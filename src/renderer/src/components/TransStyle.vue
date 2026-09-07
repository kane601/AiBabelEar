<template>
  <a-card size="small" :title="$t('style.trans.title')">
    <template #extra>
      <a @click="useSameStyle">{{ $t('style.trans.useSame') }}</a> |
      <a @click="cancelStyle">{{ $t('style.cancelChange') }}</a>
    </template>

    <div class="input-item">
      <span class="input-label">{{ $t('style.translation') }}</span>
      <a-switch v-model:checked="currentTransDisplay" />
    </div>

    <div class="input-item">
      <span class="input-label">{{ $t('style.fontFamily') }}</span>
      <a-input
        class="input-area"
        v-model:value="currentTransFontFamily"
        :disabled="!currentTransDisplay"
      />
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.fontColor') }}</span>
      <a-input
        class="input-area"
        type="color"
        v-model:value="currentTransFontColor"
        :disabled="!currentTransDisplay"
      />
      <div class="input-item-value">{{ currentTransFontColor }}</div>
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.fontSize') }}</span>
      <a-slider
        class="input-area"
        :min="0" :max="72"
        v-model:value="currentTransFontSize"
        :disabled="!currentTransDisplay"
      />
      <div class="input-item-value">{{ currentTransFontSize }}px</div>
    </div>
    <div class="input-item">
      <span class="input-label">{{ $t('style.fontWeight') }}</span>
      <a-slider
        class="input-area"
        :min="1" :max="9"
        v-model:value="currentTransFontWeight"
        :disabled="!currentTransDisplay"
      />
      <div class="input-item-value">{{ currentTransFontWeight * 100 }}</div>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useCaptionStyleStore } from '@renderer/stores/captionStyle'
import { storeToRefs } from 'pinia'

const captionStyle = useCaptionStyleStore()
const { changeSignal } = storeToRefs(captionStyle)

const currentTransDisplay = ref(true)
const currentTransFontFamily = ref('sans-serif')
const currentTransFontSize = ref(24)
const currentTransFontColor = ref('#000000')
const currentTransFontWeight = ref(4)

let syncingFromStore = false
let styleSnapshot: Record<string, unknown> | null = null

onMounted(() => {
  loadFromStore()
  saveSnapshot()
})

function useSameStyle() {
  currentTransFontFamily.value = captionStyle.fontFamily
  currentTransFontSize.value = captionStyle.fontSize
  currentTransFontColor.value = captionStyle.fontColor
  currentTransFontWeight.value = captionStyle.fontWeight
}

function applyToCaptionWindow() {
  captionStyle.transDisplay = currentTransDisplay.value
  captionStyle.transFontFamily = currentTransFontFamily.value
  captionStyle.transFontSize = currentTransFontSize.value
  captionStyle.transFontColor = currentTransFontColor.value
  captionStyle.transFontWeight = currentTransFontWeight.value
  captionStyle.sendStylesChange()
}

function loadFromStore() {
  syncingFromStore = true
  currentTransDisplay.value = captionStyle.transDisplay
  currentTransFontFamily.value = captionStyle.transFontFamily
  currentTransFontSize.value = captionStyle.transFontSize
  currentTransFontColor.value = captionStyle.transFontColor
  currentTransFontWeight.value = captionStyle.transFontWeight
  syncingFromStore = false
}

function saveSnapshot() {
  styleSnapshot = {
    transDisplay: currentTransDisplay.value,
    transFontFamily: currentTransFontFamily.value,
    transFontSize: currentTransFontSize.value,
    transFontColor: currentTransFontColor.value,
    transFontWeight: currentTransFontWeight.value
  }
}

function cancelStyle() {
  if (!styleSnapshot) return
  syncingFromStore = true
  currentTransDisplay.value = styleSnapshot.transDisplay as boolean
  currentTransFontFamily.value = styleSnapshot.transFontFamily as string
  currentTransFontSize.value = styleSnapshot.transFontSize as number
  currentTransFontColor.value = styleSnapshot.transFontColor as string
  currentTransFontWeight.value = styleSnapshot.transFontWeight as number
  syncingFromStore = false
  applyToCaptionWindow()
}

watch(
  [
    currentTransDisplay,
    currentTransFontFamily,
    currentTransFontSize,
    currentTransFontColor,
    currentTransFontWeight
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
  }
})
</script>

<style scoped>
@import url(../assets/input.css);
</style>
