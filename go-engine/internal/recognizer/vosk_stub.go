//go:build !cgo || novosk

package recognizer

import (
	"context"

	"engine/internal/protocol"
)

// VoskStub is used when built without cgo (no libvosk available).
type VoskStub struct{}

// NewVoskRecognizer returns a stub that reports the missing cgo build.
func NewVoskRecognizer(modelPath, target string, c Common) Recognizer {
	return &VoskStub{}
}

func (s *VoskStub) Start() error {
	protocol.Error("Vosk engine was not compiled with cgo support; rebuild with CGO_ENABLED=1 and libvosk present.")
	return nil
}

func (s *VoskStub) Run(ctx context.Context, sink <-chan []int16) error { return nil }

func (s *VoskStub) Stop() error { return nil }
