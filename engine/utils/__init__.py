import os
import sys

from .audioprcs import merge_chunk_channels, resample_chunk_mono
from .sysout import stdout, stdout_err, stdout_cmd, stdout_obj, stderr
from .sysout import change_caption_display
from .shared import shared_data
from .server import start_server
from .translation import ollama_translate, google_translate


def default_model_dir(engine: str) -> str:
    """返回 VoiceBridge 各字幕引擎模型的默认下载/加载目录。

    Windows: %APPDATA%/VoiceBridge/<engine>
    macOS:   ~/Library/Application Support/VoiceBridge/<engine>
    Linux:   ~/.config/VoiceBridge/<engine>
    """
    if os.name == 'nt':
        base = os.getenv('APPDATA', os.path.expanduser('~'))
    elif sys.platform == 'darwin':
        base = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support')
    else:
        base = os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'VoiceBridge', engine)