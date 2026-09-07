package recognizer

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/gorilla/websocket"

	"engine/internal/audio"
	"engine/internal/protocol"
)

// GummyRecognizer mirrors engine/audio2text/gummy.py: streams PCM to the
// DashScope realtime ASR WebSocket and emits caption messages (with optional
// translation attached). The DashScope realtime protocol field names should be
// validated against the live API before production use.
type GummyRecognizer struct {
	common  Common
	apiKey  string
	rate    int
	conn    *websocket.Conn
	mu      sync.Mutex
	curID   int
	usage   int
	lastSID int

	pending map[int]*captionState
}

type captionState struct {
	index int
	timeS string
	text  string
	trans string
}

// NewGummyRecognizer builds a Gummy recognizer.
func NewGummyRecognizer(rate int, source, target, apiKey string, c Common) *GummyRecognizer {
	return &GummyRecognizer{
		common:  c,
		apiKey:  apiKey,
		rate:    rate,
		curID:   0,
		lastSID: -1,
		pending: make(map[int]*captionState),
	}
}

const gummyWSBase = "wss://dashscope-realtime.oss-cn-beijing.aliyuncs.com/api/v1/audio/asr?model=gummy-realtime-v1"

func (r *GummyRecognizer) Start() error {
	protocol.Info("Gummy translator started.")
	return nil
}

func (r *GummyRecognizer) Run(ctx context.Context, sink <-chan []int16) error {
	header := make(map[string][]string)
	if r.apiKey != "" {
		header["X-DashScope-AppKey"] = []string{r.apiKey}
	}
	conn, _, err := websocket.DefaultDialer.Dial(gummyWSBase, header)
	if err != nil {
		protocol.Error("Gummy WebSocket dial failed: " + err.Error())
		return err
	}
	r.conn = conn
	defer conn.Close()

	r.sendStart()

	go r.readLoop(ctx)

	for {
		select {
		case <-ctx.Done():
			r.sendFinish()
			return nil
		case chunk, ok := <-sink:
			if !ok {
				r.sendFinish()
				return nil
			}
			_ = conn.WriteMessage(websocket.BinaryMessage, audio.Int16ToBytesLE(chunk))
		}
	}
}

func (r *GummyRecognizer) sendStart() {
	transEnabled := r.common.TargetLang != "" && r.common.TargetLang != "none"
	payload := map[string]interface{}{
		"input_format":          "pcm",
		"sample_rate":           r.rate,
		"transcription_enabled": true,
		"translation_enabled":   transEnabled,
		"source_language":       r.common.SourceLang,
	}
	if transEnabled {
		payload["translation_target_languages"] = []string{r.common.TargetLang}
	}
	msg := map[string]interface{}{
		"header": map[string]interface{}{
			"message_id": fmt.Sprintf("start-%d", 1),
			"task_id":    "task-gummy",
			"namespace":  "SpeechTranscriber",
			"name":       "StartTranscription",
			"appkey":     r.apiKey,
		},
		"payload": payload,
	}
	_ = r.writeJSON(msg)
}

func (r *GummyRecognizer) sendFinish() {
	msg := map[string]interface{}{
		"header": map[string]interface{}{
			"message_id": fmt.Sprintf("finish-%d", 2),
			"task_id":    "task-gummy",
			"namespace":  "SpeechTranscriber",
			"name":       "StopTranscription",
		},
	}
	_ = r.writeJSON(msg)
}

func (r *GummyRecognizer) writeJSON(v interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.conn == nil {
		return nil
	}
	return r.conn.WriteJSON(v)
}

func (r *GummyRecognizer) readLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		_, data, err := r.conn.ReadMessage()
		if err != nil {
			return
		}
		r.handleEvent(data)
	}
}

func (r *GummyRecognizer) handleEvent(data []byte) {
	var evt struct {
		Header struct {
			Name string `json:"name"`
		} `json:"header"`
		Payload struct {
			SentenceID      int            `json:"sentence_id"`
			Text            string         `json:"text"`
			Usage           map[string]int `json:"usage"`
			TranslationList []struct {
				TargetLanguage string `json:"target_language"`
				Text           string `json:"text"`
			} `json:"translation_list"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(data, &evt); err != nil {
		return
	}

	switch evt.Header.Name {
	case "TranscriptionResultChange", "SentenceEnd":
		r.onTranscription(evt.Payload.SentenceID, evt.Payload.Text)
	case "TranslationResultChange", "TranslationSentenceEnd":
		trans := ""
		if len(evt.Payload.TranslationList) > 0 {
			trans = evt.Payload.TranslationList[0].Text
		}
		r.onTranslation(evt.Payload.SentenceID, trans)
	case "TranslationInfo":
		if u, ok := evt.Payload.Usage["duration"]; ok {
			r.usage += u
			protocol.Usage(fmt.Sprintf("%d", r.usage))
		}
	}
}

func (r *GummyRecognizer) onTranscription(sid int, text string) {
	if text == "" {
		return
	}
	st, ok := r.pending[sid]
	if !ok || st.index == 0 {
		// index==0 表示尚未分配（可能 translation 先到达创建了 pending）。
		r.curID++
		st = &captionState{index: r.curID, timeS: nowTime()}
		r.pending[sid] = st
	}
	st.text = text
	protocol.Caption(st.index, text, st.trans, st.timeS, nowTime())
}

func (r *GummyRecognizer) onTranslation(sid int, trans string) {
	st, ok := r.pending[sid]
	if !ok {
		// 该句子尚未收到任何 transcription：对齐 gummy.py —— 纯翻译事件不会
		// 发出 caption（'text' 不在 caption 中），仅暂存译文，待 transcription
		// 事件分配 index/time_s 并合并输出。
		r.pending[sid] = &captionState{trans: trans}
		return
	}
	st.trans = trans
	if st.text != "" {
		protocol.Caption(st.index, st.text, trans, st.timeS, nowTime())
	}
}

func (r *GummyRecognizer) Stop() error {
	protocol.Info("Gummy translator closed.")
	protocol.Usage(fmt.Sprintf("%d", r.usage))
	return nil
}
