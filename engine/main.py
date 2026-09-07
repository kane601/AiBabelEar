import os
import sys
import wave
import argparse
import threading
import datetime
from utils import stdout, stdout_cmd, change_caption_display, default_model_dir
from utils import shared_data, start_server
from utils import merge_chunk_channels, resample_chunk_mono
# 注意：audio2text 的识别器（SosvRecognizer 等）会拉入 onnxruntime/sherpa_onnx 等较重依赖，
# 必须在各引擎函数内部「延迟导入」，避免它们影响 --list-devices 等设备枚举逻辑。
# 否则一旦识别引擎的导入链在 main.exe 启动时失败，整个进程崩溃，设备列表也会跟着变成空的。
from sysaudio import AudioStream, list_input_devices
import json

# 强制标准输出/错误以 UTF-8 编码写出。
# Windows 下当 stdout 被管道（而非控制台）重定向时，sys.stdout 的编码
# 会退化为系统本地编码（如 cp936/GBK），导致含中文的 JSON 被错误编码，
# 进而在 Node 端按 UTF-8 解析时出现乱码。此处统一改为 UTF-8。
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass


def audio_recording(stream: AudioStream, resample: bool, record = False, path = ''):
    global shared_data
    stream.open_stream()
    wf = None
    full_name = ''
    if record:
        if path != '':
            if path.startswith('"') and path.endswith('"'):
                path = path[1:-1]
            if path[-1] != '/':
                path += '/'
        cur_dt = datetime.datetime.now()
        name = cur_dt.strftime("audio-%Y-%m-%dT%H-%M-%S")
        full_name = f'{path}{name}.wav'
        wf = wave.open(full_name, 'wb')
        wf.setnchannels(stream.CHANNELS)
        wf.setsampwidth(stream.SAMP_WIDTH)
        wf.setframerate(stream.RATE)
        stdout_cmd("info", "Audio recording...")
    while shared_data.status == 'running':
        raw_chunk = stream.read_chunk()
        if record: wf.writeframes(raw_chunk) # type: ignore
        if raw_chunk is None: continue
        if resample:
            chunk = resample_chunk_mono(raw_chunk, stream.CHANNELS, stream.RATE, 16000)
        else:
            chunk = merge_chunk_channels(raw_chunk, stream.CHANNELS)
        shared_data.chunk_queue.put(chunk)
    if record:
        stdout_cmd("info", f"Audio saved to {full_name}")
        wf.close() # type: ignore
    stream.close_stream_signal()


def main_gummy(s: str, t: str, a: int, c: int, k: str, r: bool, rp: str, device_index: int = -1):
    """
    Parameters:
        s: Source language
        t: Target language
        k: Aliyun Bailian API key
        r: Whether to record the audio
        rp: Path to save the recorded audio
        device_index: Input device index for audio_type == 1, -1 for default
    """
    from audio2text import GummyRecognizer
    stream = AudioStream(a, c, device_index)
    if t == 'none':
        engine = GummyRecognizer(stream.RATE, s, None, k)
    else:
        engine = GummyRecognizer(stream.RATE, s, t, k)

    engine.start()
    stream_thread = threading.Thread(
        target=audio_recording,
        args=(stream, False, r, rp),
        daemon=True
    )
    stream_thread.start()
    try:
        engine.translate()
    except KeyboardInterrupt:
        stdout("Keyboard interrupt detected. Exiting...")
    engine.stop()


def main_vosk(a: int, c: int, vosk: str, t: str, tm: str, omn: str, ourl: str, okey: str, r: bool, rp: str, device_index: int = -1):
    """
    Parameters:
        a: Audio source: 0 for output, 1 for input
        c: Chunk number in 1 second
        vosk: Vosk model path
        t: Target language
        tm: Translation model type, ollama or google
        omn: Ollama model name
        ourl: Ollama Base URL
        okey: Ollama API Key
        r: Whether to record the audio
        rp: Path to save the recorded audio
        device_index: Input device index for audio_type == 1, -1 for default
    """
    from audio2text import VoskRecognizer
    stream = AudioStream(a, c, device_index)
    if t == 'none':
        engine = VoskRecognizer(vosk, None, tm, omn, ourl, okey)
    else:
        engine = VoskRecognizer(vosk, t, tm, omn, ourl, okey)

    engine.start()
    stream_thread = threading.Thread(
        target=audio_recording,
        args=(stream, True, r, rp),
        daemon=True
    )
    stream_thread.start()
    try:
        engine.translate()
    except KeyboardInterrupt:
        stdout("Keyboard interrupt detected. Exiting...")
    engine.stop()


def main_sosv(a: int, c: int, sosv: str, s: str, t: str, tm: str, omn: str, ourl: str, okey: str, r: bool, rp: str, device_index: int = -1):
    """
    Parameters:
        a: Audio source: 0 for output, 1 for input
        c: Chunk number in 1 second
        sosv: Sherpa-ONNX SenseVoice model path
        s: Source language
        t: Target language
        tm: Translation model type, ollama or google
        omn: Ollama model name
        ourl: Ollama API URL
        okey: Ollama API Key
        r: Whether to record the audio
        rp: Path to save the recorded audio
        device_index: Input device index for audio_type == 1, -1 for default
    """
    from audio2text import SosvRecognizer
    stream = AudioStream(a, c, device_index)
    if t == 'none':
        engine = SosvRecognizer(sosv, s, None, tm, omn, ourl, okey)
    else:
        engine = SosvRecognizer(sosv, s, t, tm, omn, ourl, okey)

    engine.start()
    stream_thread = threading.Thread(
        target=audio_recording,
        args=(stream, True, r, rp),
        daemon=True
    )
    stream_thread.start()
    try:
        engine.translate()
    except KeyboardInterrupt:
        stdout("Keyboard interrupt detected. Exiting...")
    engine.stop()


def main_glm(a: int, c: int, url: str, model: str, key: str, s: str, t: str, tm: str, omn: str, ourl: str, okey: str, r: bool, rp: str, device_index: int = -1):
    """
    Parameters:
        a: Audio source
        c: Chunk rate
        url: GLM API URL
        model: GLM Model Name
        key: GLM API Key
        s: Source language
        t: Target language
        tm: Translation model
        omn: Ollama model name
        ourl: Ollama API URL
        okey: Ollama API Key
        r: Record
        rp: Record path
        device_index: Input device index for audio_type == 1, -1 for default
    """
    from audio2text import GlmRecognizer
    stream = AudioStream(a, c, device_index)
    if t == 'none':
        engine = GlmRecognizer(url, model, key, s, None, tm, omn, ourl, okey)
    else:
        engine = GlmRecognizer(url, model, key, s, t, tm, omn, ourl, okey)
    
    engine.start()
    stream_thread = threading.Thread(
        target=audio_recording,
        args=(stream, True, r, rp),
        daemon=True
    )
    stream_thread.start()
    try:
        engine.translate()
    except KeyboardInterrupt:
        stdout("Keyboard interrupt detected. Exiting...")
    engine.stop()



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Convert system audio stream to text')
    # all
    parser.add_argument('-e', '--caption_engine', default='gummy', help='Caption engine: gummy, glm, vosk or sosv')
    parser.add_argument('-a', '--audio_type', type=int, default=0, help='Audio stream source: 0 for output, 1 for input')
    parser.add_argument('-adi', '--audio_device_index', type=int, default=-1, help='Input device index when audio_type is 1, -1 for system default input device')
    parser.add_argument('-ld', '--list-devices', action='store_true', help='List available audio input devices as JSON and exit')
    parser.add_argument('-c', '--chunk_rate', type=int, default=10, help='Number of audio stream chunks collected per second')
    parser.add_argument('-p', '--port', type=int, default=0, help='The port to run the server on, 0 for no server')
    parser.add_argument('-d', '--display_caption', type=int, default=0, help='Display caption on terminal, 0 for no display, 1 for display')
    parser.add_argument('-t', '--target_language', default='none', help='Target language code, "none" for no translation')
    parser.add_argument('-r', '--record', type=int, default=0, help='Whether to record the audio, 0 for no recording, 1 for recording')
    parser.add_argument('-rp', '--record_path', default='', help='Path to save the recorded audio')
    # gummy and sosv and glm
    parser.add_argument('-s', '--source_language', default='auto', help='Source language code')
    # gummy only
    parser.add_argument('-k', '--api_key', default='', help='API KEY for Gummy model')
    # vosk and sosv
    parser.add_argument('-tm', '--translation_model', default='ollama', help='Model for translation: ollama or google')
    parser.add_argument('-omn', '--ollama_name', default='', help='Ollama model name for translation')
    parser.add_argument('-ourl', '--ollama_url', default='', help='Ollama API URL')
    parser.add_argument('-okey', '--ollama_api_key', default='', help='Ollama API Key')
    # vosk only
    parser.add_argument('-vosk', '--vosk_model', default='', help='The path to the vosk model.')
    # sosv only
    parser.add_argument('-sosv', '--sosv_model', default=None, help='The SenseVoice model path')
    # glm only
    parser.add_argument('-gurl', '--glm_url', default='https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', help='GLM API URL')
    parser.add_argument('-gmodel', '--glm_model', default='glm-asr-2512', help='GLM Model Name')
    parser.add_argument('-gkey', '--glm_api_key', default='', help='GLM API Key')

    args = parser.parse_args()

    if args.list_devices:
        print(json.dumps({'devices': list_input_devices()}, ensure_ascii=False))
        sys.exit(0)

    if args.port != 0:
        threading.Thread(target=start_server, args=(args.port,), daemon=True).start()

    if args.display_caption == '1':
        change_caption_display(True)

    if args.caption_engine == 'gummy':
        main_gummy(
            args.source_language,
            args.target_language,
            int(args.audio_type),
            int(args.chunk_rate),
            args.api_key,
            bool(int(args.record)),
            args.record_path,
            int(args.audio_device_index)
        )
    elif args.caption_engine == 'vosk':
        vosk_model = args.vosk_model if args.vosk_model else default_model_dir('Vosk')
        main_vosk(
            int(args.audio_type),
            int(args.chunk_rate),
            vosk_model,
            args.target_language,
            args.translation_model,
            args.ollama_name,
            args.ollama_url,
            args.ollama_api_key,
            bool(int(args.record)),
            args.record_path,
            int(args.audio_device_index)
        )
    elif args.caption_engine == 'sosv':
        sosv_model = args.sosv_model if args.sosv_model else default_model_dir('SOSV')
        main_sosv(
            int(args.audio_type),
            int(args.chunk_rate),
            sosv_model,
            args.source_language,
            args.target_language,
            args.translation_model,
            args.ollama_name,
            args.ollama_url,
            args.ollama_api_key,
            bool(int(args.record)),
            args.record_path,
            int(args.audio_device_index)
        )
    elif args.caption_engine == 'glm':
        main_glm(
            int(args.audio_type),
            int(args.chunk_rate),
            args.glm_url,
            args.glm_model,
            args.glm_api_key,
            args.source_language,
            args.target_language,
            args.translation_model,
            args.ollama_name,
            args.ollama_url,
            args.ollama_api_key,
            bool(int(args.record)),
            args.record_path,
            int(args.audio_device_index)
        )
    else:
        raise ValueError('Invalid caption engine specified.')
    
    if shared_data.status == "kill":
        stdout_cmd('kill')
