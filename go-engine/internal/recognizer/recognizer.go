// Package recognizer defines the unified recognition interface and the
// per-engine implementations (glm, gummy, sosv, vosk). Each mirrors the
// corresponding engine/audio2text/*.py recognizer.
package recognizer

import (
	"context"
	"time"
)

// Recognizer consumes converted mono PCM frames and emits caption/translation
// protocol messages.
type Recognizer interface {
	Start() error
	Run(ctx context.Context, sink <-chan []int16) error
	Stop() error
}

// Common holds translation configuration shared by all engines.
type Common struct {
	SourceLang string
	TargetLang string
	TransModel string // "ollama" | "google"
	OllamaName string
	OllamaURL  string
	OllamaKey  string
}

// timeNow mirrors datetime.now().strftime('%H:%M:%S.%f')[:-3].
func timeNow() string { return time.Now().Format("15:04:05.000") }

// nowTime mirrors datetime.now().strftime('%H:%M:%S.%f')[:-3].
func nowTime() string { return timeNow() }
