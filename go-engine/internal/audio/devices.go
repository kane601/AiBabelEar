package audio

import (
	"encoding/json"
)

// Device describes an audio input device. The JSON tags exactly match the
// contract consumed by src/main/utils/audioDevices.ts.
type Device struct {
	Index             int    `json:"index"`
	Name              string `json:"name"`
	MaxInputChannels  int    `json:"maxInputChannels"`
	DefaultSampleRate int    `json:"defaultSampleRate"`
	IsLoopback        bool   `json:"isLoopback"`
	Kind              string `json:"kind"` // "microphone" | "loopback"
}

// ListDevicesJSON returns the JSON document ("{\"devices\":[...]}") consumed by
// Node via the --list-devices mode.
func ListDevicesJSON() (string, error) {
	devs, err := EnumerateDevices()
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(map[string]interface{}{"devices": devs})
	if err != nil {
		return "", err
	}
	return string(b), nil
}
