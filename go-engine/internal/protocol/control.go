package protocol

import (
	"encoding/json"
	"fmt"
	"net"
)

// ControlServer is a localhost TCP server. The Node host connects to it after
// receiving the "connect" message, and can send {"command":"stop"} to request
// a graceful shutdown. It mirrors utils/server.py.
type ControlServer struct {
	listener net.Listener
	Done     chan struct{}
}

// NewControlServer creates a control server. Done is closed when a stop
// command is received or the connection drops.
func NewControlServer() *ControlServer {
	return &ControlServer{Done: make(chan struct{})}
}

// Listen binds to localhost:<port>. On success it emits "connect". On failure
// it emits "kill" and returns the error so the caller can exit.
func (s *ControlServer) Listen(port int) error {
	ln, err := net.Listen("tcp", fmt.Sprintf("localhost:%d", port))
	if err != nil {
		Kill()
		return err
	}
	s.listener = ln
	Connect()
	go s.serve()
	return nil
}

func (s *ControlServer) serve() {
	conn, err := s.listener.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	dec := json.NewDecoder(conn)
	for {
		var msg struct {
			Command string `json:"command"`
		}
		if err := dec.Decode(&msg); err != nil {
			break
		}
		if msg.Command == "stop" {
			break
		}
	}
	s.signalStop()
}

func (s *ControlServer) signalStop() {
	select {
	case <-s.Done:
	default:
		close(s.Done)
	}
}

// Close stops accepting new connections.
func (s *ControlServer) Close() {
	if s.listener != nil {
		s.listener.Close()
	}
}
