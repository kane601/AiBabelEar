// Package model resolves default model directories, mirroring
// utils/__init__.py:default_model_dir.
package model

import (
	"os"
	"path/filepath"
	"runtime"
)

// DefaultModelDir returns the per-engine model directory:
//   - Windows: %APPDATA%/AiBabelEar/<engine>
//   - macOS:   ~/Library/Application Support/AiBabelEar/<engine>
//   - Linux:   ~/.config/AiBabelEar/<engine>
func DefaultModelDir(engine string) string {
	base := appDataBase()
	return filepath.Join(base, "AiBabelEar", engine)
}

func appDataBase() string {
	switch runtime.GOOS {
	case "windows":
		if v := os.Getenv("APPDATA"); v != "" {
			return v
		}
		return homeDir()
	case "darwin":
		return filepath.Join(homeDir(), "Library", "Application Support")
	default:
		return filepath.Join(homeDir(), ".config")
	}
}

func homeDir() string {
	if h, err := os.UserHomeDir(); err == nil && h != "" {
		return h
	}
	return "."
}
