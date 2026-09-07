import { execFile } from 'child_process'
import { CaptionEngine } from './CaptionEngine'
import { Log } from './Log'

export interface AudioInputDevice {
  index: number
  name: string
  maxInputChannels: number
  defaultSampleRate: number
  isLoopback: boolean
  // 'microphone' 为真实麦克风（含外接摄像头/USB 麦克风），'loopback' 为系统音频输出回环设备
  kind: 'microphone' | 'loopback'
}

// 通过引擎（python）以 --list-devices 模式枚举所有可用的麦克风输入设备。
// 复用 getEngineExecutable 计算出的解释器/可执行文件路径，保证与运行时一致。
export function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  return new Promise((resolve) => {
    let { appPath, baseArgs } = CaptionEngine.getEngineExecutable()
    if (!appPath) {
      resolve([])
      return
    }
    const args = [...baseArgs, '--list-devices']
    try {
      execFile(
        appPath,
        args,
        {
          timeout: 15000,
          maxBuffer: 1024 * 1024,
          // Windows 下强制 Python 以 UTF-8 输出，避免中文设备名被按本地编码（GBK）写出。
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        },
        (error, stdout) => {
          if (error) {
            Log.error('Failed to list audio input devices:', error.message)
            resolve([])
            return
          }
          try {
            // 输出可能夹杂其它日志，取最后一个非空行解析 JSON。
            let out = stdout
            // 去掉可能的 UTF-8 BOM，避免首行 JSON 解析失败或首字符乱码。
            if (out.charCodeAt(0) === 0xfeff) out = out.slice(1)
            const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
            const last = lines[lines.length - 1] || '{}'
            const parsed = JSON.parse(last)
            resolve(Array.isArray(parsed.devices) ? parsed.devices : [])
          } catch (e) {
            Log.error('Failed to parse audio device list:', e)
            resolve([])
          }
        }
      )
    } catch (e) {
      Log.error('Spawn audio device enumeration failed:', e)
      resolve([])
    }
  })
}
