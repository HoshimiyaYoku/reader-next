<template>
  <div class="review-panel">
    <div class="review-header">
      <h3>审查清单</h3>
      <span class="count-badge" :class="reviewItems.length ? 'warning' : 'success'">
        {{ reviewItems.length }} 项待审查
      </span>
    </div>

    <div v-if="reviewItems.length === 0" class="empty-state">暂无需要审查的项目</div>

    <div v-else class="review-list">
      <div
        v-for="item in sortedItems"
        :key="item.id"
        class="review-item"
        :class="`severity-${item.severity.toLowerCase()}`"
      >
        <div class="item-header">
          <span class="pill" :class="`severity-pill-${item.severity.toLowerCase()}`">
            {{ getSeverityLabel(item.severity) }}
          </span>
          <span class="pill">{{ getItemTypeLabel(item.item_type) }}</span>
          <span class="confidence">置信度 {{ (item.confidence * 100).toFixed(0) }}%</span>
        </div>

        <div class="item-body">
          <p class="issue">{{ item.issue }}</p>

          <div v-if="item.involved_entities.length" class="row">
            <span class="label">涉及实体</span>
            <span v-for="entityId in item.involved_entities" :key="entityId" class="entity-tag">
              {{ getEntityName(entityId) }}
            </span>
          </div>

          <div v-if="item.ai_suggestion" class="suggestion">
            <span class="label">AI 建议</span>
            <p>{{ item.ai_suggestion }}</p>
          </div>

          <div class="evidence">
            <span class="label">证据</span>
            <p>
              {{ item.evidence.quote }}
              <span v-if="item.evidence.chapter" class="chapter-ref">（第 {{ item.evidence.chapter }} 章）</span>
            </p>
          </div>
        </div>

        <div class="item-actions">
          <button class="btn success" :disabled="loading" @click="handleAccept(item)">采纳</button>
          <button class="btn" :disabled="loading" @click="handleEdit">修正</button>
          <button class="btn muted" :disabled="loading" @click="handleSkip(item)">跳过</button>
        </div>
      </div>
    </div>

    <div v-if="reviewItems.length" class="review-footer">
      预计审查时间：{{ estimatedTime }} 分钟
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../stores/app'
import { useWorldMapStore } from '../stores/worldMapStore'
import type { ReviewItemType, ReviewSeverity, WorldMapReviewItem } from '../types/worldMap'

const props = defineProps<{
  bookUrl: string
}>()

const worldMapStore = useWorldMapStore()
const appStore = useAppStore()
const { reviewItems, spec, loading } = storeToRefs(worldMapStore)

const sortedItems = computed(() => {
  const severityOrder: Record<ReviewSeverity, number> = { High: 0, Medium: 1, Low: 2 }
  return [...reviewItems.value].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
})

const estimatedTime = computed(() => {
  return reviewItems.value.reduce((sum, item) => sum + item.estimated_review_time_minutes, 0)
})

function getEntityName(entityId: string): string {
  return spec.value?.entities.find((entity) => entity.id === entityId)?.canonical_name || entityId
}

function getSeverityLabel(severity: ReviewSeverity): string {
  const labels: Record<ReviewSeverity, string> = { High: '高', Medium: '中', Low: '低' }
  return labels[severity]
}

function getItemTypeLabel(type: ReviewItemType): string {
  const labels: Record<ReviewItemType, string> = {
    Conflict: '冲突',
    UncertainPosition: '位置不确定',
    CriticalError: '严重错误',
  }
  return labels[type]
}

async function handleAccept(item: WorldMapReviewItem) {
  try {
    await worldMapStore.resolveItem(props.bookUrl, item.id, 'accept')
    appStore.showToast('已采纳 AI 建议')
  } catch {
    appStore.showToast('操作失败', 'error')
  }
}

function handleEdit() {
  appStore.showToast('手动修正功能开发中', 'warning')
}

async function handleSkip(item: WorldMapReviewItem) {
  try {
    await worldMapStore.resolveItem(props.bookUrl, item.id, 'skip')
    appStore.showToast('已跳过此项', 'warning')
  } catch {
    appStore.showToast('操作失败', 'error')
  }
}
</script>

<style scoped>
.review-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color, #e5e7eb);
}

.review-header h3 {
  margin: 0;
  font-size: 16px;
}

.count-badge,
.pill,
.entity-tag {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
}

.count-badge.warning { background: #fffbeb; color: #b45309; }
.count-badge.success { background: #ecfdf5; color: #047857; }

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.review-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.review-item {
  border: 1px solid var(--el-border-color, #e5e7eb);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.review-item.severity-high { border-left: 4px solid #f59e0b; }
.review-item.severity-medium { border-left: 4px solid #2563eb; }
.review-item.severity-low { border-left: 4px solid #6b7280; }

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.severity-pill-high { background: #fffbeb; color: #b45309; }
.severity-pill-medium { background: #eff6ff; color: #1d4ed8; }
.severity-pill-low { background: #f3f4f6; color: #4b5563; }

.confidence {
  margin-left: auto;
  font-size: 12px;
  color: #6b7280;
}

.issue {
  font-weight: 600;
  margin: 0 0 10px;
  color: #111827;
}

.row,
.suggestion,
.evidence {
  margin-bottom: 10px;
  font-size: 13px;
}

.label {
  display: inline-block;
  color: #6b7280;
  margin-right: 8px;
  min-width: 52px;
}

.entity-tag {
  display: inline-flex;
  margin-right: 4px;
  margin-bottom: 4px;
}

.suggestion p,
.evidence p {
  margin: 6px 0 0;
  padding: 8px;
  border-left: 3px solid #2563eb;
  background: #eff6ff;
  line-height: 1.45;
}

.chapter-ref {
  color: #6b7280;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}

.btn.success {
  border-color: #10b981;
  color: #047857;
  background: #ecfdf5;
}

.btn.muted {
  color: #6b7280;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.review-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color, #e5e7eb);
  color: #6b7280;
  font-size: 12px;
}
</style>
