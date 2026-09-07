package audio

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"
)

func TestMergeChannelsMonoPassthrough(t *testing.T) {
	in := []byte{0x01, 0x00, 0xFF, 0xFF}
	out := MergeChannels(in, 1)
	if len(out) != 2 || out[0] != 1 || out[1] != -1 {
		t.Fatalf("got %v", out)
	}
}

func TestMergeChannelsStereo(t *testing.T) {
	// stereo samples: (2,4),(6,8) -> mean (3,7)
	in := []byte{2, 0, 4, 0, 6, 0, 8, 0}
	out := MergeChannels(in, 2)
	if len(out) != 2 {
		t.Fatalf("len=%d", len(out))
	}
	if out[0] != 3 || out[1] != 7 {
		t.Fatalf("got %v", out)
	}
}

func TestResampleMono(t *testing.T) {
	// 16000 -> 8000 should halve the length.
	src := make([]int16, 160)
	for i := range src {
		src[i] = int16(i)
	}
	out := ResampleMono(src, 16000, 8000)
	if len(out) != 80 {
		t.Fatalf("expected 80, got %d", len(out))
	}
	// 44100 -> 16000 ratio
	out2 := ResampleMono(src, 44100, 16000)
	if len(out2) != int(math.Round(float64(len(src))*16000/44100)) {
		t.Fatalf("ratio len=%d", len(out2))
	}
	// same rate -> unchanged
	same := ResampleMono(src, 16000, 16000)
	if len(same) != len(src) {
		t.Fatalf("same rate changed length")
	}
}

func TestRMS(t *testing.T) {
	if RMS(nil) != 0 {
		t.Fatal("nil rms")
	}
	if RMS([]int16{0, 0}) != 0 {
		t.Fatal("zero rms")
	}
	r := RMS([]int16{32767, -32767})
	if r == 0 {
		t.Fatal("non-zero rms expected")
	}
}

func TestWavBytes(t *testing.T) {
	frames := []int16{1, 2, 3, 4}
	b := WavBytes(frames, 16000)
	if len(b) < 44 {
		t.Fatal("wav too short")
	}
	if !bytes.Equal(b[0:4], []byte("RIFF")) || !bytes.Equal(b[8:12], []byte("WAVE")) {
		t.Fatal("bad wav header")
	}
	var dataLen uint32
	binary.Read(bytes.NewReader(b[40:44]), binary.LittleEndian, &dataLen)
	if dataLen != uint32(len(frames)*2) {
		t.Fatalf("dataLen=%d", dataLen)
	}
}

func TestInt16RoundTrip(t *testing.T) {
	src := []int16{100, -200, 30000, -30000}
	b := Int16ToBytesLE(src)
	out := BytesToInt16LE(b)
	for i := range src {
		if out[i] != src[i] {
			t.Fatalf("mismatch at %d", i)
		}
	}
}
