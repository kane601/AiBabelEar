"""
Shepra-ONNX SenseVoice Model

This code file references the following:

https://github.com/k2-fsa/sherpa-onnx/blob/master/python-api-examples/simulate-streaming-sense-voice-microphone.py
"""

import os
import time
from datetime import datetime
import sherpa_onnx
import threading
import numpy as np

from utils import shared_data, default_model_dir
from utils import stdout_cmd, stdout_obj
from utils import google_translate, ollama_translate


class SosvRecognizer:
    """
    使用 Sense Voice 非流式模型处理流式音频数据，并在标准输出中输出 AiBabelEar 软件可读取的 JSON 字符串数据

    初始化参数：
        model_path: Shepra ONNX Sense Voice 识别模型路径
        vad_model: Silero VAD 模型路径
        source: 识别源语言(auto, zh, en, ja, ko, yue)
        target: 翻译目标语言
        trans_model: 翻译模型名称
        ollama_name: Ollama 模型名称
    """
    def __init__(self, model_path: str, source: str, target: str | None, trans_model: str, ollama_name: str, ollama_url: str = '', ollama_api_key: str = ''):
        if model_path:
            model_path = model_path.strip().strip('"')
        if not model_path:
            model_path = default_model_dir('SOSV')
        self.source = source
        self.target = target
        # 兼容解压后多出一层 sosv/ 子目录的情况（模型包内部结构为 <dir>/sosv/...）
        self.model_path = self._resolve_model_root(model_path)
        self.ext = ""
        if self.model_path[-4:] == "int8":
            self.ext = ".int8"
        # 加载前先校验文件，缺失时给出明确的中文提示而非 sherpa_onnx 的底层英文报错
        self._check_model_files()
        if trans_model == 'google':
            self.trans_func = google_translate
        else:
            self.trans_func = ollama_translate
        self.ollama_name = ollama_name
        self.ollama_url = ollama_url
        self.ollama_api_key = ollama_api_key
        self.time_str = ''
        self.cur_id = 0
        self.prev_content = ''

    def _resolve_model_root(self, base: str) -> str:
        """确定 SOSV 模型的根目录。

        模型压缩包解压后通常会在目标目录内多出一层 sosv/ 子目录，
        此时正确的根目录是 <base>/sosv 而非 <base>。这里按 sensevoice/model*.onnx
        是否存在自动探测，两种结构都能正常工作。
        """
        def has_sense_voice(path: str) -> bool:
            sense_dir = os.path.join(path, 'sensevoice')
            if not os.path.isdir(sense_dir):
                return False
            return any(
                f.startswith('model') and f.endswith('.onnx')
                for f in os.listdir(sense_dir)
            )

        for candidate in (base, os.path.join(base, 'sosv')):
            try:
                if has_sense_voice(candidate):
                    return candidate
            except OSError:
                continue
        return base

    def _check_model_files(self):
        """校验 SOSV 所需的全部模型文件是否齐全，缺失则抛出可读的错误。"""
        required = [
            f"sensevoice/model{self.ext}.onnx",
            "sensevoice/tokens.txt",
            "silero_vad.onnx",
        ]
        if self.source == 'en':
            required += [f"punct-en/model{self.ext}.onnx", "punct-en/bpe.vocab"]
        else:
            required += [f"punct/model{self.ext}.onnx"]

        missing = [rel for rel in required if not os.path.isfile(os.path.join(self.model_path, rel))]
        if missing:
            detail = '、'.join(os.path.join(self.model_path, rel) for rel in missing)
            raise FileNotFoundError(
                f"SOSV 模型文件缺失或不完整，未找到：{detail}。"
                f"请确认模型已正确下载解压到模型目录，"
                f"并在设置中填写正确的 SOSV 路径（当前使用：{self.model_path}）。"
            )

    def start(self):
        """启动 Sense Voice 模型"""
        self.recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=f"{self.model_path}/sensevoice/model{self.ext}.onnx",
            tokens=f"{self.model_path}/sensevoice/tokens.txt",
            language=self.source,
            num_threads = 2,
        )
        
        vad_config = sherpa_onnx.VadModelConfig()
        vad_config.silero_vad.model = f"{self.model_path}/silero_vad.onnx"
        vad_config.silero_vad.threshold = 0.5
        vad_config.silero_vad.min_silence_duration = 0.1
        vad_config.silero_vad.min_speech_duration = 0.25
        vad_config.silero_vad.max_speech_duration = 5
        vad_config.sample_rate = 16000
        self.window_size = vad_config.silero_vad.window_size
        self.vad = sherpa_onnx.VoiceActivityDetector(vad_config, buffer_size_in_seconds=100)

        if self.source == 'en':
            model_config = sherpa_onnx.OnlinePunctuationModelConfig(
                cnn_bilstm=f"{self.model_path}/punct-en/model{self.ext}.onnx",
                bpe_vocab=f"{self.model_path}/punct-en/bpe.vocab"
            )
            punct_config = sherpa_onnx.OnlinePunctuationConfig(
                model_config=model_config,
            )
            self.punct = sherpa_onnx.OnlinePunctuation(punct_config)
        else:
            punct_config = sherpa_onnx.OfflinePunctuationConfig(
                model=sherpa_onnx.OfflinePunctuationModelConfig(
                    ct_transformer=f"{self.model_path}/punct/model{self.ext}.onnx"
                ),
            )
            self.punct = sherpa_onnx.OfflinePunctuation(punct_config)

        self.buffer = []
        self.offset = 0
        self.started = False
        self.started_time = .0
        self.time_str = datetime.now().strftime('%H:%M:%S.%f')[:-3]
        stdout_cmd('info', 'Shepra ONNX Sense Voice recognizer started.')

    def send_audio_frame(self, data: bytes):
        """
        发送音频帧给 SOSV 引擎，引擎将自动识别并将识别结果输出到标准输出中

        Args:
            data: 音频帧数据，采样率必须为 16000Hz
        """
        caption = {}
        caption['command'] = 'caption'
        caption['translation'] = ''

        data_np = np.frombuffer(data, dtype=np.int16).astype(np.float32)
        self.buffer = np.concatenate([self.buffer, data_np])
        while self.offset + self.window_size < len(self.buffer):
            self.vad.accept_waveform(self.buffer[self.offset: self.offset + self.window_size])
            if not self.started and self.vad.is_speech_detected():
                self.started = True
                self.started_time = time.time()
            self.offset += self.window_size

        if not self.started:
            if len(self.buffer) > 10 * self.window_size:
                self.offset -= len(self.buffer) - 10 * self.window_size
                self.buffer = self.buffer[-10 * self.window_size:]

        if self.started and time.time() - self.started_time > 0.2:
            stream = self.recognizer.create_stream()
            stream.accept_waveform(16000, self.buffer)
            self.recognizer.decode_stream(stream)
            text = stream.result.text.strip()
            if text and self.prev_content != text:
                caption['index'] = self.cur_id
                caption['text'] = text
                caption['time_s'] = self.time_str
                caption['time_t'] = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                self.prev_content = text
                stdout_obj(caption)
            self.started_time = time.time()
        
        while not self.vad.empty():
            stream = self.recognizer.create_stream()
            stream.accept_waveform(16000, self.vad.front.samples)
            self.vad.pop()
            self.recognizer.decode_stream(stream)
            text = stream.result.text.strip()

            if self.source == 'en':
                text_with_punct = self.punct.add_punctuation_with_case(text)
            else:
                text_with_punct = self.punct.add_punctuation(text)

            caption['index'] = self.cur_id
            caption['text'] = text_with_punct
            caption['time_s'] = self.time_str
            caption['time_t'] = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            if text:
                stdout_obj(caption)
                if self.target:
                    th = threading.Thread(
                        target=self.trans_func,
                        args=(self.ollama_name, self.target, caption['text'], self.time_str, self.ollama_url, self.ollama_api_key),
                        daemon=True
                    )
                    th.start()    
                self.cur_id += 1
            self.prev_content = ''
            self.time_str = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            self.buffer = []
            self.offset = 0
            self.started = False
            self.started_time = .0

    def translate(self):
        """持续读取共享数据中的音频帧，并进行语音识别，将识别结果输出到标准输出中"""
        global shared_data
        while shared_data.status == 'running':
            chunk = shared_data.chunk_queue.get()
            self.send_audio_frame(chunk)
    
    def stop(self):
        """停止 Sense Voice 模型"""
        stdout_cmd('info', 'Shepra ONNX Sense Voice recognizer closed.')
