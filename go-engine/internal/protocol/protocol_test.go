package protocol

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

func capture(t *testing.T) (*bytes.Buffer, func()) {
	buf := &bytes.Buffer{}
	old := Default.w
	Default.w = buf
	return buf, func() { Default.w = old }
}

func lastJSON(t *testing.T, buf *bytes.Buffer) map[string]interface{} {
	t.Helper()
	line := strings.TrimSpace(buf.String())
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(line), &m); err != nil {
		t.Fatalf("invalid JSON %q: %v", line, err)
	}
	return m
}

func TestCaptionFormat(t *testing.T) {
	buf, restore := capture(t)
	defer restore()
	Caption(1, "hello", "", "12:00:00.000", "12:00:00.123")
	m := lastJSON(t, buf)
	if m["command"] != "caption" {
		t.Fatalf("command=%v", m["command"])
	}
	if int(m["index"].(float64)) != 1 {
		t.Fatalf("index=%v", m["index"])
	}
	if m["text"] != "hello" {
		t.Fatalf("text=%v", m["text"])
	}
	if m["translation"] != "" {
		t.Fatalf("translation=%v", m["translation"])
	}
	if m["time_s"] != "12:00:00.000" || m["time_t"] != "12:00:00.123" {
		t.Fatalf("time fields=%v %v", m["time_s"], m["time_t"])
	}
}

func TestTranslationFormat(t *testing.T) {
	buf, restore := capture(t)
	defer restore()
	Translation("12:00:00.000", "hi", "bonjour")
	m := lastJSON(t, buf)
	if m["command"] != "translation" {
		t.Fatal("command")
	}
	if m["text"] != "hi" || m["translation"] != "bonjour" {
		t.Fatalf("payload=%v", m)
	}
}

func TestEmptyContentSuppressed(t *testing.T) {
	buf, restore := capture(t)
	defer restore()
	Info("")
	Warn("")
	Error("")
	Print("")
	if buf.Len() != 0 {
		t.Fatalf("expected no output, got %q", buf.String())
	}
}

func TestControlServerStop(t *testing.T) {
	buf, restore := capture(t)
	defer restore()
	s := NewControlServer()
	port := 19876
	if err := s.Listen(port); err != nil {
		t.Skipf("port %d busy: %v", port, err)
	}
	defer s.Close()
	if !strings.Contains(buf.String(), `"command":"connect"`) {
		t.Fatal("connect not emitted")
	}
	conn, err := net.Dial("tcp", fmt.Sprintf("localhost:%d", port))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.Write([]byte(`{"command":"stop"}`))
	select {
	case <-s.Done:
	case <-time.After(2 * time.Second):
		t.Fatal("Done not closed after stop")
	}
}

func TestControlServerBindFail(t *testing.T) {
	buf, restore := capture(t)
	defer restore()
	// Occupy the port first.
	occupied, err := net.Listen("tcp", "localhost:19877")
	if err != nil {
		t.Skip("cannot occupy port")
	}
	defer occupied.Close()
	s := NewControlServer()
	if err := s.Listen(19877); err == nil {
		t.Fatal("expected bind error")
	}
	if !strings.Contains(buf.String(), `"command":"kill"`) {
		t.Fatal("kill not emitted on bind failure")
	}
}
