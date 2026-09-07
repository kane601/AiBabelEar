import { app, BrowserWindow } from 'electron'
import { execSync } from 'child_process'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { controlWindow } from './ControlWindow'

// Windows 中文系统控制台默认代码页为 936(GBK)，而 Node 以 UTF-8 输出，
// 会导致 console.log 的中文在终端显示为乱码(如“开始下载模型”→“寮€濮嬩笅杞芥ā鍨”)。
// 启动时把控制台代码页切为 65001(UTF-8) 即可正确显示。chcp 作用于整个控制台会话。
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch {
    /* 无控制台(打包后 GUI 运行)或执行失败时忽略 */
  }
}
import { captionWindow } from './CaptionWindow'
import { allConfig } from './utils/AllConfig'
import { captionEngine } from './utils/CaptionEngine'
import { Log } from './utils/Log'
import { createAppTray } from './AppTray'
import { appState } from './appState'

// 兜底：捕获主进程未预期的异常（如单个 IPC 参数转换失败：
// “Error processing argument at index 0, conversion failure from”），
// 仅记录到日志文件并继续运行，避免弹出致命错误框让用户误以为程序崩溃。
process.on('uncaughtException', (error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error)
  Log.error('[Uncaught] 主进程未捕获异常（已兜底，程序继续运行）:', msg)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.himeditator.aivoiceears')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  controlWindow.handleMessage()
  captionWindow.handleMessage()

  allConfig.readConfig()
  allConfig.ensureModelDirs()

  // 托盘常驻：启动时展示字幕窗口，关闭窗口后仍常驻托盘、不退出进程
  createAppTray()
  captionWindow.createWindow({ show: true })

  // 仅当当前引擎的模型已就绪才自动启动；否则等待用户手动“开始实时字幕”，
  // 避免缺少模型导致引擎崩溃并弹出错误提示。
  if (captionEngine.isModelAvailable()) {
    captionEngine.start()
  }

  app.on('activate', function () {
    // macOS：点击 Dock 图标时恢复字幕窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      captionWindow.createWindow({ show: true })
      if (captionEngine.isModelAvailable()) {
        captionEngine.start()
      }
    } else {
      captionWindow.show()
    }
  })
})

app.on('will-quit', async () => {
  appState.isQuitting = true
  captionEngine.kill()
  allConfig.writeConfig()
})

// 托盘常驻：所有窗口关闭时不退出，仅托盘菜单「退出」才真正结束进程
app.on('window-all-closed', () => {
  if (appState.isQuitting) {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  }
  // 否则保持进程，托盘继续运行
})
