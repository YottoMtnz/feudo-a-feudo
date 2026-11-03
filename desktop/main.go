// Feudo a Feudo — app de escritorio.
//
// El ejecutable lleva el juego dentro. Lo sirve en 127.0.0.1 y lo abre con el motor web de Windows
// (Microsoft Edge, el mismo de WebView2) sin barras de navegador: en pantalla completa, en modo quiosco
// (no aparece nada al acercar el ratón a los bordes); en ventana, como ventana de aplicación.
// Se ocupa además de lo que un navegador no puede hacer: cambiar la resolución y la frecuencia
// de la pantalla (y devolverla al escritorio con Alt+Tab), desactivar la sincronización vertical,
// guardar la partida en disco y cerrar el juego.
//
// La página mantiene abierto un canal con el lanzador (/api/canal). Cuando la ventana se cierra,
// el canal se corta y el lanzador termina; no depende de temporizadores que el navegador pueda frenar.
package main

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var version = "1.5"

//go:embed all:www
var webFS embed.FS

// Modo de pantalla (resolución y frecuencia).
type Modo struct {
	W  int `json:"w"`
	H  int `json:"h"`
	Hz int `json:"hz,omitempty"`
}

// Ajustes de la ventana del juego.
type Ajustes struct {
	Modo  string `json:"modo"`  // "completa", "ventana" o "maximizada"
	VentW int    `json:"ventW"` // tamaño de la ventana (píxeles lógicos)
	VentH int    `json:"ventH"`
	Pant  *Modo  `json:"pant"`  // resolución de pantalla completa; nil = la del escritorio
	VSync bool   `json:"vsync"` // sincronización vertical
}

var (
	mu           sync.Mutex
	muArchivo    sync.Mutex
	ajustes      = Ajustes{Modo: "completa", VentW: 1280, VentH: 720, VSync: true}
	dirDatos     string
	dirMotor     string
	token        string
	puerto       int
	sinNavegador bool
	motor        = "edge"

	nav         *exec.Cmd // proceso del navegador (nil si se usó el navegador predeterminado)
	navVivo     bool
	navCerrado  bool // el proceso del navegador terminó después de que la página se conectara
	relanzando  bool
	saliendo    bool
	canales     = map[chan string]struct{}{}
	conectado   bool      // la página de la ventana actual llegó a conectarse
	cambio      time.Time // último cambio en el número de páginas conectadas
	esperaDesde time.Time // desde cuándo se espera a que la ventana nueva se conecte
	salida      sync.Once
)

func main() {
	flag.BoolVar(&sinNavegador, "sin-navegador", false, "sólo arranca el servidor (para pruebas)")
	puertoFijo := flag.Int("puerto", 0, "puerto del servidor local (para pruebas)")
	flag.Parse()

	prepararProceso()
	dirDatos = carpetaDatos()
	dirMotor = carpetaMotor()
	_ = os.MkdirAll(dirDatos, 0o755)
	_ = os.MkdirAll(dirMotor, 0o755)

	if !instanciaUnica() {
		// ya hay un Feudo a Feudo abierto: se le pide que muestre su ventana
		avisarInstancia()
		return
	}
	cargarAjustes()
	token = nuevoToken()

	ln, err := escuchar(*puertoFijo)
	if err != nil {
		avisar("Feudo a Feudo", "No se pudo iniciar el servidor local del juego:\n"+err.Error())
		os.Exit(1)
	}
	puerto = ln.Addr().(*net.TCPAddr).Port
	escribirInstancia()
	srv := &http.Server{Handler: rutas(), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = srv.Serve(ln) }()

	mu.Lock()
	esperaDesde, cambio = time.Now(), time.Now()
	mu.Unlock()
	if sinNavegador {
		fmt.Printf("SERVIDOR http://127.0.0.1:%d/ TOKEN %s\n", puerto, token)
	} else if err := lanzar(); err != nil {
		avisar("Feudo a Feudo", err.Error())
		terminar(1)
	}
	if !sinNavegador {
		go vigilarFoco()
	}
	vigilar()
}

// ---------------------------------------------------------------- servidor local

func escuchar(fijo int) (net.Listener, error) {
	if fijo > 0 {
		return net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", fijo))
	}
	// puerto fijo para que el navegador recuerde siempre el mismo origen
	for p := 47831; p < 47841; p++ {
		if ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); err == nil {
			return ln, nil
		}
	}
	return net.Listen("tcp", "127.0.0.1:0")
}

// Sólo se atienden peticiones dirigidas a este servidor (evita ataques de DNS rebinding).
func hostValido(r *http.Request) bool {
	h := r.Host
	return h == fmt.Sprintf("127.0.0.1:%d", puerto) || h == fmt.Sprintf("localhost:%d", puerto)
}

// La API exige el token que sólo conoce la página del juego.
func autorizado(r *http.Request) bool {
	if !hostValido(r) {
		return false
	}
	return r.Header.Get("X-Feudo") == token || r.URL.Query().Get("t") == token
}

func rutas() http.Handler {
	sub, err := fs.Sub(webFS, "www")
	if err != nil {
		panic(err)
	}
	archivos := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	api := func(ruta string, f http.HandlerFunc) {
		mux.HandleFunc(ruta, func(w http.ResponseWriter, r *http.Request) {
			if !autorizado(r) {
				http.Error(w, "prohibido", http.StatusForbidden)
				return
			}
			f(w, r)
		})
	}

	// canal abierto mientras la ventana del juego exista
	api("/api/canal", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "sin streaming", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		ch := make(chan string, 8)
		mu.Lock()
		canales[ch] = struct{}{}
		conectado = true
		cambio = time.Now()
		mu.Unlock()
		defer func() {
			mu.Lock()
			delete(canales, ch)
			cambio = time.Now()
			mu.Unlock()
		}()
		_, _ = io.WriteString(w, "retry: 1000\n\n")
		fl.Flush()
		ping := time.NewTicker(15 * time.Second)
		defer ping.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case ev := <-ch:
				if _, err := fmt.Fprintf(w, "event: %s\ndata: {}\n\n", ev); err != nil {
					return
				}
				fl.Flush()
			case <-ping.C:
				if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
					return
				}
				fl.Flush()
			}
		}
	})

	// compatibilidad con páginas de la versión anterior
	api("/api/latido", func(w http.ResponseWriter, r *http.Request) { responder(w, map[string]bool{"ok": true}) })
	api("/api/cerrado", func(w http.ResponseWriter, r *http.Request) { responder(w, map[string]bool{"ok": true}) })

	api("/api/info", func(w http.ResponseWriter, r *http.Request) { responder(w, infoAnfitrion()) })

	api("/api/partida", func(w http.ResponseWriter, r *http.Request) {
		ruta := filepath.Join(dirDatos, "partida.json")
		if r.Method == http.MethodGet {
			datos, err := os.ReadFile(ruta)
			if err != nil {
				responder(w, nil)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(datos)
			return
		}
		cuerpo, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(cuerpo) {
			http.Error(w, "partida no válida", http.StatusBadRequest)
			return
		}
		if err := escribirSeguro(ruta, cuerpo); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		responder(w, map[string]bool{"ok": true})
	})

	api("/api/ajustes", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			mu.Lock()
			a := ajustes
			mu.Unlock()
			responder(w, a)
			return
		}
		var nuevo Ajustes
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&nuevo); err != nil {
			http.Error(w, "ajustes no válidos", http.StatusBadRequest)
			return
		}
		nuevo = sanear(nuevo)
		mu.Lock()
		hay := !iguales(ajustes, nuevo)
		ajustes = nuevo
		mu.Unlock()
		guardarAjustes()
		responder(w, map[string]bool{"relanzar": hay})
		if hay {
			go relanzar()
		}
	})

	// otra copia del lanzador pide ver la ventana del juego
	api("/api/mostrar", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		n, rel, c, vivo := len(canales), relanzando, nav, navVivo
		mu.Unlock()
		responder(w, map[string]bool{"ok": true})
		if n == 0 && !rel {
			go relanzar()
		} else {
			if c != nil && c.Process != nil && vivo {
				mostrarVentana(c.Process.Pid) // la saca de la barra de tareas si estaba minimizada
			}
			enviar("enfocar")
		}
	})

	api("/api/salir", func(w http.ResponseWriter, r *http.Request) {
		responder(w, map[string]bool{"ok": true})
		go func() {
			time.Sleep(150 * time.Millisecond)
			terminar(0)
		}()
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if !hostValido(r) {
			http.Error(w, "prohibido", http.StatusForbidden)
			return
		}
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			servirIndice(w, sub)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		archivos.ServeHTTP(w, r)
	})
	return mux
}

func responder(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

// Manda un aviso a las páginas conectadas ("cerrar", "enfocar").
func enviar(ev string) {
	mu.Lock()
	defer mu.Unlock()
	for ch := range canales {
		select {
		case ch <- ev:
		default:
		}
	}
}

// La página recibe aquí todo lo que necesita saber del anfitrión.
func infoAnfitrion() map[string]interface{} {
	mu.Lock()
	a := ajustes
	mu.Unlock()
	info := map[string]interface{}{
		"platform":   "windows",
		"version":    version,
		"api":        "/api",
		"token":      token,
		"motor":      motor,
		"ajustes":    a,
		"modos":      modosPantalla(),
		"escritorio": modoActual(),
		"escala":     escalaDPI(),
		"ventanas":   ventanasDisponibles(),
	}
	if datos, err := os.ReadFile(filepath.Join(dirDatos, "partida.json")); err == nil && json.Valid(datos) {
		info["save"] = json.RawMessage(datos)
	}
	return info
}

func servirIndice(w http.ResponseWriter, sub fs.FS) {
	html, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		http.Error(w, "falta index.html", http.StatusInternalServerError)
		return
	}
	datos, _ := json.Marshal(infoAnfitrion())
	guion := "<script>window.FEUDO_HOST=" + strings.ReplaceAll(string(datos), "</", "<\\/") + ";</script>"
	s := string(html)
	if i := strings.Index(s, "<head>"); i >= 0 {
		s = s[:i+6] + "\n  " + guion + s[i+6:]
	} else {
		s = guion + s
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.WriteString(w, s)
}

// ---------------------------------------------------------------- ventana del juego

func argumentos(url string, edge bool) []string {
	mu.Lock()
	a := ajustes
	mu.Unlock()
	args := []string{
		"--user-data-dir=" + dirMotor,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-sync",
		"--disable-extensions",
		"--disable-background-mode",
		"--hide-crash-restore-bubble",
		"--disable-session-crashed-bubble",
		"--disable-background-timer-throttling",
		"--disable-backgrounding-occluded-windows",
		"--force_high_performance_gpu", // portátiles con dos gráficas: usar la potente (p. ej. GTX)
		"--autoplay-policy=no-user-gesture-required",
		"--overscroll-history-navigation=0",
		"--disable-pinch",
		"--disable-features=Translate,msEdgeTranslate,TranslateUI,msEdgeSidebarV2,msUndersideButton,msEdgeStartupBoost",
	}
	args = append(args, argumentosPlataforma()...)
	if p := os.Getenv("FEUDO_DEPURAR"); p != "" {
		if _, err := strconv.Atoi(p); err == nil {
			args = append(args, "--remote-debugging-port="+p)
		}
	}
	switch a.Modo {
	case "ventana":
		sw, sh := escritorioLogico()
		w, h := a.VentW, a.VentH
		if w > sw {
			w = sw
		}
		if h > sh-48 {
			h = sh - 48
		}
		x, y := (sw-w)/2, (sh-h)/2-16
		if y < 0 {
			y = 0
		}
		args = append(args, "--app="+url, fmt.Sprintf("--window-size=%d,%d", w, h), fmt.Sprintf("--window-position=%d,%d", x, y))
	case "maximizada":
		args = append(args, "--app="+url, "--start-maximized")
	default:
		// Pantalla completa de verdad: modo quiosco. A diferencia de --start-fullscreen, no muestra
		// la barra con los botones de minimizar y cerrar al llevar el ratón arriba, y ni F11 ni Esc
		// la quitan. Se abre en la pantalla principal, que es la que cambia de resolución.
		args = append(args, "--kiosk", "--window-position=0,0")
		if edge {
			args = append(args, "--edge-kiosk-type=fullscreen")
		}
	}
	if !a.VSync {
		args = append(args, "--disable-gpu-vsync", "--disable-frame-rate-limit")
	}
	if a.Modo != "ventana" && a.Modo != "maximizada" {
		args = append(args, url) // en modo quiosco la dirección va sola, al final
	}
	return args
}

func lanzar() error {
	url := fmt.Sprintf("http://127.0.0.1:%d/", puerto)
	exe, err := buscarNavegador()
	if err != nil {
		// ni Edge ni Chrome: el juego se abre en el navegador predeterminado
		if abrirPredeterminado(url) == nil {
			mu.Lock()
			motor, nav, navVivo = "predeterminado", nil, false
			mu.Unlock()
			return nil
		}
		return err
	}
	prepararPerfil()
	aplicarPantalla()
	edge := strings.Contains(strings.ToLower(filepath.Base(exe)), "edge")
	cmd := exec.Command(exe, argumentos(url, edge)...)
	ocultarConsola(cmd)
	if err := cmd.Start(); err != nil {
		restaurarPantalla()
		return fmt.Errorf("No se pudo abrir la ventana del juego (%s):\n%v", exe, err)
	}
	mu.Lock()
	nav, navVivo, navCerrado = cmd, true, false
	if edge {
		motor = "edge"
	} else {
		motor = "chrome"
	}
	mu.Unlock()
	go func(c *exec.Cmd) {
		_ = c.Wait()
		mu.Lock()
		if nav == c {
			navVivo = false
			navCerrado = conectado // la ventana del juego llegó a abrirse y ya no existe
		}
		mu.Unlock()
	}(cmd)
	return nil
}

// Espera a que el navegador termine; devuelve true si terminó a tiempo.
func esperarFin(t time.Duration) bool {
	limite := time.Now().Add(t)
	for {
		mu.Lock()
		vivo := navVivo
		mu.Unlock()
		if !vivo {
			return true
		}
		if time.Now().After(limite) {
			return false
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// Cierra la ventana como si se pulsara la X (el navegador guarda su estado y no pide
// "restaurar páginas" la próxima vez); si no responde, lo termina a la fuerza.
func cerrarNavegador(espera time.Duration) {
	mu.Lock()
	c, vivo := nav, navVivo
	mu.Unlock()
	if c == nil || c.Process == nil || !vivo {
		return
	}
	if esperarFin(espera) {
		return
	}
	cerrarVentanas(c.Process.Pid)
	if esperarFin(3 * time.Second) {
		return
	}
	_ = c.Process.Kill()
	esperarFin(2 * time.Second)
}

// Cierra la ventana actual y abre otra con los ajustes nuevos.
func relanzar() {
	mu.Lock()
	if relanzando {
		mu.Unlock()
		return
	}
	relanzando = true
	mu.Unlock()
	enviar("cerrar")
	// la página se cierra sola en unos 150 ms; si no puede (modo quiosco), se cierra como con Alt+F4
	cerrarNavegador(1200 * time.Millisecond)
	time.Sleep(300 * time.Millisecond)
	mu.Lock()
	conectado, navCerrado, esperaDesde = false, false, time.Now()
	mu.Unlock()
	if sinNavegador {
		fmt.Println("RELANZAR")
	} else if err := lanzar(); err != nil {
		avisar("Feudo a Feudo", err.Error())
		terminar(1)
	}
	mu.Lock()
	relanzando = false
	mu.Unlock()
}

// El lanzador termina cuando la ventana del juego se cierra.
func vigilar() {
	for {
		time.Sleep(250 * time.Millisecond)
		mu.Lock()
		n, con, cam, esp, rel, vivo, fin := len(canales), conectado, cambio, esperaDesde, relanzando, navVivo, navCerrado
		mu.Unlock()
		if rel || n > 0 {
			continue
		}
		if con {
			// sin página: se cerró la ventana (si sólo se recargó, vuelve enseguida);
			// si además el navegador ya terminó, no hay nada que esperar
			if fin || time.Since(cam) > 4*time.Second {
				terminar(0)
			}
		} else if !sinNavegador && !vivo && time.Since(esp) > 25*time.Second {
			terminar(0) // la ventana se cerró sin llegar a cargar el juego
		}
	}
}

func terminar(codigo int) {
	salida.Do(func() {
		// la ventana desaparece al momento y la pantalla vuelve a su resolución mientras
		// el navegador termina de cerrarse
		mu.Lock()
		c, vivo := nav, navVivo
		saliendo = true
		mu.Unlock()
		if c != nil && c.Process != nil && vivo {
			despedirVentana(c.Process.Pid)
		}
		restaurarPantalla()
		cerrarNavegador(1200 * time.Millisecond)
		restaurarPantalla()
		_ = os.Remove(filepath.Join(dirDatos, "instancia.json"))
		os.Exit(codigo)
	})
}

// ---------------------------------------------------------------- una sola copia abierta

func escribirInstancia() {
	datos, _ := json.Marshal(map[string]interface{}{"puerto": puerto, "token": token, "pid": os.Getpid()})
	_ = escribirSeguro(filepath.Join(dirDatos, "instancia.json"), datos)
}

func avisarInstancia() {
	permitirPrimerPlano() // esta copia la abrió el jugador: deja a la otra traer su ventana al frente
	traerAlFrente()
	datos, err := os.ReadFile(filepath.Join(dirDatos, "instancia.json"))
	if err != nil {
		return
	}
	var ins struct {
		Puerto int    `json:"puerto"`
		Token  string `json:"token"`
	}
	if json.Unmarshal(datos, &ins) != nil || ins.Puerto == 0 {
		return
	}
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/api/mostrar", ins.Puerto), nil)
	if err != nil {
		return
	}
	req.Header.Set("X-Feudo", ins.Token)
	cli := &http.Client{Timeout: 3 * time.Second}
	if resp, err := cli.Do(req); err == nil {
		_ = resp.Body.Close()
	}
}

// ---------------------------------------------------------------- perfil del motor web

// Deja el perfil propio del juego listo: sin seguir abierto en segundo plano al cerrar,
// sin traductor y marcado como cerrado correctamente.
func prepararPerfil() {
	ajustarJSON(filepath.Join(dirMotor, "Local State"), func(m map[string]interface{}) {
		rama(m, "background_mode")["enabled"] = false
	})
	ajustarJSON(filepath.Join(dirMotor, "Default", "Preferences"), func(m map[string]interface{}) {
		p := rama(m, "profile")
		p["exit_type"] = "Normal"
		p["exited_cleanly"] = true
		rama(m, "translate")["enabled"] = false
		m["credentials_enable_service"] = false
	})
}

func rama(m map[string]interface{}, k string) map[string]interface{} {
	if v, ok := m[k].(map[string]interface{}); ok {
		return v
	}
	v := map[string]interface{}{}
	m[k] = v
	return v
}

func ajustarJSON(ruta string, f func(map[string]interface{})) {
	m := map[string]interface{}{}
	if datos, err := os.ReadFile(ruta); err == nil {
		dec := json.NewDecoder(bytes.NewReader(datos))
		dec.UseNumber()
		if dec.Decode(&m) != nil {
			return // no se toca un archivo que no se entiende
		}
	}
	f(m)
	datos, err := json.Marshal(m)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(ruta), 0o755)
	_ = escribirSeguro(ruta, datos)
}

// ---------------------------------------------------------------- ajustes en disco

func cargarAjustes() {
	datos, err := os.ReadFile(filepath.Join(dirDatos, "ajustes.json"))
	if err != nil {
		return
	}
	var a Ajustes
	if json.Unmarshal(datos, &a) == nil {
		ajustes = sanear(a)
	}
}

func guardarAjustes() {
	mu.Lock()
	datos, _ := json.MarshalIndent(ajustes, "", "  ")
	mu.Unlock()
	_ = escribirSeguro(filepath.Join(dirDatos, "ajustes.json"), datos)
}

func sanear(a Ajustes) Ajustes {
	switch a.Modo {
	case "completa", "ventana", "maximizada":
	default:
		a.Modo = "completa"
	}
	if a.VentW < 640 || a.VentW > 7680 {
		a.VentW = 1280
	}
	if a.VentH < 360 || a.VentH > 4320 {
		a.VentH = 720
	}
	if a.Pant != nil {
		valido := false
		for _, m := range modosPantalla() {
			if m.W == a.Pant.W && m.H == a.Pant.H && m.Hz == a.Pant.Hz {
				valido = true
				break
			}
		}
		if !valido {
			a.Pant = nil
		}
	}
	return a
}

func iguales(a, b Ajustes) bool {
	if a.Modo != b.Modo || a.VSync != b.VSync {
		return false
	}
	if b.Modo == "ventana" && (a.VentW != b.VentW || a.VentH != b.VentH) {
		return false
	}
	if b.Modo == "completa" {
		if (a.Pant == nil) != (b.Pant == nil) {
			return false
		}
		if a.Pant != nil && *a.Pant != *b.Pant {
			return false
		}
	}
	return true
}

func escribirSeguro(ruta string, datos []byte) error {
	muArchivo.Lock()
	defer muArchivo.Unlock()
	tmp := ruta + ".tmp"
	if err := os.WriteFile(tmp, datos, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, ruta)
}

func nuevoToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(b)
}

// Tamaños de ventana que caben en la pantalla.
func ventanasDisponibles() []Modo {
	sw, sh := escritorioLogico()
	todos := []Modo{{W: 1024, H: 576}, {W: 1280, H: 720}, {W: 1366, H: 768}, {W: 1600, H: 900}, {W: 1920, H: 1080}, {W: 2560, H: 1440}, {W: 3200, H: 1800}, {W: 3840, H: 2160}}
	var res []Modo
	for _, m := range todos {
		if m.W <= sw && m.H <= sh-40 {
			res = append(res, m)
		}
	}
	if len(res) == 0 {
		res = append(res, todos[0])
	}
	return res
}
