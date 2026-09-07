// Package protocol implements the stdout line protocol and the TCP control
// channel used by the AiVoiceEars Node (Electron) host to talk to the engine.
//
// Every message is a single line of UTF-8 JSON. This must stay byte-for-byte
// compatible with engine/utils/sysout.py on the Python side.
package protocol

import (
	"encoding/json"
	"io"
	"os"
	"sync"
)

// Command names (mirror utils/sysout.py stdout_cmd command field).
const (
	CmdConnect     = "connect"
	CmdKill        = "kill"
	CmdCaption     = "caption"
	CmdTranslation = "translation"
	CmdPrint       = "print"
	CmdInfo        = "info"
	CmdWarn        = "warn"
	CmdError       = "error"
	CmdUsage       = "usage"
)

// Emitter serializes protocol messages to an io.Writer (default os.Stdout).
// It is safe for concurrent use.
type Emitter struct {
	mu sync.Mutex
	w  io.Writer
}

// Default is the process-wide emitter bound to os.Stdout.
var Default = &Emitter{w: os.Stdout}

// SetOutput overrides the writer used by the package-level helpers (tests).
func SetOutput(w io.Writer) { Default.w = w }

// CurrentOutput returns the current writer (used by tests to restore it).
func CurrentOutput() io.Writer { return Default.w }

func (e *Emitter) emit(obj map[string]interface{}) {
	b, err := json.Marshal(obj)
	if err != nil {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	// Guarantee one JSON object per line, terminated by '\n'.
	e.w.Write(b)
	e.w.Write([]byte{'\n'})
}

func (e *Emitter) emitKV(command, content string) {
	if content == "" {
		return
	}
	e.emit(map[string]interface{}{"command": command, "content": content})
}

// --- Command helpers (package level, bound to Default) ---

// Connect is emitted once the TCP control server has bound successfully.
func Connect() { Default.emit(map[string]interface{}{"command": CmdConnect}) }

// Kill is emitted when the engine must self-terminate (e.g. bind failure).
func Kill() { Default.emit(map[string]interface{}{"command": CmdKill}) }

func Info(s string) { Default.emitKV(CmdInfo, s) }
func Warn(s string) { Default.emitKV(CmdWarn, s) }
func Error(s string) {
	if s == "" {
		return
	}
	Default.emit(map[string]interface{}{"command": CmdError, "content": s})
}
func Print(s string) { Default.emitKV(CmdPrint, s) }
func Usage(s string) { Default.emitKV(CmdUsage, s) }

// Caption emits a recognition result. Fields mirror SosvRecognizer/VoskRecognizer output.
func Caption(index int, text, translation, timeS, timeT string) {
	Default.emit(map[string]interface{}{
		"command":     CmdCaption,
		"index":       index,
		"text":        text,
		"translation": translation,
		"time_s":      timeS,
		"time_t":      timeT,
	})
}

// Translation emits a translation result. Mirrors translation.py stdout_obj.
func Translation(timeS, text, translation string) {
	Default.emit(map[string]interface{}{
		"command":     CmdTranslation,
		"time_s":      timeS,
		"text":        text,
		"translation": translation,
	})
}
