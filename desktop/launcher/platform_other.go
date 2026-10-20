//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// Windows dışında yalnızca geliştirme ve deneme için
const nodeExe = "node"

func documentsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Documents")
}

func hideWindow(c *exec.Cmd)              {}
func consoleAttached() bool               { return true }
func ensureShortcuts(exe, dataDir string) {}
func showError(msg string)                { fmt.Fprintln(os.Stderr, msg) }

func appBrowser() string {
	for _, b := range []string{"microsoft-edge", "google-chrome", "chromium"} {
		if p, err := exec.LookPath(b); err == nil {
			return p
		}
	}
	return ""
}

func openDefault(url string) {
	cmd := "xdg-open"
	if runtime.GOOS == "darwin" {
		cmd = "open"
	}
	_ = exec.Command(cmd, url).Start()
}
