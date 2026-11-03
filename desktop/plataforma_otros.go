//go:build !windows

// Versión para Linux y macOS: sirve para probar el lanzador fuera de Windows.
package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func avisar(titulo, texto string) { fmt.Fprintln(os.Stderr, titulo+": "+texto) }
func instanciaUnica() bool        { return true }
func traerAlFrente()              {}
func prepararProceso()            {}
func ocultarConsola(*exec.Cmd)    {}

// El foco, la ventana minimizada y el icono sólo se gestionan en Windows.
func vigilarFoco()         {}
func mostrarVentana(int)   {}
func permitirPrimerPlano() {}
func despedirVentana(int)  {}

func carpetaDatos() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = os.TempDir()
	}
	return filepath.Join(d, "feudo-a-feudo")
}

func carpetaMotor() string {
	d, err := os.UserCacheDir()
	if err != nil {
		d = os.TempDir()
	}
	return filepath.Join(d, "feudo-a-feudo", "motor")
}

func buscarNavegador() (string, error) {
	for _, n := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(n); err == nil {
			return p, nil
		}
	}
	return "", errors.New("no se encontró ningún navegador Chromium")
}

func argumentosPlataforma() []string {
	if os.Geteuid() == 0 {
		return []string{"--no-sandbox"} // Chrome no arranca como root sin esto
	}
	return nil
}

func abrirPredeterminado(url string) error { return exec.Command("xdg-open", url).Start() }

func cerrarVentanas(pid int) { _ = syscall.Kill(pid, syscall.SIGTERM) }

func escalaDPI() float64           { return 1 }
func escritorioLogico() (int, int) { return 1920, 1080 }
func modoActual() Modo             { return Modo{W: 1920, H: 1080, Hz: 60} }
func modosPantalla() []Modo        { return []Modo{{1920, 1080, 144}, {1920, 1080, 60}, {1280, 720, 60}} }
func aplicarPantalla()             {}
func restaurarPantalla()           {}
