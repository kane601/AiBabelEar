// Command engine is the Go reimplementation of the AiBabelEar
// transcription/translation engine. It is a drop-in replacement for the Python
// main.exe: it speaks the exact same CLI, stdout line protocol and TCP control
// protocol expected by src/main/utils/CaptionEngine.ts.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"engine/internal/audio"
	"engine/internal/protocol"
	"engine/internal/recognizer"
)

func aliasString(f *flag.FlagSet, short, long, def, usage string) *string {
	p := f.String(short, def, usage)
	f.StringVar(p, long, def, usage)
	return p
}

func main() {
	f := flag.NewFlagSet("engine", flag.ContinueOnError)
	f.SetOutput(os.Stderr)

	captionEngine := aliasString(f, "e", "caption_engine", "gummy", "Caption engine: gummy, glm, vosk or sosv")
	audioType := aliasString(f, "a", "audio_type", "0", "Audio stream source: 0 output, 1 input")
	audioDeviceIndex := aliasString(f, "adi", "audio_device_index", "-1", "Input device index when audio_type is 1, -1 for default")
	listDevices := f.Bool("ld", false, "List available audio input devices as JSON and exit")
	f.BoolVar(listDevices, "list-devices", false, "List available audio input devices as JSON and exit")
	chunkRate := aliasString(f, "c", "chunk_rate", "10", "Number of audio stream chunks collected per second")
	port := aliasString(f, "p", "port", "0", "The port to run the server on, 0 for no server")
	displayCaption := aliasString(f, "d", "display_caption", "0", "Display caption on terminal, 0 no, 1 yes")
	targetLanguage := aliasString(f, "t", "target_language", "none", "Target language code, none for no translation")
	record := aliasString(f, "r", "record", "0", "Whether to record the audio, 0 no, 1 yes")
	recordPath := aliasString(f, "rp", "record_path", "", "Path to save the recorded audio")
	sourceLanguage := aliasString(f, "s", "source_language", "auto", "Source language code")
	apiKey := aliasString(f, "k", "api_key", "", "API KEY for Gummy model")
	translationModel := aliasString(f, "tm", "translation_model", "ollama", "Model for translation: ollama or google")
	ollamaName := aliasString(f, "omn", "ollama_name", "", "Ollama model name for translation")
	ollamaURL := aliasString(f, "ourl", "ollama_url", "", "Ollama API URL")
	ollamaAPIKey := aliasString(f, "okey", "ollama_api_key", "", "Ollama API Key")
	voskModel := aliasString(f, "vosk", "vosk_model", "", "The path to the vosk model")
	sosvModel := aliasString(f, "sosv", "sosv_model", "", "The SenseVoice model path")
	glmURL := aliasString(f, "gurl", "glm_url", "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions", "GLM API URL")
	glmModel := aliasString(f, "gmodel", "glm_model", "glm-asr-2512", "GLM Model Name")
	glmAPIKey := aliasString(f, "gkey", "glm_api_key", "", "GLM API Key")

	if err := f.Parse(os.Args[1:]); err != nil {
		os.Exit(2)
	}

	// --- --list-devices mode ---
	if *listDevices {
		out, err := audio.ListDevicesJSON()
		if err != nil {
			fmt.Fprintln(os.Stderr, "Failed to list devices:", err)
			os.Exit(1)
		}
		fmt.Println(out)
		os.Exit(0)
	}

	// --- resolve numeric flags ---
	adi, _ := atoiDefault(*audioDeviceIndex, -1)
	aType, _ := atoiDefault(*audioType, 0)
	cRate, _ := atoiDefault(*chunkRate, 10)
	p, _ := atoiDefault(*port, 0)
	doRecord := *record == "1"
	_ = *displayCaption

	common := recognizer.Common{
		SourceLang: *sourceLanguage,
		TargetLang: *targetLanguage,
		TransModel: *translationModel,
		OllamaName: *ollamaName,
		OllamaURL:  *ollamaURL,
		OllamaKey:  *ollamaAPIKey,
	}

	// --- resolve capture device & rate (needed before building gummy) ---
	devIndex := adi
	if devIndex < 0 {
		devIndex, _ = audio.DefaultDeviceIndex(aType)
	}
	deviceRate, _ := audio.DeviceSampleRate(devIndex)
	if deviceRate == 0 {
		deviceRate = 16000
	}
	deviceChannels, _ := audio.DeviceChannels(devIndex)
	if deviceChannels <= 0 {
		deviceChannels = 1
	}

	rec, err := buildRecognizer(*captionEngine, common, deviceRate, recognizerArgs{
		source: *sourceLanguage, target: *targetLanguage,
		apiKey: *apiKey, glmURL: *glmURL, glmModel: *glmModel, glmKey: *glmAPIKey,
		vosk: *voskModel, sosv: *sosvModel,
	})
	if err != nil {
		protocol.Error(err.Error())
		os.Exit(1)
	}

	// gummy streams at device rate (resample=false); others are resampled to 16k.
	resample := *captionEngine != "gummy"
	targetRate := 16000
	if *captionEngine == "gummy" {
		targetRate = deviceRate
	}

	var recorder *audio.Recorder
	if doRecord {
		full := buildRecordPath(*recordPath, deviceRate)
		// 对齐 Python：录音按设备原生通道数/采样率写出（raw_chunk 原样写入）。
		recorder, err = audio.NewRecorder(full, deviceChannels, deviceRate)
		if err != nil {
			protocol.Error("Failed to open recorder: " + err.Error())
			os.Exit(1)
		}
		defer recorder.Close()
		protocol.Info("Audio recording to " + full)
	}

	// --- control server ---
	control := protocol.NewControlServer()
	if p != 0 {
		if err := control.Listen(p); err != nil {
			// bind failure already emitted "kill"
			os.Exit(1)
		}
		defer control.Close()
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// stop on TCP "stop" or SIGINT/SIGTERM
	go func() { <-control.Done; cancel() }()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		cancel()
	}()

	if err := rec.Start(); err != nil {
		protocol.Error(err.Error())
	}

	sink := make(chan []int16, 128)
	cfg := audio.CaptureConfig{
		DeviceIndex: devIndex,
		ChunkRate:   cRate,
		TargetRate:  targetRate,
		Resample:    resample,
		Recorder:    recorder,
	}

	captureErr := make(chan error, 1)
	go func() {
		captureErr <- audio.StartCapture(ctx, cfg, sink)
	}()

	recErr := rec.Run(ctx, sink)
	if recErr != nil {
		protocol.Error(recErr.Error())
	}
	_ = rec.Stop()

	if err := <-captureErr; err != nil {
		protocol.Error("Audio capture error: " + err.Error())
	}
}

type recognizerArgs struct {
	source, target, apiKey   string
	glmURL, glmModel, glmKey string
	vosk, sosv               string
}

func buildRecognizer(engine string, common recognizer.Common, deviceRate int, a recognizerArgs) (recognizer.Recognizer, error) {
	switch engine {
	case "gummy":
		return recognizer.NewGummyRecognizer(deviceRate, a.source, a.target, a.apiKey, common), nil
	case "glm":
		return recognizer.NewGLMRecognizer(a.glmURL, a.glmModel, a.glmKey, common), nil
	case "vosk":
		return recognizer.NewVoskRecognizer(a.vosk, a.target, common), nil
	case "sosv":
		return recognizer.NewSosvRecognizer(a.sosv, a.source, a.target, common), nil
	default:
		return nil, fmt.Errorf("invalid caption engine specified: %s", engine)
	}
}

func atoiDefault(s string, def int) (int, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return def, nil
	}
	var v int
	_, err := fmt.Sscanf(s, "%d", &v)
	if err != nil {
		return def, err
	}
	return v, nil
}

func buildRecordPath(rp string, rate int) string {
	rp = strings.TrimSpace(strings.Trim(rp, "\""))
	if rp == "" {
		rp = "."
	}
	if !strings.HasSuffix(rp, string(filepath.Separator)) && !strings.HasSuffix(rp, "/") {
		rp += string(filepath.Separator)
	}
	name := "audio-" + time.Now().Format("2006-01-02T15-04-05") + ".wav"
	return filepath.Join(rp, name)
}
