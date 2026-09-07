import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

import { notification } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { h } from 'vue'
import { useI18n } from 'vue-i18n'

import { Controls } from '@renderer/types'
import { engines } from '@renderer/i18n'
import { useGeneralSettingStore } from './generalSetting'

export const useEngineControlStore = defineStore('engineControl', () => {
  const { t } = useI18n()
  const platform = ref('unknown')

  const captionEngine = ref(engines[useGeneralSettingStore().uiLanguage])
  const engineEnabled = ref(false)
  const sourceLang = ref<string>('en')
  const targetLang = ref<string>('zh')
  const transModel = ref<string>('google')
  const ollamaName = ref<string>('')
  const ollamaUrl = ref<string>('')
  const ollamaApiKey = ref<string>('')
  const engine = ref<string>('sosv')
  // 统一的音频采集来源：
  //   'system'        -> 系统扬声器（默认输出，audio=0）
  //   'dev:<index>'   -> 指定采集设备（麦克风/回环，audio=1，audioDevice=index）
  const audioSource = ref<string>('system')
  const audio = computed<0 | 1>(() => audioSource.value === 'system' ? 0 : 1)
  const audioDevice = computed<number>(() => {
    if (audioSource.value === 'system') return -1
    const m = /^dev:(-?\d+)$/.exec(audioSource.value)
    return m ? parseInt(m[1], 10) : -1
  })
  const translation = ref<boolean>(true)
  const recording = ref<boolean>(false)
  const API_KEY = ref<string>('')
  const voskModelPath = ref<string>('')
  const sosvModelPath = ref<string>('')
  const glmUrl = ref<string>('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions')
  const glmModel = ref<string>('glm-asr-2512')
  const glmApiKey = ref<string>('')
  const recordingPath = ref<string>('')
  const startTimeoutSeconds = ref<number>(30)

  const changeSignal = ref<boolean>(false)
  const errorSignal = ref<boolean>(false)

  function sendControlsChange() {
    const controls: Controls = {
      engineEnabled: engineEnabled.value,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      transModel: transModel.value,
      ollamaName: ollamaName.value,
      ollamaUrl: ollamaUrl.value,
      ollamaApiKey: ollamaApiKey.value,
      engine: engine.value,
      audio: audio.value,
      audioDevice: audioDevice.value,
      translation: translation.value,
      recording: recording.value,
      API_KEY: API_KEY.value,
      voskModelPath: voskModelPath.value,
      sosvModelPath: sosvModelPath.value,
      glmUrl: glmUrl.value,
      glmModel: glmModel.value,
      glmApiKey: glmApiKey.value,
      recordingPath: recordingPath.value,
      startTimeoutSeconds: startTimeoutSeconds.value
    }
    window.electron.ipcRenderer.send('control.controls.change', controls)
  }

  function setControls(controls: Controls) {
    sourceLang.value = controls.sourceLang
    targetLang.value = controls.targetLang
    transModel.value = controls.transModel
    ollamaName.value = controls.ollamaName
    ollamaUrl.value = controls.ollamaUrl
    ollamaApiKey.value = controls.ollamaApiKey
    engine.value = controls.engine
    audioSource.value = controls.audio === 0 ? 'system' : `dev:${controls.audioDevice ?? -1}`
    engineEnabled.value = controls.engineEnabled
    translation.value = controls.translation
    recording.value = controls.recording
    API_KEY.value = controls.API_KEY
    voskModelPath.value = controls.voskModelPath
    sosvModelPath.value = controls.sosvModelPath
    glmUrl.value = controls.glmUrl || 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions'
    glmModel.value = controls.glmModel || 'glm-asr-2512'
    glmApiKey.value = controls.glmApiKey
    recordingPath.value = controls.recordingPath
    startTimeoutSeconds.value = controls.startTimeoutSeconds
    changeSignal.value = true
  }

  function emptyModelPathErr() {
    notification.open({
      message: t('noti.empty'),
      description: t('noti.emptyInfo'),
      duration: null,
      icon: () => h(ExclamationCircleOutlined, { style: 'color: #ff4d4f' })
    });
  }

  window.electron.ipcRenderer.on('control.controls.set', (_, controls: Controls) => {
    setControls(controls)
  })

  window.electron.ipcRenderer.on('control.error.occurred', (_, message) => {
    notification.open({
      message: t('noti.error'),
      description: message,
      duration: null,
      icon: () => h(ExclamationCircleOutlined, { style: 'color: #ff4d4f' })
    });
  })

  return {
    platform,           // 系统平台
    captionEngine,      // 字幕引擎列表
    engineEnabled,      // 字幕引擎是否启用
    sourceLang,         // 源语言
    targetLang,         // 目标语言
    transModel,         // 翻译模型
    ollamaName,         // Ollama 模型
    ollamaUrl,
    ollamaApiKey,
    engine,             // 字幕引擎
    audioSource,        // 统一音频采集来源（'system' 或 'dev:<index>'）
    audio,              // 由 audioSource 推导：0 系统输出 / 1 输入
    audioDevice,        // 由 audioSource 推导：麦克风设备索引（-1 为系统默认）
    translation,        // 是否启用翻译
    recording,          // 是否启用录音
    API_KEY,            // API KEY
    voskModelPath,      // vosk 模型路径
    sosvModelPath,      // sosv 模型路径
    glmUrl,             // GLM API URL
    glmModel,           // GLM 模型名称
    glmApiKey,          // GLM API Key
    recordingPath,      // 录音保存路径
    startTimeoutSeconds, // 启动超时时间（秒）
    setControls,        // 设置引擎配置
    sendControlsChange, // 发送最新控制消息到后端
    emptyModelPathErr,  // 模型路径为空时显示警告
    changeSignal,       // 配置改变信号
    errorSignal,        // 错误信号
  }
})
