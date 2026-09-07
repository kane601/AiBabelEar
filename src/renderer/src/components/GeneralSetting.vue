<template>
  <a-card size="small" :title="$t('general.title')">
    <template #extra>
      <a-popover>
        <template #content>
          <p class="general-note">{{ $t('general.note') }}</p>
        </template>
        <a><InfoCircleOutlined /></a>
      </a-popover>
    </template>

    <div>
      <div class="input-item">
        <span class="input-label">{{ $t('general.uiLanguage') }}</span>
        <a-select
          class="input-area"
          v-model:value="uiLanguage"
          :options="languageOptions"
        />
      </div>

      <div class="input-item">
        <span class="input-label">{{ $t('general.theme') }}</span>
        <a-select
          class="input-area"
          v-model:value="uiTheme"
          :options="themeOptions"
        />
      </div>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeneralSettingStore } from '@renderer/stores/generalSetting'
import { InfoCircleOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const generalSettingStore = useGeneralSettingStore()
const { uiLanguage, uiTheme } = storeToRefs(generalSettingStore)

const languageOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' }
]

const themeOptions = computed(() => [
  { value: 'system', label: t('general.system') },
  { value: 'light', label: t('general.light') },
  { value: 'dark', label: t('general.dark') }
])
</script>

<style scoped>
@import url(../assets/input.css);

.general-note {
  padding: 10px 10px 0;
  max-width: min(36vw, 400px);
}
</style>
