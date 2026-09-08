import { exec, spawn } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import * as path from 'path'
import * as fs from 'fs'
import * as net from 'net'
import { controlWindow } from '../ControlWindow'
import { allConfig } from './AllConfig'
import { i18n } from '../i18n'
import { Log } from './Log'
import { passwordMaskingForList } from './UtilsFunc'
import { resolveVoskLangModel, getFirstVoskModel } from './voskModels'

export class CaptionEngine {
  appPath: string = ''
  command: string[] = []
  process: any | undefined
  client: net.Socket | undefined
  port: number = 8080
  status: 'running' | 'starting' | 'stopping' | 'stopped' | 'starting-timeout' = 'stopped'
  timerID: NodeJS.Timeout | undefined
  startTimeoutID: NodeJS.Timeout | undefined
  private shouldRestart: boolean = false
  private stderrTail: string[] = []
  private expectedExit: boolean = false

  private notifyAll(channel: string, ...args: any[]) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, ...args)
    }
  }

  private sendControlsToAll(info = true) {
    for (const window of BrowserWindow.getAllWindows()) {
      allConfig.sendControls(window, info)
    }
  }

  // 计算引擎可执行文件与基础启动参数（dev 下为 python + main.py，prod 下为打包后的可执行文件）。
  // 抽成独立方法，供 getApp 与音频设备枚举复用，避免路径逻辑重复。
  public static getEngineExecutable(): { appPath: string, baseArgs: string[] } {
    let appPath = ''
    const baseArgs: string[] = []
    if (is.dev) {
      if (process.platform === "win32") {
        appPath = path.join(app.getAppPath(), 'engine', '.venv', 'Scripts', 'python.exe')
        baseArgs.push(path.join(app.getAppPath(), 'engine', 'main.py'))
      } else {
        appPath = path.join(app.getAppPath(), 'engine', '.venv', 'bin', 'python3')
        baseArgs.push(path.join(app.getAppPath(), 'engine', 'main.py'))
      }
    } else {
      if (process.platform === 'win32') {
        appPath = path.join(process.resourcesPath, 'engine', 'main.exe')
      } else {
        appPath = path.join(process.resourcesPath, 'engine', 'main', 'main')
      }
    }
    return { appPath, baseArgs }
  }

  // 当前引擎的模型是否已就绪（可在启动时安全启动，或用户点击“开始”时无需下载即可直接启动）。
  // 云端引擎（gummy/glm）无需本地模型；vosk 需存在对应语言（或任一）模型文件夹；sosv 需存在 onnx 权重。
  public isModelAvailable(): boolean {
    const engine = allConfig.controls.engine
    if (engine === 'gummy' || engine === 'glm') return true
    if (engine === 'vosk') {
      const baseVoskPath =
        allConfig.controls.voskModelPath ||
        path.join(app.getPath('appData'), 'AiBabelEar', 'Vosk')
      const lang = allConfig.controls.sourceLang
      let resolved: string | null = null
      if (lang && lang !== 'auto') {
        resolved = resolveVoskLangModel(baseVoskPath, lang)
      } else {
        resolved = getFirstVoskModel(baseVoskPath)
      }
      return !!resolved && fs.existsSync(resolved)
    }
    if (engine === 'sosv') {
      const sosvPath =
        allConfig.controls.sosvModelPath ||
        path.join(app.getPath('appData'), 'AiBabelEar', 'SOSV')
      const candidates = [
        path.join(sosvPath, 'sensevoice', 'model.onnx'),
        path.join(sosvPath, 'sensevoice', 'model.int8.onnx'),
        path.join(sosvPath, 'sosv', 'sensevoice', 'model.onnx'),
        path.join(sosvPath, 'sosv', 'sensevoice', 'model.int8.onnx'),
        path.join(sosvPath, 'sosv-int8', 'sensevoice', 'model.int8.onnx'),
      ]
      return candidates.some((c) => fs.existsSync(c))
    }
    return true
  }

  private getApp(): boolean {
    if(allConfig.controls.engine === 'gummy' && 
        !allConfig.controls.API_KEY && !process.env.DASHSCOPE_API_KEY
      ) {
        controlWindow.sendErrorMessage(i18n('gummy.key.missing'))
        return false
      }
      this.command = []
      const { appPath, baseArgs } = CaptionEngine.getEngineExecutable()
      this.appPath = appPath
      this.command.push(...baseArgs)
      this.command.push('-a', allConfig.controls.audio ? '1' : '0')
      this.command.push('-adi', String(allConfig.controls.audioDevice ?? -1))
      if(allConfig.controls.recording) {
        this.command.push('-r', '1')
        this.command.push('-rp', `"${allConfig.controls.recordingPath}"`)
      }
      this.port = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024
      this.command.push('-p', this.port.toString())
      this.command.push(
        '-t', allConfig.controls.translation ?
        allConfig.controls.targetLang : 'none'
      )

      if(allConfig.controls.engine === 'gummy') {
        this.command.push('-e', 'gummy')
        this.command.push('-s', allConfig.controls.sourceLang)
        if(allConfig.controls.API_KEY) {
          this.command.push('-k', allConfig.controls.API_KEY)
        }
      }
      else if(allConfig.controls.engine === 'vosk'){
        const baseVoskPath = allConfig.controls.voskModelPath ||
          path.join(app.getPath('appData'), 'AiBabelEar', 'Vosk')
        // Vosk 是单模型引擎，必须把 -vosk 指向“具体的模型文件夹”，不能传容器目录。
        // 优先使用源语言对应的模型；选 auto 或无法解析时，回落到第一个可用模型；
        // 若手动把 voskModelPath 指向了某个具体模型文件夹，则直接使用它。
        let voskPath = baseVoskPath
        const lang = allConfig.controls.sourceLang
        if (lang && lang !== 'auto') {
          const resolved = resolveVoskLangModel(baseVoskPath, lang)
          if (resolved) voskPath = resolved
        } else {
          const first = getFirstVoskModel(baseVoskPath)
          if (first) voskPath = first
        }
        this.command.push('-e', 'vosk')
        this.command.push('-vosk', `"${voskPath}"`)
        this.command.push('-tm', allConfig.controls.transModel)
        this.command.push('-omn', allConfig.controls.ollamaName)
        if(allConfig.controls.ollamaUrl) this.command.push('-ourl', allConfig.controls.ollamaUrl)
        if(allConfig.controls.ollamaApiKey) this.command.push('-okey', allConfig.controls.ollamaApiKey)
      }
      else if(allConfig.controls.engine === 'sosv'){
        const sosvPath = allConfig.controls.sosvModelPath ||
          path.join(app.getPath('appData'), 'AiBabelEar', 'SOSV')
        this.command.push('-e', 'sosv')
        this.command.push('-s', allConfig.controls.sourceLang)
        this.command.push('-sosv', `"${sosvPath}"`)
        this.command.push('-tm', allConfig.controls.transModel)
        this.command.push('-omn', allConfig.controls.ollamaName)
        if(allConfig.controls.ollamaUrl) this.command.push('-ourl', allConfig.controls.ollamaUrl)
        if(allConfig.controls.ollamaApiKey) this.command.push('-okey', allConfig.controls.ollamaApiKey)
      }
      else if(allConfig.controls.engine === 'glm'){
        this.command.push('-e', 'glm')
        this.command.push('-s', allConfig.controls.sourceLang)
        this.command.push('-gurl', allConfig.controls.glmUrl)
        this.command.push('-gmodel', allConfig.controls.glmModel)
        if(allConfig.controls.glmApiKey) {
          this.command.push('-gkey', allConfig.controls.glmApiKey)
        }
        this.command.push('-tm', allConfig.controls.transModel)
        this.command.push('-omn', allConfig.controls.ollamaName)
        if(allConfig.controls.ollamaUrl) this.command.push('-ourl', allConfig.controls.ollamaUrl)
        if(allConfig.controls.ollamaApiKey) this.command.push('-okey', allConfig.controls.ollamaApiKey)
      }
    Log.info('Engine Path:', this.appPath)
    Log.info('Engine Command:', passwordMaskingForList(this.command))
    return true
  }

  public connect() {
    if(this.client) { Log.warn('Client already exists, ignoring...') }
    if (this.startTimeoutID) {
      clearTimeout(this.startTimeoutID)
      this.startTimeoutID = undefined
    }
    this.client = net.createConnection({ port: this.port }, () => {
      Log.info('Connected to caption engine server');
    });
    this.client.on('error', (err) => {
      Log.error('Connection to caption engine reset or refused:', err.message)
      this.client = undefined
      allConfig.controls.engineEnabled = false
      this.sendControlsToAll(false)
    });
    this.client.on('close', () => {
      Log.warn('Caption engine TCP connection closed');
      if (this.client) {
        this.client = undefined
      }
    });
    this.status = 'running'
    allConfig.controls.engineEnabled = true
    this.sendControlsToAll(false)
    this.notifyAll('control.engine.started', this.process.pid)
  }

  public sendCommand(command: string, content: string = "") {
    if(this.client === undefined || this.client.destroyed) {
      Log.error('Client not initialized or disconnected, cannot send command:', command)
      return
    }
    const data = JSON.stringify({command, content})
    this.client.write(data);
    Log.info(`Send data to python server: ${data}`);
  }

  public start() {
    if (this.status !== 'stopped') {
      Log.warn('Caption engine is not stopped, current status:', this.status)
      return
    }
    if(!this.getApp()){ return }

    this.stderrTail = []
    this.expectedExit = false

    this.process = spawn(this.appPath, this.command)
    this.status = 'starting'
    Log.info('Caption Engine Starting, PID:', this.process.pid)

    const timeoutMs = allConfig.controls.startTimeoutSeconds * 1000
    this.startTimeoutID = setTimeout(() => {
      if (this.status === 'starting') {
        Log.warn(`Engine start timeout after ${allConfig.controls.startTimeoutSeconds} seconds, forcing kill...`)
        this.status = 'starting-timeout'
        controlWindow.sendErrorMessage(i18n('engine.start.timeout'))
        this.kill()
      }
    }, timeoutMs)
    
    this.process.stdout.on('data', (data: any) => {
      const lines = data.toString().split('\n')
      lines.forEach((line: string) => {
        if (line.trim()) {
          try {
            const data_obj = JSON.parse(line)
            handleEngineData(data_obj)
          } catch (e) {
            // controlWindow.sendErrorMessage(i18n('engine.output.parse.error') + e)
            Log.error('Error parsing JSON:', e)
          }
        }
      });
    });

    this.process.stderr.on('data', (data: any) => {
      const lines = data.toString().split('\n')
      lines.forEach((line: string) => {
        if(line.trim()){
          Log.error(line)
          this.stderrTail.push(line)
          if (this.stderrTail.length > 30) this.stderrTail.shift()
        }
      })
    });

    this.process.on('close', (code: any) => {
      this.process = undefined;
      this.client = undefined
      allConfig.controls.engineEnabled = false
      this.sendControlsToAll(false)
      this.status = 'stopped'
      clearInterval(this.timerID)
      if (this.startTimeoutID) {
        clearTimeout(this.startTimeoutID)
        this.startTimeoutID = undefined
      }
      // Surface unexpected crashes (e.g. invalid Vosk model path) to the user,
      // instead of letting the broken socket throw an uncaught ECONNRESET.
      if (code !== 0 && code !== null && !this.expectedExit) {
        const tail = this.stderrTail.join('\n').trim()
        if (tail) {
          controlWindow.sendErrorMessage(i18n('engine.crashed') + '\n' + tail)
        } else {
          controlWindow.sendErrorMessage(i18n('engine.crashed.noinfo'))
        }
        this.stderrTail = []
      }
      Log.info(`Engine exited with code ${code}`)
      if (this.shouldRestart) {
        this.shouldRestart = false
        this.start()
      } else {
        this.notifyAll('control.engine.stopped')
      }
    });
  }

  public restart() {
    if (this.status === 'stopped' || !this.process) {
      this.shouldRestart = false
      this.start()
      return
    }
    this.shouldRestart = true
    this.kill()
  }

  public stop() {
    if(this.status !== 'running'){
      Log.warn('Trying to stop engine which is not running, current status:', this.status)
    }
    this.expectedExit = true
    this.sendCommand('stop')
    if(this.client){
      this.client.destroy()
      this.client = undefined
    }
    this.status = 'stopping'
    this.timerID = setTimeout(() => {
      if(this.status !== 'stopping') return
      Log.warn('Engine process still not stopped, trying to kill...')
      this.kill()
    }, 4000);
  }

  public kill(){
    if(!this.process || !this.process.pid) return
    if(this.status !== 'running'){
      Log.warn('Trying to kill engine which is not running, current status:', this.status)
    }
    this.expectedExit = true
    Log.warn('Killing engine process, PID:', this.process.pid)

    if (this.startTimeoutID) {
      clearTimeout(this.startTimeoutID)
      this.startTimeoutID = undefined
    }
    if(this.client){
      this.client.destroy()
      this.client = undefined
    }
    if (this.process.pid) {
      let cmd = `kill -9 ${this.process.pid}`;
      if (process.platform === "win32") {
        cmd = `taskkill /pid ${this.process.pid} /t /f`
      }
      exec(cmd, (error) => {
        if (error) {
          Log.error('Failed to kill process:', error)
        } else {
          Log.info('Process killed successfully')
        }
      })
    }
  }
}

function handleEngineData(data: any) {
  if(data.command === 'connect'){
    captionEngine.connect()
  }
  else if(data.command === 'kill') {
    if(captionEngine.status !== 'stopped') {
      Log.warn('Error occurred, trying to kill caption engine...')
      captionEngine.kill()
    }
  }
  else if(data.command === 'caption') {
    allConfig.updateCaptionLog(data);
  }
  else if(data.command === 'translation') {
    allConfig.updateCaptionTranslation(data);
  }
  else if(data.command === 'print') {
    console.log(data.content)
  }
  else if(data.command === 'info') {
    Log.info('Engine Info:', data.content)
  }
  else if(data.command === 'warn') {
    Log.warn('Engine Warn:', data.content)
  }
  else if(data.command === 'error') {
    Log.error('Engine Error:', data.content)
    controlWindow.sendErrorMessage(/*i18n('engine.error') +*/ data.content)
  }
  else if(data.command === 'usage') {
    Log.info('Engine Token Usage: ', data.content)
  }
  else {
    Log.warn('Unknown command:', data)
  }
}

export const captionEngine = new CaptionEngine()
