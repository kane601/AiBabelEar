# AiBabelEar Engine (Go)

Go 重实现的 AiBabelEar 转写/翻译引擎，是 `engine/`(Python) 的 drop-in 替换。
与 Node（`src/main/utils/CaptionEngine.ts`、`audioDevices.ts`）的通信契约**完全不变**。

## 目录结构

```
go-engine/
├── cmd/engine/main.go      # CLI 解析、引擎分发、生命周期
├── internal/
│   ├── protocol/   # stdout 行协议 + TCP 控制(connect/stop)
│   ├── audio/      # WASAPI 采集(go-wca)、设备枚举、下混/重采样、WAV 录音
│   ├── recognizer/ # 识别器接口 + GLM(HTTP)/Gummy(WebSocket)/SOSV(cgo)/Vosk(cgo)
│   ├── translate/  # Ollama/OpenAI 兼容 + Google 翻译
│   └── model/      # 默认模型目录(%APPDATA%/AiBabelEar/<engine>)
└── go.mod
```

## 构建模式

> ⚠️ **生产构建必须用 64 位 (amd64)**。当前开发机是 32 位(386) Go 工具链，但可通过**交叉编译 + 64 位 MinGW-w64** 产出 x64 二进制（已在本机验证）。
> sherpa-onnx-go 的绑定在 32 位(386)下因超大静态数组无法编译。

### 1) pure（纯 Go，无原生依赖）

```bash
CGO_ENABLED=0 GOARCH=amd64 go build -o dist/engine-x64.exe ./cmd/engine
```

- SOSV/Vosk 走 stub（启动对应引擎会输出错误提示）；GLM/Gummy/翻译/设备枚举/WASAPI 采集完全可用。
- 产物为 AMD64（`PE Machine = 0x8664`），约 8 MB，**无需任何 DLL**。

### 2) cgo（含 SOSV 离线识别，不含 Vosk）

Vosk 的 `libvosk` 不在仓库内（需外部提供），先用 `-tags novosk` 排除 Vosk 以产出含 SOSV 的 x64 二进制：

```bash
CGO_ENABLED=1 GOARCH=amd64 \
  CC=x86_64-w64-mingw32-gcc CXX=x86_64-w64-mingw32-g++ \
  go build -tags novosk -o dist/engine-x64-cgo.exe ./cmd/engine
```

构建后需把原生 DLL 拷到二进制同目录（否则运行报 `0xC0000135` 缺 DLL）：

- `sherpa-onnx-go-windows` 模块内 `lib/x86_64-pc-windows-gnu/` 下的 `onnxruntime.dll`、`sherpa-onnx-c-api.dll`、`sherpa-onnx-cxx-api.dll`
- MinGW-w64 运行时的 `libgcc_s_seh-1.dll`、`libstdc++-6.dll`、`libwinpthread-1.dll`

> 已验证：该二进制为 AMD64，可正常运行 `--list-devices` 并输出正确设备 JSON（含中文、microphone/loopback 标注）。

### 3) 完整 cgo（含 Vosk）

需先取得 Vosk C 库（含 `vosk_api.h` 与 `libvosk`/`vosk.dll`，如 `alphacep/vosk` 的 win64 发布包），放到可访问路径，然后：

```bash
CGO_ENABLED=1 GOARCH=amd64 \
  CC=x86_64-w64-mingw32-gcc CXX=x86_64-w64-mingw32-g++ \
  CGO_CFLAGS="-I<path-to-vosk_api.h>" CGO_LDFLAGS="-L<path-to-libvosk>" \
  go build -o dist/engine-x64-full.exe ./cmd/engine
```

（去掉 `-tags novosk`，并把 `vosk.dll` 一并拷到同目录。）

## 契约（与 Python 完全一致）

- CLI 参数：`-e -a -adi -ld/--list-devices -c -p -d -t -r -rp -s -k -tm -omn -ourl -okey -vosk -sosv -gurl -gmodel -gkey`
- stdout：每行一个 JSON，`command` ∈ {connect,kill,caption,translation,print,info,warn,error,usage}
- TCP：`localhost:<port>` 监听，绑定成功发 `connect`，收到 `{"command":"stop"}` 优雅退出
- 设备 JSON：`{"devices":[{index,name,maxInputChannels,defaultSampleRate,isLoopback,kind}]}`

## 测试

```
CGO_ENABLED=0 go test ./...
```

覆盖：协议格式、TCP stop/kill 握手、音频下混/重采样/WAV、翻译(<think> 剥离 + OpenAI 兼容)、
Gummy caption 映射/usage，以及两个集成测试（真实二进制 `--list-devices` 与 TCP stop 生命周期）。
