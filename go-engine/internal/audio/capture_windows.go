//go:build windows

package audio

import (
	"context"
	"fmt"
	"time"
	"unsafe"

	"github.com/go-ole/go-ole"
	"github.com/moutend/go-wca/pkg/wca"
)

// deviceInfo is the internal (non-serialized) representation of a device.
type deviceInfo struct {
	dev        *wca.IMMDevice
	id         string
	name       string
	render     bool // true = render endpoint (loopback source)
	channels   int
	sampleRate int
	index      int
}

func kindOf(render bool) string {
	if render {
		return "loopback"
	}
	return "microphone"
}

func withCOM(fn func() error) error {
	// COINIT_MULTITHREADED is safe for WASAPI capture on a dedicated goroutine.
	if err := ole.CoInitializeEx(0, ole.COINIT_MULTITHREADED); err != nil {
		// Already initialized on this thread is not an error.
	}
	defer ole.CoUninitialize()
	return fn()
}

func newEnumerator() (*wca.IMMDeviceEnumerator, error) {
	var enumerator *wca.IMMDeviceEnumerator
	if err := wca.CoCreateInstance(
		wca.CLSID_MMDeviceEnumerator, 0, wca.CLSCTX_ALL,
		wca.IID_IMMDeviceEnumerator, &enumerator,
	); err != nil {
		return nil, err
	}
	return enumerator, nil
}

func describeDevice(dev *wca.IMMDevice, render bool) (deviceInfo, error) {
	var ps *wca.IPropertyStore
	if err := dev.OpenPropertyStore(wca.STGM_READ, &ps); err != nil {
		return deviceInfo{}, err
	}
	defer ps.Release()

	var pv wca.PROPVARIANT
	if err := ps.GetValue(&wca.PKEY_Device_FriendlyName, &pv); err != nil {
		return deviceInfo{}, err
	}
	name := pv.String()

	var ac *wca.IAudioClient
	if err := dev.Activate(wca.IID_IAudioClient, wca.CLSCTX_ALL, nil, &ac); err != nil {
		return deviceInfo{}, err
	}
	defer ac.Release()

	var wfx *wca.WAVEFORMATEX
	if err := ac.GetMixFormat(&wfx); err != nil {
		return deviceInfo{}, err
	}

	id := ""
	_ = dev.GetId(&id)

	return deviceInfo{
		dev:        dev,
		id:         id,
		name:       name,
		render:     render,
		channels:   int(wfx.NChannels),
		sampleRate: int(wfx.NSamplesPerSec),
	}, nil
}

func enumFlow(flow uint32, render bool) ([]deviceInfo, error) {
	enumerator, err := newEnumerator()
	if err != nil {
		return nil, err
	}
	defer enumerator.Release()

	var coll *wca.IMMDeviceCollection
	if err := enumerator.EnumAudioEndpoints(flow, wca.DEVICE_STATE_ACTIVE, &coll); err != nil {
		return nil, err
	}
	defer coll.Release()

	var count uint32
	if err := coll.GetCount(&count); err != nil {
		return nil, err
	}

	out := make([]deviceInfo, 0, count)
	for i := uint32(0); i < count; i++ {
		var dev *wca.IMMDevice
		if err := coll.Item(i, &dev); err != nil {
			continue
		}
		info, err := describeDevice(dev, render)
		if err != nil {
			dev.Release()
			continue
		}
		out = append(out, info)
	}
	return out, nil
}

func collectDevices() ([]deviceInfo, error) {
	infos, err := enumFlow(wca.ECapture, false)
	if err != nil {
		return nil, err
	}
	renderDevs, err := enumFlow(wca.ERender, true)
	if err != nil {
		return nil, err
	}
	infos = append(infos, renderDevs...)

	// De-duplicate by name (keep first), mirroring Python's WASAPI-first dedup.
	seen := make(map[string]bool)
	out := infos[:0]
	for _, d := range infos {
		if seen[d.name] {
			d.dev.Release()
			continue
		}
		seen[d.name] = true
		out = append(out, d)
	}
	for i := range out {
		out[i].index = i
	}
	return out, nil
}

// EnumerateDevices lists available input devices (Windows WASAPI).
func EnumerateDevices() ([]Device, error) {
	var result []Device
	err := withCOM(func() error {
		infos, e := collectDevices()
		if e != nil {
			return e
		}
		defer func() {
			for _, d := range infos {
				d.dev.Release()
			}
		}()
		for _, d := range infos {
			result = append(result, Device{
				Index:             d.index,
				Name:              d.name,
				MaxInputChannels:  d.channels,
				DefaultSampleRate: d.sampleRate,
				IsLoopback:        d.render,
				Kind:              kindOf(d.render),
			})
		}
		return nil
	})
	return result, err
}

// openCapture resolves a device by index and returns a captureDevice.
func openCapture(index int) (captureDevice, error) {
	var cd *wasapiCapture
	err := withCOM(func() error {
		infos, e := collectDevices()
		if e != nil {
			return e
		}
		found := false
		for _, d := range infos {
			if d.index == index {
				cd = &wasapiCapture{dev: d.dev, render: d.render, channels: d.channels, sampleRate: d.sampleRate, id: d.id}
				found = true
			} else {
				d.dev.Release()
			}
		}
		if !found {
			return fmt.Errorf("audio device index %d not found", index)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return cd, nil
}

type wasapiCapture struct {
	dev        *wca.IMMDevice
	render     bool
	channels   int
	sampleRate int
	id         string
}

// DefaultDeviceIndex returns the index of the first loopback (audio_type 0) or
// microphone (audio_type 1) device, mirroring Python's default-device logic.
func DefaultDeviceIndex(audioType int) (int, error) {
	idx := -1
	err := withCOM(func() error {
		infos, e := collectDevices()
		if e != nil {
			return e
		}
		defer func() {
			for _, d := range infos {
				d.dev.Release()
			}
		}()
		for _, d := range infos {
			if audioType == 0 && d.render {
				idx = d.index
				return nil
			}
			if audioType == 1 && !d.render {
				idx = d.index
				return nil
			}
		}
		return nil
	})
	return idx, err
}

// DeviceSampleRate returns the mix-format sample rate of the device at index.
func DeviceSampleRate(index int) (int, error) {
	rate := 0
	err := withCOM(func() error {
		infos, e := collectDevices()
		if e != nil {
			return e
		}
		defer func() {
			for _, d := range infos {
				d.dev.Release()
			}
		}()
		for _, d := range infos {
			if d.index == index {
				rate = d.sampleRate
				return nil
			}
		}
		return nil
	})
	return rate, err
}

// DeviceChannels returns the mix-format channel count of the device at index.
// Mirrors engine/sysaudio/win.py AudioStream.CHANNELS (device maxInputChannels).
func DeviceChannels(index int) (int, error) {
	ch := 0
	err := withCOM(func() error {
		infos, e := collectDevices()
		if e != nil {
			return e
		}
		defer func() {
			for _, d := range infos {
				d.dev.Release()
			}
		}()
		for _, d := range infos {
			if d.index == index {
				ch = d.channels
				return nil
			}
		}
		return nil
	})
	return ch, err
}

func (c *wasapiCapture) Close() {
	if c.dev != nil {
		c.dev.Release()
		c.dev = nil
	}
}

func (c *wasapiCapture) Run(ctx context.Context, cfg CaptureConfig, sink Sink) error {
	return withCOM(func() error {
		var ac *wca.IAudioClient
		if err := c.dev.Activate(wca.IID_IAudioClient, wca.CLSCTX_ALL, nil, &ac); err != nil {
			return err
		}
		defer ac.Release()

		var wfx *wca.WAVEFORMATEX
		if err := ac.GetMixFormat(&wfx); err != nil {
			return err
		}
		channels := int(wfx.NChannels)
		deviceRate := int(wfx.NSamplesPerSec)

		streamFlags := uint32(0)
		if c.render {
			streamFlags = wca.AUDCLNT_STREAMFLAGS_LOOPBACK
		}
		if err := ac.Initialize(wca.AUDCLNT_SHAREMODE_SHARED, streamFlags, 0, 0, wfx, nil); err != nil {
			return err
		}

		var bufSize uint32
		if err := ac.GetBufferSize(&bufSize); err != nil {
			return err
		}
		_ = bufSize

		var cc *wca.IAudioCaptureClient
		if err := ac.GetService(wca.IID_IAudioCaptureClient, &cc); err != nil {
			return err
		}
		defer cc.Release()

		if err := ac.Start(); err != nil {
			return err
		}
		defer ac.Stop()

		sleepDur := time.Millisecond * 10
		if cfg.ChunkRate > 0 {
			sleepDur = time.Millisecond * time.Duration(1000/cfg.ChunkRate/2)
		}

		for {
			select {
			case <-ctx.Done():
				return nil
			default:
			}

			var frames, flags uint32
			var data *byte
			if err := cc.GetBuffer(&data, &frames, &flags, nil, nil); err != nil {
				select {
				case <-ctx.Done():
					return nil
				case <-time.After(sleepDur):
					continue
				}
			}
			if frames > 0 {
				n := int(frames) * channels * 2
				buf := unsafe.Slice((*byte)(data), n)
				mono := MergeChannels(buf, channels)
				if cfg.Resample && deviceRate != cfg.TargetRate {
					mono = ResampleMono(mono, deviceRate, cfg.TargetRate)
				}
				// 对齐 Python audio_recording：录音写入设备原生（多通道、设备采样率）
				// 的原始字节，而非重采样后的单声道。
				if cfg.Recorder != nil {
					raw := make([]byte, n)
					copy(raw, buf)
					_ = cfg.Recorder.Write(raw)
				}
				select {
				case sink <- mono:
				case <-ctx.Done():
					cc.ReleaseBuffer(frames)
					return nil
				}
				cc.ReleaseBuffer(frames)
			} else {
				select {
				case <-ctx.Done():
					return nil
				case <-time.After(sleepDur):
				}
			}
		}
	})
}
