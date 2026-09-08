#!/usr/bin/env node
// 汇总 dist/ 下的安装包到 release-assets/，并生成 SHA256 校验文件，便于手工上传发布。
//
// 用法:
//   node scripts/collect-artifacts.mjs
//   node scripts/collect-artifacts.mjs --output release-assets --no-checksum
import crypto from 'node:crypto'
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

const distDir = path.join(root, 'dist')
const outDir = path.resolve(root, readValue('output', 'release-assets'))
const withChecksum = !argv.includes('--no-checksum')

const ARTIFACT_EXT = ['.exe', '.dmg', '.zip', '.tar.gz', '.AppImage', '.deb', '.rpm']

if (!fs.existsSync(distDir)) {
  console.error('[collect] 未找到 dist/，请先执行打包脚本。')
  process.exit(1)
}

const files = fs
  .readdirSync(distDir, { withFileTypes: true })
  .filter((e) => e.isFile() && ARTIFACT_EXT.some((ext) => e.name.endsWith(ext)))
  .map((e) => path.join(distDir, e.name))

if (files.length === 0) {
  console.error('[collect] dist/ 下没有可发布的安装包产物。')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
const sums = []
for (const f of files) {
  const dest = path.join(outDir, path.basename(f))
  fs.copyFileSync(f, dest)
  const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(2)
  console.log(`[collect] ${path.relative(root, dest)} (${size} MB)`)
  if (withChecksum) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')
    sums.push(`${hash}  ${path.basename(dest)}`)
  }
}

if (withChecksum) {
  const sumFile = path.join(outDir, 'SHA256SUMS.txt')
  fs.writeFileSync(sumFile, `${sums.join('\n')}\n`, 'utf8')
  console.log(`[collect] 校验文件: ${path.relative(root, sumFile)}`)
}

console.log(`[collect] 完成，共 ${files.length} 个产物 -> ${path.relative(root, outDir)}`)
