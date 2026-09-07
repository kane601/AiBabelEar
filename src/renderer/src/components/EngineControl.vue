<template>
  <div class="engine-page">
    <a-card size="small" :title="$t('engine.title')">
      <template #extra>
        <a @click="applyChange">{{ $t('engine.applyChange') }}</a> |
        <a @click="cancelChange">{{ $t('engine.cancelChange') }}</a>
      </template>
      <div class="input-item">
        <span class="input-label">{{ $t('engine.captionEngine') }}</span>
        <a-select
          class="input-area"
          v-model:value="currentEngine"
          :options="captionEngine"
        ></a-select>
      </div>
      <div class="input-item">
        <span class="input-label">{{ $t('engine.sourceLang') }}</span>
        <a-select
          :disabled="sLangList.length === 0"
          class="input-area"
          v-model:value="currentSourceLang"
          :options="sLangList"
        >
          <template #option="{ value, label }">
            <span>{{ label }}</span>
            <template v-if="currentEngine === 'vosk' && value">
              <CheckCircleFilled v-if="voskReadyByLang[value]" :style="{ color: '#52c41a', marginLeft: '8px' }" />
              <CloseCircleFilled v-else :style="{ color: '#bfbfbf', marginLeft: '8px' }" />
            </template>
          </template>
        </a-select>
      </div>
      <div class="input-item">
        <span class="input-label">{{ $t('engine.enableTranslation') }}</span>
        <a-switch v-model:checked="currentTranslation" />
      </div>
      <div class="input-item">
        <span class="input-label">{{ $t('engine.transLang') }}</span>
        <a-select
          class="input-area"
          :disabled="!currentTranslation"
          v-model:value="currentTargetLang"
          :options="tLangList"
        ></a-select>
      </div>
      <div class="input-item" v-if="transModel">
        <span class="input-label">{{ $t('engine.transModel') }}</span>
        <a-select
          class="input-area"
          :disabled="!currentTranslation"
          v-model:value="currentTransModel"
          :options="transModel"
        ></a-select>
      </div>
      <div class="input-item" v-if="transModel && currentTransModel === 'ollama'">
        <a-popover placement="right">
          <template #content>
            <p class="label-hover-info">{{ $t('engine.modelNameNote') }}</p>
          </template>
          <span class="input-label info-label"
            :style="{color: uiColor}"
          >{{ $t('engine.modelName') }}</span>
        </a-popover>
        <a-input
          class="input-area"
          :disabled="!currentTranslation"
          v-model:value="currentOllamaName"
        ></a-input>
      </div>
      <div class="input-item" v-if="transModel && currentTransModel === 'ollama'">
        <a-popover placement="right">
          <template #content>
            <p class="label-hover-info">{{ $t('engine.baseURL') }}</p>
          </template>
          <span class="input-label info-label"
            :style="{color: uiColor}"
          >Base URL</span>
        </a-popover>
        <a-input
          class="input-area"
          :disabled="!currentTranslation"
          v-model:value="currentOllamaUrl"
          placeholder="http://localhost:11434"
        ></a-input>
      </div>
      <div class="input-item" v-if="transModel && currentTransModel === 'ollama'">
        <a-popover placement="right">
          <template #content>
            <p class="label-hover-info">{{ $t('engine.apiKey') }}</p>
          </template>
          <span class="input-label info-label"
            :style="{color: uiColor}"
          >API Key</span>
        </a-popover>
        <a-input
            class="input-area"
            type="password"
            :disabled="!currentTranslation"
            v-model:value="currentOllamaApiKey"
        />
      </div>
      <div class="input-item" v-if="currentEngine === 'glm'">
        <span class="input-label">GLM API URL</span>
        <a-input
          class="input-area"
          v-model:value="currentGlmUrl"
          placeholder="https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"
        ></a-input>
      </div>
      <div class="input-item" v-if="currentEngine === 'glm'">
        <span class="input-label">GLM Model Name</span>
        <a-input
          class="input-area"
          v-model:value="currentGlmModel"
          placeholder="glm-asr-2512"
        ></a-input>
      </div>
      <div class="input-item" v-if="currentEngine === 'gummy'">
        <a-popover placement="right">
          <template #content>
            <p class="label-hover-info">{{ $t('engine.apikeyInfo') }}</p>
            <p><a href="https://bailian.console.aliyun.com" target="_blank">
              https://bailian.console.aliyun.com
            </a></p>
          </template>
          <span class="input-label info-label"
            :style="{color: uiColor}"
          >ALI {{ $t('engine.apikey') }}</span>
        </a-popover>
        <a-input
          class="input-area"
          type="password"
          v-model:value="currentAPI_KEY"
        />
      </div>
    </a-card>

    <a-card size="small" class="engine-page-card" :title="$t('engine.device')">
      <div class="input-item">
        <span class="input-label">{{ $t('engine.audioSource') }}</span>
        <a-select
          class="input-area"
          v-model:value="currentAudioSource"
          :options="audioSourceOptions"
          :placeholder="$t('engine.audioSource')"
        ></a-select>
      </div>
      <div class="input-item">
        <span class="input-label">{{ $t('engine.enableRecording') }}</span>
        <a-switch v-model:checked="currentRecording" />
      </div>
    </a-card>

    <a-card
      v-if="isLocalEngine"
      size="small"
      class="engine-page-card"
      :title="$t('engine.modelManager')"
    >
      <p class="label-hover-info model-manager-desc">{{ $t(currentEngine === 'sosv' ? 'engine.modelManagerDescSosv' : 'engine.modelManagerDescVosk') }}</p>
      <div
        v-for="m in modelList"
        :key="m.id"
        class="model-row"
        :class="{ active: isCurrentModel(m), selectable: isSelectable(m) }"
        @click="onRowClick(m)"
      >
        <div class="model-info">
          <div class="model-title-row">
            <span class="model-name">{{ m.name }}</span>
            <a-tag v-if="m.recommended" color="gold" class="model-recommend">{{ $t('engine.modelRecommended') }}</a-tag>
          </div>
          <span class="model-size" v-if="m.size">{{ $t('engine.modelSize') }}: {{ m.size }}</span>
        </div>
        <div class="model-action">
          <template v-if="modelProg[m.id] && (modelProg[m.id].status === 'downloading' || modelProg[m.id].status === 'extracting')">
            <a-progress
              v-if="modelProg[m.id].status === 'downloading'"
              :percent="Math.round((modelProg[m.id].percent || 0) * 100)"
              size="small"
              style="width:150px;"
            />
            <span v-else class="model-status">{{ $t('engine.modelExtracting') }}</span>
          </template>
          <template v-else-if="m.path">
            <CheckCircleFilled :style="okIconStyle" />
            <a-tag v-if="isCurrentModel(m)" color="success" class="model-used-tag">{{ $t('engine.modelUsed') }}</a-tag>
          </template>
          <template v-else-if="modelProg[m.id] && modelProg[m.id].status === 'error'">
            <a-tag color="error">{{ $t('engine.modelFailed') }}</a-tag>
            <a @click="downloadModel(m)">{{ $t('engine.modelRetry') }}</a>
          </template>
          <template v-else>
            <a @click="downloadModel(m)">{{ $t('engine.modelDownloadBtn') }}</a>
          </template>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, h, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeneralSettingStore } from '@renderer/stores/generalSetting'
import { useEngineControlStore } from '@renderer/stores/engineControl'
import { notification } from 'ant-design-vue'
import { ExclamationCircleOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const engineControl = useEngineControlStore()
const { captionEngine, changeSignal } = storeToRefs(engineControl)

const generalSetting = useGeneralSettingStore()
const { uiColor } = storeToRefs(generalSetting)

// 模型“已下载/已使用”状态：绿色图标（与 Vosk 多语言模型下载成功状态一致）
const okIconStyle = { color: '#52c41a', fontSize: '16px', marginRight: '4px', verticalAlign: 'middle' }

const currentSourceLang = ref('auto')
const currentTargetLang = ref('zh')
const currentEngine = ref<string>('sosv')
const currentAudioSource = ref<string>('system')
const currentTranslation = ref<boolean>(true)
const currentRecording = ref<boolean>(false)
const currentTransModel = ref('google')
const currentOllamaName = ref('')
const currentOllamaUrl = ref('')
const currentOllamaApiKey = ref('')
const currentAPI_KEY = ref<string>('')
const currentVoskModelPath = ref<string>('')
const currentSosvModelPath = ref<string>('')
const currentGlmUrl = ref<string>('')
const currentGlmModel = ref<string>('')
const currentGlmApiKey = ref<string>('')
const currentRecordingPath = ref<string>('')
const currentStartTimeoutSeconds = ref<number>(30)

// 本地模型引擎（vosk / sosv）才需要下载模型；云端 API 引擎（gummy / glm）不需要。
const isLocalEngine = computed(() => currentEngine.value === 'vosk' || currentEngine.value === 'sosv')

interface ModelItem {
  id: string
  engine: string
  name: string
  lang?: string
  url: string
  size?: string
  recommended?: boolean
  path: string | null
}
interface ModelProg {
  status: 'downloading' | 'extracting' | 'error'
  percent?: number
  received?: number
  total?: number
  error?: string
  path?: string
}

// 当前引擎可下载的模型列表及其安装状态
const modelList = ref<ModelItem[]>([])
// 各模型的实时下载进度（仅下载期间存在）
const modelProg = ref<Record<string, ModelProg>>({})

function refreshModels() {
  if (!isLocalEngine.value) {
    modelList.value = []
    return
  }
  window.electron.ipcRenderer
    .invoke('control.models.list', currentEngine.value)
    .then((list: ModelItem[] | undefined) => {
      modelList.value = list || []
    })
    .catch(() => {
      modelList.value = []
    })
}

function downloadModel(m: ModelItem) {
  modelProg.value = { ...modelProg.value, [m.id]: { status: 'downloading', percent: 0 } }
  window.electron.ipcRenderer.send('control.model.download', { engine: m.engine, id: m.id })
}

// 将该模型路径填入对应字段（Vosk/SOSV），需点「应用更改」后方生效。
function useModel(m: ModelItem) {
  if (m.engine === 'vosk') currentVoskModelPath.value = m.path || ''
  else currentSosvModelPath.value = m.path || ''
  notification.open({
    message: t('engine.modelManager'),
    description: t('noti.modelSelected')
  })
}

function isCurrentModel(m: ModelItem): boolean {
  if (m.engine === 'vosk') return !!m.path && currentVoskModelPath.value === m.path
  return !!m.path && currentSosvModelPath.value === m.path
}

// 仅 SOSV 已下载且非当前模型 才允许点击整行切换（Vosk 模型由下拉框选择，不在列表中切换）
function isSelectable(m: ModelItem): boolean {
  return m.engine === 'sosv' && !!m.path && !isCurrentModel(m)
}

// 「使用」交互改进：由点击小段“使用”文字 改为点击整行即可切换模型（卡片式单选）
function onRowClick(m: ModelItem) {
  if (isSelectable(m)) useModel(m)
}

function onModelProgress(_: unknown, p: ModelProg & { id: string }) {
  modelProg.value = { ...modelProg.value, [p.id]: { ...modelProg.value[p.id], ...p } }
}

function onModelDone(_: unknown, p: ModelProg & { id: string; success?: boolean; engine?: string }) {
  modelProg.value = { ...modelProg.value, [p.id]: { ...modelProg.value[p.id], ...p } }
  if (p.success) {
    modelList.value = modelList.value.map((m) => (m.id === p.id ? { ...m, path: p.path || null } : m))
    notification.open({
      message: t('noti.modelDownloadSuccess'),
      description: `${t('noti.modelDownloadSuccessInfo')}${p.path}`
    })
  } else {
    notification.open({
      message: t('noti.modelDownloadError'),
      description: t('noti.modelDownloadErrorInfo')
    })
  }
}

// Vosk 各语言模型是否已下载：直接依据下方“模型下载列表”的同一数据源（modelList）推导，
// 保证下拉框语言状态与下载列表完全一致。{ langCode: boolean }
const voskReadyByLang = computed<Record<string, boolean>>(() => {
  const map: Record<string, boolean> = {}
  for (const m of modelList.value) {
    if (m.lang) map[m.lang] = !!m.path
  }
  return map
})

// 音频采集设备列表（麦克风 + 系统输出回环），供统一选择器使用
const audioDevices = ref<{ index: number, name: string, isLoopback?: boolean, kind?: 'microphone' | 'loopback' }[]>([])

function refreshAudioDevices() {
  window.electron.ipcRenderer
    .invoke('control.audio.devices')
    .then((devices: { index: number, name: string, isLoopback?: boolean, kind?: 'microphone' | 'loopback' }[] | undefined) => {
      audioDevices.value = devices || []
    })
    .catch(() => {
      audioDevices.value = []
    })
}

// 统一的音频采集来源选择器：
//   - 顶部固定项：系统扬声器（默认输出）
//   - 麦克风输入分组：所有真实麦克风（含外接摄像头/USB 麦克风）
//   - 系统音频输出（回环）分组：所有可采集的系统输出回环设备
const audioSourceOptions = computed(() => {
  const opts: any[] = [
    { value: 'system', label: t('engine.audioSourceSpeaker') }
  ]
  const mics = audioDevices.value.filter(d => d.kind !== 'loopback')
  const loops = audioDevices.value.filter(d => d.kind === 'loopback')
  if (mics.length) {
    opts.push({
      label: t('engine.audioSourceMicGroup'),
      options: mics.map(d => ({ value: `dev:${d.index}`, label: d.name }))
    })
  }
  if (loops.length) {
    opts.push({
      label: t('engine.audioSourceLoopbackGroup'),
      options: loops.map(d => ({ value: `dev:${d.index}`, label: d.name }))
    })
  }
  // 若当前保存的来源（指定设备）在列表中已不存在（如更换设备/平台），仍然保留该选项，避免选中态丢失
  if (currentAudioSource.value.startsWith('dev:')) {
    const idx = currentAudioSource.value.slice(4)
    const exists = audioDevices.value.some(d => String(d.index) === idx)
    if (!exists) {
      opts.push({ value: currentAudioSource.value, label: `${t('engine.audioDevice')} #${idx}` })
    }
  }
  return opts
})

onMounted(() => {
  cancelChange()
  refreshAudioDevices()
  refreshModels()
  window.electron.ipcRenderer.on('control.model.progress', onModelProgress)
  window.electron.ipcRenderer.on('control.model.done', onModelDone)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('control.model.progress', onModelProgress)
  window.electron.ipcRenderer.removeListener('control.model.done', onModelDone)
})

const sLangList = computed(() => {
  for(let item of captionEngine.value){
    if(item.value === currentEngine.value) {
      return item.languages.filter(item => item.type <= 0)
    }
  }
  return []
})

const tLangList = computed(() => {
  for(let item of captionEngine.value){
    if(item.value === currentEngine.value) {
      return item.languages.filter(item => item.type >= 0)
    }
  }
  return []
})

const transModel = computed(() => {
  for(let item of captionEngine.value){
    if(item.value === currentEngine.value) {
      return item.transModel
    }
  }
  return []
})

function applyChange(){
  if(
    currentTranslation.value && transModel.value &&
    currentTransModel.value === 'ollama' && !currentOllamaName.value.trim()
  ) {
    notification.open({
      message: t('noti.ollamaNameNull'),
      description: t('noti.ollamaNameNullNote'),
      duration: null,
      icon: () => h(ExclamationCircleOutlined, { style: 'color: #ff4d4f' })
    })
    return
  }

  engineControl.sourceLang = currentSourceLang.value
  engineControl.targetLang = currentTargetLang.value
  engineControl.transModel = currentTransModel.value
  engineControl.ollamaName = currentOllamaName.value
  engineControl.engine = currentEngine.value
  engineControl.ollamaUrl = currentOllamaUrl.value ?? "http://localhost:11434"
  engineControl.ollamaApiKey = currentOllamaApiKey.value
  engineControl.audioSource = currentAudioSource.value
  engineControl.translation = currentTranslation.value
  engineControl.recording = currentRecording.value
  engineControl.API_KEY = currentAPI_KEY.value
  engineControl.voskModelPath = currentVoskModelPath.value
  engineControl.sosvModelPath = currentSosvModelPath.value
  engineControl.glmUrl = currentGlmUrl.value ?? "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"
  engineControl.glmModel = currentGlmModel.value ?? "glm-asr-2512"
  engineControl.glmApiKey = currentGlmApiKey.value
  engineControl.recordingPath = currentRecordingPath.value
  engineControl.startTimeoutSeconds = currentStartTimeoutSeconds.value

  engineControl.sendControlsChange()
  refreshModels()
  window.electron.ipcRenderer.send('control.engine.restart')

  notification.open({
    placement: 'topLeft',
    message: t('noti.engineChange'),
    description: t('noti.changeInfo')
  });
}

function cancelChange(){
  currentSourceLang.value = engineControl.sourceLang
  currentTargetLang.value = engineControl.targetLang
  currentTransModel.value = engineControl.transModel
  currentOllamaName.value = engineControl.ollamaName
  currentOllamaUrl.value = engineControl.ollamaUrl
  currentOllamaApiKey.value = engineControl.ollamaApiKey
  currentEngine.value = engineControl.engine
  currentAudioSource.value = engineControl.audioSource
  currentTranslation.value = engineControl.translation
  currentRecording.value = engineControl.recording
  currentAPI_KEY.value = engineControl.API_KEY
  currentVoskModelPath.value = engineControl.voskModelPath
  currentSosvModelPath.value = engineControl.sosvModelPath
  currentGlmUrl.value = engineControl.glmUrl
  currentGlmModel.value = engineControl.glmModel
  currentGlmApiKey.value = engineControl.glmApiKey
  currentRecordingPath.value = engineControl.recordingPath
  currentStartTimeoutSeconds.value = engineControl.startTimeoutSeconds
  normalizeSourceLang()
}

// Vosk 已移除“auto”选项，确保选中语言始终为有效项：
// 若当前值不在可选列表中（如旧配置残留的 'auto'），则优先选第一个已下载的语言，否则选第一个。
function normalizeSourceLang() {
  if (currentEngine.value !== 'vosk') return
  const opts = sLangList.value
  if (!opts.length) return
  if (opts.some((l) => l.value === currentSourceLang.value)) return
  const downloaded = opts.find((l) => voskReadyByLang.value[l.value])
  currentSourceLang.value = (downloaded?.value) || opts[0].value
}

watch(changeSignal, (val) => {
  if(val == true) {
    cancelChange();
    engineControl.changeSignal = false;
  }
})

watch(currentEngine, (val) => {
  if(val == 'vosk'){
    currentTargetLang.value = useGeneralSettingStore().uiLanguage
    if(currentTargetLang.value === 'zh') {
      currentTargetLang.value = 'zh-cn'
    }
    normalizeSourceLang()
  }
  else{
    currentSourceLang.value = 'auto'
    currentTargetLang.value = useGeneralSettingStore().uiLanguage
  }
  // 切换到本地模型引擎（vosk/sosv）时，刷新可下载模型列表与状态
  refreshModels()
})

// 引擎配置（captionEngine）异步加载完成后，若当前为 Vosk 且选中语言无效，则纠正默认选择
watch(sLangList, () => {
  if (currentEngine.value === 'vosk') normalizeSourceLang()
})

// Vosk 模型路径变化时实时刷新下载列表与状态标记
watch(currentVoskModelPath, () => {
  refreshModels()
})

// 切换音频采集来源时，若切换到指定设备且列表尚未加载，则拉取设备列表
watch(currentAudioSource, (val) => {
  if (val.startsWith('dev:') && audioDevices.value.length === 0) refreshAudioDevices()
})

// 主进程推送配置（control.controls.set）后 engineControl.voskModelPath 才被赋值，
// 此时需重新拉取模型列表，否则初始会一直显示"未下载"。
watch(() => engineControl.voskModelPath, () => {
  refreshModels()
})
</script>

<style scoped>
@import url(../assets/input.css);

.engine-page-card {
  margin-top: 12px;
}

.label-hover-info {
  margin-top: 10px;
  max-width: min(36vw, 380px);
}

/* 模型下载卡片里的说明文案：用满卡片宽度，避免在 380px 处被强行换行 */
.model-manager-desc {
  max-width: 100%;
}

.info-label {
  cursor: pointer;
  font-style: italic;
}

.input-folder {
  display:inline-block;
  width: 40px;
  font-size:1.38em;
  cursor: pointer;
  transition: all 0.25s;
}

.input-folder:hover {
  transform: scale(1.1);
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  border-radius: 6px;
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}
.model-row:last-child {
  border-bottom: none;
}
.model-row.selectable {
  cursor: pointer;
}
.model-row.selectable:hover {
  background-color: #f5f5f5;
}
.model-row.active {
  background-color: #e6f4ff;
  box-shadow: inset 0 0 0 1px #91caff;
}
.model-used-tag {
  margin-left: 4px;
}
.model-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.model-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.model-name {
  font-weight: 600;
}
.model-recommend {
  margin-inline-end: 0;
}
.model-size {
  font-size: 12px;
  color: #8c8c8c;
}
.model-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
  justify-content: flex-end;
}
.model-status {
  color: #8c8c8c;
}
</style>
