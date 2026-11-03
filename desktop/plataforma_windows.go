//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")

	pMessageBoxW               = user32.NewProc("MessageBoxW")
	pEnumDisplaySettingsW      = user32.NewProc("EnumDisplaySettingsW")
	pChangeDisplaySettingsExW  = user32.NewProc("ChangeDisplaySettingsExW")
	pGetSystemMetrics          = user32.NewProc("GetSystemMetrics")
	pGetDpiForSystem           = user32.NewProc("GetDpiForSystem")
	pSetProcessDpiAwarenessCtx = user32.NewProc("SetProcessDpiAwarenessContext")
	pSetProcessDPIAware        = user32.NewProc("SetProcessDPIAware")
	pFindWindowW               = user32.NewProc("FindWindowW")
	pShowWindow                = user32.NewProc("ShowWindow")
	pSetForegroundWindow       = user32.NewProc("SetForegroundWindow")
	pGetDC                     = user32.NewProc("GetDC")
	pReleaseDC                 = user32.NewProc("ReleaseDC")
	pGetDeviceCaps             = gdi32.NewProc("GetDeviceCaps")
	pCreateMutexW              = kernel32.NewProc("CreateMutexW")
	pRegGetValueW              = advapi32.NewProc("RegGetValueW")
	pEnumWindows               = user32.NewProc("EnumWindows")
	pGetWindowThreadProcessId  = user32.NewProc("GetWindowThreadProcessId")
	pIsWindowVisible           = user32.NewProc("IsWindowVisible")
	pPostMessageW              = user32.NewProc("PostMessageW")
	pGetForegroundWindow       = user32.NewProc("GetForegroundWindow")
	pGetAncestor               = user32.NewProc("GetAncestor")
	pIsIconic                  = user32.NewProc("IsIconic")
	pIsWindow                  = user32.NewProc("IsWindow")
	pAllowSetForegroundWindow  = user32.NewProc("AllowSetForegroundWindow")
	pAttachThreadInput         = user32.NewProc("AttachThreadInput")
	pBringWindowToTop          = user32.NewProc("BringWindowToTop")
	pSendMessageTimeoutW       = user32.NewProc("SendMessageTimeoutW")
	pLoadImageW                = user32.NewProc("LoadImageW")
	pMonitorFromWindow         = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfoW           = user32.NewProc("GetMonitorInfoW")
	pSetWindowPos              = user32.NewProc("SetWindowPos")
	pGetWindowRect             = user32.NewProc("GetWindowRect")
	pGetModuleHandleW          = kernel32.NewProc("GetModuleHandleW")
	pGetCurrentThreadId        = kernel32.NewProc("GetCurrentThreadId")
)

type rect struct{ Left, Top, Right, Bottom int32 }

// MONITORINFO (40 bytes)
type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

// DEVMODEW (220 bytes)
type devmode struct {
	DeviceName       [32]uint16
	SpecVersion      uint16
	DriverVersion    uint16
	Size             uint16
	DriverExtra      uint16
	Fields           uint32
	Union1           [16]byte
	Color            int16
	Duplex           int16
	YResolution      int16
	TTOption         int16
	Collate          int16
	FormName         [32]uint16
	LogPixels        uint16
	BitsPerPel       uint32
	PelsWidth        uint32
	PelsHeight       uint32
	DisplayFlags     uint32
	DisplayFrequency uint32
	ICMMethod        uint32
	ICMIntent        uint32
	MediaType        uint32
	DitherType       uint32
	Reserved1        uint32
	Reserved2        uint32
	PanningWidth     uint32
	PanningHeight    uint32
}

// comprobación en compilación: la estructura debe medir exactamente 220 bytes
var _ [220 - unsafe.Sizeof(devmode{})]byte
var _ [unsafe.Sizeof(devmode{}) - 220]byte

const (
	enumCurrentSettings = 0xFFFFFFFF
	cdsFullscreen       = 0x00000004
	dmBitsPerPel        = 0x00040000
	dmPelsWidth         = 0x00080000
	dmPelsHeight        = 0x00100000
	dmDisplayFrequency  = 0x00400000
	errorAlreadyExists  = 183
	hkeyLocalMachine    = 0x80000002
	hkeyCurrentUser     = 0x80000001
	rrfRtRegSz          = 0x00000002
	createNoWindow      = 0x08000000
)

var (
	muPantalla       sync.Mutex
	pantallaCambiada bool
)

func u16(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

func avisar(titulo, texto string) {
	_, _, _ = pMessageBoxW.Call(0, uintptr(unsafe.Pointer(u16(texto))), uintptr(unsafe.Pointer(u16(titulo))), 0x30|0x10000)
}

func instanciaUnica() bool {
	h, _, err := pCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(u16("Local\\FeudoAFeudo.Lanzador"))))
	if h == 0 {
		return true
	}
	if en, ok := err.(syscall.Errno); ok && en == errorAlreadyExists {
		return false
	}
	return true
}

func traerAlFrente() {
	h, _, _ := pFindWindowW.Call(0, uintptr(unsafe.Pointer(u16("Feudo a Feudo"))))
	if h != 0 {
		_, _, _ = pShowWindow.Call(h, 9) // SW_RESTORE
		_, _, _ = pSetForegroundWindow.Call(h)
	}
}

func prepararProceso() {
	if pSetProcessDpiAwarenessCtx.Find() == nil {
		// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
		if r, _, _ := pSetProcessDpiAwarenessCtx.Call(^uintptr(3)); r != 0 {
			return
		}
	}
	if pSetProcessDPIAware.Find() == nil {
		_, _, _ = pSetProcessDPIAware.Call()
	}
}

func carpetaDatos() string {
	if d := os.Getenv("APPDATA"); d != "" {
		return filepath.Join(d, "FeudoAFeudo")
	}
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "FeudoAFeudo")
}

func carpetaMotor() string {
	if d := os.Getenv("LOCALAPPDATA"); d != "" {
		return filepath.Join(d, "FeudoAFeudo", "Motor")
	}
	return filepath.Join(carpetaDatos(), "Motor")
}

func ocultarConsola(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow}
}

func argumentosPlataforma() []string { return nil }

// Sin Edge ni Chrome: abre el juego en el navegador predeterminado.
func abrirPredeterminado(url string) error {
	cmd := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
	ocultarConsola(cmd)
	return cmd.Start()
}

// Pide a las ventanas del navegador que se cierren (WM_CLOSE), como al pulsar la X.
var (
	pidACerrar   uint32
	cerrarCB     uintptr
	cerrarCBOnce sync.Once
)

func cerrarVentanas(pid int) {
	cerrarCBOnce.Do(func() {
		cerrarCB = syscall.NewCallback(func(h uintptr, _ uintptr) uintptr {
			var p uint32
			_, _, _ = pGetWindowThreadProcessId.Call(h, uintptr(unsafe.Pointer(&p)))
			if p == pidACerrar {
				if v, _, _ := pIsWindowVisible.Call(h); v != 0 {
					_, _, _ = pPostMessageW.Call(h, 0x0010, 0, 0) // WM_CLOSE
				}
			}
			return 1
		})
	})
	pidACerrar = uint32(pid)
	_, _, _ = pEnumWindows.Call(cerrarCB, 0)
}

// ---------------------------------------------------------------- motor web (Edge o Chrome)

func registroCadena(raiz uintptr, clave string) string {
	var tam uint32
	r, _, _ := pRegGetValueW.Call(raiz, uintptr(unsafe.Pointer(u16(clave))), 0, rrfRtRegSz, 0, 0, uintptr(unsafe.Pointer(&tam)))
	if r != 0 || tam == 0 {
		return ""
	}
	buf := make([]uint16, tam/2+1)
	r, _, _ = pRegGetValueW.Call(raiz, uintptr(unsafe.Pointer(u16(clave))), 0, rrfRtRegSz, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&tam)))
	if r != 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func buscarNavegador() (string, error) {
	var cand []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		if base != "" {
			cand = append(cand, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	for _, raiz := range []uintptr{hkeyLocalMachine, hkeyCurrentUser} {
		if p := registroCadena(raiz, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`); p != "" {
			cand = append(cand, p)
		}
	}
	for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")} {
		if base != "" {
			cand = append(cand, filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
		}
	}
	for _, raiz := range []uintptr{hkeyLocalMachine, hkeyCurrentUser} {
		if p := registroCadena(raiz, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe`); p != "" {
			cand = append(cand, p)
		}
	}
	for _, c := range cand {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", errors.New("No se encontró Microsoft Edge, que viene con Windows 10 y 11 y es el motor que usa el juego.\n\nInstálalo desde https://www.microsoft.com/edge y vuelve a abrir Feudo a Feudo.")
}

// ---------------------------------------------------------------- pantalla

func escalaDPI() float64 {
	if pGetDpiForSystem.Find() == nil {
		if r, _, _ := pGetDpiForSystem.Call(); r > 0 {
			return float64(r) / 96
		}
	}
	dc, _, _ := pGetDC.Call(0)
	if dc != 0 {
		r, _, _ := pGetDeviceCaps.Call(dc, 88) // LOGPIXELSX
		_, _, _ = pReleaseDC.Call(0, dc)
		if r > 0 {
			return float64(r) / 96
		}
	}
	return 1
}

func escritorioFisico() (int, int) {
	w, _, _ := pGetSystemMetrics.Call(0)
	h, _, _ := pGetSystemMetrics.Call(1)
	if w == 0 || h == 0 {
		return 1920, 1080
	}
	return int(w), int(h)
}

func escritorioLogico() (int, int) {
	w, h := escritorioFisico()
	s := escalaDPI()
	if s <= 0 {
		s = 1
	}
	return int(float64(w)/s + 0.5), int(float64(h)/s + 0.5)
}

func leerModo(i uint32) (devmode, bool) {
	var dm devmode
	dm.Size = uint16(unsafe.Sizeof(dm))
	r, _, _ := pEnumDisplaySettingsW.Call(0, uintptr(i), uintptr(unsafe.Pointer(&dm)))
	return dm, r != 0
}

func modoActual() Modo {
	dm, ok := leerModo(enumCurrentSettings)
	if !ok {
		w, h := escritorioFisico()
		return Modo{W: w, H: h, Hz: 60}
	}
	return Modo{W: int(dm.PelsWidth), H: int(dm.PelsHeight), Hz: int(dm.DisplayFrequency)}
}

func modosPantalla() []Modo {
	vistos := map[Modo]bool{}
	var res []Modo
	for i := uint32(0); i < 4096; i++ {
		dm, ok := leerModo(i)
		if !ok {
			break
		}
		if dm.BitsPerPel != 32 || dm.PelsWidth < 800 || dm.PelsHeight < 600 || dm.DisplayFrequency < 30 {
			continue
		}
		m := Modo{W: int(dm.PelsWidth), H: int(dm.PelsHeight), Hz: int(dm.DisplayFrequency)}
		if !vistos[m] {
			vistos[m] = true
			res = append(res, m)
		}
	}
	sort.Slice(res, func(a, b int) bool {
		if res[a].W*res[a].H != res[b].W*res[b].H {
			return res[a].W*res[a].H > res[b].W*res[b].H
		}
		return res[a].Hz > res[b].Hz
	})
	return res
}

// Cambia la resolución y la frecuencia de la pantalla mientras el juego está en pantalla completa.
func aplicarPantalla() {
	mu.Lock()
	a := ajustes
	mu.Unlock()
	muPantalla.Lock()
	defer muPantalla.Unlock()
	if a.Modo != "completa" || a.Pant == nil {
		restaurar()
		return
	}
	actual := modoActual()
	if actual.W == a.Pant.W && actual.H == a.Pant.H && actual.Hz == a.Pant.Hz {
		return
	}
	for i := uint32(0); i < 4096; i++ {
		dm, ok := leerModo(i)
		if !ok {
			break
		}
		if int(dm.PelsWidth) == a.Pant.W && int(dm.PelsHeight) == a.Pant.H && int(dm.DisplayFrequency) == a.Pant.Hz && dm.BitsPerPel == 32 {
			dm.Fields = dmBitsPerPel | dmPelsWidth | dmPelsHeight | dmDisplayFrequency
			r, _, _ := pChangeDisplaySettingsExW.Call(0, uintptr(unsafe.Pointer(&dm)), 0, cdsFullscreen, 0)
			if r == 0 { // DISP_CHANGE_SUCCESSFUL
				pantallaCambiada = true
			}
			return
		}
	}
}

func restaurarPantalla() {
	muPantalla.Lock()
	defer muPantalla.Unlock()
	restaurar()
}

func restaurar() {
	if !pantallaCambiada {
		return
	}
	_, _, _ = pChangeDisplaySettingsExW.Call(0, 0, 0, 0, 0)
	pantallaCambiada = false
}

// ---------------------------------------------------------------- ventana del juego

func pidDe(h uintptr) uint32 {
	var p uint32
	_, _, _ = pGetWindowThreadProcessId.Call(h, uintptr(unsafe.Pointer(&p)))
	return p
}

func esVisible(h uintptr) bool {
	if h == 0 {
		return false
	}
	if ok, _, _ := pIsWindow.Call(h); ok == 0 {
		return false
	}
	v, _, _ := pIsWindowVisible.Call(h)
	return v != 0
}

// Ventana principal de un desplegable o diálogo del navegador.
func raiz(h uintptr) uintptr {
	if r, _, _ := pGetAncestor.Call(h, 3); r != 0 { // GA_ROOTOWNER
		return r
	}
	return h
}

var (
	muBuscar   sync.Mutex
	buscarOnce sync.Once
	buscarCB   uintptr
	buscarPid  uint32
	buscarRes  uintptr
	buscarArea int64
)

// La ventana del juego: la mayor de las ventanas visibles del proceso del navegador.
func ventanaPrincipal(pid int) uintptr {
	muBuscar.Lock()
	defer muBuscar.Unlock()
	buscarOnce.Do(func() {
		buscarCB = syscall.NewCallback(func(h uintptr, _ uintptr) uintptr {
			if pidDe(h) != buscarPid {
				return 1
			}
			if v, _, _ := pIsWindowVisible.Call(h); v == 0 {
				return 1
			}
			var r rect
			_, _, _ = pGetWindowRect.Call(h, uintptr(unsafe.Pointer(&r)))
			a := int64(r.Right-r.Left) * int64(r.Bottom-r.Top)
			if buscarRes == 0 || a > buscarArea {
				buscarRes, buscarArea = h, a
			}
			return 1
		})
	})
	buscarPid, buscarRes, buscarArea = uint32(pid), 0, 0
	_, _, _ = pEnumWindows.Call(buscarCB, 0)
	return buscarRes
}

// Trae la ventana al frente aunque el lanzador no sea el programa activo (al reabrirse con otros
// ajustes, el último clic lo recibió la ventana anterior y Windows no dejaría activar la nueva).
func forzarPrimerPlano(h uintptr) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	yo, _, _ := pGetCurrentThreadId.Call()
	var otro uintptr
	if fg, _, _ := pGetForegroundWindow.Call(); fg != 0 {
		otro, _, _ = pGetWindowThreadProcessId.Call(fg, 0)
	}
	if otro != 0 && otro != yo {
		if r, _, _ := pAttachThreadInput.Call(yo, otro, 1); r != 0 {
			defer pAttachThreadInput.Call(yo, otro, 0)
		}
	}
	if ic, _, _ := pIsIconic.Call(h); ic != 0 {
		_, _, _ = pShowWindow.Call(h, 9) // SW_RESTORE
	}
	_, _, _ = pBringWindowToTop.Call(h)
	_, _, _ = pSetForegroundWindow.Call(h)
}

// Otra copia del lanzador pidió ver el juego.
func mostrarVentana(pid int) {
	if h := ventanaPrincipal(pid); h != 0 {
		forzarPrimerPlano(h)
	}
}

// La copia que abre el jugador cede su permiso para pasar ventanas al frente.
func permitirPrimerPlano() {
	_, _, _ = pAllowSetForegroundWindow.Call(uintptr(0xFFFFFFFF)) // ASFW_ANY
}

// Al salir: la ventana desaparece ya y se le pide cerrarse como con Alt+F4.
func despedirVentana(pid int) {
	if h := ventanaPrincipal(pid); h != 0 {
		_, _, _ = pShowWindow.Call(h, 0)              // SW_HIDE
		_, _, _ = pPostMessageW.Call(h, 0x0010, 0, 0) // WM_CLOSE
	}
}

// Tras cambiar la resolución, la ventana ocupa exactamente la pantalla nueva.
func ajustarAlMonitor(h uintptr) {
	if !esVisible(h) {
		return
	}
	if ic, _, _ := pIsIconic.Call(h); ic != 0 {
		return
	}
	m, _, _ := pMonitorFromWindow.Call(h, 2) // MONITOR_DEFAULTTONEAREST
	if m == 0 {
		return
	}
	mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
	if r, _, _ := pGetMonitorInfoW.Call(m, uintptr(unsafe.Pointer(&mi))); r == 0 {
		return
	}
	var w rect
	_, _, _ = pGetWindowRect.Call(h, uintptr(unsafe.Pointer(&w)))
	r := mi.Monitor
	if w == r {
		return
	}
	// SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER
	_, _, _ = pSetWindowPos.Call(h, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), 0x0004|0x0010|0x0200)
}

var (
	iconoOnce      sync.Once
	iconoG, iconoP uintptr
)

// En modo quiosco el motor web pone su propio icono y nombre; en Alt+Tab y en la barra de tareas
// se ven los del juego.
func vestirVentana(h uintptr) {
	if !esVisible(h) {
		return
	}
	iconoOnce.Do(func() {
		inst, _, _ := pGetModuleHandleW.Call(0)
		cargar := func(mx, my uintptr) uintptr {
			cx, _, _ := pGetSystemMetrics.Call(mx)
			cy, _, _ := pGetSystemMetrics.Call(my)
			r, _, _ := pLoadImageW.Call(inst, 1, 1, cx, cy, 0) // icono 1 del ejecutable, IMAGE_ICON
			return r
		}
		iconoG = cargar(11, 12) // SM_CXICON, SM_CYICON
		iconoP = cargar(49, 50) // SM_CXSMICON, SM_CYSMICON
	})
	var res uintptr
	const wmSetIcon, wmSetText, smtoAbortIfHung = 0x0080, 0x000C, 0x0002
	if iconoG != 0 {
		_, _, _ = pSendMessageTimeoutW.Call(h, wmSetIcon, 1, iconoG, smtoAbortIfHung, 500, uintptr(unsafe.Pointer(&res)))
	}
	if iconoP != 0 {
		_, _, _ = pSendMessageTimeoutW.Call(h, wmSetIcon, 0, iconoP, smtoAbortIfHung, 500, uintptr(unsafe.Pointer(&res)))
	}
	_, _, _ = pSendMessageTimeoutW.Call(h, wmSetText, 0, uintptr(unsafe.Pointer(u16("Feudo a Feudo"))), smtoAbortIfHung, 500, uintptr(unsafe.Pointer(&res)))
}

// ---------------------------------------------------------------- pantalla completa exclusiva

// Vigila qué programa tiene el foco.
//   - Cuando se abre (o se reabre con otros ajustes) la ventana del juego, se trae al frente.
//   - En pantalla completa se comporta como la pantalla completa exclusiva de los juegos de PC:
//     si el jugador se va a otro programa (Alt+Tab, tecla Windows, clic en otro monitor), el juego
//     se minimiza (y con ello se pausa y se calla) y la pantalla vuelve a la resolución del
//     escritorio; al volver al juego, recupera la resolución elegida.
func vigilarFoco() {
	var (
		pid        int
		aparecio   time.Time // cuándo apareció la ventana de este navegador
		forzado    bool      // ya se trajo al frente una vez
		juego      uintptr   // ventana del juego
		activa     bool      // el juego tiene el foco
		visto      bool      // el juego tuvo el foco al menos una vez
		fuera      time.Time // desde cuándo el foco está en otro programa
		minimizado time.Time // cuándo lo minimizó el lanzador
		sinMin     bool      // el navegador no se deja minimizar: sólo se devuelve la resolución
	)
	for {
		time.Sleep(100 * time.Millisecond)
		mu.Lock()
		c, vivo, rel, sal, modo := nav, navVivo, relanzando, saliendo, ajustes.Modo
		mu.Unlock()
		if sal {
			return
		}
		if c == nil || c.Process == nil || !vivo || rel {
			pid = 0
			continue
		}
		if c.Process.Pid != pid {
			pid, aparecio, forzado, juego, activa, visto, sinMin = c.Process.Pid, time.Time{}, false, 0, false, false, false
			fuera, minimizado = time.Time{}, time.Time{}
		}
		completa := modo == "completa"
		fg, _, _ := pGetForegroundWindow.Call()
		nuestra := fg != 0 && int(pidDe(fg)) == pid

		if !visto && !forzado && !nuestra {
			if h := ventanaPrincipal(pid); h != 0 {
				if aparecio.IsZero() {
					aparecio = time.Now()
				} else if time.Since(aparecio) > time.Second {
					forzado = true
					forzarPrimerPlano(h)
				}
			}
		}
		if fg == 0 {
			continue // el foco está cambiando de ventana
		}
		if nuestra {
			fuera = time.Time{}
			if activa {
				continue
			}
			activa, juego = true, raiz(fg)
			if visto && completa {
				if !minimizado.IsZero() && time.Since(minimizado) < 400*time.Millisecond {
					sinMin = true // volvió sola al frente: no se insiste en minimizarla
				}
				aplicarPantalla()
				ajustarAlMonitor(juego)
			}
			visto = true
			if completa {
				vestirVentana(juego)
			}
			continue
		}
		if !activa {
			continue
		}
		if fuera.IsZero() {
			fuera = time.Now()
			continue
		}
		if time.Since(fuera) < 200*time.Millisecond {
			continue
		}
		activa, fuera = false, time.Time{}
		if !completa {
			continue
		}
		if !sinMin && esVisible(juego) {
			if ic, _, _ := pIsIconic.Call(juego); ic == 0 {
				_, _, _ = pShowWindow.Call(juego, 7) // SW_SHOWMINNOACTIVE: no le quita el foco a la otra ventana
				minimizado = time.Now()
			}
		}
		restaurarPantalla()
	}
}
