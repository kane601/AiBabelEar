//go:build !cgo

package recognizer

import (
	"context"

	"engine/internal/protocol"
)

// SosvStub is used when the engine is built without cgo (CGO_ENABLED=0),
// i.e. sherpa-onnx / onnxruntime are unavailable.
type SosvStub struct{}

// NewSosvRecognizer returns a stub that reports the missing cgo build.
func NewSosvRecognizer(modelPath, source, target string, c Common) Recognizer {
	return &SosvStub{}
}

func (s *SosvStub) Start() error {
	protocol.Error("SOSV engine was not compiled with cgo support; rebuild with CGO_ENABLED=1 and onnxruntime present.")
	return nil
}

func (s *SosvStub) Run(ctx context.Context, sink <-chan []int16) error { return nil }

func (s *SosvStub) Stop() error { return nil }
