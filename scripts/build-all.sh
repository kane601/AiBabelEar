#!/usr/bin/env bash
# 在本机可支持的范围内构建全部目标产物。
#
# 打包受宿主限制（引擎无法交叉编译），因此本脚本只构建当前系统能构建的目标：
#   - Windows: x64（传 --all-arch 时追加 arm64）
#   - macOS  : 当前架构（arm64 或 x64）
#   - Linux  : 当前架构（x64 或 arm64）
# 其余平台由 GitHub Actions 的对应 runner 承担（见 .github/workflows/release.yml）。
set -euo pipefail

cd "$(dirname "$0")/.."

ALL_ARCH=false
if [ "${1:-}" = "--all-arch" ]; then
  ALL_ARCH=true
  shift || true
fi

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    if [ "$ALL_ARCH" = true ]; then
      ./scripts/build-win.sh x64 "$@"
      ./scripts/build-win.sh arm64 "$@"
    else
      ./scripts/build-win.sh x64 "$@"
    fi
    ;;
  Darwin*)
    if [ "$(uname -m)" = "arm64" ]; then
      ./scripts/build-mac.sh arm64 "$@"
    else
      ./scripts/build-mac.sh x64 "$@"
    fi
    ;;
  Linux*)
    if [ "$(uname -m)" = "aarch64" ]; then
      ./scripts/build-linux.sh arm64 "$@"
    else
      ./scripts/build-linux.sh x64 "$@"
    fi
    ;;
  *)
    echo "不支持的宿主系统: $(uname -s)"
    exit 1
    ;;
esac

echo "==> 汇总产物"
node scripts/collect-artifacts.mjs || true
