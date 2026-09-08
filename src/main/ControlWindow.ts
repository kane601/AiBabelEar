import { app, shell, BrowserWindow, ipcMain, nativeTheme, dialog } from 'electron'
import path from 'path'
import { EngineInfo } from './types'
import pidusage from 'pidusage'
import { is } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import { captionWindow } from './CaptionWindow'
import { allConfig } from './utils/AllConfig'
import { captionEngine } from './utils/CaptionEngine'
import { getVoskModelStatus } from './utils/voskModels'
import { listAudioInputDevices } from './utils/audioDevices'
import { getModelsForEngine, getModelBaseDir, getModelById, ModelEngine } from './utils/modelRegistry'
import { getModelInstalledPath, handleModelDownload, startModelDownload } from './utils/modelDownloader'
import { Log } from './utils/Log'
import { appState } from './appState'
import { refreshAppTrayMenu } from './AppTray'

// 根据当前引擎选择一个默认需要下载的模型：
// - vosk：优先下载当前源语言对应模型，未指定或 auto 时默认英语(en)；
// - sosv：下载推荐模型（FP32 推荐项）；
// - 云端引擎(gummy/glm)无需模型，返回 null。
function resolveDefaultModel(): { engine: ModelEngine; id: string } | null {
  const engine = allConfig.controls.engine
  if (engine === 'gummy' || engine === 'glm') return null
  if (engine === 'vosk') {
    const lang = allConfig.controls.sourceLang
    const byLang = getModelsForEngine('vosk').find((m) => m.lang === lang)
    if (byLang) return { engine: 'vosk', id: byLang.id }
    return { engine: 'vosk', id: 'en' }
  }
  if (engine === 'sosv') {
    const rec = getModelsForEngine('sosv').find((m) => m.recommended) || getModelsForEngine('sosv')[0]
    if (rec) return { engine: 'sosv', id: rec.id }
  }
  return null
}

// 用户点击“开始实时字幕”时调用：
// 若当前引擎模型已就绪则直接启动；否则后台自动下载默认模型，下载完成后自动启动引擎。
async function ensureEngineStarted(): Promise<void> {
  if (captionEngine.isModelAvailable()) {
    captionEngine.start()
    return
  }
  const target = resolveDefaultModel()
  if (!target) {
    // 云端引擎无需模型
    captionEngine.start()
    return
  }
  const model = getModelById(target.engine, target.id)
  if (!model) {
    Log.warn(`[Engine] 未找到待下载模型 ${target.engine}/${target.id}，直接尝试启动`)
    captionEngine.start()
    return
  }
  Log.info(`[Engine] 模型未就绪，先自动下载 ${target.engine}/${target.id} 再启动引擎`)
  try {
    await startModelDownload(model)
    captionEngine.start()
  } catch (e) {
    Log.error(`[Engine] 自动下载模型失败，无法启动引擎: ${e}`)
  }
}

class ControlWindow {
  mounted: boolean = false;
  window: BrowserWindow | undefined;

  public createWindow(): void {
    if (this.window) {
      this.window.show()
      this.window.focus()
      return
    }

    this.window = new BrowserWindow({
      icon: icon,
      width: 710,
      height: 580,
      minWidth: 710,
      minHeight: 480,
      show: false,
      center: true,
      modal: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.window.setAlwaysOnTop(true, 'screen-saver')

    this.window.on('ready-to-show', () => {
      this.window?.show()
    })

    // 关闭设置窗口时隐藏到托盘，不退出应用
    this.window.on('close', (e) => {
      if (!appState.isQuitting && this.window) {
        e.preventDefault()
        this.window.hide()
        allConfig.writeConfig()
      }
    })

    this.window.on('closed', () => {
      this.mounted = false
      this.window = undefined
      allConfig.writeConfig()
    })

    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.window.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
  }

  public handleMessage() {
    nativeTheme.on('updated', () => {
      if(allConfig.uiTheme === 'system'){
        if(nativeTheme.shouldUseDarkColors && this.window){
          this.window.webContents.send('control.nativeTheme.change', 'dark')
        }
        else if(!nativeTheme.shouldUseDarkColors && this.window){
          this.window.webContents.send('control.nativeTheme.change', 'light')
        }
      }
    })

    ipcMain.handle('both.window.mounted', () => {
      this.mounted = true
      return allConfig.getFullConfig(Log.getAndClearLogQueue())
    })

    ipcMain.handle('control.nativeTheme.get', () => {
      if(allConfig.uiTheme === 'system'){
        if(nativeTheme.shouldUseDarkColors) return 'dark'
        return 'light'
      }
      return allConfig.uiTheme
    })

    ipcMain.handle('control.folder.select', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });

      if (result.canceled) return "";
      return result.filePaths[0];
    })

    // 返回 Vosk 各语言模型是否已下载（已下载返回模型目录绝对路径，否则为 null）。
    // baseDir 缺省时使用当前配置的 voskModelPath（或默认目录）。
    ipcMain.handle('control.vosk.models.status', (_, baseDir?: string) => {
      const dir = baseDir ||
        allConfig.controls.voskModelPath ||
        path.join(app.getPath('appData'), 'AiBabelEar', 'Vosk')
      return getVoskModelStatus(dir)
    })

    // 枚举可用的麦克风输入设备，返回 {index,name,...}[]，供前端在下拉框选择。
    ipcMain.handle('control.audio.devices', async () => {
      return listAudioInputDevices()
    })

    // 返回某引擎下所有可下载模型及其安装状态（已安装返回绝对路径，否则为 null）。
    ipcMain.handle('control.models.list', (_, engine: ModelEngine) => {
      let baseDir = getModelBaseDir(engine)
      // Vosk 允许用户自定义模型目录（voskModelPath）；列表与引擎需基于同一目录，保证状态一致。
      if (engine === 'vosk' && allConfig.controls.voskModelPath) {
        baseDir = allConfig.controls.voskModelPath
      }
      return getModelsForEngine(engine).map((m) => ({
        id: m.id,
        engine: m.engine,
        name: m.name,
        lang: m.lang,
        url: m.url,
        size: m.size,
        recommended: m.recommended,
        path: getModelInstalledPath(m, baseDir)
      }))
    })

    // 触发模型下载（流式回报进度/完成事件）。
    // 下载进度/完成事件会广播给所有窗口，字幕窗与设置窗均可监听展示。
    ipcMain.on('control.model.download', (_event, payload: { engine: ModelEngine; id: string }) => {
      handleModelDownload(payload)
    })

    ipcMain.handle('control.engine.info', async () => {
      const info: EngineInfo = {
        pid: 0, ppid: 0, port: 0, cpu: 0, mem: 0, elapsed: 0
      }
      if(captionEngine.status !== 'running') return info
      const stats = await pidusage(captionEngine.process.pid)
      info.pid = stats.pid
      info.ppid = stats.ppid
      info.port = captionEngine.port
      info.cpu = stats.cpu
      info.mem = stats.memory
      info.elapsed = stats.elapsed
      return info
    })

    ipcMain.on('control.uiLanguage.change', (_, args) => {
      allConfig.uiLanguage = args
      if(captionWindow.window){
        captionWindow.window.webContents.send('control.uiLanguage.set', args)
      }
      refreshAppTrayMenu()
    })

    ipcMain.on('control.uiTheme.change', (_, args) => {
      allConfig.uiTheme = args
    })

    ipcMain.on('control.uiColor.change', (_, args) => {
      allConfig.uiColor = args
    })

    ipcMain.on('control.leftBarWidth.change', (_, args) => {
      allConfig.leftBarWidth = args
    })

    ipcMain.on('control.styles.change', (_, args) => {
      allConfig.setStyles(args)
      if(captionWindow.window){
        allConfig.sendStyles(captionWindow.window)
      }
    })

    ipcMain.on('control.styles.reset', () => {
      allConfig.resetStyles()
      if(this.window){
        allConfig.sendStyles(this.window)
      }
      if(captionWindow.window){
        allConfig.sendStyles(captionWindow.window)
      }
    })

    ipcMain.on('control.captionWindow.activate', () => {
      captionWindow.show()
    })

    ipcMain.on('control.controls.change', (_, args) => {
      allConfig.setControls(args)
    })

    ipcMain.on('control.engine.start', () => {
      ensureEngineStarted()
    })

    ipcMain.on('control.engine.stop', () => {
      captionEngine.stop()
    })

    ipcMain.on('control.engine.forceKill', () => {
      captionEngine.kill()
    })

    ipcMain.on('control.engine.restart', () => {
      captionEngine.restart()
    })

    ipcMain.on('control.captionLog.clear', () => {
      allConfig.captionLog.splice(0)
    })
  }

  public sendErrorMessage(message: string) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('control.error.occurred', message)
    }
  }
}

export const controlWindow = new ControlWindow()
