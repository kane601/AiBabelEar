import * as fs from 'fs'
import * as path from 'path'

// Vosk 各语言 -> 模型文件夹名关键字（用于在 %APPDATA%/VoiceBridge/Vosk 下匹配具体模型子目录）。
// 匹配规则：关键字前后为分隔符（_ - . 空格）或字符串边界，避免误匹配。
export const VOSK_LANG_KEYWORDS: Record<string, RegExp> = {
  'en': /(^|[_\-.\s])en([_\-.\s]|$)/i,
  'zh-cn': /(^|[_\-.\s])(cn|zh)([_\-.\s]|$)/i,
  'ja': /(^|[_\-.\s])ja([_\-.\s]|$)/i,
  'ko': /(^|[_\-.\s])ko([_\-.\s]|$)/i,
  'de': /(^|[_\-.\s])de([_\-.\s]|$)/i,
  'fr': /(^|[_\-.\s])fr([_\-.\s]|$)/i,
  'ru': /(^|[_\-.\s])ru([_\-.\s]|$)/i,
  'es': /(^|[_\-.\s])es([_\-.\s]|$)/i,
  'it': /(^|[_\-.\s])it([_\-.\s]|$)/i,
}

// 判断一个目录是否为有效的 Vosk 模型目录。
// Vosk 模型一定包含标志性目录/文件（如 am/、conf/、graph/、ivector/，或 final.mdl、HCLG.fst、mfcc.conf）。
// 这里在目录内递归（最多 2 层）查找这些标志，以避免因布局差异导致漏判。
const VOSK_SIGNATURE_DIRS = new Set(['am', 'conf', 'graph', 'ivector'])
const VOSK_SIGNATURE_FILES = new Set(['final.mdl', 'HCLG.fst', 'mfcc.conf', 'model'])

export function isVoskModelDir(dir: string): boolean {
  if (!dir) return false
  try {
    if (!fs.statSync(dir).isDirectory()) return false
  } catch {
    return false
  }

  function walk(d: string, depth: number): boolean {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return false
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (VOSK_SIGNATURE_DIRS.has(e.name)) return true
        if (depth < 2 && walk(path.join(d, e.name), depth + 1)) return true
      } else if (VOSK_SIGNATURE_FILES.has(e.name)) {
        return true
      }
    }
    return false
  }

  return walk(dir, 0)
}

/**
 * 仅检查“直接子内容”是否含 Vosk 模型标志，不向子目录递归。
 * 用于判断一个路径“本身”是否为模型目录（例如用户手动指定了某个具体模型文件夹）。
 * 必须非递归：Vosk 根目录会包含若干模型子文件夹，一旦递归就会被误判为“自身即模型目录”，
 * 从而导致所有语言都被错误识别为已下载。
 */
export function isVoskModelDirDirect(dir: string): boolean {
  if (!dir) return false
  try {
    if (!fs.statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (VOSK_SIGNATURE_DIRS.has(e.name)) return true
    } else if (VOSK_SIGNATURE_FILES.has(e.name)) {
      return true
    }
  }
  return false
}

// 根据源语言解析对应的 Vosk 模型路径：
// - 若 baseDir 本身就是有效模型目录（用户手动指定了某个模型），直接返回它；
// - 否则在 baseDir 下查找名称匹配该语言且为有效模型目录的子文件夹。
export function resolveVoskLangModel(baseDir: string, lang: string): string | null {
  if (!baseDir) return null
  baseDir = baseDir.trim()
  if (isVoskModelDirDirect(baseDir)) return baseDir

  const kw = VOSK_LANG_KEYWORDS[lang]
  if (!kw) return null

  let subDirs: string[]
  try {
    subDirs = fs
      .readdirSync(baseDir)
      .filter((f) => {
        try {
          return fs.statSync(path.join(baseDir, f)).isDirectory()
        } catch {
          return false
        }
      })
  } catch {
    return null
  }

  for (const f of subDirs) {
    if (kw.test(f) && isVoskModelDir(path.join(baseDir, f))) {
      return path.join(baseDir, f)
    }
  }
  return null
}

// 在 baseDir 下取“第一个”可用的 Vosk 模型文件夹（用于 auto / 未解析到具体语言时回落）。
// - 若 baseDir 本身就是模型目录，直接返回它；
// - 否则返回其下第一个有效的模型子目录；都不满足则返回 null。
export function getFirstVoskModel(baseDir: string): string | null {
  if (!baseDir) return null
  baseDir = baseDir.trim()
  if (isVoskModelDirDirect(baseDir)) return baseDir

  let subDirs: string[]
  try {
    subDirs = fs
      .readdirSync(baseDir)
      .filter((f) => {
        try {
          return fs.statSync(path.join(baseDir, f)).isDirectory()
        } catch {
          return false
        }
      })
  } catch {
    return null
  }

  for (const f of subDirs) {
    const full = path.join(baseDir, f)
    if (isVoskModelDir(full)) return full
  }
  return null
}

// 返回所有 Vosk 语言对应的模型路径（已下载则返回绝对路径，否则为 null）。
export function getVoskModelStatus(baseDir: string): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  for (const lang of Object.keys(VOSK_LANG_KEYWORDS)) {
    result[lang] = resolveVoskLangModel(baseDir, lang)
  }
  return result
}
