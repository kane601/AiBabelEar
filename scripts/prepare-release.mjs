#!/usr/bin/env node
// 发布前置检查：版本一致性校验 + 更新日志提取 + 构建目录清理。
//
// 用法:
//   node scripts/prepare-release.mjs
//   node scripts/prepare-release.mjs --tag v2.0.1 --clean
//   node scripts/prepare-release.mjs --tag v2.0.1 --notes-out release-notes.md
//   node scripts/prepare-release.mjs --tag v2.0.1 --allow-mismatch   # 版本不一致只告警
//
// 参数:
//   --tag <vX.Y.Z>        待发布的 tag；缺省时用 package.json 的 version
//   --allow-mismatch      版本不一致时只告警不失败
//   --clean               清理 out/ dist/ release-assets/
//   --notes-out <file>    把提取到的更新日志写入文件（CI 里作为 release 正文）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)

function readValue(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = argv[i + 1]
  if (!v || v.startsWith('--')) return fallback
  return v
}
const hasFlag = (name) => argv.includes(`--${name}`)

const allowMismatch = hasFlag('allow-mismatch')
const clean = hasFlag('clean')
const notesOut = readValue('notes-out', null)
const tagArg = readValue('tag', null)

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const pkgVersion = pkg.version
const version = tagArg ? tagArg.replace(/^v/, '') : pkgVersion
const tag = tagArg || `v${pkgVersion}`

// ── 1) 版本一致性 ───────────────────────────────────────────────────────
console.log(`[release] package.json 版本: ${pkgVersion}`)
console.log(`[release] 发布 tag: ${tag}（版本号 ${version}）`)

if (version !== pkgVersion) {
  const msg =
    `版本不一致：tag ${tag} 对应 ${version}，但 package.json 为 ${pkgVersion}。` +
    '安装包名取自 package.json，请先同步版本号再发布。'
  if (allowMismatch) {
    console.warn(`[release] 警告：${msg}`)
  } else {
    console.error(`[release] 错误：${msg}`)
    process.exit(1)
  }
}

// ── 2) 提取更新日志 ─────────────────────────────────────────────────────
// docs/CHANGELOG.md 的段落形如 "## v1.1.1"，向下取到下一个 "## " 之前。
function extractNotes(ver) {
  const changelog = path.join(root, 'docs', 'CHANGELOG.md')
  if (!fs.existsSync(changelog)) return ''
  const lines = fs.readFileSync(changelog, 'utf8').split(/\r?\n/)
  const escaped = ver.replace(/\./g, '\\.')
  const heading = new RegExp(`^##\\s+v?${escaped}\\s*$`)
  const notes = []
  let matched = false
  for (const line of lines) {
    if (!matched) {
      if (heading.test(line.trim())) matched = true
      continue
    }
    if (/^##\s+/.test(line)) break
    notes.push(line)
  }
  return notes.join('\n').trim()
}

const notes = extractNotes(version) || 'See the assets below to download and install this version.'
if (notesOut) {
  fs.mkdirSync(path.dirname(path.resolve(root, notesOut)), { recursive: true })
  fs.writeFileSync(path.resolve(root, notesOut), `${notes}\n`, 'utf8')
  console.log(`[release] 更新日志已写入: ${notesOut}`)
} else {
  console.log('\n[release] 更新日志:\n')
  console.log(notes)
}

// ── 3) 清理构建目录 ─────────────────────────────────────────────────────
if (clean) {
  for (const d of ['out', 'dist', 'release-assets']) {
    const p = path.join(root, d)
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true })
      console.log(`[release] 已清理: ${d}/`)
    }
  }
}

console.log('[release] 前置检查通过')
