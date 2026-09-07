# AiVoiceEars Engine 模块 Go 语言重写技术方案

> 版本：v1.0 ｜ 状态：方案评审 ｜ 适用范围：`engine/` 目录（Python 实时转写/翻译引擎）
>
> 目标：在**完全保持 Node（Electron 主进程）↔ Engine 通信契约不变**的前提下，用 Go 重写现有 Python 引擎，
> 以获得更快的冷启动、更小的分发体积、更可控的原生依赖，并消除 PyInstaller 打包相关的隐性问题。

---

## 1. 背景与目标

### 1.1 现状

- `engine/` 是一个独立的 Python 可执行程序，由 Electron 主进程通过 `child_process.spawn` 拉起。
- 生产环境打包为 PyInstaller `onefile`（`main.exe`，约 103MB），随 Electron `extraResources` 一起分发到 `resources/engine/`。
- 引擎与 Node 之间通过两条通道通信：
  - **stdout 行协议**：每行一个 JSON，Node 端逐行 `JSON.parse`（见 `src/main/utils/CaptionEngine.ts`）。
  - **TCP 本地控制**：引擎在 `localhost:<port>` 起 socket，Node 连上后可下发 `stop` 命令。
- 另有一个**一次性设备枚举模式**：`--list-devices`，输出设备 JSON 后退出（见 `src/main/utils/audioDevices.ts`）。

### 1.2 重写动机

| 痛点 | 说明 |
|------|------|
| 冷启动慢 | PyInstaller onefile 每次启动需解压临时目录 |
| 体积大 | 单个 `main.exe` ~103MB |
| 打包脆弱 | 曾出现 `exit(0)` 在打包环境 NameError、延迟导入耦合、argparse 冲突、缓存复用旧产物等问题 |
| 依赖不透明 | Python + 一堆 wheel（onnxruntime/sherpa/vosk/pyaudiowpatch）在不同机器上行为不一致 |

### 1.3 目标与非目标

**目标**
- Go 单二进制替换 `main.exe` / `main`，对 Node 端**零改动**（命令行参数、stdout 协议、TCP 协议、设备枚举 JSON 完全兼容）。
- 模型权重（`.onnx` / Vosk 模型目录）**直接复用**，不重训、不转换。
- 跨平台：Windows（首要）、macOS、Linux。

**非目标**
- 不改变前端 UI / i18n / 配置项。
- 不改变模型下载逻辑、模型目录结构（`%APPDATA%/AiVoiceEars/<engine>`）。
- 不追求在本阶段就实现 100% 引擎覆盖（可分阶段，SOSV 优先）。

---

## 2. 通信契约（重写必须严格保持，逐条对照代码）

> 这是整份方案的**红线**。Go 实现只要有一条契约不符，Node 端就会出现设备列表为空、字幕不显示、无法停止等问题。

### 2.1 命令行参数（来自 `engine/main.py` argparse）

| 参数 | 短 | 默认 | 含义 |
|------|----|------|------|
| `--caption_engine` | `-e` | `gummy` | 引擎：`gummy` / `glm` / `vosk` / `sosv` |
| `--audio_type` | `-a` | `0` | `0`=系统输出回环，`1`=麦克风输入 |
| `--audio_device_index` | `-adi` | `-1` | 输入设备索引（`-1`=默认设备） |
| `--list-devices` | `-ld` | false | 枚举输入设备为 JSON 并退出 |
| `--chunk_rate` | `-c` | `10` | 每秒采集音频块数量 |
| `--port` | `-p` | `0` | 控制服务端口，`0`=不起服务 |
| `--display_caption` | `-d` | `0` | 终端显示字幕（仅调试） |
| `--target_language` | `-t` | `none` | 目标语言，`none`=不翻译 |
| `--record` | `-r` | `0` | 是否录音 |
| `--record_path` | `-rp` | `''` | 录音保存路径 |
| `--source_language` | `-s` | `auto` | 源语言（gummy/sosv/glm） |
| `--api_key` | `-k` | `''` | Gummy（阿里云百炼）API Key |
| `--translation_model` | `-tm` | `ollama` | 翻译模型：`ollama` / `google` |
| `--ollama_name` | `-omn` | `''` | Ollama 模型名 |
| `--ollama_url` | `-ourl` | `''` | Ollama / OpenAI 兼容 base_url |
| `--ollama_api_key` | `-okey` | `''` | Ollama API Key |
| `--vosk_model` | `-vosk` | `''` | Vosk 模型目录 |
| `--sosv_model` | `-sosv` | `None` | SenseVoice 模型目录 |
| `--glm_url` | `-gurl` | 智谱转写 URL | GLM API URL |
| `--glm_model` | `-gmodel` | `glm-asr-2512` | GLM 模型名 |
| `--glm_api_key` | `-gkey` | `''` | GLM API Key |

> 注意：Node 端实际下发参数见 `CaptionEngine.getApp()`，Go 版本必须能解析上述**全部**参数（即使部分引擎未实现，也要能识别不报错）。

### 2.2 stdout 行协议（每行一个 JSON + `\n`，UTF-8）

Node 端 `handleEngineData()` 消费以下 `command`：

| command | 触发方 | 关键字段 | Node 行为 |
|---------|--------|----------|-----------|
| `connect` | 控制服务 bind 成功 | 无 | Node 建立 TCP 连接、标记引擎已启动 |
| `kill` | 出错需自杀 | 无 | Node 调用 `kill()` 强杀进程 |
| `caption` | 识别结果 | `index`,`text`,`translation`,`time_s`,`time_t` | 更新字幕日志 |
| `translation` | 翻译结果 | `time_s`,`text`,`translation` | 更新字幕翻译 |
| `print` | 调试打印 | `content` | `console.log` |
| `info` | 信息 | `content` | 记录日志 |
| `warn` | 警告 | `content` | 记录日志 |
| `error` | 错误 | `content` | 弹窗提示用户 |
| `usage` | Token 用量 | `content` | 记录日志 |

统一序列化格式（见 `utils/sysout.py`）：`{"command": "...", "content": "..."}`；带结构的 `caption`/`translation` 直接把字段并入对象输出。

**关键点**：
- Node 逐行解析，解析失败**静默丢弃该行**（`Log.error` 但不崩），因此 Go 版必须保证**每条消息独占一行且为合法 JSON**，切勿把多行日志混进一条 JSON。
- Windows 下必须 UTF-8 输出（中文设备名/字幕）。`audioDevices.ts` 会去 BOM 并取**最后一个非空行**解析设备 JSON。

### 2.3 TCP 控制协议（`utils/server.py`）

- 引擎在 `localhost:<port>` `listen(1)`，accept 后单连接。
- bind 成功 → 输出 `{"command":"connect"}`；bind 失败 → 输出 `{"command":"kill"}` 并返回。
- 收到 `{"command":"stop"}` → 将内部状态置为 `stop`，引擎优雅退出。
- Node 端 `stop()` 先发 `stop`，4s 后仍未退出则 `taskkill`。

### 2.4 设备枚举 JSON（`sysaudio/win.py::list_input_devices`）

`--list-devices` 输出（最后一行）：

```json
{"devices":[
  {"index":1,"name":"麦克风 (Realtek)","maxInputChannels":2,"defaultSampleRate":48000,"isLoopback":false,"kind":"microphone"},
  {"index":7,"name":"扬声器 (Realtek) [Loopback]","maxInputChannels":2,"defaultSampleRate":48000,"isLoopback":true,"kind":"loopback"}
]}
```

字段与类型必须一致（`index:int`、`isLoopback:bool`、`kind: "microphone"|"loopback"`）。Windows 下需优先枚举 WASAPI 宿主设备并去重。

### 2.5 音频参数（`sysaudio/win.py::AudioStream`）

- 目标格式：**16000Hz / 单声道 / int16**。
- 采集块大小 `CHUNK = 16000 / chunk_rate`。
- `audio_type=0` 采集默认输出设备的 **WASAPI loopback**；`=1` 采集指定/默认输入设备。
- 多声道需下混为单声道（`merge_chunk_channels`）；非 16k 需重采样到 16k（`resample_chunk_mono`）。

---

## 3. 可行性分析：Python 依赖 → Go 映射

| Python 依赖 | 作用 | Go 方案 | 成熟度 / 风险 |
|-------------|------|---------|---------------|
| `pyaudiowpatch` | WASAPI loopback 采集 | `github.com/gen2brain/malgo`（miniaudio，跨平台，支持 loopback）或 `github.com/moutend/go-wca`（纯 WASAPI） | 中：malgo 跨平台省事；go-wca 更贴近现有 WASAPI 语义但仅 Windows |
| `sherpa_onnx` | SenseVoice 识别 + Silero VAD + 标点 | `github.com/k2-fsa/sherpa-onnx-go`（官方 Go binding，cgo） | **低**：官方维护，API 对齐，模型直接复用 |
| `vosk` | Vosk 离线识别 | `github.com/alphacep/vosk-api`（含 `/go` binding，cgo） | 低-中：官方 binding，需链接 libvosk |
| `onnxruntime`（间接） | sherpa 后端 | 由 sherpa-onnx-go 静态/动态链接自带 | 中：cgo 链接与分发需处理 |
| `ollama` / `openai` | LLM 翻译 | `github.com/sashabaranov/go-openai`（可设自定义 base_url，兼容 Ollama OpenAI 端点） | 低 |
| `googletrans` | 免费 Google 翻译 | 无官方库，自写 HTTP 调用 `translate.googleapis.com` | 中：非官方端点，需容错 |
| dashscope（Gummy） | 阿里云百炼实时 ASR | 无官方 Go SDK，自写 **WebSocket** 客户端 | **高**：协议复杂，工作量最大 |
| GLM 转写 | 智谱 `audio/transcriptions` | HTTP multipart，`net/http` 自写 | 低 |
| `numpy` | PCM/float32 处理 | 标准库 `encoding/binary` + 自写转换 | 低 |
| `wave` | 录音落盘 | 标准库自写 WAV 头 或 `github.com/go-audio/wav` | 低 |

### 3.1 结论

- **可行**。核心识别链路（SOSV/Vosk）都有官方 Go binding，`.onnx` 与 Vosk 模型可原样复用。
- **优先级建议**：`sosv` 风险最低、收益最高，作为首个迁移引擎；`gummy` 风险最高（WebSocket 私有协议），放到最后，甚至可保留 Python 兜底。
- **主要工程成本**在 cgo：sherpa-onnx / vosk 的原生库（onnxruntime、libvosk）需要随二进制正确分发（静态链接或同目录动态库）。

---

## 4. 目标架构与项目结构

```
engine-go/
├── cmd/
│   └── engine/
│       └── main.go              # 参数解析、引擎分发、生命周期
├── internal/
│   ├── protocol/
│   │   ├── stdout.go            # stdout 行协议（connect/kill/caption/translation/info/warn/error/usage/print）
│   │   └── control.go           # TCP localhost 控制服务（connect/stop）
│   ├── audio/
│   │   ├── stream.go            # AudioStream 抽象：16k/mono/int16 + chunk 队列
│   │   ├── stream_windows.go    # WASAPI loopback / 输入采集
│   │   ├── stream_darwin.go
│   │   ├── stream_linux.go
│   │   ├── devices_windows.go   # list_input_devices（WASAPI 去重 + kind 标注）
│   │   └── resample.go          # 下混 + 重采样到 16k
│   ├── recognizer/
│   │   ├── recognizer.go        # 统一接口：Start/Feed/Translate/Stop
│   │   ├── sosv.go              # sherpa-onnx-go SenseVoice + VAD + 标点
│   │   ├── vosk.go              # vosk-api
│   │   ├── gummy.go             # DashScope WebSocket（最后实现）
│   │   └── glm.go               # 智谱 HTTP 转写
│   ├── translate/
│   │   ├── ollama.go            # go-openai（自定义 base_url）
│   │   └── google.go            # 自写 HTTP
│   └── model/
│       └── paths.go             # default_model_dir（%APPDATA%/AiVoiceEars/<engine> 等）
└── go.mod
```

### 4.1 统一识别器接口

```go
type Recognizer interface {
    Start() error                      // 加载模型/建立连接
    Feed(chunk []int16)                // 送入 16k mono 音频帧
    Run(ctx context.Context) error     // 持续消费队列并输出 caption/translation
    Stop() error
}
```

`main.go` 根据 `-e` 选择实现，音频采集协程把 chunk 写入 channel，识别器从 channel 读取；`stop`（TCP）或退出信号取消 `ctx`，各协程优雅收尾。

---

## 5. 分阶段实施路线

| 阶段 | 内容 | 交付物 | 预估 |
|------|------|--------|------|
| **P0 协议骨架** | CLI 解析 + stdout 行协议 + TCP 控制 + `--list-devices`（Windows） | 可被 Node 拉起、能枚举设备、能响应 stop 的空壳 | 1-2 天 |
| **P1 SOSV** | sherpa-onnx-go 接入 SenseVoice + Silero VAD + 标点，音频经 channel 驱动 | Windows 下 sosv 引擎端到端可用（含翻译） | 3-5 天 |
| **P2 Windows 采集** | WASAPI loopback + 麦克风采集、多声道下混、重采样、录音落盘 | 音频链路与 Python 行为一致 | 3-4 天 |
| **P3 其它引擎** | Vosk（离线）+ GLM（HTTP）+ Gummy（WebSocket） | 四引擎全覆盖 | 5-8 天 |
| **P4 跨平台** | macOS / Linux 采集与打包 | 三平台二进制 | 3-5 天 |
| **P5 打包替换** | 替换 `electron-builder.yml` 的 `extraResources`，回归测试 | 发布版切换到 Go 引擎 | 2-3 天 |

> 建议：P0+P1 完成后即可与现有 Python 引擎**并行灰度**（通过配置或构建开关切换 `main.py` / `engine.exe`，Node 侧 `getEngineExecutable()` 已支持 dev 优先 Go 二进制、生产用打包 `engine`、否则回落 Python），降低风险。

---

## 6. 打包与分发

| 项 | Python（现状） | Go（目标） |
|----|----------------|-----------|
| 产物 | PyInstaller onefile `main.exe` ~103MB | 单二进制 + 原生库（onnxruntime/libvosk） |
| 体积 | ~103MB | ~20-40MB（cgo 静态链接后视原生库而定） |
| 冷启动 | 需解压临时目录，较慢 | 直接执行，快 |
| 系统依赖 | 无（已验证仅依赖 ADVAPI32/KERNEL32/USER32） | 需保证 onnxruntime/libvosk 随包分发（静态或同目录 DLL/dylib/so） |
| Electron 集成 | `extraResources` → `resources/engine/main.exe` | 同路径替换为 Go 二进制，Node 无需改动 |

**cgo 注意**：
- Windows：优先静态链接 onnxruntime；若动态则把 `onnxruntime.dll`、`libvosk.dll` 放到二进制同目录并随 `extraResources` 分发。
- 交叉编译受 cgo 限制，建议**在各目标平台原生构建**（CI 三平台 runner）。

---

## 7. 功能回归影响范围

> 重写属于"替换底层实现、保持外部契约"，理论上前端/主进程无改动，但实际受影响面覆盖**所有依赖引擎输出的功能**。下表按模块列出受影响点与关注理由，作为回归测试的范围依据。

### 7.1 直接受影响（引擎行为变更的第一现场）

| 模块 / 文件 | 影响点 | 风险说明 |
|-------------|--------|----------|
| `src/main/utils/CaptionEngine.ts` | 进程拉起、stdout 逐行解析、TCP 连接、start/stop/kill/restart、启动超时、崩溃 stderr 上报 | 协议/退出码/时序若有细微差异，会导致字幕不显示、无法停止、误报崩溃 |
| `src/main/utils/audioDevices.ts` | `--list-devices` 枚举、取最后一非空行解析、BOM 处理、UTF-8 | 设备下拉为空或乱码（历史高发问题区） |
| `engine/`（整体替换） | 采集/识别/翻译/录音全链路 | 全量重写，需逐引擎验证 |
| 设备选择 UI（渲染层设备下拉） | 依赖枚举 JSON 的 `index/name/kind` | 字段缺失/类型不符导致选择失效 |

### 7.2 间接受影响（依赖引擎输出的上层功能）

| 功能 | 依赖点 | 关注理由 |
|------|--------|----------|
| 字幕显示 / 字幕历史 | `caption` 消息的 `index/text/time_s/time_t` | `index` 递增语义变化会影响句子分段与刷新 |
| 翻译显示 | `translation` 消息 + 异步线程时序 | 翻译为异步，需保证顺序/配对不错乱 |
| 引擎启动/停止状态机 | `connect`/`kill` + TCP + close code | 状态机对退出码敏感（`code!==0 && !expectedExit` 才报崩溃） |
| 错误提示弹窗 | `error` 消息、stderr tail | 错误文案是否仍能被用户看到 |
| Token 用量统计 | `usage` 消息 | Gummy/GLM 用量上报格式 |
| 录音功能 | `-r/-rp` + WAV 落盘 | 文件名规则、声道/采样率与 Python 一致 |
| 模型管理（下载/使用） | `default_model_dir`、模型目录结构、`isModelAvailable()` 探测路径 | Go 版模型路径/文件名必须与 `CaptionEngine.isModelAvailable()` 的探测候选一致（如 `sensevoice/model.onnx`） |
| 多语言 / 源语言 auto | `-s/-t` 语义、`lang_map` | 语言码映射需完全对齐 |
| 翻译后端切换 | `-tm ollama/google`、`-ourl/-omn/-okey` | Ollama OpenAI 兼容端点与 base_url 行为 |

### 7.3 打包 / 分发受影响

| 项 | 影响点 |
|----|--------|
| `electron-builder.yml` | `extraResources` 指向的引擎产物路径/文件名变更 |
| `engine/main.spec` | 若不再用 PyInstaller，可废弃 |
| 安装包体积 / 杀软误报 | Go 二进制 + 原生 DLL 需重新验证签名与免报毒 |
| 首次启动 | cgo 原生库缺失会直接启动失败（需覆盖"干净机器"场景） |

### 7.4 不受影响（预期零改动，仍需冒烟确认）

- 渲染层 UI / i18n 文案 / 配置存储结构
- 模型下载源与 aria2 下载逻辑
- 应用自动更新、窗口管理

---

## 8. 测试验证功能点

> 验证策略：**契约测试优先**（保证 Go 引擎的输入输出与 Python 逐字节/逐字段兼容），再做端到端功能回归，最后覆盖异常与跨平台。

### 8.1 契约兼容测试（最高优先级）

| 编号 | 测试点 | 步骤 | 预期 |
|------|--------|------|------|
| C-01 | CLI 全参数可解析 | 用 `getApp()` 生成的各引擎完整命令行分别启动 Go 引擎 | 不因未知/多余参数报错退出 |
| C-02 | `--list-devices` JSON 结构 | 运行 `-ld`，对比 Python 输出 | `devices[]` 字段名/类型一致，最后一行为合法 JSON，UTF-8 无 BOM 干扰 |
| C-03 | 设备去重与 kind | Windows 多宿主环境枚举 | 仅保留 WASAPI 去重结果，`kind` 正确标注 microphone/loopback |
| C-04 | stdout 单行 JSON | 抓取引擎 stdout | 每条消息独占一行、合法 JSON，无多行日志污染 |
| C-05 | `connect` 时序 | 启动带 `-p <port>` | 先输出 `{"command":"connect"}`，Node 才能连上 TCP |
| C-06 | `stop` 优雅退出 | TCP 发送 `{"command":"stop"}` | 引擎在 4s 内退出，退出码 0，Node 不报崩溃 |
| C-07 | `kill` 自杀 | 构造 bind 失败（占用端口） | 输出 `{"command":"kill"}` 且退出 |
| C-08 | caption 字段 | 触发识别 | 含 `index/text/translation/time_s/time_t`，`index` 递增语义与 Python 一致 |
| C-09 | translation 字段 | 开启翻译 | 含 `time_s/text/translation`，与对应 caption 可配对 |
| C-10 | 中文 UTF-8 | 中文设备名 + 中文字幕 | Node 端无乱码 |
| C-11 | 退出码语义 | 正常停止 vs 崩溃 | 正常=0（不弹崩溃框）；崩溃≠0 且 `error`/stderr 能被上报 |

### 8.2 音频链路测试

| 编号 | 测试点 | 预期 |
|------|--------|------|
| A-01 | loopback 采集（`-a 0`） | 采到系统播放声音，识别正常 |
| A-02 | 麦克风采集（`-a 1 -adi <idx>`） | 采到指定麦克风 |
| A-03 | 默认设备回落（`-adi -1` 或非法索引） | 回落到默认输入设备，不崩溃 |
| A-04 | 多声道下混 | 立体声/多声道正确混为单声道 |
| A-05 | 重采样 | 非 16k 设备重采样到 16k，音质与识别率无明显退化 |
| A-06 | chunk_rate | 不同 `-c` 值下块大小 `16000/c` 正确、无卡顿 |
| A-07 | 录音（`-r 1 -rp <path>`） | 生成 `audio-YYYY-MM-DDTHH-MM-SS.wav`，声道/位宽/采样率正确、可播放 |

### 8.3 各引擎功能测试

| 编号 | 引擎 | 测试点 | 预期 |
|------|------|--------|------|
| E-SOSV-1 | sosv | SenseVoice 识别 + VAD 断句 + 标点 | 断句合理，中英标点正确 |
| E-SOSV-2 | sosv | 源语言 auto/zh/en/ja/ko/yue | 各语言识别正常，en 走在线标点分支 |
| E-SOSV-3 | sosv | 模型路径探测 | `isModelAvailable()` 的候选路径命中 |
| E-VOSK-1 | vosk | 指定语言模型加载 | `resolveVoskLangModel` 解析到的目录可加载 |
| E-VOSK-2 | vosk | 无效模型路径 | 优雅报错（`error`/退出码），Node 弹窗提示 |
| E-GLM-1 | glm | HTTP 转写 | 正确调用 `-gurl/-gmodel/-gkey`，返回字幕 |
| E-GUMMY-1 | gummy | DashScope WebSocket 实时 ASR | 与 Python 行为一致（含 `usage` 上报） |
| E-GUMMY-2 | gummy | 缺失 API Key | Node 端预校验 + 引擎侧兜底报错 |

### 8.4 翻译功能测试

| 编号 | 测试点 | 预期 |
|------|--------|------|
| T-01 | `-t none` | 不产生 translation 消息 |
| T-02 | Ollama（`-tm ollama` + 本地） | 正常翻译，`<think>` 段被剥离 |
| T-03 | OpenAI 兼容端点（`-ourl` + `-okey`） | 走 base_url，翻译正常 |
| T-04 | Google（`-tm google`） | 网络异常时输出 `warn` 而非崩溃 |
| T-05 | 翻译异步顺序 | 高频字幕下翻译与原文正确配对、不串行阻塞识别 |

### 8.5 生命周期与状态机测试

| 编号 | 测试点 | 预期 |
|------|--------|------|
| L-01 | 启动超时 | 超过 `startTimeoutSeconds` 未 connect → Node 触发超时并 kill |
| L-02 | 正常 start→stop | 状态回到 stopped，无崩溃弹窗 |
| L-03 | restart | 先 kill 再 start，恢复正常 |
| L-04 | 强杀 kill | `taskkill /t /f`（win）后无僵尸进程/残留端口占用 |
| L-05 | 引擎崩溃 | 非预期退出 → 展示 stderr tail 或 `engine.crashed.noinfo` |

### 8.6 跨平台与分发测试

| 编号 | 测试点 | 预期 |
|------|--------|------|
| P-01 | 干净 Windows（无 Python/无 VC++） | Go 引擎可直接运行（原生库随包） |
| P-02 | macOS 采集与识别 | loopback/麦克风、SOSV 正常 |
| P-03 | Linux 采集与识别 | 同上 |
| P-04 | 安装包体积 | 明显小于 PyInstaller 版 |
| P-05 | 冷启动耗时 | 优于 PyInstaller onefile |
| P-06 | 杀软/签名 | 无误报，签名有效 |

### 8.7 回归基线对比（推荐做法）

- 录制一段固定音频（多语言混合），分别用 **Python 引擎**与 **Go 引擎**离线跑，导出各自 stdout 全部 JSON 行。
- 用脚本按 `command` 分类比对：`caption.text`、`translation`、字段集合、行数量级差异，形成"识别一致率/字段兼容"报告。
- 差异控制在可接受阈值内（识别文本受模型推理细节可能有极小差异，但**协议字段必须 100% 兼容**）。

---

## 9. 风险与回退策略

| 风险 | 等级 | 缓解 |
|------|------|------|
| cgo 原生库分发（onnxruntime/libvosk） | 高 | 优先静态链接；CI 各平台原生构建；干净机启动测试纳入发布门禁 |
| Gummy WebSocket 私有协议逆向 | 高 | 放到最后阶段；必要时该引擎**保留 Python 兜底**，其余引擎走 Go |
| WASAPI loopback 行为差异 | 中 | 用 A-01/A-05 基线音频比对；malgo 与 go-wca 二选一做 PoC |
| stdout 协议细节不一致 | 中 | C 组契约测试 + 8.7 基线对比作为硬门禁 |
| 翻译异步时序错乱 | 中 | T-05 专项 + 为 translation 保留 `time_s` 配对键 |

**回退策略**：保留 Python 引擎产物与 `main.spec`，通过构建开关（或 `extraResources` 指向）在 Go 引擎出现严重问题时**一键切回** PyInstaller 版本；灰度期间两套并存，按引擎粒度切换。

---

## 10. 结论

- 技术上**可行**，核心识别依赖（SenseVoice/Vosk）具备官方 Go binding，模型权重可直接复用。
- 关键约束是**通信契约零变更**与 **cgo 原生库分发**，二者均有明确应对手段。
- 建议路线：`P0 协议骨架 → P1 SOSV → 灰度并行 → 逐引擎补齐 → 跨平台 → 替换分发`，Gummy 视投入产出可最后处理或保留 Python 兜底。
