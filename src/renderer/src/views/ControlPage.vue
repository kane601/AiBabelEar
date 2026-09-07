<template>
  <a-config-provider :theme="antdTheme">
    <div class="control-container">
      <a-tabs
        v-model:activeKey="activeKey"
        tab-position="left"
        class="settings-tabs"
      >
        <a-tab-pane key="engine" :tab="$t('engine.title')" force-render>
          <div class="tab-pane-body">
            <div class="settings-panel">
              <EngineControl />
            </div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="style" :tab="$t('style.title')" force-render>
          <div class="tab-pane-body style-pane">
            <div class="settings-panel">
              <CaptionStyle />
            </div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="transStyle" :tab="$t('style.trans.title')" force-render>
          <div class="tab-pane-body">
            <div class="settings-panel">
              <TransStyle />
            </div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="captionLog" :tab="$t('log.title')" force-render>
          <div class="tab-pane-body caption-data-pane">
            <div class="settings-panel log-panel">
              <CaptionLog />
            </div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="general" :tab="$t('general.title')" force-render>
          <div class="tab-pane-body">
            <div class="settings-panel">
              <GeneralSetting />
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import GeneralSetting from '../components/GeneralSetting.vue'
import CaptionStyle from '../components/CaptionStyle.vue'
import TransStyle from '../components/TransStyle.vue'
import EngineControl from '../components/EngineControl.vue'
import CaptionLog from '../components/CaptionLog.vue'
import { storeToRefs } from 'pinia'
import { useGeneralSettingStore } from '@renderer/stores/generalSetting'
import { ref } from 'vue'

const generalSettingStore = useGeneralSettingStore()
const { antdTheme } = storeToRefs(generalSettingStore)

const activeKey = ref('engine')
</script>

<style scoped>
.control-container {
  height: 100vh;
  overflow: hidden;
  background-color: var(--control-background);
}

.settings-tabs {
  height: 100%;
}

.settings-tabs :deep(.ant-tabs-nav) {
  width: 176px;
  min-width: 176px;
  padding: 16px 0 12px;
  margin: 0 !important;
  flex-shrink: 0;
}

.settings-tabs :deep(.ant-tabs-nav::before) {
  border: none !important;
}

.settings-tabs :deep(.ant-tabs-nav-list) {
  width: 100%;
  padding: 0 8px;
  box-sizing: border-box;
}

.settings-tabs :deep(.ant-tabs-tab) {
  padding: 10px 16px !important;
  margin: 0 0 6px 0 !important;
  justify-content: flex-start;
  border-radius: 6px;
  white-space: nowrap;
}

.settings-tabs :deep(.ant-tabs-tab + .ant-tabs-tab) {
  margin-top: 0 !important;
}

.settings-tabs :deep(.ant-tabs-ink-bar) {
  display: none;
}

.settings-tabs :deep(.ant-tabs-tab-active) {
  background: rgba(22, 119, 255, 0.08);
}

.settings-tabs :deep(.ant-tabs-content-holder) {
  flex: 1;
  min-width: 0;
  min-height: 0;
  margin: 0 !important;
  padding: 0 !important;
  border-left: 1px solid rgba(5, 5, 5, 0.06);
  overflow: hidden;
}

.settings-tabs :deep(.ant-tabs-content) {
  height: 100%;
  width: 100%;
  margin: 0 !important;
}

.settings-tabs :deep(.ant-tabs-tabpane) {
  height: 100%;
  width: 100%;
  outline: none;
  padding: 0 !important;
}

.tab-pane-body {
  height: 100%;
  width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

/* 字幕样式页：收紧间距，配合窗口高度一屏展示 */
.style-pane {
  padding: 12px 16px;
}

.style-pane :deep(.input-item) {
  margin: 6px 0;
}

.style-pane :deep(.ant-card-head) {
  min-height: 36px;
  padding: 0 12px;
}

.style-pane :deep(.ant-card-body) {
  padding: 10px 12px;
}

.tab-pane-body::-webkit-scrollbar {
  width: 6px;
}

.tab-pane-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.settings-panel {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
}

.caption-data-pane {
  padding: 16px;
  overflow-y: hidden;
}

.log-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
