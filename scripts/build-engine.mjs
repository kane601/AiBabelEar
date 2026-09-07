#!/usr/bin/env node
// 编译 Python 字幕引擎（PyInstaller onefile），供各平台打包命令前置调用。
// 形成硬门禁：编译失败或产物缺失时以非零状态退出，阻止 electron-builder 继续打包。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const engineDir = path.join(root, 'engine')
const distDir = path.join(engineDir, 'dist')

// 期望产物：win -> main.exe；mac/linux -> main（与 electron-builder.yml extraResources 对应）
const expectedName = process.platform === 'win32' ? 'main.exe' : 'main'
const expectedPath = path.join(distDir, expectedName)

// 1) 选择 python 解释器（优先 engine/.venv，main.spec 硬编码依赖该 venv 的 vosk 等包）
function resolvePython() {
  const venvCandidates = [
    path.join(engineDir, '.venv', 'Scripts', 'python.exe'),
    path.join(engineDir, '.venv', 'bin', 'python3'),
    path.join(engineDir, '.venv', 'bin', 'python')
  ]
  for (const c of venvCandidates) {
    if (fs.existsSync(c)) return { python: c, fromVenv: true }
  }
  const fallback = process.platform === 'win32' ? 'python' : 'python3'
  return { python: fallback, fromVenv: false }
}

const { python, fromVenv } = resolvePython()
if (!fromVenv) {
  console.warn('[build:engine] 未找到 engine/.venv，回退到系统 python（请确认依赖已安装）。')
}

// 2) 清理旧产物，确保“必须重新编译成功”，而非沿用上次遗留文件
if (fs.existsSync(expectedPath)) {
  fs.rmSync(expectedPath, { force: true })
  console.log(`[build:engine] 已清理旧产物: ${expectedPath}`)
}

// 3) 在 engine 目录内运行 PyInstaller（main.spec 依赖当前工作目录下的 .venv 相对路径）
console.log(`[build:engine] 开始编译字幕引擎 (${python} -m PyInstaller main.spec) ...`)
const result = spawnSync(python, ['-m', 'PyInstaller', 'main.spec'], {
  cwd: engineDir,
  stdio: 'inherit'
})

if (result.status !== 0) {
  console.error(`[build:engine] PyInstaller 编译失败，退出码 ${result.status}`)
  process.exit(result.status ?? 1)
}

// 4) 校验产物确实存在（编译成功但未生成预期文件也应视为失败）
if (!fs.existsSync(expectedPath)) {
  console.error(`[build:engine] 编译完成但未找到产物: ${expectedPath}`)
  process.exit(1)
}

console.log(`[build:engine] 编译成功: ${expectedPath}`)
