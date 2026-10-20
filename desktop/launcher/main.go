// Agent-cy masaüstü başlatıcısı (Windows). Paketteki taşınabilir Node ile sunucuyu yalnızca bu bilgisayarda
// (127.0.0.1) başlatır, boş bir port seçer ve tarayıcıyı açar. Veriler Belgeler\Agent-cy klasöründe durur.
// Program zaten açıksa yenisini başlatmaz, açık olanı tarayıcıda gösterir.
package main

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	exe, _ := os.Executable()
	base := filepath.Dir(exe)
	appDir := filepath.Join(base, "app")
	node := filepath.Join(base, "runtime", "node.exe")
	if runtime.GOOS != "windows" {
		node = filepath.Join(base, "runtime", "node")
	}

	dataDir := os.Getenv("AGENT_CY_DATA")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, "Documents", "Agent-cy")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		fail("Veri klasörü oluşturulamadı: " + dataDir + "\n" + err.Error())
	}

	fmt.Println("Agent-cy")
	fmt.Println("Veri klasörü:", dataDir)

	// Açık bir Agent-cy varsa onu göster
	portFile := filepath.Join(dataDir, ".port")
	if b, err := os.ReadFile(portFile); err == nil {
		if p, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil && alive(p) {
			url := fmt.Sprintf("http://127.0.0.1:%d", p)
			fmt.Println("Agent-cy zaten açık:", url)
			openBrowser(url)
			time.Sleep(2 * time.Second)
			return
		}
	}

	if _, err := os.Stat(node); err != nil {
		fail("Node bulunamadı: " + node + "\nZip'in tamamını aynı klasöre çıkardığından emin ol.")
	}
	port := freePort()
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	logf, _ := os.OpenFile(filepath.Join(dataDir, "agent-cy.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	var out io.Writer = os.Stdout
	if logf != nil {
		out = io.MultiWriter(os.Stdout, logf)
		defer logf.Close()
	}

	cmd := exec.Command(node, filepath.Join(appDir, "server", "index.js"))
	cmd.Dir = appDir
	cmd.Stdout = out
	cmd.Stderr = out
	cmd.Env = append(os.Environ(),
		"NODE_ENV=production",
		"DATA_DIR="+dataDir,
		"PORT="+strconv.Itoa(port),
		"HOST=127.0.0.1",
		"AJANS_DESKTOP=1",
	)
	if err := cmd.Start(); err != nil {
		fail("Sunucu başlatılamadı: " + err.Error())
	}
	_ = os.WriteFile(portFile, []byte(strconv.Itoa(port)), 0o644)
	defer os.Remove(portFile)

	// Ctrl+C ya da pencere kapanınca sunucuyu da kapat
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() { <-sig; _ = cmd.Process.Kill() }()

	go func() {
		for i := 0; i < 120; i++ {
			if alive(port) {
				fmt.Println()
				fmt.Println("Hazır:", url)
				fmt.Println("Bu pencereyi kapatınca Agent-cy de kapanır.")
				openBrowser(url)
				return
			}
			time.Sleep(500 * time.Millisecond)
		}
		fmt.Println("Sunucu 60 saniyede açılmadı; ayrıntı agent-cy.log dosyasında.")
	}()

	err := cmd.Wait()
	os.Remove(portFile)
	if err != nil {
		fail("Agent-cy kapandı: " + err.Error() + "\nAyrıntı: " + filepath.Join(dataDir, "agent-cy.log"))
	}
}

func alive(port int) bool {
	c := http.Client{Timeout: 1500 * time.Millisecond}
	r, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/meta", port))
	if err != nil {
		return false
	}
	r.Body.Close()
	return r.StatusCode < 500
}

func freePort() int {
	for p := 3700; p < 3800; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			l.Close()
			return p
		}
	}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fail("Boş port bulunamadı: " + err.Error())
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		_ = exec.Command("open", url).Start()
	default:
		_ = exec.Command("xdg-open", url).Start()
	}
}

func fail(msg string) {
	fmt.Println()
	fmt.Println("HATA:", msg)
	fmt.Println("Kapatmak için Enter'a bas.")
	fmt.Scanln()
	os.Exit(1)
}
