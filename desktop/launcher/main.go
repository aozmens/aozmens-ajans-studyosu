// Agent-cy masaüstü başlatıcısı. Paketteki taşınabilir Node ile sunucuyu yalnızca bu bilgisayarda (127.0.0.1)
// arka planda başlatır ve Agent-cy'yi kendi uygulama penceresinde açar (Edge/Chrome uygulama modu; adres çubuğu yok).
// Pencere kapanınca sunucu da kapanır. Veriler Belgeler\Agent-cy klasöründe durur.
// Program zaten açıksa yenisini başlatmaz, açık olanın penceresini getirir.
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
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	exe, _ := os.Executable()
	base := filepath.Dir(exe)
	appDir := filepath.Join(base, "app")
	node := filepath.Join(base, "runtime", nodeExe)

	dataDir := os.Getenv("AGENT_CY_DATA")
	if dataDir == "" {
		dataDir = filepath.Join(documentsDir(), "Agent-cy")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		fail("Veri klasörü oluşturulamadı:\n" + dataDir + "\n\n" + err.Error())
	}

	// Açık bir Agent-cy varsa yalnızca penceresini aç
	portFile := filepath.Join(dataDir, ".port")
	if b, err := os.ReadFile(portFile); err == nil {
		if p, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil && alive(p) {
			openWindow(fmt.Sprintf("http://127.0.0.1:%d", p), dataDir)
			return
		}
	}

	if _, err := os.Stat(node); err != nil {
		fail("Node bulunamadı:\n" + node + "\n\nZip'in tamamını aynı klasöre çıkardığından emin ol.")
	}
	ensureShortcuts(exe, dataDir)

	port := freePort()
	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	logPath := filepath.Join(dataDir, "agent-cy.log")
	var out io.Writer = os.Stdout
	if logf, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644); err == nil {
		defer logf.Close()
		out = logf
		if consoleAttached() {
			out = io.MultiWriter(os.Stdout, logf)
		}
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
		"APP_PASSWORD=",
	)
	hideWindow(cmd)
	if err := cmd.Start(); err != nil {
		fail("Agent-cy başlatılamadı: " + err.Error())
	}
	_ = os.WriteFile(portFile, []byte(strconv.Itoa(port)), 0o644)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() { <-sig; _ = cmd.Process.Kill() }()

	go func() {
		for i := 0; i < 120; i++ {
			if alive(port) {
				fmt.Fprintln(out, "Hazır:", url)
				openWindow(url, dataDir)
				return
			}
			time.Sleep(500 * time.Millisecond)
		}
		_ = cmd.Process.Kill()
		fail("Agent-cy 60 saniyede açılmadı.\nAyrıntı: " + logPath)
	}()

	// Sunucu, uygulama penceresi kapanınca kendiliğinden kapanır
	err := cmd.Wait()
	os.Remove(portFile)
	if err != nil && !strings.Contains(err.Error(), "killed") {
		fail("Agent-cy beklenmedik biçimde kapandı.\nAyrıntı: " + logPath)
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

// Edge ya da Chrome varsa ayrı profil ve uygulama modunda (kendi penceresi, kendi görev çubuğu simgesi) açar
func openWindow(url, dataDir string) {
	if b := appBrowser(); b != "" {
		profile := filepath.Join(dataDir, ".pencere")
		c := exec.Command(b, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check",
			"--disable-sync", "--disable-features=msEdgeStartupBoost,Translate,msImplicitSignin,msEdgeSyncConsent", "--window-size=1440,920", "--lang=tr")
		if c.Start() == nil {
			go c.Wait()
			return
		}
	}
	openDefault(url)
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "HATA:", msg)
	showError(msg)
	os.Exit(1)
}
