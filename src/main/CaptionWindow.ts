import { shell, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import { controlWindow } from './ControlWindow'
import { Log } from './utils/Log'
import { allConfig } from './utils/AllConfig'
import { appState } from './appState'

// 字幕窗口固定宽度（像素）。minWidth === maxWidth 锁定宽度，禁止任何拖拽/缩放改变宽度。
const CAPTION_WINDOW_WIDTH = 800

class CaptionWindow {
  window: BrowserWindow | undefined;
  private dragOrigin: [number, number] | null = null;
  /** 创建后是否在 ready-to-show 时自动显示 */
  private showWhenReady = false;

  public createWindow(options?: { show?: boolean }): void {
    if (this.window) return

    this.showWhenReady = options?.show ?? false

    this.window = new BrowserWindow({
      icon: icon,
      width: CAPTION_WINDOW_WIDTH,
      height: 100,
      minWidth: CAPTION_WINDOW_WIDTH,
      maxWidth: CAPTION_WINDOW_WIDTH,
      resizable: false,
      show: false,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // 字幕窗口默认显示在屏幕底部居中（而非居中弹窗）：按主屏工作区计算底部位置。
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
    const winW = CAPTION_WINDOW_WIDTH
    const winH = 100
    const marginBottom = 54
    const x = Math.max(0, Math.floor((screenW - winW) / 2))
    const y = Math.max(0, screenH - winH - marginBottom)
    this.window.setPosition(x, y)

    this.window.setAlwaysOnTop(true, 'screen-saver')

    this.window.on('ready-to-show', () => {
      if (this.showWhenReady) {
        this.window?.show()
      }
    })

    // 关闭时隐藏到托盘，不销毁窗口、不退出应用
    this.window.on('close', (e) => {
      if (!appState.isQuitting && this.window) {
        e.preventDefault()
        // 宽度已固定为 CAPTION_WINDOW_WIDTH，保持配置一致。
        allConfig.captionWindowWidth = CAPTION_WINDOW_WIDTH
        this.window.hide()
      }
    })

    this.window.on('closed', () => {
      this.window = undefined
    })

    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/caption`)
    } else {
      this.window.loadFile(path.join(__dirname, '../renderer/index.html'), {
        hash: 'caption'
      })
    }
  }

  /** 显示字幕窗口（不存在则创建） */
  public show(): void {
    if (!this.window) {
      this.createWindow({ show: true })
      return
    }
    if (this.window.isMinimized()) this.window.restore()
    this.window.show()
    this.window.focus()
  }

  public hide(): void {
    this.window?.hide()
  }

  public handleMessage() {
    ipcMain.on('caption.controlWindow.activate', () => {
      if (!controlWindow.window) {
        controlWindow.createWindow()
      } else {
        controlWindow.window.show()
        controlWindow.window.focus()
      }
    })

    ipcMain.on('caption.windowHeight.change', (_, height) => {
      // 仅当高度为有效正数时执行，避免 NaN/undefined 传入 setBounds 触发 native 转换异常。
      if(this.window && typeof height === 'number' && Number.isFinite(height) && height > 0){
        try {
          // 高度变化时保持窗口底边固定，避免多行字幕向下溢出屏幕。
          // 同时把宽度显式强制回固定值 CAPTION_WINDOW_WIDTH（常量，不会因 DIP 取整漂移），
          // 即便其它路径意外改了宽度也会被即时拉回，杜绝“拖拽时窗口变大”。
          const bounds = this.window.getBounds()
          const newHeight = Math.round(height)
          this.window.setBounds({
            x: bounds.x,
            y: bounds.y + bounds.height - newHeight,
            width: CAPTION_WINDOW_WIDTH,
            height: newHeight
          })
        } catch (e) {
          Log.error('[Caption] setBounds 失败（已忽略）:', e)
        }
      }
    })

    ipcMain.on('caption.window.close', () => {
      // 关闭按钮：隐藏到托盘，而非退出
      this.hide()
    })

    ipcMain.on('caption.mouseEvents.ignore', (_, ignore: boolean) => {
      if(this.window){
        this.window.setIgnoreMouseEvents(ignore, { forward: ignore })
      }
    })

    // 渲染进程用 JS 指针实现的窗口拖动
    ipcMain.on('caption.drag.start', () => {
      if(this.window){
        this.dragOrigin = this.window.getPosition() as [number, number]
      }
    })
    ipcMain.on('caption.drag.move', (_, payload: { dx?: unknown; dy?: unknown }) => {
      const dx = payload?.dx
      const dy = payload?.dy
      // setPosition 收到非有限数值会抛 native 转换异常
      // （“Error processing argument at index 0, conversion failure from”）。
      // 任何异常都就地吞掉，避免单个拖拽事件弹致命框、反复刷屏。
      if (
        this.window &&
        Array.isArray(this.dragOrigin) &&
        Number.isFinite(this.dragOrigin[0]) &&
        Number.isFinite(this.dragOrigin[1]) &&
        Number.isFinite(dx) &&
        Number.isFinite(dy)
      ) {
        try {
          this.window.setPosition(
            Math.round(this.dragOrigin[0] + (dx as number)),
            Math.round(this.dragOrigin[1] + (dy as number))
          )
        } catch (e) {
          Log.error('[Caption] setPosition 失败（已忽略）:', e)
        }
      }
    })
  }
}

export const captionWindow = new CaptionWindow()
