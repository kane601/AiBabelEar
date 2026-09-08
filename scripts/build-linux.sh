#!/usr/bin/env bash
# Linux 打包脚本（产出 tar.gz）。
#
# 用法:
#   ./scripts/build-linux.sh          # x64
#   ./scripts/build-linux.sh arm64    # arm64（需 arm64 宿主）
set -euo pipefail

cd "$(dirname "$0")/.."

ARCH="${1:-$( [ "$(uname -m)" = "aarch64" ] && echo arm64 || echo x64 )}"
shift || true

echo "==> 准备 Python 引擎环境"
node scripts/setup-engine.mjs --if-missing

echo "==> 打包 Linux (${ARCH})"
node scripts/build-app.mjs --platform linux --arch "${ARCH}" "$@"
