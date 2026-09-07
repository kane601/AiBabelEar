package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestAtoidDefault(t *testing.T) {
	cases := map[string]int{"": -1, "5": 5, "-3": -3, " 10 ": 10}
	for in, want := range cases {
		got, _ := atoiDefault(in, -1)
		if got != want {
			t.Fatalf("%q: got %d want %d", in, got, want)
		}
	}
}

func TestBuildRecordPath(t *testing.T) {
	p := buildRecordPath("", 16000)
	if !strings.HasSuffix(p, ".wav") {
		t.Fatalf("not wav: %s", p)
	}
	p2 := buildRecordPath(`"C:\tmp"`, 16000)
	if filepath.Ext(p2) != ".wav" {
		t.Fatalf("ext: %s", p2)
	}
	if !strings.Contains(p2, "tmp") {
		t.Fatalf("dir lost: %s", p2)
	}
}

func TestListDevicesIntegration(t *testing.T) {
	cmd := exec.Command("go", "run", ".", "--list-devices")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	out, err := cmd.Output()
	if err != nil {
		t.Skipf("go run failed: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	last := lines[len(lines)-1]
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(last), &m); err != nil {
		t.Fatal(err)
	}
	devs, ok := m["devices"].([]interface{})
	if !ok {
		t.Fatal("no devices array")
	}
	if len(devs) == 0 {
		t.Fatal("empty devices")
	}
}

// TestEngineLifecycleIntegration starts the real binary (glm engine) with a
// control port, verifies it emits "connect", then drives a graceful shutdown
// via the TCP "stop" command and asserts a clean exit (exit code 0).
func TestEngineLifecycleIntegration(t *testing.T) {
	port := 19991
	cmd := exec.Command("go", "run", ".", "-e", "glm", "-p", strconv.Itoa(port), "-a", "0")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Skipf("stdout pipe: %v", err)
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		t.Skipf("start failed: %v", err)
	}
	defer func() { _ = cmd.Process.Kill() }()

	connected := make(chan struct{}, 1)
	go func() {
		sc := bufio.NewScanner(out)
		for sc.Scan() {
			if strings.Contains(sc.Text(), `"command":"connect"`) {
				select {
				case <-connected:
				default:
					close(connected)
				}
			}
		}
	}()

	select {
	case <-connected:
	case <-time.After(8 * time.Second):
		t.Skip("engine did not emit connect (audio device may be unavailable)")
	}

	// Drive graceful shutdown via TCP stop (best effort).
	if conn, derr := net.Dial("tcp", fmt.Sprintf("localhost:%d", port)); derr == nil {
		_, _ = conn.Write([]byte(`{"command":"stop"}`))
		_ = conn.Close()
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("engine exited with error: %v", err)
		}
	case <-time.After(6 * time.Second):
		t.Fatal("engine did not exit after stop")
	}
}
