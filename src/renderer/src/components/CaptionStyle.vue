<template>
  <a-card size="small" :title="$t('style.title')">
    <template #extra>
      <a @click="cancelStyle">{{ $t('style.cancelChange') }}</a> |
      <a @click="resetStyle">{{ $t('style.resetStyle') }}</a>
    </template>

    <div class="input-item">
      <span class="input-label">{{ $t('style.lineNumber') }}</span>
      <a-radio-group v-model:value="currentLineNumber">
        <a-radio-button :value="1">1</a-radio-button>
        <a-radio-button :value="2">2</a-radio-button>
        <a-radio-button :value="3">3</a-radio-button>
        <a-radio-button :value="4">4</a-radio-button>
      </a-radio-group>
    </div>

    <div class="input-item">
      <span class="input-label">{{ $t('style.longCaption') }}</span>
      <a-select
        class="input-area"
        v-model:value="currentLineBreak"
        :options="captionStyle.iBreakOptions"
      ></a-select>
    </div>

    <div class="input-item">
      <span class="input-label">{{ $t('style.fontFamily') }}</span>
      <a-input
        class="input-area"
        v-model:value="currentFontFamily"
      />
    </div>

    <div class="input-item">
      <span class="input-label">{{ $t('style.fontColor') }}</span>
      <a-input
        class="input-area"
        type="color"
        v-model:value="currentFontColor"
      />
      <div class="input-item-value">{{ currentFontColor }}</div>
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.fontSize') }}</span>
      <a-slider
        class="input-area"
        :min="0" :max="72"
        v-model:value="currentFontSize"
      />
      <div class="input-item-value">{{ currentFontSize }}px</div>
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.fontWeight') }}</span>
      <a-slider
        class="input-area"
        :min="1" :max="9"
        v-model:value="currentFontWeight"
      />
      <div class="input-item-value">{{ currentFontWeight * 100 }}</div>
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.background') }}</span>
      <a-input
        class="input-area"
        type="color"
        v-model:value="currentBackground"
      />
      <div class="input-item-value">{{ currentBackground }}</div>
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.opacity') }}</span>
      <a-slider
        class="input-area"
        :min="0"
        :max="100"
        v-model:value="currentOpacity"
      />
      <div class="input-item-value">{{ currentOpacity }}%</div>
    </div>

    <div class="input-item">
      <span class="input-label">{{ $t('style.textShadow') }}</span>
      <a-switch v-model:checked="currentTextShadow" />
    </div>

    <div v-show="currentTextShadow" class="shadow-block">
      <a-card size="small" :title="$t('style.shadow.title')">
        <div class="input-item">
          <span class="input-label">{{ $t('style.shadow.offsetX') }}</span>
          <a-slider
            class="input-area"
            :min="-10" :max="10"
            v-model:value="currentOffsetX"
          />
          <div class="input-item-value">{{ currentOffsetX }}px</div>
        </div>
        <div class="input-item">
          <span class="input-label">{{ $t('style.shadow.offsetY') }}</span>
          <a-slider
            class="input-area"
            :min="-10" :max="10"
            v-model:value="currentOffsetY"
          />
          <div class="input-item-value">{{ currentOffsetY }}px</div>
        </div>
        <div class="input-item">
          <span class="input-label">{{ $t('style.shadow.blur') }}</span>
          <a-slider
            class="input-area"
            :min="0" :max="12"
            v-model:value="currentBlur"
          />
          <div class="input-item-value">{{ currentBlur }}px</div>
        </div>
        <div class="input-item">
          <span class="input-label">{{ $t('style.shadow.color') }}</span>
          <a-input
            class="input-area"
            type="color"
            v-model:value="currentTextShadowColor"
          />
          <div class="input-item-value">{{ currentTextShadowColor }}</div>
        </div>
      </a-card>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useCaptionStyleStore } from '@renderer/stores/captionStyle'
import { storeToRefs } from 'pinia'

const captionStyle = useCaptionStyleStore()
const { changeSignal } = storeToRefs(captionStyle)

const currentLineNumber = ref<number>(1)
const currentLineBreak = ref<number>(0)
const currentFontFamily = ref<string>('sans-serif')
const currentFontSize = ref<number>(24)
const currentFontColor = ref<string>('#000000')
const currentFontWeight = ref<number>(4)
const currentBackground = ref<string>('#dbe2ef')
const currentOpacity = ref<number>(50)
const currentTextShadow = ref<boolean>(false)
const currentOffsetX = ref<number>(2)
const currentOffsetY = ref<number>(2)
const currentBlur = ref<number>(0)
const currentTextShadowColor = ref<string>('#ffffff')

let syncingFromStore = false
let styleSnapshot: Record<string, unknown> | null = null

onMounted(() => {
  loadFromStore()
  saveSnapshot()
})

function applyToCaptionWindow() {
  captionStyle.lineNumber = currentLineNumber.value
  captionStyle.lineBreak = currentLineBreak.value
  captionStyle.fontFamily = currentFontFamily.value
  captionStyle.fontSize = currentFontSize.value
  captionStyle.fontColor = currentFontColor.value
  captionStyle.fontWeight = currentFontWeight.value
  captionStyle.background = currentBackground.value
  captionStyle.opacity = currentOpacity.value
  captionStyle.showPreview = false
  captionStyle.textShadow = currentTextShadow.value
  captionStyle.offsetX = currentOffsetX.value
  captionStyle.offsetY = currentOffsetY.value
  captionStyle.blur = currentBlur.value
  captionStyle.textShadowColor = currentTextShadowColor.value
  captionStyle.sendStylesChange()
}

function loadFromStore() {
  syncingFromStore = true
  currentLineNumber.value = captionStyle.lineNumber
  currentLineBreak.value = captionStyle.lineBreak
  currentFontFamily.value = captionStyle.fontFamily
  currentFontSize.value = captionStyle.fontSize
  currentFontColor.value = captionStyle.fontColor
  currentFontWeight.value = captionStyle.fontWeight
  currentBackground.value = captionStyle.background
  currentOpacity.value = captionStyle.opacity
  currentTextShadow.value = captionStyle.textShadow
  currentOffsetX.value = captionStyle.offsetX
  currentOffsetY.value = captionStyle.offsetY
  currentBlur.value = captionStyle.blur
  currentTextShadowColor.value = captionStyle.textShadowColor
  syncingFromStore = false
}

function saveSnapshot() {
  styleSnapshot = {
    lineNumber: currentLineNumber.value,
    lineBreak: currentLineBreak.value,
    fontFamily: currentFontFamily.value,
    fontSize: currentFontSize.value,
    fontColor: currentFontColor.value,
    fontWeight: currentFontWeight.value,
    background: currentBackground.value,
    opacity: currentOpacity.value,
    textShadow: currentTextShadow.value,
    offsetX: currentOffsetX.value,
    offsetY: currentOffsetY.value,
    blur: currentBlur.value,
    textShadowColor: currentTextShadowColor.value
  }
}

function cancelStyle() {
  if (!styleSnapshot) return
  syncingFromStore = true
  currentLineNumber.value = styleSnapshot.lineNumber as number
  currentLineBreak.value = styleSnapshot.lineBreak as number
  currentFontFamily.value = styleSnapshot.fontFamily as string
  currentFontSize.value = styleSnapshot.fontSize as number
  currentFontColor.value = styleSnapshot.fontColor as string
  currentFontWeight.value = styleSnapshot.fontWeight as number
  currentBackground.value = styleSnapshot.background as string
  currentOpacity.value = styleSnapshot.opacity as number
  currentTextShadow.value = styleSnapshot.textShadow as boolean
  currentOffsetX.value = styleSnapshot.offsetX as number
  currentOffsetY.value = styleSnapshot.offsetY as number
  currentBlur.value = styleSnapshot.blur as number
  currentTextShadowColor.value = styleSnapshot.textShadowColor as string
  syncingFromStore = false
  applyToCaptionWindow()
}

function resetStyle() {
  captionStyle.sendStylesReset()
}

watch(
  [
    currentLineNumber,
    currentLineBreak,
    currentFontFamily,
    currentFontSize,
    currentFontColor,
    currentFontWeight,
    currentBackground,
    currentOpacity,
    currentTextShadow,
    currentOffsetX,
    currentOffsetY,
    currentBlur,
    currentTextShadowColor
  ],
  () => {
    if (syncingFromStore) return
    applyToCaptionWindow()
  }
)

watch(changeSignal, (val) => {
  if (val === true) {
    loadFromStore()
    saveSnapshot()
    nextTick(() => {
      captionStyle.changeSignal = false
    })
  }
})
</script>

<style scoped>
@import url(../assets/input.css);

.shadow-block {
  margin-top: 8px;
}

.input-item {
  margin: 6px 0;
}
</style>
