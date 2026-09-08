#!/usr/bin/env bash
# macOS 打包脚本。
#
# 用法:
#   ./scripts/build-mac.sh            # 当前架构（Apple Silicon 为 arm64）
#   ./scripts/build-mac.sh arm64
#   ./scripts/build-mac.sh x64
#
# 注意：需在 macOS 宿主上执行，且架构需与宿主机一致（引擎为原生编译产物）。
set -euo pipefail

cd "$(dirname "$0")/.."

ARCH="${1:-$( [ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64 )}"
shift || true

echo "==> 准备 Python 引擎环境"
if ! command -v portaudio >/dev/null 2>&1 && ! brew list portaudio >/dev/null 2>&1; then
  echo "==> 安装 portaudio（engine/requirements.txt 在 macOS 上依赖 pyaudio）"
  brew install portaudio || true
fi
node scripts/setup-engine.mjs --if-missing

echo "==> 打包 macOS (${ARCH})"
node scripts/build-app.mjs --platform mac --arch "${ARCH}" "$@"
