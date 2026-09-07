package audio

import (
	"bytes"
	"encoding/binary"
	"os"
	"sync"
)

// Recorder writes 16-bit PCM WAV files, mirroring engine audio_recording's
// wave.open writeframes behaviour.
type Recorder struct {
	mu        sync.Mutex
	f         *os.File
	channels  int
	rate      int
	sampWidth int
	dataLen   int
	closed    bool
}

// NewRecorder creates a WAV recorder. The header is written with a placeholder
// data length and fixed up on Close.
func NewRecorder(path string, channels, rate int) (*Recorder, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	r := &Recorder{f: f, channels: channels, rate: rate, sampWidth: 2}
	if err := r.writeHeader(0); err != nil {
		f.Close()
		return nil, err
	}
	return r, nil
}

func (r *Recorder) writeHeader(dataLen int) error {
	var buf bytes.Buffer
	buf.WriteString("RIFF")
	binary.Write(&buf, binary.LittleEndian, uint32(36+dataLen))
	buf.WriteString("WAVE")
	buf.WriteString("fmt ")
	binary.Write(&buf, binary.LittleEndian, uint32(16))
	binary.Write(&buf, binary.LittleEndian, uint16(1)) // PCM
	binary.Write(&buf, binary.LittleEndian, uint16(r.channels))
	binary.Write(&buf, binary.LittleEndian, uint32(r.rate))
	byteRate := uint32(r.rate * r.channels * r.sampWidth)
	binary.Write(&buf, binary.LittleEndian, byteRate)
	blockAlign := uint16(r.channels * r.sampWidth)
	binary.Write(&buf, binary.LittleEndian, blockAlign)
	binary.Write(&buf, binary.LittleEndian, uint16(8*r.sampWidth))
	buf.WriteString("data")
	binary.Write(&buf, binary.LittleEndian, uint32(dataLen))
	_, err := r.f.WriteAt(buf.Bytes(), 0)
	return err
}

// Write appends raw PCM bytes (device-native channels/rate) to the file.
// Mirrors engine/main.py audio_recording, which writes the raw device chunk
// (stream.CHANNELS, stream.RATE) verbatim via wave.writeframes.
func (r *Recorder) Write(data []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return nil
	}
	n, err := r.f.Write(data)
	if err != nil {
		return err
	}
	r.dataLen += n
	return nil
}

// Close finalizes the WAV header.
func (r *Recorder) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return nil
	}
	r.closed = true
	if err := r.writeHeader(r.dataLen); err != nil {
		r.f.Close()
		return err
	}
	return r.f.Close()
}

// WavBytes encodes mono int16 PCM frames into a complete WAV byte slice
// (used by the GLM recognizer, which POSTs WAV to the API).
func WavBytes(frames []int16, rate int) []byte {
	var buf bytes.Buffer
	_ = writeWavTo(&buf, frames, rate)
	return buf.Bytes()
}

func writeWavTo(buf *bytes.Buffer, frames []int16, rate int) error {
	channels := 1
	sampWidth := 2
	data := Int16ToBytesLE(frames)
	dataLen := len(data)
	buf.WriteString("RIFF")
	binary.Write(buf, binary.LittleEndian, uint32(36+dataLen))
	buf.WriteString("WAVE")
	buf.WriteString("fmt ")
	binary.Write(buf, binary.LittleEndian, uint32(16))
	binary.Write(buf, binary.LittleEndian, uint16(1))
	binary.Write(buf, binary.LittleEndian, uint16(channels))
	binary.Write(buf, binary.LittleEndian, uint32(rate))
	binary.Write(buf, binary.LittleEndian, uint32(rate*channels*sampWidth))
	binary.Write(buf, binary.LittleEndian, uint16(channels*sampWidth))
	binary.Write(buf, binary.LittleEndian, uint16(8*sampWidth))
	buf.WriteString("data")
	binary.Write(buf, binary.LittleEndian, uint32(dataLen))
	buf.Write(data)
	return nil
}
