//go:build !windows

package audio

import (
	"context"
	"errors"
	"fmt"
)

// EnumerateDevices is unsupported off Windows in this build.
func EnumerateDevices() ([]Device, error) {
	return nil, errors.New("audio device enumeration is only supported on windows in this build")
}

// DefaultDeviceIndex is unsupported off Windows.
func DefaultDeviceIndex(audioType int) (int, error) {
	return -1, errUnsupported
}

// DeviceSampleRate is unsupported off Windows.
func DeviceSampleRate(index int) (int, error) {
	return 0, errUnsupported
}

// DeviceChannels is unsupported off Windows.
func DeviceChannels(index int) (int, error) {
	return 0, errUnsupported
}

func openCapture(index int) (captureDevice, error) {
	return nil, fmt.Errorf("audio capture is not supported on this platform (device %d)", index)
}

// ensure captureDevice interface is satisfied by a concrete stub if needed.
var _ captureDevice = (*stubCapture)(nil)

type stubCapture struct{}

func (s *stubCapture) Close() {}
func (s *stubCapture) Run(ctx context.Context, cfg CaptureConfig, sink Sink) error {
	return errUnsupported
}
