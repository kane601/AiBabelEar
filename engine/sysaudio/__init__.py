import sys

if sys.platform == "win32":
    from .win import AudioStream, list_input_devices
elif sys.platform == "darwin":
    from .darwin import AudioStream, list_input_devices
elif sys.platform == "linux":
    from .linux import AudioStream, list_input_devices
else:
    raise NotImplementedError(f"Unsupported platform: {sys.platform}")
