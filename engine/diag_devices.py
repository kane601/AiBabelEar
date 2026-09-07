import sys
import json

out = []
def log(*a):
    out.append(" ".join(str(x) for x in a))

log("PYTHON:", sys.executable, sys.version)
try:
    import pyaudiowpatch as pyaudio
    log("pyaudiowpatch imported OK")
except Exception as e:
    log("IMPORT FAIL:", repr(e))
    open("diag_result.txt", "w", encoding="utf-8").write("\n".join(out))
    sys.exit(0)

try:
    p = pyaudio.PyAudio()
except Exception as e:
    log("PyAudio init FAIL:", repr(e))
    open("diag_result.txt", "w", encoding="utf-8").write("\n".join(out))
    sys.exit(0)

try:
    wasapi = p.get_host_api_info_by_type(pyaudio.paWASAPI)
    log("WASAPI host api info:", json.dumps(wasapi, ensure_ascii=False))
except Exception as e:
    log("WASAPI FAIL:", repr(e))
    wasapi = None

log("=== ALL DEVICES ===")
for i in range(p.get_device_count()):
    try:
        d = p.get_device_info_by_index(i)
        log(json.dumps({
            "index": d["index"],
            "name": d["name"],
            "maxInput": d["maxInputChannels"],
            "maxOutput": d["maxOutputChannels"],
            "defaultRate": d["defaultSampleRate"],
            "isLoopback": d.get("isLoopbackDevice"),
            "hostApi": d["hostApi"],
        }, ensure_ascii=False))
    except Exception as e:
        log("device", i, "err", repr(e))

if wasapi is not None:
    log("=== LOOPBACK DEVICES ===")
    try:
        for lb in p.get_loopback_device_info_generator():
            log(json.dumps({
                "index": lb["index"],
                "name": lb["name"],
                "maxInput": lb["maxInputChannels"],
                "defaultRate": lb["defaultSampleRate"],
                "isLoopback": lb.get("isLoopbackDevice"),
            }, ensure_ascii=False))
    except Exception as e:
        log("loopback gen FAIL:", repr(e))

open("diag_result.txt", "w", encoding="utf-8").write("\n".join(out))
p.terminate()
