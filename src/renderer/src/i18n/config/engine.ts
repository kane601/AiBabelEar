// type: -1 仅为源语言，0 两者皆可， 1 仅为翻译语言
export const engines = {
  zh: [
    {
      value: 'gummy',
      label: '云端 / 阿里云 / Gummy',
      languages: [
        { value: 'auto', type: -1, label: '自动检测' },
        { value: 'en', type: 0, label: '英语' },
        { value: 'zh', type: 0, label: '中文' },
        { value: 'ja', type: 0, label: '日语' },
        { value: 'ko', type: 0, label: '韩语' },
        { value: 'de', type: -1, label: '德语' },
        { value: 'fr', type: -1, label: '法语' },
        { value: 'ru', type: -1, label: '俄语' },
        { value: 'es', type: -1, label: '西班牙语' },
        { value: 'it', type: -1, label: '意大利语' },
        { value: 'yue', type: -1, label: '粤语' },
      ]
    },
    {
      value: 'vosk',
      label: '本地 / Vosk',
      languages: [
        { value: 'en', type: 0, label: '英语' },
        { value: 'zh-cn', type: 0, label: '中文' },
        { value: 'ja', type: 0, label: '日语' },
        { value: 'ko', type: 0, label: '韩语' },
        { value: 'de', type: 0, label: '德语' },
        { value: 'fr', type: 0, label: '法语' },
        { value: 'ru', type: 0, label: '俄语' },
        { value: 'es', type: 0, label: '西班牙语' },
        { value: 'it', type: 0, label: '意大利语' },
      ],
      transModel: [
        // 翻译模型目前只支持 Google API 调用，Ollama / OpenAI 兼容模型选项先屏蔽
        // { value: 'ollama', label: 'Ollama 模型或 OpenAI 兼容模型' },
        { value: 'google', label: 'Google API 调用' },
      ]
    },
    {
      value: 'sosv',
      label: '本地 / SOSV',
      languages: [
        { value: 'auto', type: -1, label: '自动检测' },
        { value: 'en', type: 0, label: '英语' },
        { value: 'zh', type: 0, label: '中文' },
        { value: 'ja', type: 0, label: '日语' },
        { value: 'ko', type: 0, label: '韩语' },
        { value: 'yue', type: -1, label: '粤语' },
        { value: 'de', type: 1, label: '德语' },
        { value: 'fr', type: 1, label: '法语' },
        { value: 'ru', type: 1, label: '俄语' },
        { value: 'es', type: 1, label: '西班牙语' },
        { value: 'it', type: 1, label: '意大利语' },
      ],
      transModel: [
        // 翻译模型目前只支持 Google API 调用，Ollama / OpenAI 兼容模型选项先屏蔽
        // { value: 'ollama', label: 'Ollama 模型或 OpenAI 兼容模型' },
        { value: 'google', label: 'Google API 调用' },
      ]
    }
  ],
  en: [
    {
      value: 'gummy',
      label: 'Cloud / Alibaba Cloud / Gummy',
      languages: [
        { value: 'auto', type: -1, label: 'Auto Detect' },
        { value: 'en', type: 0, label: 'English' },
        { value: 'zh', type: 0, label: 'Chinese' },
        { value: 'ja', type: 0, label: 'Japanese' },
        { value: 'ko', type: 0, label: 'Korean' },
        { value: 'de', type: -1, label: 'German' },
        { value: 'fr', type: -1, label: 'French' },
        { value: 'ru', type: -1, label: 'Russian' },
        { value: 'es', type: -1, label: 'Spanish' },
        { value: 'it', type: -1, label: 'Italian' },
        { value: 'yue', type: -1, label: 'Cantonese' },
      ]
    },
    {
      value: 'vosk',
      label: 'Local / Vosk',
      languages: [
        { value: 'en', type: 0, label: 'English' },
        { value: 'zh-cn', type: 0, label: 'Chinese' },
        { value: 'ja', type: 0, label: 'Japanese' },
        { value: 'ko', type: 0, label: 'Korean' },
        { value: 'de', type: 0, label: 'German' },
        { value: 'fr', type: 0, label: 'French' },
        { value: 'ru', type: 0, label: 'Russian' },
        { value: 'es', type: 0, label: 'Spanish' },
        { value: 'it', type: 0, label: 'Italian' },
      ],
      transModel: [
        // Only Google API is supported for now; Ollama / OpenAI-compatible option is temporarily disabled
        // { value: 'ollama', label: 'Ollama Model or OpenAI-compatible Model' },
        { value: 'google', label: 'Google API Call' },
      ]
    },
    {
      value: 'sosv',
      label: 'Local / SOSV',
      languages: [
        { value: 'auto', type: -1, label: 'Auto Detect' },
        { value: 'en', type: 0, label: 'English' },
        { value: 'zh-cn', type: 0, label: 'Chinese' },
        { value: 'ja', type: 0, label: 'Japanese' },
        { value: 'ko', type: 0, label: 'Korean' },
        { value: 'yue', type: -1, label: 'Cantonese' },
        { value: 'de', type: 1, label: 'German' },
        { value: 'fr', type: 1, label: 'French' },
        { value: 'ru', type: 1, label: 'Russian' },
        { value: 'es', type: 1, label: 'Spanish' },
        { value: 'it', type: 1, label: 'Italian' },
      ],
      transModel: [
        // Only Google API is supported for now; Ollama / OpenAI-compatible option is temporarily disabled
        // { value: 'ollama', label: 'Ollama Model or OpenAI-compatible Model' },
        { value: 'google', label: 'Google API Call' },
      ]
    }
  ],
  ja: [
    {
      value: 'gummy',
      label: 'クラウド / アリババクラウド / Gummy',
      languages: [
        { value: 'auto', type: -1, label: '自動検出' },
        { value: 'en', type: 0, label: '英語' },
        { value: 'zh', type: 0, label: '中国語' },
        { value: 'ja', type: 0, label: '日本語' },
        { value: 'ko', type: 0, label: '韓国語' },
        { value: 'de', type: -1, label: 'ドイツ語' },
        { value: 'fr', type: -1, label: 'フランス語' },
        { value: 'ru', type: -1, label: 'ロシア語' },
        { value: 'es', type: -1, label: 'スペイン語' },
        { value: 'it', type: -1, label: 'イタリア語' },
        { value: 'yue', type: -1, label: '広東語' },
      ]
    },
    {
      value: 'vosk',
      label: 'ローカル / Vosk',
      languages: [
        { value: 'en', type: 0, label: '英語' },
        { value: 'zh-cn', type: 0, label: '中国語' },
        { value: 'ja', type: 0, label: '日本語' },
        { value: 'ko', type: 0, label: '韓国語' },
        { value: 'de', type: 0, label: 'ドイツ語' },
        { value: 'fr', type: 0, label: 'フランス語' },
        { value: 'ru', type: 0, label: 'ロシア語' },
        { value: 'es', type: 0, label: 'スペイン語' },
        { value: 'it', type: 0, label: 'イタリア語' },
      ],
      transModel: [
        // 翻訳モデルは現在 Google API 呼び出しのみ対応。Ollama / OpenAI 互換モデルの選択肢は一時的に無効化
        // { value: 'ollama', label: 'Ollama モデルまたは OpenAI 互換モデル' },
        { value: 'google', label: 'Google API 呼び出し' },
      ]
    },
    {
      value: 'sosv',
      label: 'ローカル / SOSV',
      languages: [
        { value: 'auto', type: -1, label: '自動検出' },
        { value: 'en', type: 0, label: '英語' },
        { value: 'zh-cn', type: 0, label: '中国語' },
        { value: 'ja', type: 0, label: '日本語' },
        { value: 'ko', type: 0, label: '韓国語' },
        { value: 'yue', type: -1, label: '広東語' },
        { value: 'de', type: 1, label: 'ドイツ語' },
        { value: 'fr', type: 1, label: 'フランス語' },
        { value: 'ru', type: 1, label: 'ロシア語' },
        { value: 'es', type: 1, label: 'スペイン語' },
        { value: 'it', type: 1, label: 'イタリア語' },
      ],
      transModel: [
        // 翻訳モデルは現在 Google API 呼び出しのみ対応。Ollama / OpenAI 互換モデルの選択肢は一時的に無効化
        // { value: 'ollama', label: 'Ollama モデルまたは OpenAI 互換モデル' },
        { value: 'google', label: 'Google API 呼び出し' },
      ]
    }
  ]
}
