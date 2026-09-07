package audio

import (
	"context"
	"errors"
)

// errUnsupported is returned on platforms without audio capture support.
var errUnsupported = errors.New("audio capture is not supported on this platform")

// Sink delivers converted mono PCM frames to a recognizer.
type Sink chan []int16

// CaptureConfig configures the capture pipeline.
type CaptureConfig struct {
	DeviceIndex int
	ChunkRate   int // chunks per second
	TargetRate  int // 16000 normally; device rate for gummy (resample=false)
	Resample    bool
	Recorder    *Recorder
}

// captureDevice is implemented per-platform.
type captureDevice interface {
	Close()
	Run(ctx context.Context, cfg CaptureConfig, sink Sink) error
}

// StartCapture opens the device and feeds sink until ctx is done.
func StartCapture(ctx context.Context, cfg CaptureConfig, sink Sink) error {
	cd, err := openCapture(cfg.DeviceIndex)
	if err != nil {
		return err
	}
	defer cd.Close()
	return cd.Run(ctx, cfg, sink)
}
