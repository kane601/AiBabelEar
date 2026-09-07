import * as path from 'path'
import { app } from 'electron'

export type ModelEngine = 'vosk' | 'sosv'

export interface ModelInfo {
  /** 模型唯一标识（VOSK 与 VOSK_LANG_KEYWORDS 的语言码一致；SOSV 为 sosv / sosv-int8） */
  id: string
  engine: ModelEngine
  /** 显示名（语言名） */
  name: string
  /** VOSK 对应的语言关键字（用于状态检测与引擎按语言选模型） */
  lang?: string
  /** 下载地址 */
  url: string
  /** 解压后的模型文件夹名（VOSK 需要保留含语言关键字的原名，SOSV 不使用） */
  folder?: string
  /** 体积（仅用于展示） */
  size?: string
  /** 是否推荐优先使用（仅用于展示） */
  recommended?: boolean
}

// VOSK 多语言“小模型”（small）：体积约 40~80MB，适合桌面应用。
// 文件夹名保留官方原名，其中包含语言关键字（en/cn/ja/ko/de/fr/ru/es/it），
// 以便前端 getVoskModelStatus 与引擎 resolve_vosk_model_path 正确识别。
const VOSK_SMALL: ModelInfo[] = [
  { id: 'en', engine: 'vosk', lang: 'en', name: 'English', folder: 'vosk-model-small-en-us-0.15', url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip', size: '~40 MB' },
  { id: 'zh-cn', engine: 'vosk', lang: 'zh-cn', name: '中文', folder: 'vosk-model-small-cn-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip', size: '~42 MB' },
  { id: 'ja', engine: 'vosk', lang: 'ja', name: '日本語', folder: 'vosk-model-small-ja-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-ja-0.22.zip', size: '~48 MB' },
  { id: 'ko', engine: 'vosk', lang: 'ko', name: '한국어', folder: 'vosk-model-small-ko-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-ko-0.22.zip', size: '~82 MB' },
  { id: 'de', engine: 'vosk', lang: 'de', name: 'Deutsch', folder: 'vosk-model-small-de-0.15', url: 'https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip', size: '~45 MB' },
  { id: 'fr', engine: 'vosk', lang: 'fr', name: 'Français', folder: 'vosk-model-small-fr-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip', size: '~41 MB' },
  { id: 'ru', engine: 'vosk', lang: 'ru', name: 'Русский', folder: 'vosk-model-small-ru-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip', size: '~45 MB' },
  { id: 'es', engine: 'vosk', lang: 'es', name: 'Español', folder: 'vosk-model-small-es-0.42', url: 'https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip', size: '~39 MB' },
  { id: 'it', engine: 'vosk', lang: 'it', name: 'Italiano', folder: 'vosk-model-small-it-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-it-0.22.zip', size: '~48 MB' },
]

// SOSV（SenseVoice，多语言）：FP32 与 INT8 两个变体。
// INT8 解压后的文件夹名须以 int8 结尾，引擎才能加载量化模型（见 sosv.py）。
const SOSV_MODELS: ModelInfo[] = [
  { id: 'sosv', engine: 'sosv', name: 'SenseVoice (FP32)', recommended: true, url: 'https://github.com/HiMeditator/auto-caption/releases/download/sosv-model/sosv.zip', size: '~1.3 GB' },
  { id: 'sosv-int8', engine: 'sosv', name: 'SenseVoice (INT8)', url: 'https://github.com/HiMeditator/auto-caption/releases/download/sosv-model/sosv-int8.zip', size: '~330 MB' },
]

export const MODEL_REGISTRY: ModelInfo[] = [...VOSK_SMALL, ...SOSV_MODELS]

/** 返回某引擎下所有可下载模型。 */
export function getModelsForEngine(engine: ModelEngine): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.engine === engine)
}

/** 按引擎 + id 查找模型定义。 */
export function getModelById(engine: ModelEngine, id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.engine === engine && m.id === id)
}

/** 模型默认安装根目录：%APPDATA%/AiVoiceEars/<Vosk|SOSV> */
export function getModelBaseDir(engine: ModelEngine): string {
  const sub = engine === 'vosk' ? 'Vosk' : 'SOSV'
  return path.join(app.getPath('appData'), 'AiVoiceEars', sub)
}
