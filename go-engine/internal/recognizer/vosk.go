//go:build cgo && !novosk

package recognizer

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	vosk "github.com/alphacep/vosk-api/go"

	"engine/internal/audio"
	"engine/internal/model"
	"engine/internal/protocol"
	"engine/internal/translate"
)

// VoskRecognizer mirrors engine/audio2text/vosk.py using the vosk-api binding.
type VoskRecognizer struct {
	common      Common
	target      string
	recognizer  *vosk.VoskRecognizer
	timeStr     string
	curID       int
	prevContent string
}

// NewVoskRecognizer builds a Vosk recognizer.
func NewVoskRecognizer(modelPath, target string, c Common) Recognizer {
	vosk.SetLogLevel(-1)
	mp := resolveVoskModelPath(modelPath)
	model, err := vosk.NewModel(mp)
	if err != nil {
		protocol.Error("Failed to load Vosk model: " + err.Error())
		return &voskUnavailable{}
	}
	rec, err := vosk.NewRecognizer(model, 16000.0)
	if err != nil {
		protocol.Error("Failed to create Vosk recognizer: " + err.Error())
		return &voskUnavailable{}
	}
	return &VoskRecognizer{common: c, target: target, recognizer: rec}
}

func (r *VoskRecognizer) Start() error {
	protocol.Info("Vosk recognizer started.")
	return nil
}

func (r *VoskRecognizer) Run(ctx context.Context, sink <-chan []int16) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case chunk, ok := <-sink:
			if !ok {
				return nil
			}
			r.sendFrame(chunk)
		}
	}
}

func (r *VoskRecognizer) sendFrame(data []int16) {
	b := audio.Int16ToBytesLE(data)
	if r.recognizer.AcceptWaveform(b) != 0 {
		var res struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal([]byte(r.recognizer.Result()), &res)
		// 对齐 vosk.py：final 结果先重置 prevContent，空文本直接 return（不输出、
		// 不自增 index）；非空时先用当前 curID 输出，再自增，且 time_s 沿用既有
		// timeStr（Python 在 final 分支不重置 time_str）。
		r.prevContent = ""
		if res.Text == "" {
			return
		}
		protocol.Caption(r.curID, res.Text, "", r.timeStr, nowTime())
		r.curID++
		if r.target != "" && r.target != "none" {
			r.translate(res.Text, r.timeStr)
		}
		return
	}
	var res struct {
		Partial string `json:"partial"`
	}
	_ = json.Unmarshal([]byte(r.recognizer.PartialResult()), &res)
	if res.Partial == "" || res.Partial == r.prevContent {
		return
	}
	if r.prevContent == "" {
		r.timeStr = nowTime()
	}
	protocol.Caption(r.curID, res.Partial, "", r.timeStr, nowTime())
	r.prevContent = res.Partial
}

func (r *VoskRecognizer) translate(text, timeS string) {
	if r.common.TransModel == "google" {
		go translate.GoogleTranslate("", r.common.TargetLang, text, timeS, "", "")
	} else {
		go translate.OllamaTranslate(r.common.OllamaName, r.common.TargetLang, text, timeS, r.common.OllamaURL, r.common.OllamaKey)
	}
}

func (r *VoskRecognizer) Stop() error {
	protocol.Info("Vosk recognizer closed.")
	return nil
}

// --- model path resolution (mirrors vosk.py) ---

func isVoskModelDir(p string) bool {
	if fi, err := os.Stat(p); err != nil || !fi.IsDir() {
		return false
	}
	if _, err := os.Stat(filepath.Join(p, "conf")); err == nil {
		return true
	}
	entries, err := os.ReadDir(p)
	if err != nil {
		return false
	}
	for _, e := range entries {
		n := e.Name()
		if strings.HasSuffix(n, ".fst") || n == "model" || strings.HasSuffix(n, ".ini") || n == "graph" {
			return true
		}
	}
	return false
}

func resolveVoskModelPath(modelPath string) string {
	modelPath = strings.TrimSpace(strings.Trim(modelPath, "\""))
	if modelPath == "" {
		modelPath = model.DefaultModelDir("Vosk")
	}
	modelPath = strings.TrimSpace(strings.Trim(modelPath, "\""))
	if !isVoskModelDir(modelPath) {
		entries, err := os.ReadDir(modelPath)
		if err == nil {
			var subs []string
			for _, e := range entries {
				if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
					subs = append(subs, e.Name())
				}
			}
			if len(subs) == 1 {
				return filepath.Join(modelPath, subs[0])
			}
			if len(subs) > 1 {
				protocol.Warn("Multiple Vosk models found under " + modelPath + ", please set voskModelPath to a specific model folder.")
			}
		}
	}
	return modelPath
}

// voskUnavailable is returned by NewVoskRecognizer in the cgo build when the
// Vosk model or recognizer cannot be initialized. The failure is already
// reported via protocol.Error; this stub satisfies the Recognizer interface so
// the engine can keep running without crashing.
type voskUnavailable struct{}

func (voskUnavailable) Start() error { return nil }
func (voskUnavailable) Run(ctx context.Context, sink <-chan []int16) error {
	return nil
}
func (voskUnavailable) Stop() error { return nil }
