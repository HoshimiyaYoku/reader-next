<template>
  <section class="background-card">
    <div class="background-head">
      <div>
        <h4>自定义主题背景</h4>
        <p>
          同一账号多端同步，本机保留离线缓存
          <span class="sync-status" :data-state="store.readerBackgroundSyncState">{{ syncLabel }}</span>
        </p>
      </div>
      <div class="background-actions">
        <label class="option-button upload-button" :class="{ disabled: uploading }">
          {{ uploading ? '处理中…' : (store.readerBackgroundUrl ? '更换图片' : '上传图片') }}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            :disabled="uploading"
            @change="uploadBackground"
          >
        </label>
        <button v-if="store.readerBackgroundUrl" class="option-button danger" :disabled="uploading" @click="clearBackground">清除</button>
      </div>
    </div>

    <div
      v-if="store.readerBackgroundUrl"
      class="background-preview"
      :style="previewStyle"
      aria-label="主界面背景预览"
    ><span>主界面预览</span></div>
    <div v-else class="background-empty">支持 JPG、PNG、WebP、AVIF，原图不超过 15MB</div>

    <template v-if="store.readerBackgroundUrl">
      <div class="scope-row">
        <span>使用位置</span>
        <div class="button-group">
          <button
            class="option-button"
            :class="{ active: store.readerBackgroundConfig.enabled }"
            :disabled="uploading"
            @click="toggleSetting('enabled')"
          >主界面</button>
          <button
            class="option-button"
            :class="{ active: store.readerBackgroundConfig.readerEnabled }"
            :disabled="uploading"
            @click="toggleSetting('readerEnabled')"
          >正文阅读</button>
        </div>
      </div>
      <p class="readability-warning">正文背景默认关闭；图片颜色复杂时可能降低文字可读性，可按需单独开启。</p>

      <div class="setting-row">
        <span>适配方式</span>
        <div class="button-group">
          <button class="option-button" :class="{ active: store.readerBackgroundConfig.fit === 'cover' }" :disabled="uploading" @click="store.updateReaderBackgroundConfig('fit', 'cover')">铺满屏幕</button>
          <button class="option-button" :class="{ active: store.readerBackgroundConfig.fit === 'contain' }" :disabled="uploading" @click="store.updateReaderBackgroundConfig('fit', 'contain')">完整显示</button>
        </div>
      </div>
      <div class="setting-row">
        <span>焦点位置</span>
        <div class="button-group">
          <button v-for="position in positions" :key="position.value" class="option-button" :class="{ active: store.readerBackgroundConfig.position === position.value }" :disabled="uploading" @click="store.updateReaderBackgroundConfig('position', position.value)">{{ position.label }}</button>
        </div>
      </div>
      <label class="overlay-row">
        <span>背景遮罩</span>
        <input
          type="range"
          min="0"
          max="0.9"
          step="0.05"
          :disabled="uploading"
          :value="store.readerBackgroundConfig.overlay"
          @input="store.updateReaderBackgroundConfig('overlay', Number(($event.target as HTMLInputElement).value))"
        >
        <code>{{ Math.round(store.readerBackgroundConfig.overlay * 100) }}%</code>
      </label>
      <p class="background-hint">图片会等比缩放；可调整适配、焦点和遮罩来兼顾手机与电脑显示。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useReaderStore, type ReaderBackgroundPosition } from '../stores/reader'
import { prepareReaderBackground } from '../utils/readerBackground'

const appStore = useAppStore()
const store = useReaderStore()
const uploading = ref(false)
const positions: Array<{ value: ReaderBackgroundPosition; label: string }> = [
  { value: 'top', label: '顶部' },
  { value: 'center', label: '中央' },
  { value: 'bottom', label: '底部' },
]

const syncLabel = computed(() => ({
  loading: '检查同步中',
  synced: '已同步',
  pending: '等待联网同步',
  local: '同步暂不可用',
}[store.readerBackgroundSyncState]))

function colorWithAlpha(color: string, alpha: number) {
  const normalized = color.trim().replace(/^#/, '')
  const hex = normalized.length === 3
    ? normalized.split('').map((item) => `${item}${item}`).join('')
    : normalized
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`
}

const previewStyle = computed(() => {
  const background = store.readerBackgroundConfig
  const color = store.currentTheme.body
  const overlay = colorWithAlpha(color, background.overlay)
  return {
    backgroundColor: color,
    backgroundImage: `linear-gradient(${overlay}, ${overlay}), url("${store.readerBackgroundUrl}")`,
    backgroundPosition: `center ${background.position}`,
    backgroundSize: background.fit,
    backgroundRepeat: 'no-repeat',
    color: store.currentTheme.fontColor,
  }
})

function toggleSetting(key: 'enabled' | 'readerEnabled') {
  store.updateReaderBackgroundConfig(key, !store.readerBackgroundConfig[key])
}

async function uploadBackground(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploading.value) return
  uploading.value = true
  try {
    const image = await prepareReaderBackground(file)
    await store.setReaderBackgroundImage(image)
    appStore.showToast(
      store.readerBackgroundSyncState === 'synced' ? '主题背景已保存并同步' : '背景已保存在本机，联网后会自动同步',
      store.readerBackgroundSyncState === 'synced' ? 'success' : 'warning',
    )
  } catch (error) {
    appStore.showToast((error as Error).message || '背景图片处理失败', 'warning')
  } finally {
    uploading.value = false
  }
}

async function clearBackground() {
  if (!window.confirm('清除自定义背景？此操作会同步到其他设备。')) return
  try {
    await store.clearReaderBackgroundImage()
    appStore.showToast(
      store.readerBackgroundSyncState === 'synced' ? '主题背景已清除并同步' : '背景已在本机清除，联网后会同步',
      store.readerBackgroundSyncState === 'synced' ? 'success' : 'warning',
    )
  } catch (error) {
    appStore.showToast((error as Error).message || '背景图片清除失败', 'error')
  }
}
</script>

<style scoped>
.background-card {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl, 14px);
  background: color-mix(in srgb, var(--color-bg-elevated) 88%, transparent);
}

.background-head,
.scope-row,
.setting-row,
.overlay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h4 { margin: 0 0 4px; font-size: 14px; }
p { margin: 0; }
.background-head p, .background-hint { font-size: 11px; color: var(--color-text-tertiary); }
.sync-status { margin-left: 6px; color: var(--color-primary); }
.sync-status[data-state='pending'], .sync-status[data-state='local'] { color: #c27a16; }
.background-actions, .button-group { display: flex; flex-wrap: wrap; gap: 6px; }
.background-actions { justify-content: flex-end; }

.option-button {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  font-size: 12px;
}
.option-button.active { color: white; border-color: var(--color-primary); background: var(--color-primary); }
.option-button:disabled, .upload-button.disabled { opacity: .55; cursor: wait; }
.upload-button { display: inline-flex; align-items: center; cursor: pointer; }
.upload-button input { display: none; }
.option-button.danger { color: var(--color-danger, #c43d3d); }

.background-preview, .background-empty {
  height: 128px;
  margin-top: 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-sizing: border-box;
}
.background-preview { display: grid; place-items: center; overflow: hidden; font-size: 18px; font-weight: 650; text-shadow: 0 1px 3px rgba(0,0,0,.28); }
.background-empty { display: grid; place-items: center; padding: 12px; color: var(--color-text-tertiary); font-size: 12px; text-align: center; }
.scope-row, .setting-row, .overlay-row { margin-top: 12px; font-size: 13px; }
.scope-row > span, .setting-row > span, .overlay-row > span { flex-shrink: 0; color: var(--color-text-secondary); }
.readability-warning { margin-top: 8px; color: #b36a0b; font-size: 11px; line-height: 1.5; }
.overlay-row input { flex: 1; min-width: 80px; accent-color: var(--color-primary); }
.overlay-row code { width: 38px; text-align: right; font-size: 11px; }
.background-hint { margin-top: 10px; line-height: 1.5; }

@media (max-width: 420px) {
  .background-head, .scope-row, .setting-row { align-items: flex-start; flex-direction: column; }
  .background-actions { justify-content: flex-start; }
}
</style>
