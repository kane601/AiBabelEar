"""获取 Linux 系统音频输入流"""

import subprocess
from textwrap import dedent


def find_monitor_source():
    result = subprocess.run(
        ["pactl", "list", "short", "sources"],
        stdout=subprocess.PIPE, text=True
    )
    lines = result.stdout.splitlines()

    for line in lines:
        parts = line.split('\t')
        if len(parts) >= 2 and ".monitor" in parts[1]:
            return parts[1]

    raise RuntimeError("System output monitor device not found")


def list_input_sources():
    """枚举所有非监视器（即真实麦克风）的 pactl 输入源名称。"""
    try:
        result = subprocess.run(
            ["pactl", "list", "short", "sources"],
            stdout=subprocess.PIPE, text=True
        )
    except Exception:
        return []
    sources = []
    for line in result.stdout.splitlines():
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        name = parts[1]
        if ".monitor" not in name:
            sources.append(name)
    return sources


def find_input_source(index=-1):
    sources = list_input_sources()
    if not sources:
        raise RuntimeError("Microphone input device not found")
    if index is not None and index >= 0 and index < len(sources):
        return sources[index]
    return sources[0]


def list_input_devices():
    """
    枚举所有可用的音频输入（麦克风）设备，返回设备信息列表。
    Linux 下以 pactl 输入源为单位，index 为在前端展示的序号（0 起）。
    """
    sources = list_input_sources()
    devices = []
    for idx, name in enumerate(sources):
        devices.append({
            'index': idx,
            'name': name,
            'maxInputChannels': 1,
            'defaultSampleRate': 44100,
            'isLoopback': False,
            'kind': 'microphone',
        })
    return devices


class AudioStream:
    """
    获取系统音频流

    初始化参数：
        audio_type: 0-系统音频输出流（不支持，不会生效），1-系统音频输入流（默认）
        chunk_rate: 每秒采集音频块的数量，默认为10
    """
    def __init__(self, audio_type=1,  chunk_rate=10, device_index=-1):
        self.audio_type = audio_type

        if self.audio_type == 0:
            self.source = find_monitor_source()
        else:
            self.source = find_input_source(device_index)
        self.stop_signal = False
        self.process = None
        self.FORMAT = 16
        self.SAMP_WIDTH = 2
        self.CHANNELS = 2
        self.RATE = 16000
        self.CHUNK_RATE = chunk_rate
        self.CHUNK = self.RATE // chunk_rate

    def get_info(self):
        dev_info = f"""
        音频捕获进程：
            - 捕获类型：{"音频输出" if self.audio_type == 0 else "音频输入"}
            - 设备源：{self.source}
            - 捕获进程 PID：{self.process.pid if self.process else "None"}

        样本格式：{self.FORMAT}
        样本位宽：{self.SAMP_WIDTH}
        样本通道数：{self.CHANNELS}
        样本采样率：{self.RATE}
        样本块大小：{self.CHUNK}
        """
        print(dev_info)

    def open_stream(self):
        """
        启动音频捕获进程
        """
        self.process = subprocess.Popen(
            ["parec", "-d", self.source, "--format=s16le", "--rate=16000", "--channels=2"],
            stdout=subprocess.PIPE
        )

    def read_chunk(self):
        """
        读取音频数据
        """
        if self.stop_signal:
            self.close_stream()
            return None
        if self.process and self.process.stdout:
            return self.process.stdout.read(self.CHUNK)
        return None

    def close_stream_signal(self):
        """
        线程安全的关闭系统音频输入流，不一定会立即关闭
        """
        self.stop_signal = True

    def close_stream(self):
        """
        关闭系统音频捕获进程
        """
        if self.process:
            self.process.terminate()
        self.stop_signal = False
