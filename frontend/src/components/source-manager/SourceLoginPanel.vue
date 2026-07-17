<template>
  <div class="source-login-container" @click.self="$emit('close')">
    <section class="source-login-modal" role="dialog" aria-modal="true" aria-labelledby="source-login-title">
      <header class="source-login-header">
        <div class="source-login-heading">
          <div class="source-login-title-row">
            <h3 id="source-login-title">{{ title || '书源登录' }}</h3>
            <span class="login-status" :class="{ active: loggedIn }">
              {{ loggedIn ? '已登录' : '未登录' }}
            </span>
          </div>
          <p>{{ sourceUrl }}</p>
        </div>
        <button class="close-btn" type="button" title="关闭" aria-label="关闭书源登录" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div v-if="messages.length" class="login-messages" role="status">
        <p v-for="(message, index) in messages" :key="`${index}-${message}`">{{ message }}</p>
      </div>

      <a
        v-if="openUrl"
        class="login-open-link"
        :href="openUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        打开书源页面
      </a>

      <div class="source-login-controls">
        <template v-for="(item, index) in items" :key="`${index}-${item.name}`">
          <div
            v-if="isButton(item)"
            class="login-control-button"
            :class="{ divider: !item.action?.trim() }"
            :style="getControlStyle(item)"
          >
            <button
              v-if="item.action?.trim()"
              type="button"
              :disabled="loading"
              @click="$emit('action', { action: item.action, name: item.name })"
            >
              {{ loading && activeAction === item.action ? '处理中…' : item.name }}
            </button>
            <div v-else class="login-section-label">{{ item.name }}</div>
          </div>

          <label v-else class="login-field" :for="`source-login-field-${index}`">
            <span>{{ item.name }}</span>
            <textarea
              v-if="normalizeInputType(item.type) === 'textarea'"
              :id="`source-login-field-${index}`"
              :value="fieldValue(item.name)"
              rows="3"
              autocomplete="off"
              @input="updateField(item.name, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <input
              v-else-if="normalizeInputType(item.type) === 'checkbox'"
              :id="`source-login-field-${index}`"
              type="checkbox"
              :checked="isChecked(fieldValue(item.name))"
              @change="updateField(item.name, String(($event.target as HTMLInputElement).checked))"
            />
            <input
              v-else
              :id="`source-login-field-${index}`"
              :type="normalizeInputType(item.type)"
              :value="fieldValue(item.name)"
              :autocomplete="normalizeInputType(item.type) === 'password' ? 'current-password' : 'off'"
              @input="updateField(item.name, ($event.target as HTMLInputElement).value)"
            />
          </label>
        </template>
      </div>

      <footer class="source-login-footer">
        <span>输入内容会在点击操作按钮时保存；密码不会持久化。</span>
        <button type="button" @click="$emit('close')">完成</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { BookSourceLoginUiItem } from '../../api/source'

const props = defineProps<{
  title: string
  sourceUrl: string
  items: BookSourceLoginUiItem[]
  modelValue: Record<string, string>
  loggedIn: boolean
  loading: boolean
  activeAction: string
  messages: string[]
  openUrl: string
}>()

const emit = defineEmits<{
  close: []
  action: [payload: { action: string; name: string }]
  'update:modelValue': [value: Record<string, string>]
}>()

function isButton(item: BookSourceLoginUiItem) {
  return item.type.trim().toLowerCase() === 'button'
}

function normalizeInputType(type: string) {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'password' || normalized === 'email' || normalized === 'number'
    || normalized === 'url' || normalized === 'tel' || normalized === 'search'
    || normalized === 'textarea' || normalized === 'checkbox') {
    return normalized
  }
  return 'text'
}

function fieldValue(name: string) {
  return props.modelValue[name] ?? ''
}

function updateField(name: string, value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    [name]: value,
  })
}

function isChecked(value: string) {
  return value === 'true' || value === '1'
}

function getControlStyle(item: BookSourceLoginUiItem): Record<string, string> {
  const style = item.style
  const rawBasis = style?.layout_flexBasisPercent ?? style?.layoutFlexBasisPercent
  const rawGrow = style?.layout_flexGrow ?? style?.layoutFlexGrow
  const basis = toFiniteNumber(rawBasis)
  const grow = toFiniteNumber(rawGrow)
  return {
    '--login-basis': basis === null ? 'auto' : `${Math.min(1, Math.max(0.1, basis)) * 100}%`,
    '--login-grow': grow === null ? '1' : String(Math.max(0, grow)),
  }
}

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
</script>

<style scoped>
.source-login-container {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    calc(24px + var(--safe-area-top))
    calc(24px + var(--safe-area-right))
    calc(24px + var(--safe-area-bottom))
    calc(24px + var(--safe-area-left));
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(3px);
}

.source-login-modal {
  width: min(720px, 100%);
  height: min(86vh, 860px);
  max-height: calc(var(--app-height, 100dvh) - var(--safe-area-top) - var(--safe-area-bottom) - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-xl);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-xl);
}

.source-login-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border-light);
}

.source-login-heading {
  min-width: 0;
}

.source-login-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.source-login-title-row h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.source-login-heading p {
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-status {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--color-bg-hover);
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.login-status.active {
  background: rgba(82, 196, 26, 0.14);
  color: #389e0d;
}

.close-btn {
  width: 36px;
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
}

.close-btn:hover {
  background: var(--color-bg-hover);
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

.login-messages {
  max-height: 150px;
  overflow-y: auto;
  margin: 14px 18px 0;
  padding: 10px 12px;
  border: 1px solid var(--color-primary-border);
  border-radius: var(--radius-md);
  background: var(--color-primary-bg);
  color: var(--color-text-secondary);
  font-size: 13px;
  white-space: pre-wrap;
}

.login-messages p {
  margin: 0;
}

.login-messages p + p {
  margin-top: 6px;
}

.login-open-link {
  align-self: flex-start;
  margin: 10px 18px 0;
  padding: 8px 12px;
  border: 1px solid var(--color-primary-border);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.login-open-link:hover {
  background: var(--color-primary-bg);
}

.source-login-controls {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 10px;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.login-field {
  flex: 1 0 100%;
  min-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.login-field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.login-field input:not([type='checkbox']),
.login-field textarea {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.login-field textarea {
  resize: vertical;
}

.login-field input:focus,
.login-field textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-bg);
}

.login-field input[type='checkbox'] {
  width: 20px;
  height: 20px;
}

.login-control-button {
  flex: var(--login-grow, 1) 1 var(--login-basis, auto);
  min-width: min(190px, 100%);
}

.login-control-button button,
.login-section-label {
  width: 100%;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.login-control-button button {
  background: var(--color-bg);
  color: var(--color-text);
  transition: background var(--duration-fast), border-color var(--duration-fast);
}

.login-control-button button:hover:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.login-control-button button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.login-control-button.divider {
  min-width: 100%;
}

.login-section-label {
  display: flex;
  align-items: center;
  justify-content: center;
  border-color: var(--color-border-light);
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  font-weight: 650;
  text-align: center;
}

.source-login-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 18px;
  border-top: 1px solid var(--color-border-light);
}

.source-login-footer span {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.source-login-footer button {
  min-width: 76px;
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}

@media (max-width: 520px) {
  .source-login-container {
    align-items: stretch;
    padding:
      calc(8px + var(--safe-area-top))
      calc(8px + var(--safe-area-right))
      calc(8px + var(--safe-area-bottom))
      calc(8px + var(--safe-area-left));
  }

  .source-login-modal {
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 20px;
  }

  .source-login-header {
    padding: 14px;
  }

  .source-login-controls {
    gap: 8px;
    padding: 14px;
  }

  .login-control-button {
    min-width: calc(50% - 4px);
  }

  .login-control-button.divider {
    min-width: 100%;
  }

  .source-login-footer {
    padding: 10px 14px;
  }
}

@media (max-width: 360px) {
  .login-control-button {
    min-width: 100%;
  }
}
</style>
