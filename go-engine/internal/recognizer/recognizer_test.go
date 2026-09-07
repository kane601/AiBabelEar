package recognizer

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"engine/internal/protocol"
)

func capture(t *testing.T) (*bytes.Buffer, func()) {
	buf := &bytes.Buffer{}
	prev := protocol.CurrentOutput()
	protocol.SetOutput(buf)
	return buf, func() { protocol.SetOutput(prev) }
}

// TestGummyCaptionMapping verifies the sentence_id -> index mapping and the
// caption field contract (text + attached translation) match the Python
// gummy.py callback output.
func TestGummyCaptionMapping(t *testing.T) {
	buf, restore := capture(t)
	defer restore()

	g := NewGummyRecognizer(16000, "zh", "en", "key", Common{TargetLang: "en"})

	g.onTranscription(1, "你好")
	g.onTranslation(1, "hello")
	g.onTranscription(2, "世界")
	g.onTranslation(2, "world")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected 4 caption lines, got %d: %v", len(lines), lines)
	}

	var first map[string]interface{}
	_ = json.Unmarshal([]byte(lines[0]), &first)
	if first["command"] != "caption" {
		t.Fatalf("command=%v", first["command"])
	}
	if int(first["index"].(float64)) != 0 {
		t.Fatalf("first index should be 0, got %v", first["index"])
	}
	if first["text"] != "你好" {
		t.Fatalf("text=%v", first["text"])
	}
	if first["translation"] != "" {
		t.Fatalf("first should have empty translation, got %v", first["translation"])
	}

	// lines[1] is the translation update for sentence 1.
	var upd map[string]interface{}
	_ = json.Unmarshal([]byte(lines[1]), &upd)
	if upd["translation"] != "hello" {
		t.Fatalf("translation should be attached: %v", upd["translation"])
	}
	if upd["text"] != "你好" {
		t.Fatalf("translation caption should keep text: %v", upd["text"])
	}
	if int(upd["index"].(float64)) != 0 {
		t.Fatalf("translation index should be 0, got %v", upd["index"])
	}

	var second map[string]interface{}
	_ = json.Unmarshal([]byte(lines[2]), &second)
	if int(second["index"].(float64)) != 1 {
		t.Fatalf("second index should be 1, got %v", second["index"])
	}
	if second["text"] != "世界" || second["translation"] != "" {
		t.Fatalf("second transcription=%v", second)
	}

	// lines[3] is the translation update for sentence 2.
	var upd2 map[string]interface{}
	_ = json.Unmarshal([]byte(lines[3]), &upd2)
	if upd2["translation"] != "world" {
		t.Fatalf("second translation should be world, got %v", upd2["translation"])
	}
	if int(upd2["index"].(float64)) != 1 {
		t.Fatalf("second translation index should be 1, got %v", upd2["index"])
	}
}

// TestGummyUsage verifies the usage command is emitted on TranslationInfo.
func TestGummyUsage(t *testing.T) {
	buf, restore := capture(t)
	defer restore()
	g := NewGummyRecognizer(16000, "zh", "en", "key", Common{TargetLang: "en"})
	g.handleEvent([]byte(`{"header":{"name":"TranslationInfo"},"payload":{"usage":{"duration":42}}}`))
	if !strings.Contains(buf.String(), `"command":"usage"`) {
		t.Fatalf("usage not emitted: %s", buf.String())
	}
}
