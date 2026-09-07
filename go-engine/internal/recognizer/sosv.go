//go:build cgo

package recognizer

import (
	"context"
	"strings"
	"time"

	sherpa_onnx "github.com/k2-fsa/sherpa-onnx-go/sherpa_onnx"

	"engine/internal/model"
	"engine/internal/protocol"
	"engine/internal/translate"
)

// SosvRecognizer mirrors engine/audio2text/sosv.py using sherpa-onnx-go:
// SenseVoice offline recognition driven by Silero VAD, with punctuation and
// async translation. Requires a cgo build with onnxruntime present.
type SosvRecognizer struct {
	common      Common
	modelPath   string
	source      string
	target      string
	windowSize  int
	buffer      []float32
	offset      int
	started     bool
	startedTs   time.Time
	timeStr     string
	curID       int
	prevContent string

	recognizer  *sherpa_onnx.OfflineRecognizer
	vad         *sherpa_onnx.VoiceActivityDetector
	punctOnline *sherpa_onnx.OnlinePunctuation
	punctOff    *sherpa_onnx.OfflinePunctuation
	useOnline   bool
}

// NewSosvRecognizer builds a SOSV recognizer.
func NewSosvRecognizer(modelPath, source, target string, c Common) Recognizer {
	mp := modelPath
	if mp == "" {
		mp = model.DefaultModelDir("SOSV")
	}
	mp = strings.TrimSpace(strings.Trim(mp, "\""))
	ext := ""
	if strings.HasSuffix(mp, "int8") {
		ext = ".int8"
	}

	// Offline recognizer (SenseVoice)
	cfg := sherpa_onnx.OfflineRecognizerConfig{}
	cfg.ModelConfig.SenseVoice.Model = mp + "/sensevoice/model" + ext + ".onnx"
	cfg.ModelConfig.SenseVoice.Language = source
	cfg.ModelConfig.SenseVoice.UseInverseTextNormalization = 1
	cfg.ModelConfig.Tokens = mp + "/sensevoice/tokens.txt"
	cfg.ModelConfig.NumThreads = 2
	recognizer := sherpa_onnx.NewOfflineRecognizer(&cfg)

	// VAD
	vadCfg := sherpa_onnx.VadModelConfig{}
	vadCfg.SileroVad.Model = mp + "/silero_vad.onnx"
	vadCfg.SileroVad.Threshold = 0.5
	vadCfg.SileroVad.MinSilenceDuration = 0.1
	vadCfg.SileroVad.MinSpeechDuration = 0.25
	vadCfg.SileroVad.MaxSpeechDuration = 5
	// Silero VAD 处理窗口大小（sherpa-onnx 默认 512）。必须显式设置：
	// 否则为 0，既会让 C 侧 silero_vad.window_size=0，也会使本侧 r.windowSize=0，
	// 导致喂给 vad.AcceptWaveform 的帧为空切片而 panic（index out of range [0] with length 0）。
	vadCfg.SileroVad.WindowSize = 512
	vadCfg.SampleRate = 16000
	vad := sherpa_onnx.NewVoiceActivityDetector(&vadCfg, 100)

	r := &SosvRecognizer{
		common:     c,
		modelPath:  mp,
		source:     source,
		target:     target,
		windowSize: vadCfg.SileroVad.WindowSize,
		recognizer: recognizer,
		vad:        vad,
	}

	// Punctuation
	if source == "en" {
		pc := sherpa_onnx.OnlinePunctuationModelConfig{}
		pc.CnnBilstm = mp + "/punct-en/model" + ext + ".onnx"
		pc.BpeVocab = mp + "/punct-en/bpe.vocab"
		cfg2 := sherpa_onnx.OnlinePunctuationConfig{}
		cfg2.Model = pc
		r.punctOnline = sherpa_onnx.NewOnlinePunctuation(&cfg2)
		r.useOnline = true
	} else {
		pc := sherpa_onnx.OfflinePunctuationModelConfig{}
		pc.CtTransformer = mp + "/punct/model" + ext + ".onnx"
		cfg2 := sherpa_onnx.OfflinePunctuationConfig{}
		cfg2.Model = pc
		r.punctOff = sherpa_onnx.NewOfflinePunctuation(&cfg2)
		r.useOnline = false
	}

	return r
}

func (r *SosvRecognizer) Start() error {
	// 对齐 sosv.py：start() 初始化 time_str，使首个句子（及其中间结果）的
	// time_s 与 Python 一致，而非空字符串。
	r.timeStr = nowTime()
	protocol.Info("Sherpa ONNX SenseVoice recognizer started.")
	return nil
}

func (r *SosvRecognizer) Run(ctx context.Context, sink <-chan []int16) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case chunk, ok := <-sink:
			if !ok {
				return nil
			}
			r.sendFrame(chunk)
		}
	}
}

func int16ToFloat32(s []int16) []float32 {
	out := make([]float32, len(s))
	for i, v := range s {
		out[i] = float32(v) / 32768.0
	}
	return out
}

func (r *SosvRecognizer) sendFrame(data []int16) {
	if len(data) == 0 {
		return
	}
	f := int16ToFloat32(data)
	r.buffer = append(r.buffer, f...)
	for r.windowSize > 0 && r.offset+r.windowSize < len(r.buffer) {
		r.vad.AcceptWaveform(r.buffer[r.offset : r.offset+r.windowSize])
		if !r.started && r.vad.IsSpeech() {
			r.started = true
			r.startedTs = time.Now()
		}
		r.offset += r.windowSize
	}
	if !r.started {
		if len(r.buffer) > 10*r.windowSize {
			r.offset -= len(r.buffer) - 10*r.windowSize
			r.buffer = r.buffer[len(r.buffer)-10*r.windowSize:]
		}
	}
	// 中间（部分）结果：对齐 sosv.py —— 仅在有语音且距上次输出 >0.2s 时刷新，
	// 使用当前 curID（不自增），且不触发翻译（翻译只在句子最终确定时进行）。
	if r.started && time.Since(r.startedTs).Seconds() > 0.2 {
		stream := sherpa_onnx.NewOfflineStream(r.recognizer)
		stream.AcceptWaveform(16000, r.buffer)
		r.recognizer.DecodeStreams([]*sherpa_onnx.OfflineStream{stream})
		text := strings.TrimSpace(stream.GetResult().Text)
		if text != "" && r.prevContent != text {
			protocol.Caption(r.curID, text, "", r.timeStr, nowTime())
			r.prevContent = text
		}
		r.startedTs = time.Now()
	}
	// 最终结果：对齐 sosv.py —— 用（未加标点的）原始识别文本判空，
	// 输出加标点后的文本、翻译加标点文本，且 index 先用当前 curID 再自增。
	for !r.vad.IsEmpty() {
		s := r.vad.Front()
		r.vad.Pop()
		raw := ""
		if len(s.Samples) > 0 {
			stream := sherpa_onnx.NewOfflineStream(r.recognizer)
			stream.AcceptWaveform(16000, s.Samples)
			r.recognizer.DecodeStreams([]*sherpa_onnx.OfflineStream{stream})
			raw = strings.TrimSpace(stream.GetResult().Text)
		}
		var textPunct string
		if r.useOnline {
			textPunct = r.punctOnline.AddPunct(raw)
		} else {
			textPunct = r.punctOff.AddPunct(raw)
		}
		if raw != "" {
			protocol.Caption(r.curID, textPunct, "", r.timeStr, nowTime())
			if r.target != "" && r.target != "none" {
				r.translate(textPunct, r.timeStr)
			}
			r.curID++
		}
		r.prevContent = ""
		r.timeStr = nowTime()
		r.buffer = nil
		r.offset = 0
		r.started = false
		r.startedTs = time.Time{}
	}
}

func (r *SosvRecognizer) translate(text, timeS string) {
	if r.common.TransModel == "google" {
		go translate.GoogleTranslate("", r.common.TargetLang, text, timeS, "", "")
	} else {
		go translate.OllamaTranslate(r.common.OllamaName, r.common.TargetLang, text, timeS, r.common.OllamaURL, r.common.OllamaKey)
	}
}

func (r *SosvRecognizer) Stop() error {
	protocol.Info("Sherpa ONNX SenseVoice recognizer closed.")
	return nil
}
