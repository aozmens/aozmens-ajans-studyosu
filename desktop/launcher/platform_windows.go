//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"
)

const nodeExe = "node.exe"

// Gerçek Belgeler klasörü (OneDrive'a taşınmış olsa da)
func documentsDir() string {
	if p, err := windows.KnownFolderPath(windows.FOLDERID_Documents, 0); err == nil && p != "" {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Documents")
}

func hideWindow(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}

func consoleAttached() bool { return false }

func appBrowser() string {
	var list []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LocalAppData"} {
		if d := os.Getenv(env); d != "" {
			list = append(list, filepath.Join(d, "Microsoft", "Edge", "Application", "msedge.exe"), filepath.Join(d, "Google", "Chrome", "Application", "chrome.exe"))
		}
	}
	for _, p := range list {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func openDefault(url string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func showError(msg string) {
	t, _ := windows.UTF16PtrFromString("Agent-cy")
	m, _ := windows.UTF16PtrFromString(msg)
	windows.MessageBox(0, m, t, windows.MB_OK|windows.MB_ICONERROR)
}

// İlk açılışta Masaüstü ve Başlat menüsüne Agent-cy kısayolu (silinirse yeniden oluşturulmaz)
func ensureShortcuts(exe, dataDir string) {
	flag := filepath.Join(dataDir, ".kisayol")
	if _, err := os.Stat(flag); err == nil {
		return
	}
	q := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	ps := "$s=New-Object -ComObject WScript.Shell;" +
		"foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){" +
		"$l=$s.CreateShortcut((Join-Path $d 'Agent-cy.lnk'));$l.TargetPath=" + q(exe) + ";$l.WorkingDirectory=" + q(filepath.Dir(exe)) +
		";$l.IconLocation=" + q(exe+",0") + ";$l.Description='Agent-cy';$l.Save()}"
	c := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps)
	hideWindow(c)
	if c.Run() == nil {
		_ = os.WriteFile(flag, []byte("1"), 0o644)
	}
}
