#!/usr/bin/env node
// 创建/同步 Python 字幕引擎的虚拟环境（engine/.venv）并安装依赖。
//
// 为什么必须有这一步：engine/main.spec 硬编码从 ./.venv 中取 vosk 包及其动态库，
// 使用系统 Python 环境编译出来的产物会缺少 vosk 运行时。因此本地与 CI 都必须
// 先执行本脚本，再执行 scripts/build-engine.mjs。
//
// 用法:
//   node scripts/setup-engine.mjs            # 已存在 venv 时只补齐依赖
//   node scripts/setup-engine.mjs --if-missing   # 已存在 venv 时跳过安装（CI 缓存/提速）
//   node scripts/setup-engine.mjs --recreate     # 删除旧 venv 后重建
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const engineDir = path.join(root, 'engine')
const venvDir = path.join(engineDir, '.venv')

const isWin = process.platform === 'win32'
const binDir = isWin ? path.join(venvDir, 'Scripts') : path.join(venvDir, 'bin')
const venvPython = isWin ? path.join(binDir, 'python.exe') : path.join(binDir, 'python')

const args = process.argv.slice(2)
const ifMissing = args.includes('--if-missing')
const recreate = args.includes('--recreate')

/** 运行子进程，失败即以相同退出码终止。 */
function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (res.error) {
    console.error(`[setup:engine] 无法执行 ${cmd}: ${res.error.message}`)
    process.exit(1)
  }
  if (res.status !== 0) {
    console.error(`[setup:engine] ${cmd} ${cmdArgs.join(' ')} 失败，退出码 ${res.status}`)
    process.exit(res.status ?? 1)
  }
}

/** 探测可用于创建 venv 的基础解释器（3.12/3.11/3.10 优先，vosk/sherpa_onnx 对 3.13 支持不全）。 */
function resolveBasePython() {
  const candidates = isWin
    ? ['py -3.12', 'python']
    : ['python3.12', 'python3.11', 'python3.10', 'python3']
  for (const c of candidates) {
    const [cmd, ...rest] = c.split(' ')
    const res = spawnSync(cmd, [...rest, '--version'], { stdio: 'ignore' })
    if (!res.error && res.status === 0) return c
  }
  console.error('[setup:engine] 未找到可用的 Python 3.10+，请先安装 Python。')
  process.exit(1)
}

if (recreate && fs.existsSync(venvDir)) {
  console.log(`[setup:engine] 删除旧虚拟环境: ${venvDir}`)
  fs.rmSync(venvDir, { recursive: true, force: true })
}

if (fs.existsSync(venvPython)) {
  if (ifMissing) {
    console.log(`[setup:engine] 虚拟环境已存在，跳过安装: ${venvDir}`)
    process.exit(0)
  }
  console.log(`[setup:engine] 复用已有虚拟环境: ${venvDir}`)
} else {
  const base = resolveBasePython()
  const [cmd, ...rest] = base.split(' ')
  console.log(`[setup:engine] 创建虚拟环境 (${base} -m venv ${venvDir}) ...`)
  run(cmd, [...rest, '-m', 'venv', venvDir])
}

console.log('[setup:engine] 升级 pip ...')
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])

console.log('[setup:engine] 安装引擎依赖 (engine/requirements.txt) ...')
run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: engineDir })

console.log(`[setup:engine] 完成。Python: ${venvPython}`)
