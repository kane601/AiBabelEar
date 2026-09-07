import { controlWindow } from "../ControlWindow"
import { type SoftwareLogItem } from "../types"
import * as fs from "fs"
import * as path from "path"
import { app } from "electron"

let logIndex = 0
const logQueue: SoftwareLogItem[] = []

// 同时把日志写入 UTF-8(带 BOM) 文件，保证在任何编辑器/终端下中文都不会乱码。
let logFilePath: string | null = null
let bomWritten = false

function getLogFilePath(): string | null {
  if (logFilePath) return logFilePath
  try {
    if (!app.isReady()) return null
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    logFilePath = path.join(dir, 'app.log')
    return logFilePath
  } catch {
    return null
  }
}

function appendLogToFile(line: string): void {
  const fp = getLogFilePath()
  if (!fp) return
  try {
    if (!bomWritten) {
      // 首次写入时确保文件以 UTF-8 BOM 开头，避免记事本等按 GBK 解码乱码。
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, '﻿', 'utf8')
      bomWritten = true
    }
    fs.appendFileSync(fp, line + '\n', 'utf8')
  } catch {
    /* 日志写文件失败不影响主流程 */
  }
}

function getTimeString() {
  const now = new Date()
  const HH = String(now.getHours()).padStart(2, '0')
  const MM = String(now.getMinutes()).padStart(2, '0')
  const SS = String(now.getSeconds()).padStart(2, '0')
  const MS = String(now.getMilliseconds()).padStart(3, '0')
  return `${HH}:${MM}:${SS}.${MS}`
}

export class Log {
  static getAndClearLogQueue() {
    const copiedQueue = structuredClone(logQueue)
    logQueue.length = 0
    return copiedQueue
  }

  static handleLog(logType: "INFO" | "WARN" | "ERROR", ...msg: any[]) {
    const timeStr = getTimeString()
    const logPre = `[${logType} ${timeStr}]`
    let logStr = ""
    for(let i = 0; i < msg.length; i++) {
      logStr += i ? " " : ""
      if(typeof msg[i] === "string") logStr += msg[i]
      else logStr += JSON.stringify(msg[i], undefined, 2)
    }
    console.log(logPre, logStr)
    appendLogToFile(`${logPre} ${logStr}`)
    const logItem: SoftwareLogItem = {
      type: logType,
      index: ++logIndex,
      time: timeStr,
      text: logStr
    }
    if(controlWindow.mounted && controlWindow.window) {
      controlWindow.window.webContents.send('control.softwareLog.add', logItem)
    }
    else {
      logQueue.push(logItem)
    }
  }

  static info(...msg: any[]){
    this.handleLog("INFO", ...msg)
  }

  static warn(...msg: any[]){
    this.handleLog("WARN", ...msg)
  }

  static error(...msg: any[]){
    this.handleLog("ERROR", ...msg)
  }
}
