// Package translate provides Ollama/OpenAI-compatible and Google translation
// backends. It mirrors engine/utils/translation.py.
package translate

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"engine/internal/protocol"
)

// langMap maps VoiceBridge language codes to English names for the prompt.
var langMap = map[string]string{
	"en":    "English",
	"es":    "Spanish",
	"fr":    "French",
	"de":    "German",
	"it":    "Italian",
	"ru":    "Russian",
	"ja":    "Japanese",
	"ko":    "Korean",
	"zh":    "Chinese",
	"zh-cn": "Chinese",
}

func translateTarget(target string) string {
	if t, ok := langMap[target]; ok {
		return t
	}
	return target
}

// OllamaTranslate translates text via Ollama (native) or any OpenAI-compatible
// endpoint when url is set. Mirrors ollama_translate: strips <think>..</think>.
func OllamaTranslate(model, target, text, timeS, u, key string) {
	lang := translateTarget(target)
	sys := fmt.Sprintf("/no_think Translate the following content into %s, and do not output any additional information.", lang)
	var content string
	if u != "" {
		content = openAICompatible(u, key, model, sys, text)
	} else {
		content = ollamaNative(model, sys, text)
	}
	content = stripThink(content)
	if strings.TrimSpace(content) == "" {
		return
	}
	protocol.Translation(timeS, text, strings.TrimSpace(content))
}

func ollamaNative(model, sys, text string) string {
	body, _ := json.Marshal(map[string]interface{}{
		"model":    model,
		"messages": []map[string]string{{"role": "system", "content": sys}, {"role": "user", "content": text}},
		"stream":   false,
	})
	resp, err := http.Post("http://localhost:11434/api/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		protocol.Warn("Translation failed: " + err.Error())
		return ""
	}
	defer resp.Body.Close()
	var out struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out.Message.Content
}

func openAICompatible(baseURL, key, model, sys, text string) string {
	endpoint := strings.TrimRight(baseURL, "/") + "/chat/completions"
	body, _ := json.Marshal(map[string]interface{}{
		"model":    model,
		"messages": []map[string]string{{"role": "system", "content": sys}, {"role": "user", "content": text}},
	})
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		protocol.Warn("Translation failed: " + err.Error())
		return ""
	}
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		protocol.Warn("Translation failed: " + err.Error())
		return ""
	}
	defer resp.Body.Close()
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if len(out.Choices) > 0 {
		return out.Choices[0].Message.Content
	}
	return ""
}

func stripThink(s string) string {
	if strings.HasPrefix(s, "<think>") {
		if i := strings.Index(s, "</think>"); i != -1 {
			s = s[i+len("</think>"):]
		}
	}
	return s
}

// GoogleTranslate mirrors google_translate using the unofficial endpoint.
func GoogleTranslate(model, target, text, timeS, u, key string) {
	endpoint := fmt.Sprintf("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=%s&dt=t&q=%s",
		url.QueryEscape(target), url.QueryEscape(text))
	resp, err := http.Get(endpoint)
	if err != nil {
		protocol.Warn("Google translation request failed, please check your network connection...")
		return
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		protocol.Warn("Google translation request failed, please check your network connection...")
		return
	}
	trans := parseGoogle(b)
	if trans == "" {
		return
	}
	protocol.Translation(timeS, text, trans)
}

func parseGoogle(b []byte) string {
	var arr [][]interface{}
	if err := json.Unmarshal(b, &arr); err != nil {
		return ""
	}
	if len(arr) > 0 && len(arr[0]) > 0 {
		if s, ok := arr[0][0].(string); ok {
			return s
		}
	}
	return ""
}
