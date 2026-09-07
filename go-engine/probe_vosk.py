import os, glob, sys
try:
    import vosk
    d = os.path.dirname(vosk.__file__)
    print("VOSK_DIR=" + d)
    print("H=" + str(os.path.exists(os.path.join(d, "vosk_api.h"))))
    print("DLL=" + str(os.path.exists(os.path.join(d, "libvosk.dll"))))
    print("LIBS=" + str(glob.glob(os.path.join(d, "*.lib")) + glob.glob(os.path.join(d, "*.dll"))))
    print("ALL=" + str(os.listdir(d)))
except Exception as e:
    print("NO_VOSK:" + repr(e))
