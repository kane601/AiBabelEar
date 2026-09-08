#!/usr/bin/env node
// AiBabelEar 多平台打包入口。
//
// 一条命令完成「编译字幕引擎 → 构建 Electron 应用 → 生成安装包」三步，
// 并对宿主平台、目标架构做前置校验，避免产出残缺的安装包。
//
// 用法:
//   node scripts/build-app.mjs --platform win   --arch x64
//   node scripts/build-app.mjs --platform mac   --arch arm64
//   node scripts/build-app.mjs --platform mac   --arch x64,arm64
//   node scripts/build-app.mjs --platform linux --arch x64 --dir
//
// 参数:
//   --platform <win|mac|linux>   目标平台，默认取当前宿主平台
//   --arch <x64|arm64|ia32|armv7l|universal>  目标架构，可逗号分隔，默认 x64
//   --dir                        只生成免安装目录（electron-builder --dir）
//   --publish <always|onTag|never>  透传给 electron-builder
//   --clean                      构建前清理 out/ 与 dist/
//   --skip-engine-build          跳过 PyInstaller 编译（仍会校验产物存在）
//   --skip-typecheck             跳过 TS/Vue 类型检查
//   --skip-app-build             跳过 electron-vite build（复用已有 out/）
//
// 说明：字幕引擎是本机原生编译产物，无法交叉编译，因此 Windows 包只能在 Windows 上打，
// macOS / Linux 同理（CI 中由对应 runner 承担，见 .github/workflows/release.yml）。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const outDir = path.join(root, 'out')
const engineDist = path.join(root, 'engine', 'dist')
const isWin = process.platform === 'win32'

// ── 参数解析 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)

function readValue(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = argv[i + 1]
  if (!v || v.startsWith('--')) return fallback
  return v
}
const hasFlag = (name) => argv.includes(`--${name}`)

const HOST_PLATFORM = isWin ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
const HOST_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const platform = (readValue('platform', HOST_PLATFORM) || HOST_PLATFORM).toLowerCase()
const archArg = readValue('arch', HOST_ARCH)
const publish = readValue('publish', null)
const dirOnly = hasFlag('dir')
const clean = hasFlag('clean')
const skipEngineBuild = hasFlag('skip-engine-build')
const skipTypecheck = hasFlag('skip-typecheck')
const skipAppBuild = hasFlag('skip-app-build')

// ── 校验 ────────────────────────────────────────────────────────────────
const SUPPORTED_ARCH = {
  win: ['x64', 'arm64', 'ia32'],
  mac: ['x64', 'arm64', 'universal'],
  linux: ['x64', 'arm64', 'armv7l']
}
// electron-builder 只能在对应宿主上产出对应平台的包
const REQUIRED_HOST = { win: 'win32', mac: 'darwin', linux: 'linux' }

if (!SUPPORTED_ARCH[platform]) {
  console.error(`[build:app] 不支持的平台: ${platform}（可选 win / mac / linux）`)
  process.exit(1)
}
if (REQUIRED_HOST[platform] !== process.platform) {
  console.error(
    `[build:app] 目标平台 ${platform} 需要宿主 ${REQUIRED_HOST[platform]}，当前为 ${process.platform}。` +
      '字幕引擎为原生编译产物，无法交叉编译，请在对应系统（或 CI runner）上执行。'
  )
  process.exit(1)
}

const archs = archArg
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean)
const invalid = archs.filter((a) => !SUPPORTED_ARCH[platform].includes(a))
if (invalid.length) {
  console.error(
    `[build:app] ${platform} 不支持架构: ${invalid.join(', ')}（可选 ${SUPPORTED_ARCH[platform].join(' / ')}）`
  )
  process.exit(1)
}

const engineName = platform === 'win' ? 'main.exe' : 'main'

/**
 * 运行子进程，失败即以相同退出码终止。
 * Windows 下 npm / npx 是 .cmd，需要走 shell；走 shell 时含空格的参数必须加引号，
 * 否则 cmd.exe 会把 "D:\Program Files\..." 之类的路径截断。
 */
function run(cmd, cmdArgs, opts = {}) {
  const useShell = opts.shell ?? isWin
  const args = useShell && isWin ? cmdArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : cmdArgs
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: root,
    ...opts,
    shell: useShell
  })
  if (res.error) {
    console.error(`[build:app] 无法执行 ${cmd}: ${res.error.message}`)
    process.exit(1)
  }
  if (res.status !== 0) {
    console.error(`[build:app] ${cmd} ${cmdArgs.join(' ')} 失败，退出码 ${res.status}`)
    process.exit(res.status ?? 1)
  }
}

// ── 0) 清理 ─────────────────────────────────────────────────────────────
if (clean) {
  for (const d of [outDir, distDir]) {
    if (fs.existsSync(d)) {
      fs.rmSync(d, { recursive: true, force: true })
      console.log(`[build:app] 已清理: ${d}`)
    }
  }
}

// ── 1) 编译字幕引擎（硬门禁）────────────────────────────────────────────
if (skipEngineBuild) {
  console.log('[build:app] 已指定 --skip-engine-build，跳过 PyInstaller 编译')
} else {
  // process.execPath 是真实的 .exe，无需 shell（也避免 cmd.exe 截断带空格的 Node 安装路径）
  run(process.execPath, [path.join(root, 'scripts', 'build-engine.mjs')], { shell: false })
}
const engineArtifact = path.join(engineDist, engineName)
if (!fs.existsSync(engineArtifact)) {
  console.error(
    `[build:app] 缺少字幕引擎产物: ${engineArtifact}\n` +
      '请先执行 node scripts/setup-engine.mjs && node scripts/build-engine.mjs'
  )
  process.exit(1)
}

// ── 2) 构建 Electron 应用内容 ───────────────────────────────────────────
if (skipAppBuild) {
  console.log('[build:app] 已指定 --skip-app-build，跳过 electron-vite build')
} else {
  run('npm', ['run', skipTypecheck ? 'build:no-typecheck' : 'build'])
}

// ── 3) electron-builder 打包 ────────────────────────────────────────────
const builderArgs = ['--', 'electron-builder', `--${platform}`]
for (const a of archs) builderArgs.push(`--${a}`)
if (dirOnly) builderArgs.push('--dir')
if (publish) builderArgs.push('--publish', publish)

console.log(`[build:app] npx ${builderArgs.slice(2).join(' ')}`)
run('npx', builderArgs)

// ── 4) 产物汇总 ─────────────────────────────────────────────────────────
const ARTIFACT_EXT = ['.exe', '.dmg', '.zip', '.tar.gz', '.AppImage', '.deb', '.rpm']
function collectArtifacts() {
  if (!fs.existsSync(distDir)) return []
  return fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((e) => e.isFile() && ARTIFACT_EXT.some((ext) => e.name.endsWith(ext)))
    .map((e) => path.join(distDir, e.name))
}

const artifacts = collectArtifacts()
console.log(`\n[build:app] 打包完成（${platform} / ${archs.join(', ')}）`)
if (artifacts.length === 0) {
  console.warn('[build:app] 未在 dist/ 下找到安装包产物，请检查 electron-builder 配置。')
} else {
  for (const f of artifacts) {
    const size = (fs.statSync(f).size / 1024 / 1024).toFixed(2)
    console.log(`  - ${path.relative(root, f)} (${size} MB)`)
  }
}
