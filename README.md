# AiVoiceEars

跨平台实时字幕软件（当前版本 **2.0.2**）。从系统扬声器或麦克风采集音频，经语音识别与可选翻译，以悬浮窗口实时显示字幕。

> 仓库根目录另有完整说明：[../README.md](../README.md)（推荐从根文档阅读）。  
> 多语言简介：[English](./README_en.md) · [日本語](./README_ja.md)

---

## 文档导航

| 主题                                                     | 链接                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| **完整项目说明**（功能 / 原理 / 架构 / 参数 / 编译打包） | [仓库根 README](../README.md)                                        |
| 用户使用手册                                             | [docs/user-manual/zh.md](./docs/user-manual/zh.md)                   |
| 字幕引擎开发                                             | [docs/engine-manual/zh.md](./docs/engine-manual/zh.md)               |
| 引擎通信协议                                             | [docs/api-docs/caption-engine.md](./docs/api-docs/caption-engine.md) |
| Electron IPC                                             | [docs/api-docs/electron-ipc.md](./docs/api-docs/electron-ipc.md)     |
| Go 引擎                                                  | [go-engine/README.md](./go-engine/README.md)                         |
| 更新日志                                                 | [docs/CHANGELOG.md](./docs/CHANGELOG.md)                             |

---

## 功能概览

- **实时字幕**：系统音频输出（Loopback）或麦克风输入
- **多引擎**：Gummy、GLM-ASR（云端）；Vosk、SOSV（本地）
- **翻译**：Google / Ollama / OpenAI 兼容 API；Gummy 可自带翻译
- **样式与日志**：字体与背景高度可配；字幕记录导出 `.srt` / `.json`
- **桌面体验**：透明置顶字幕窗、系统托盘常驻、中英日界面

架构要点：**Electron（Vue 3 UI）主进程** 通过 **CLI + stdout JSON + TCP** 驱动 **Python 字幕引擎**（`engine/`，可选 Go 实现 `go-engine/` 协议兼容替换）。

---

## 快速开始

### 环境

- Node.js 18+
- Python ≥ 3.10（开发与打包引擎）
- Windows 打包需本机可跑通 `engine` venv + PyInstaller

### 安装与开发

```bash
npm install

# Python 引擎（首次）
cd engine
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cd ..

npm run dev                     # 开发启动
```

### 打包 Windows

```bash
npm run build:win
```

产物：

- 安装包：`dist/ai-voice-ears-2.0.2-setup.exe`
- 免安装：`dist/win-unpacked/ai-voice-ears.exe`

### 多平台打包脚本

引擎由 PyInstaller **本机原生编译**，无法交叉编译，因此某个平台的安装包只能在该系统上构建
（CI 中由 `.github/workflows/release.yml` 的对应 runner 承担）。

| 脚本                            | 说明                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `scripts/setup-engine.mjs`      | 创建 `engine/.venv` 并安装依赖（`main.spec` 依赖该 venv 中的 vosk） |
| `scripts/build-engine.mjs`      | PyInstaller 编译 `engine/dist/main(.exe)`，失败即终止               |
| `scripts/build-app.mjs`         | 通用打包入口：引擎编译 → `electron-vite build` → `electron-builder` |
| `scripts/build-win.sh`          | Windows 打包（`./scripts/build-win.sh [x64\|arm64]`）               |
| `scripts/build-mac.sh`          | macOS 打包（`./scripts/build-mac.sh [arm64\|x64]`）                 |
| `scripts/build-linux.sh`        | Linux 打包（`./scripts/build-linux.sh [x64\|arm64]`）               |
| `scripts/build-all.sh`          | 在本机构建当前系统能构建的全部目标并汇总产物                        |
| `scripts/prepare-release.mjs`   | 发布前置检查：版本一致性 + 更新日志提取 + 清理                      |
| `scripts/collect-artifacts.mjs` | 汇总 `dist/` 安装包到 `release-assets/` 并生成 `SHA256SUMS.txt`     |

npm 脚本（Windows 下无需 bash，直接可用）：

```bash
npm run build:engine:setup   # 首次：准备引擎 Python 环境
npm run build:win:x64        # Windows x64 安装包
npm run build:win:arm64      # Windows arm64 安装包
npm run build:mac:arm64      # macOS Apple Silicon（需 macOS arm64 宿主）
npm run build:mac:x64        # macOS Intel（需 macOS x64 宿主）
npm run build:linux:x64      # Linux tar.gz
npm run build:unpack         # 仅生成免安装目录
npm run release:prepare      # 发布前置检查
npm run release:collect      # 汇总安装包
```

`scripts/build-app.mjs` 还支持 `--dir`（免安装）、`--clean`（清理 `out/`、`dist/`）、
`--skip-engine-build`、`--skip-typecheck`、`--publish <always|onTag|never>` 等参数，
详见脚本头部注释。

### 自动发布

在 GitHub 上 Publish 一个 Release、或推送 `v*` tag 后，`.github/workflows/release.yml` 会自动：

1. 校验 tag 与 `package.json` 版本号一致，并从 `docs/CHANGELOG.md` 提取更新日志；
2. 在 `windows-latest` / `macos-latest` / `macos-15-intel` / `ubuntu-latest` 上并行编译
   各平台安装包（NSIS / dmg+zip / tar.gz）；
3. 将安装包回传到该 Release，同时保留为 workflow artifact。

也可在 Actions 页面手动触发（`workflow_dispatch`），可指定 tag 与 `dry_run`（只构建不上传 Release）。

### 常用脚本

| 命令                   | 说明                                    |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | 开发模式                                |
| `npm run build`        | 仅构建 Electron 应用内容到 `out/`       |
| `npm run build:engine` | PyInstaller 编译 `engine/dist/main.exe` |
| `npm run build:win`    | 引擎 + 前端 + Windows 安装包            |
| `npm run typecheck`    | TS / Vue 类型检查                       |

---

## 架构简图

```text
Vue 渲染进程  ←IPC→  Electron 主进程  ←stdout/TCP→  字幕引擎 (Python/Go)
                          │
                     配置 / 托盘 / 双窗口
                     (字幕窗 + 设置窗)
```

原理、目录、`Controls`/`Styles` 参数表、CLI 一览、Go 编译方式等见 **[根目录 README](../README.md)**。

---

## 内置引擎一览

| 引擎    | 类型 | 需准备                                                                             |
| ------- | ---- | ---------------------------------------------------------------------------------- |
| Gummy   | 云端 | 阿里云百炼 API Key（或 `DASHSCOPE_API_KEY`）                                       |
| GLM-ASR | 云端 | 智谱 API Key                                                                       |
| Vosk    | 本地 | [模型包](https://alphacephei.com/vosk/models) 解压路径                             |
| SOSV    | 本地 | [SOSV 发布包](https://github.com/HiMeditator/auto-caption/releases/tag/sosv-model) |

默认模型目录示例（Windows）：`%APPDATA%\AiVoiceEars\Vosk`、`%APPDATA%\AiVoiceEars\SOSV`。

---

## 许可证

见 [LICENSE](./LICENSE)。云服务与第三方模型遵循各自条款。
