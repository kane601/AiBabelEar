package translate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestStripThink(t *testing.T) {
	got := stripThink("<think>reasoning</think>bonjour")
	if got != "bonjour" {
		t.Fatalf("got %q", got)
	}
	if stripThink("plain") != "plain" {
		t.Fatal("plain unchanged")
	}
}

func TestParseGoogle(t *testing.T) {
	raw := `[["你好","hello",null,null,1],["","",null,null,1]]`
	if parseGoogle([]byte(raw)) != "你好" {
		t.Fatal("parseGoogle failed")
	}
}

func TestOllamaTranslateOpenAI(t *testing.T) {
	buf, restore := capture(t)
	defer restore()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sek" {
			t.Errorf("missing auth")
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"choices": []map[string]interface{}{
				{"message": map[string]string{"content": "<think>x</think>bonjour"}},
			},
		})
	}))
	defer srv.Close()

	OllamaTranslate("m", "en", "hello", "12:00:00.000", srv.URL, "sek")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &m); err != nil {
		t.Fatal(err)
	}
	if m["command"] != "translation" {
		t.Fatalf("command=%v", m["command"])
	}
	if m["translation"] != "bonjour" {
		t.Fatalf("translation not stripped: %v", m["translation"])
	}
	if m["text"] != "hello" {
		t.Fatalf("text=%v", m["text"])
	}
}

func TestOllamaTranslateStripsThinkFromNonJSON(t *testing.T) {
	if !strings.Contains(stripThink("<think>1</think>世界"), "世界") {
		t.Fatal("stripThink broke CJK")
	}
}
