package audio

import (
	"encoding/binary"
	"math"
)

// BytesToInt16LE converts little-endian int16 PCM bytes to a slice.
func BytesToInt16LE(b []byte) []int16 {
	n := len(b) / 2
	out := make([]int16, n)
	for i := 0; i < n; i++ {
		out[i] = int16(binary.LittleEndian.Uint16(b[i*2:]))
	}
	return out
}

// Int16ToBytesLE converts int16 PCM samples to little-endian bytes.
func Int16ToBytesLE(s []int16) []byte {
	b := make([]byte, len(s)*2)
	for i, v := range s {
		binary.LittleEndian.PutUint16(b[i*2:], uint16(v))
	}
	return b
}

// MergeChannels downmixes interleaved multi-channel int16 PCM to mono.
// Mirrors utils/audioprcs.py:merge_chunk_channels.
func MergeChannels(data []byte, channels int) []int16 {
	if channels <= 1 {
		return BytesToInt16LE(data)
	}
	n := len(data) / (2 * channels)
	out := make([]int16, n)
	for i := 0; i < n; i++ {
		var sum float64
		for c := 0; c < channels; c++ {
			v := int16(binary.LittleEndian.Uint16(data[(i*channels+c)*2:]))
			sum += float64(v)
		}
		out[i] = int16(math.Round(sum / float64(channels)))
	}
	return out
}

// ResampleMono linearly resamples mono int16 PCM from origSR to targetSR.
// Mirrors utils/audioprcs.py:resample_chunk_mono (linear fallback).
func ResampleMono(data []int16, origSR, targetSR int) []int16 {
	if origSR == targetSR || len(data) == 0 {
		return data
	}
	ratio := float64(targetSR) / float64(origSR)
	outLen := int(math.Round(float64(len(data)) * ratio))
	if outLen <= 0 {
		return []int16{}
	}
	out := make([]int16, outLen)
	for i := 0; i < outLen; i++ {
		pos := float64(i) / ratio
		left := int(math.Floor(pos))
		right := left + 1
		var frac float64
		if right < len(data) {
			frac = pos - float64(left)
		} else {
			right = len(data) - 1
			left = right
		}
		a := float64(data[left])
		b := float64(data[right])
		out[i] = int16(math.Round(a + (b-a)*frac))
	}
	return out
}

// RMS returns the root-mean-square energy of int16 PCM (mirrors audioop.rms).
func RMS(s []int16) float64 {
	if len(s) == 0 {
		return 0
	}
	var sum float64
	for _, v := range s {
		sum += float64(v) * float64(v)
	}
	return math.Sqrt(sum / float64(len(s)))
}
