#!/usr/bin/env bash
# Windows 打包脚本（Git Bash / CI bash 均可执行）。
#
# 用法:
#   ./scripts/build-win.sh            # x64 安装包
#   ./scripts/build-win.sh arm64      # arm64 安装包
#   ./scripts/build-win.sh x64 --dir  # 只产出免安装目录
#
# 注意：字幕引擎由 PyInstaller 本机原生编译，Windows 包必须在 Windows 宿主上构建。
set -euo pipefail

cd "$(dirname "$0")/.."

ARCH="${1:-x64}"
shift || true

echo "==> 准备 Python 引擎环境"
node scripts/setup-engine.mjs --if-missing

echo "==> 打包 Windows (${ARCH})"
node scripts/build-app.mjs --platform win --arch "${ARCH}" "$@"
