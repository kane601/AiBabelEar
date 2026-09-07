<template>
  <div
    class="caption-page"
    ref="caption"
    :class="{ idle: !bgActive }"
    @mousemove="showBackground"
    @mouseleave="scheduleHide"
    @pointerdown="onCaptionPointerDown"
    @pointermove="onCaptionPointerMove"
    @pointerup="onCaptionPointerUp"
    @pointercancel="onCaptionPointerUp"
    :style="{
      backgroundColor: bgActive ? captionStyle.backgroundRGBA : idleBg
    }"
  >
    <div class="top-bar" :style="{ color: captionStyle.fontColor }">
      <div class="option-item" @pointerdown.stop @click="pinCaptionWindow">
        <PushpinFilled v-if="pinned" />
        <PushpinOutlined v-else />
      </div>
      <div
        class="option-item"
        @pointerdown.stop
        @click="toggleCaptionEngine"
        :title="engineEnabled ? $t('engine.stopEngine') : $t('engine.startEngine')"
      >
        <PauseCircleOutlined v-if="engineEnabled" />
        <PlayCircleOutlined v-else />
      </div>
      <div class="option-item" @pointerdown.stop @click="openControlWindow">
        <SettingOutlined />
      </div>
      <div class="option-item" @pointerdown.stop @click="closeCaptionWindow">
        <CloseOutlined />
      </div>
    </div>

    <div
      class="caption-container"
      :style="{
        textShadow: captionStyle.textShadow ? `${captionStyle.offsetX}px ${captionStyle.offsetY}px ${captionStyle.blur}px ${captionStyle.textShadowColor}` : 'none'
      }"
    >
      <template v-if="captionData.length">
        <template
          v-for="val in revArr[Math.min(captionStyle.lineNumber, captionData.length)]"
          :key="captionData[captionData.length - val].time_s"
        >
          <p :class="[captionStyle.lineBreak?'':'left-ellipsis']" :style="{
            fontFamily: captionStyle.fontFamily,
            fontSize: captionStyle.fontSize + 'px',
            color: captionStyle.fontColor,
            fontWeight: captionStyle.fontWeight * 100
          }">
            <span>{{ captionData[captionData.length - val].text }}</span>
          </p>
          <p :class="[captionStyle.lineBreak?'':'left-ellipsis']"
            v-if="captionStyle.transDisplay && captionData[captionData.length - val].translation"
            :style="{
            fontFamily: captionStyle.transFontFamily,
            fontSize: captionStyle.transFontSize + 'px',
            color: captionStyle.transFontColor,
            fontWeight: captionStyle.transFontWeight * 100
          }">
            <span>{{ captionData[captionData.length - val].translation }}</span>
          </p>
        </template>
      </template>
      <template v-else>
        <template v-for="val in captionStyle.lineNumber" :key="val">
          <p :class="[captionStyle.lineBreak?'':'left-ellipsis']" :style="{
            fontFamily: captionStyle.fontFamily,
            fontSize: captionStyle.fontSize + 'px',
            color: captionStyle.fontColor,
            fontWeight: captionStyle.fontWeight * 100
          }">
            <span>{{ $t('example.original') }}</span>
          </p>
          <p :class="[captionStyle.lineBreak?'':'left-ellipsis']"
            v-if="captionStyle.transDisplay"
            :style="{
            fontFamily: captionStyle.transFontFamily,
            fontSize: captionStyle.transFontSize + 'px',
            color: captionStyle.transFontColor,
            fontWeight: captionStyle.transFontWeight * 100
          }">
            <span>{{ $t('example.translation') }}</span>
          </p>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PushpinOutlined, PushpinFilled, CloseOutlined, SettingOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons-vue';
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useCaptionStyleStore } from '@renderer/stores/captionStyle';
import { useCaptionLogStore } from '@renderer/stores/captionLog';
import { useEngineControlStore } from '@renderer/stores/engineControl';
import { storeToRefs } from 'pinia';

const revArr = {
  1: [1],
  2: [2, 1],
  3: [3, 2, 1],
  4: [4, 3, 2, 1],
}

const captionStyle = useCaptionStyleStore();
const captionLog = useCaptionLogStore();
const { captionData } = storeToRefs(captionLog);
const engineControl = useEngineControlStore();
const { engineEnabled } = storeToRefs(engineControl);
const caption = ref();
const windowHeight = ref(100);
const pinned = ref(false);

// QQ音乐歌词式效果：启动短暂显示背景，随后淡出为透明（仅显示文字）；
// 鼠标悬停时背景与标题栏浮现，移开后再淡出。
const bgActive = ref(true)
let idleTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_DELAY = 4000   // 启动后多少毫秒淡出背景
const HIDE_DELAY = 400    // 鼠标移开后多少毫秒淡出背景

function showBackground() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  bgActive.value = true
}

function scheduleHide() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { bgActive.value = false }, HIDE_DELAY)
}

function startIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { bgActive.value = false }, IDLE_DELAY)
}

// 空闲（淡出）时的背景：保留一个极低 alpha 的淡色底，而非纯透明。
// 原因：Electron 在 Windows 上对 transparent 窗口的“完全透明像素”会穿透到桌面，
// 鼠标移到透明区域时事件被下层窗口吃掉，hover 无法命中、背景再也回不来。
// 极低 alpha（约 5%）视觉上几乎不可见（仅显字幕），但 OS 仍视窗口像素为不透明，可正常 hover。
function withAlpha(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6) return hex
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, '0')
  return `#${h}${a}`
}
// 空闲淡底需要足够 alpha：Windows 透明窗口的透明像素会被 OS 穿透、收不到鼠标事件，
// 必须保留一层足以命中且不穿透的淡色底（仅鼠标进入窗口那一刻需要它，之后背景变实即稳定）。
const idleBg = computed(() => withAlpha(captionStyle.background, 0.3))

onMounted(() => {
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if(windowHeight.value !== Math.floor(entry.contentRect.height) + 2) {
        windowHeight.value = Math.floor(entry.contentRect.height) + 2;
        window.electron.ipcRenderer.send('caption.windowHeight.change', windowHeight.value)
      }
    }
  });
  if (caption.value) {
    resizeObserver.observe(caption.value);
  }
  startIdleTimer()
});

onUnmounted(() => {
  if (idleTimer) clearTimeout(idleTimer)
});

function pinCaptionWindow() {
  pinned.value = !pinned.value;
  window.electron.ipcRenderer.send('caption.mouseEvents.ignore', pinned.value)
}

function openControlWindow() {
  window.electron.ipcRenderer.send('caption.controlWindow.activate')
}

// 在顶部 start/stop 按钮：控制实时字幕引擎的启停（与设置页共用 control.engine.start/stop）
function toggleCaptionEngine() {
  window.electron.ipcRenderer.send(
    engineEnabled.value ? 'control.engine.stop' : 'control.engine.start'
  )
}

function closeCaptionWindow() {
  window.electron.ipcRenderer.send('caption.window.close')
}

// 窗口拖动：用 JS 指针事件实现（setPointerCapture 保证移出窗口仍跟随），
// 避免 -webkit-app-region: drag 吞掉 hover 所需的 mousemove 事件。
let dragging = false
let dragStartX = 0
let dragStartY = 0
function onCaptionPointerDown(e: PointerEvent) {
  dragging = true
  dragStartX = e.screenX
  dragStartY = e.screenY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.electron.ipcRenderer.send('caption.drag.start')
}
function onCaptionPointerMove(e: PointerEvent) {
  if (!dragging) return
  window.electron.ipcRenderer.send('caption.drag.move', {
    dx: e.screenX - dragStartX,
    dy: e.screenY - dragStartY
  })
}
function onCaptionPointerUp(e: PointerEvent) {
  dragging = false
  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
}
</script>

<style scoped>
.caption-page {
  width: 100%;
  user-select: none;
  border-radius: 8px;
  box-sizing: border-box;
  border: 1px solid transparent;
  transition: background-color 0.4s ease, border-color 0.4s ease;
  display: flex;
  flex-direction: column;
}

.caption-page:not(.idle) {
  border-color: #3333;
}

.top-bar {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  transition: opacity 0.4s ease;
}

.caption-page.idle .top-bar {
  opacity: 0;
  pointer-events: none;
}

.caption-container {
  display: block;
  width: 100%;
  padding-top: 10px;
  padding-bottom: 10px;
}

.caption-container p {
  text-align: center;
  margin: 0;
  line-height: 1.6em;
}

.left-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  direction: rtl;
  text-align: left;
}

.left-ellipsis > span {
  direction: ltr;
  display: inline-block;
}

.option-item {
  width: 32px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.option-item:hover {
  background-color: #2221;
}
</style>
