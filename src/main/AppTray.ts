import { Tray, Menu, app, nativeImage } from 'electron'
import icon from '../../build/icon.png?asset'
import { captionWindow } from './CaptionWindow'
import { controlWindow } from './ControlWindow'
import { appState } from './appState'
import { i18n } from './i18n'
import { Log } from './utils/Log'

let tray: Tray | undefined

function showCaptionWindow() {
  captionWindow.show()
}

function showControlWindow() {
  if (!controlWindow.window) {
    controlWindow.createWindow()
  } else {
    controlWindow.window.show()
    controlWindow.window.focus()
  }
}

function buildContextMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: i18n('tray.showCaption'),
      click: () => showCaptionWindow()
    },
    {
      label: i18n('tray.openSettings'),
      click: () => showControlWindow()
    },
    { type: 'separator' },
    {
      label: i18n('tray.quit'),
      click: () => quitToTray()
    }
  ])
}

export function createAppTray(): void {
  if (tray) return

  let image = nativeImage.createFromPath(icon)
  if (image.isEmpty()) {
    Log.warn('[Tray] 托盘图标加载失败，使用空图标')
  } else if (process.platform === 'win32') {
    // Windows 托盘建议使用较小尺寸，避免模糊
    image = image.resize({ width: 16, height: 16 })
  }

  tray = new Tray(image)
  tray.setToolTip('AiVoiceEars')
  tray.setContextMenu(buildContextMenu())

  // Windows：双击托盘显示字幕窗口
  tray.on('double-click', () => showCaptionWindow())
  // 部分环境单击也会打开菜单；再补一层左键单击显示窗口更直观
  tray.on('click', () => {
    if (process.platform === 'darwin') return
    tray?.popUpContextMenu()
  })

  Log.info('[Tray] 系统托盘已创建，应用常驻托盘')
}

/** 语言切换后刷新托盘菜单文案 */
export function refreshAppTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(buildContextMenu())
}

/** 从托盘退出：销毁托盘并退出应用 */
export function quitToTray(): void {
  appState.isQuitting = true
  if (tray) {
    tray.destroy()
    tray = undefined
  }
  // 真正关闭窗口（不再 preventDefault 隐藏）
  captionWindow.window?.destroy()
  controlWindow.window?.destroy()
  app.quit()
}
