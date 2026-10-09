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
    <div class="top-bar" :style="{ color: barColor }">
      <div
        class="option-item"
        @pointerdown.stop
        @click="toggleLock"
        :title="locked ? $t('caption.unlock') : $t('caption.lock')"
      >
        <LockFilled v-if="locked" />
        <UnlockOutlined v-else />
      </div>
      <div
        class="option-item"
        :class="{ 'locked-item': locked }"
        @pointerdown.stop
        @click="toggleCaptionEngine"
        :title="engineEnabled ? $t('engine.stopEngine') : $t('engine.startEngine')"
      >
        <PauseCircleOutlined v-if="engineEnabled" />
        <PlayCircleOutlined v-else />
      </div>
      <div
        class="option-item"
        :class="{ 'locked-item': locked }"
        @pointerdown.stop
        @click="openControlWindow"
      >
        <SettingOutlined />
      </div>
      <div
        class="option-item"
        :class="{ 'locked-item': locked }"
        @pointerdown.stop
        @click="closeCaptionWindow"
      >
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
            v-if="captionStyle.transDisplay && translation"
            :style="{
            fontFamily: captionStyle.transFontFamily,
            fontSize: captionStyle.transFontSize + 'px',
            color: captionStyle.transFontColor,
            fontWeight: captionStyle.transFontWeight * 100
          }">
            <span>{{ captionData[captionData.length - val].translation || NBSP }}</span>
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
            v-if="captionStyle.transDisplay && translation"
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
import { CloseOutlined, SettingOutlined, PlayCircleOutlined, PauseCircleOutlined, LockFilled, UnlockOutlined } from '@ant-design/icons-vue';
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
const { engineEnabled, translation } = storeToRefs(engineControl);
const caption = ref();
const windowHeight = ref(100);
// 翻译尚未返回（或该条无翻译）时的占位内容。
// 用不间断空格撑起行高，保证翻译行始终占位，避免窗口高度在有无翻译之间来回抖动。
const NBSP = '\u00A0';
// 锁定窗口：锁定后禁止拖拽与其它按钮操作，窗口固定在该位置显示
const locked = ref(false);

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
// 空闲时的底：压到极低 alpha（约 1.5%），视觉上基本全透明，只剩字幕文字。
// 为什么不能设为 0：Windows 上分层窗口 alpha 为 0 的像素不参与命中测试，
// 鼠标事件会穿透到下层窗口，hover 再也唤不回背景与顶栏。
// 而 alpha 只要 >= 1/255 即可命中，故取 ~1.5% 兼顾「几乎隐形」与「可靠接收鼠标事件」。
const IDLE_BG_ALPHA = 0.015
const idleBg = computed(() => withAlpha(captionStyle.background, IDLE_BG_ALPHA))

// 顶栏按钮图标颜色：与字幕文字颜色解耦（否则调整字幕配色会连带改变按钮外观）。
// 按钮仅在 hover 时可见，此时背景为字幕背景色，因此按背景明暗自动选取黑/白，
// 无论用户把字幕背景配成浅色还是深色都能清晰可读。
const barColor = computed(() => {
  const hex = captionStyle.background.replace('#', '')
  if (hex.length !== 6) return '#000000'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#000000'
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 128 ? '#000000' : '#ffffff'
})

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
  if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = 0 }
});

// 锁定/解锁字幕窗口。锁定按钮本身始终可点（否则无法解锁），
// 其余按钮与拖拽均在 locked 时失效。
function toggleLock() {
  locked.value = !locked.value;
  window.electron.ipcRenderer.send('caption.lock', locked.value)
}

function openControlWindow() {
  if (locked.value) return
  window.electron.ipcRenderer.send('caption.controlWindow.activate')
}

// 在顶部 start/stop 按钮：控制实时字幕引擎的启停（与设置页共用 control.engine.start/stop）
function toggleCaptionEngine() {
  if (locked.value) return
  window.electron.ipcRenderer.send(
    engineEnabled.value ? 'control.engine.stop' : 'control.engine.start'
  )
}

function closeCaptionWindow() {
  if (locked.value) return
  window.electron.ipcRenderer.send('caption.window.close')
}

// 窗口拖动：用 JS 指针事件实现（setPointerCapture 保证移出窗口仍跟随），
// 避免 -webkit-app-region: drag 吞掉 hover 所需的 mousemove 事件。
// pointermove 用 rAF 节流：每帧最多发一次 IPC，避免高频 native 窗口操作
// 放大 Windows 上 DIP 换算取整误差导致的尺寸漂移。
let dragging = false
let dragStartX = 0
let dragStartY = 0
let dragRafId = 0
let dragLastDx = 0
let dragLastDy = 0
function onCaptionPointerDown(e: PointerEvent) {
  // 锁定状态下禁止拖拽：不进入拖拽态、不抓取指针、不通知主进程记录起点
  if (locked.value) return
  dragging = true
  dragStartX = e.screenX
  dragStartY = e.screenY
  dragLastDx = 0
  dragLastDy = 0
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.electron.ipcRenderer.send('caption.drag.start')
}
function onCaptionPointerMove(e: PointerEvent) {
  if (!dragging) return
  dragLastDx = e.screenX - dragStartX
  dragLastDy = e.screenY - dragStartY
  if (dragRafId) return
  dragRafId = requestAnimationFrame(() => {
    dragRafId = 0
    if (!dragging) return
    window.electron.ipcRenderer.send('caption.drag.move', {
      dx: dragLastDx,
      dy: dragLastDy
    })
  })
}
function onCaptionPointerUp(e: PointerEvent) {
  dragging = false
  if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = 0 }
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

/* 锁定后其它按钮彻底失效。
   用 pointer-events: none 在 DOM 层直接阻断鼠标事件：
   元素根本收不到 pointerdown/click/hover，比单纯在 JS 里 return 更可靠，
   也不依赖任何运行时状态判断的正确性。 */
.option-item.locked-item {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}
</style>
