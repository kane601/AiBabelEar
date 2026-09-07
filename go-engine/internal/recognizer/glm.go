package recognizer

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"sync"
	"time"

	"engine/internal/audio"
	"engine/internal/protocol"
	"engine/internal/translate"
)

// GLMRecognizer mirrors engine/audio2text/glm.py: buffers speech via RMS VAD,
// then POSTs a WAV clip to the GLM-ASR HTTP endpoint.
type GLMRecognizer struct {
	common    Common
	url       string
	model     string
	apiKey    string
	mu        sync.Mutex
	buf       [][]int16
	isSpeech  bool
	silFrames int
	curID     int
	timeStr   string
}

const (
	glmThreshold       = 500
	glmSilenceLimit    = 15
	glmMinSpeechFrames = 10
)

// NewGLMRecognizer builds a GLM recognizer.
func NewGLMRecognizer(url, model, key string, c Common) *GLMRecognizer {
	if url == "" {
		url = "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"
	}
	if model == "" {
		model = "glm-asr-2512"
	}
	return &GLMRecognizer{common: c, url: url, model: model, apiKey: key}
}

func (r *GLMRecognizer) Start() error {
	protocol.Info("GLM-ASR recognizer started.")
	return nil
}

func (r *GLMRecognizer) Run(ctx context.Context, sink <-chan []int16) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case chunk, ok := <-sink:
			if !ok {
				return nil
			}
			r.processAudio(chunk)
		}
	}
}

func (r *GLMRecognizer) processAudio(chunk []int16) {
	rms := audio.RMS(chunk)
	r.mu.Lock()
	defer r.mu.Unlock()
	if rms > glmThreshold {
		if !r.isSpeech {
			r.isSpeech = true
			r.timeStr = nowTime()
			r.buf = nil
		}
		r.buf = append(r.buf, chunk)
		r.silFrames = 0
		return
	}
	if r.isSpeech {
		r.buf = append(r.buf, chunk)
		r.silFrames++
		if r.silFrames > glmSilenceLimit {
			if len(r.buf) > glmMinSpeechFrames {
				r.recognize(r.buf, r.timeStr, r.curID)
				r.curID++
			}
			r.isSpeech = false
			r.buf = nil
			r.silFrames = 0
		}
	}
}

func (r *GLMRecognizer) recognize(frames [][]int16, timeS string, index int) {
	var flat []int16
	for _, f := range frames {
		flat = append(flat, f...)
	}
	audioContent := audio.WavBytes(flat, 16000)
	go r.doRequest(audioContent, timeS, index)
}

func (r *GLMRecognizer) doRequest(audioContent []byte, timeS string, index int) {
	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	part, err := mw.CreateFormFile("file", "audio.wav")
	if err != nil {
		protocol.Error("GLM Request Failed: " + err.Error())
		return
	}
	if _, err := part.Write(audioContent); err != nil {
		protocol.Error("GLM Request Failed: " + err.Error())
		return
	}
	_ = mw.WriteField("model", r.model)
	_ = mw.WriteField("stream", "false")
	_ = mw.Close()

	req, err := http.NewRequest(http.MethodPost, r.url, body)
	if err != nil {
		protocol.Error("GLM Request Failed: " + err.Error())
		return
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+r.apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		protocol.Error("GLM Request Failed: " + err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		var out struct {
			Text string `json:"text"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&out)
		if out.Text != "" {
			r.outputCaption(out.Text, timeS, index)
		}
		return
	}
	b, _ := io.ReadAll(resp.Body)
	protocol.Error("GLM API Error: " + string(b))
}

func (r *GLMRecognizer) outputCaption(text, timeS string, index int) {
	protocol.Caption(index, text, "", timeS, nowTime())
	if r.common.TargetLang != "" && r.common.TargetLang != "none" {
		if r.common.TransModel == "google" {
			go translate.GoogleTranslate("", r.common.TargetLang, text, timeS, "", "")
		} else {
			go translate.OllamaTranslate(r.common.OllamaName, r.common.TargetLang, text, timeS, r.common.OllamaURL, r.common.OllamaKey)
		}
	}
}

func (r *GLMRecognizer) Stop() error {
	protocol.Info("GLM-ASR recognizer stopped.")
	return nil
}
