import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { execFile, spawn } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { Log } from './Log'
import { getModelById, getModelBaseDir, ModelInfo } from './modelRegistry'
import { resolveVoskLangModel } from './voskModels'

export const MODEL_PROGRESS_EVENT = 'control.model.progress'
export const MODEL_DONE_EVENT = 'control.model.done'

export type ModelStatus = 'idle' | 'downloading' | 'extracting' | 'done' | 'error'

export interface ModelProgress {
  id: string
  engine: ModelInfo['engine']
  status: ModelStatus
  received?: number
  total?: number
  percent?: number
  error?: string
  path?: string
}


// 模型下载进度/完成事件广播给所有窗口（字幕窗与设置窗都可能展示下载状态）。
function broadcastModelEvent(event: string, payload: any): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send(event, payload)
      } catch {
        /* 窗口已失效，忽略 */
      }
    }
  }
}

/** 下载文件，支持 HTTP 重定向，并通过 onProgress 回报进度。 */
function downloadFile(url: string, dest: string, onProgress: (received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (u: string, redirects: number): void => {
      if (redirects > 10) {
        reject(new Error('重定向次数过多'))
        return
      }
      const lib = u.startsWith('https:') ? https : http
      const req = lib.get(u, (res) => {
        const status = res.statusCode
        if (status && status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          doRequest(new URL(res.headers.location, u).toString(), redirects + 1)
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`下载失败，HTTP 状态 ${status}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(dest)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total) onProgress(received, total)
        })
        res.on('error', reject)
        out.on('error', reject)
        res.pipe(out)
        out.on('finish', () => out.close(() => resolve()))
      })
      req.on('error', reject)
    }
    doRequest(url, 0)
  })
}

/**
 * 定位 aria2c 可执行文件。
 * dev 下位于仓库根目录 aria2/，生产环境（打包后）位于 resources/aria2/。
 * 按 platform + arch 选择对应子目录；找不到返回 null（此时回退内置下载）。
 */
function getAria2BinaryPath(): string | null {
  let sub: string
  if (process.platform === 'win32') {
    sub = `win/${process.arch === 'x64' ? 'x64' : 'x86'}`
  } else if (process.platform === 'darwin') {
    sub = `mac/${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`
  } else {
    sub = 'linux'
  }
  const rel = path.join('aria2', sub, process.platform === 'win32' ? 'aria2c.exe' : 'aria2c')
  const base = is.dev ? app.getAppPath() : process.resourcesPath
  const bin = path.join(base, rel)
  return fs.existsSync(bin) ? bin : null
}

/** 发起 HEAD 请求获取文件总大小（Content-Length），失败返回 0（进度转为不确定态）。 */
function headContentLength(url: string): Promise<number> {
  return new Promise((resolve) => {
    const doReq = (u: string, redirects: number): void => {
      if (redirects > 10) return resolve(0)
      const lib = u.startsWith('https:') ? https : http
      const req = lib.request(u, { method: 'HEAD' }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          doReq(new URL(res.headers.location, u).toString(), redirects + 1)
          return
        }
        const len = parseInt(res.headers['content-length'] || '0', 10)
        resolve(len || 0)
      })
      req.on('error', () => resolve(0))
      req.end()
    }
    doReq(url, 0)
  })
}

/** 将 aria2 输出中的人类可读体积（如 1.2MiB / 340MB）转换为字节数。 */
function parseHumanSize(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMGTP]?)i?B$/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  const mult = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit] ?? 1
  return Math.round(n * mult)
}

/** 从 aria2 输出文本中提取真实下载进度（received/total 字节 + 百分比）。 */
function parseAria2Progress(text: string): { received: number; total: number; percent: number } | null {
  const seg = text.replace(/\u001b\[[0-9;]*m/g, '') // 去除 ANSI 颜色码
  // 实时进度行：12% (12345/123456) 或 12% (1.2MiB/12MiB)
  let m = seg.match(/(\d+)%\s*\(([\d.]+[KMGTP]?i?B|\d+)\s*\/\s*([\d.]+[KMGTP]?i?B|\d+)\)/)
  if (m) {
    const pct = parseInt(m[1], 10)
    const recv = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : parseHumanSize(m[2])
    const tot = /^\d+$/.test(m[3]) ? parseInt(m[3], 10) : parseHumanSize(m[3])
    return { received: recv, total: tot, percent: pct }
  }
  // 周期汇总行：[#GID 1.2MiB/12MiB ...] 或 [#GID 12345/123456 ...]
  m = seg.match(/\[#\w+\s+([\d.]+[KMGTP]?i?B|\d+)\s*\/\s*([\d.]+[KMGTP]?i?B|\d+)\]/)
  if (m) {
    const recv = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : parseHumanSize(m[1])
    const tot = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : parseHumanSize(m[2])
    return { received: recv, total: tot, percent: tot ? Math.round((recv / tot) * 100) : 0 }
  }
  // 仅百分比（无字节信息）
  m = seg.match(/(\d+)%/)
  if (m) {
    return { received: 0, total: 0, percent: parseInt(m[1], 10) }
  }
  return null
}

/**
 * 使用 aria2c 下载：分片多连接（更快）、自动重试/续传（更稳）。
 * 进度直接从 aria2 自身输出的真实下载字节数解析（避免轮询文件大小——
 * aria2 会预分配磁盘空间导致 statSync.size 瞬间等于总大小、进度误报 100%）。
 */
function downloadWithAria2(
  url: string,
  dest: string,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = getAria2BinaryPath()
    if (!bin) {
      reject(new Error('aria2 not found'))
      return
    }
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(bin, 0o755)
      } catch {
        /* 权限已是 755 时忽略 */
      }
    }
    const dir = path.dirname(dest)
    const name = path.basename(dest)
    const args = [
      '-x', '8', '-s', '8', '-k', '1M',
      '--summary-interval=1',
      '--console-log-level=notice',
      '--allow-overwrite=true',
      '--auto-file-renaming=false',
      '-d', dir, '-o', name,
      url
    ]
    const child = spawn(bin, args)
    child.on('error', reject)
    let total = 0
    headContentLength(url).then((t) => {
      total = t
    })
    const handleData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      // aria2 用 \r 原地刷新进度，按 \r / \n 切分后逐段解析
      for (const part of text.split(/[\r\n]+/)) {
        const p = parseAria2Progress(part)
        if (!p) continue
        if (p.total > 0) total = p.total
        const effTotal = total || p.total
        if (p.percent >= 0 && p.percent <= 100) {
          const effRecv = effTotal ? Math.round((p.percent / 100) * effTotal) : p.received
          onProgress(effRecv, effTotal)
        } else if (p.received > 0 && p.total > 0) {
          onProgress(p.received, p.total)
        }
      }
    }
    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)
    child.on('close', (code) => {
      if (code === 0) {
        if (total > 0) onProgress(total, total)
        resolve()
      } else {
        reject(new Error(`aria2 下载失败，退出码 ${code}`))
      }
    })
  })
}

/** 优先用 aria2 下载，失败则回退到 Node 内置下载。 */
async function downloadModel(
  url: string,
  dest: string,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  if (getAria2BinaryPath()) {
    try {
      await downloadWithAria2(url, dest, onProgress)
      return
    } catch (e) {
      Log.warn(`[Model] aria2 下载失败，回退内置下载: ${e}`)
    }
  }
  await downloadFile(url, dest, onProgress)
}

/** 解压 zip：Windows 用 Expand-Archive，macOS/Linux 优先 unzip，缺失则回退 python3。 */
function extractZip(zipPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const ps =
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' ` +
        `-DestinationPath '${outDir.replace(/'/g, "''")}' -Force`
      execFile('powershell', ['-NoProfile', '-Command', ps], (err) =>
        err ? reject(err) : resolve()
      )
      return
    }
    execFile('unzip', ['-o', zipPath, '-d', outDir], (err) => {
      if (!err) return resolve()
      // Linux 上 unzip 可能未安装，回退到 python3 的 zipfile
      execFile(
        'python3',
        ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zipPath, outDir],
        (err2) => (err2 ? reject(err2) : resolve())
      )
    })
  })
}

/** 若解压目录只包含一个子文件夹，返回该子文件夹（多数模型 zip 的根目录包裹一层）。 */
function resolveExtractRoot(dir: string): string {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return dir
  }
  const dirs = entries.filter((e) => e.isDirectory())
  if (dirs.length === 1 && entries.length === 1) {
    return path.join(dir, dirs[0].name)
  }
  return dir
}

/** 将 src 的内容递归复制到 dest（dest 已存在则覆盖其中的同名项）。 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) await copyDirRecursive(s, d)
    else await fsp.copyFile(s, d)
  }
}

/** 把解压内容安装到模型根目录下，返回最终模型文件夹路径。 */
async function installModel(model: ModelInfo, extractDir: string, baseDir: string): Promise<string> {
  const root = resolveExtractRoot(extractDir)
  // VOSK：用官方原名作子文件夹（含语言关键字）；SOSV：用 model.id（int8 后缀保证引擎识别）。
  const targetName = model.engine === 'vosk' ? model.folder || path.basename(root) : model.id
  const target = path.join(baseDir, targetName)
  await fsp.rm(target, { recursive: true, force: true })
  await copyDirRecursive(root, target)
  return target
}

/** 判断某模型是否已安装，返回模型文件夹绝对路径或 null。 */
export function getModelInstalledPath(model: ModelInfo, baseDir: string): string | null {
  if (model.engine === 'vosk') {
    if (!model.lang) return null
    return resolveVoskLangModel(baseDir, model.lang)
  }
  // SOSV：目标文件夹需同时存在 sensevoice/model(.int8).onnx 与 silero_vad.onnx
  const onnx = model.id.endsWith('int8') ? 'model.int8.onnx' : 'model.onnx'
  const sense = path.join(baseDir, model.id, 'sensevoice', onnx)
  const vad = path.join(baseDir, model.id, 'silero_vad.onnx')
  if (fs.existsSync(sense) && fs.existsSync(vad)) return path.join(baseDir, model.id)
  return null
}

/** 启动模型下载并实时回报进度。支持并行下载（每次调用独立进程）。 */
export async function startModelDownload(model: ModelInfo): Promise<void> {
  const baseDir = getModelBaseDir(model.engine)
  fs.mkdirSync(baseDir, { recursive: true })
  const tmpZip = path.join(app.getPath('temp'), `vb-model-${model.id}-${Date.now()}.zip`)
  const tmpExtract = path.join(app.getPath('temp'), `vb-model-${model.id}-${Date.now()}`)
  Log.info(`[Model] 开始下载模型 ${model.id}: ${model.url}`)
  try {
    await downloadModel(model.url, tmpZip, (received, total) => {
      broadcastModelEvent(MODEL_PROGRESS_EVENT, {
        id: model.id,
        engine: model.engine,
        status: 'downloading',
        received,
        total,
        percent: total ? received / total : 0
      } as ModelProgress)
    })
    broadcastModelEvent(MODEL_PROGRESS_EVENT, {
      id: model.id,
      engine: model.engine,
      status: 'extracting'
    } as ModelProgress)
    await extractZip(tmpZip, tmpExtract)
    const installed = await installModel(model, tmpExtract, baseDir)
    Log.info(`[Model] 模型安装完成: ${installed}`)
    broadcastModelEvent(MODEL_DONE_EVENT, {
      id: model.id,
      engine: model.engine,
      status: 'done',
      success: true,
      path: installed
    } as ModelProgress)
  } catch (e) {
    Log.error(`[Model] 模型下载失败 ${model.id}: ${e}`)
    broadcastModelEvent(MODEL_DONE_EVENT, {
      id: model.id,
      engine: model.engine,
      status: 'error',
      success: false,
      error: String(e)
    } as ModelProgress)
    throw e
  } finally {
    try {
      fs.rmSync(tmpZip, { force: true })
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpExtract, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/** 供 IPC 调用：按引擎 + id 启动下载。 */
export function handleModelDownload(
  payload: { engine: ModelInfo['engine']; id: string }
): void {
  const model = getModelById(payload.engine, payload.id)
  if (!model) {
    broadcastModelEvent(MODEL_DONE_EVENT, {
      id: payload.id,
      engine: payload.engine,
      status: 'error',
      success: false,
      error: 'model not found'
    } as ModelProgress)
    return
  }
  startModelDownload(model).catch(() => {
    /* 错误已在内部处理并回报 */
  })
}
