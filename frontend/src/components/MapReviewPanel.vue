<template>
  <div class="review-panel">
    <div class="review-header">
      <h3>审查清单</h3>
      <el-tag :type="reviewItems.length > 0 ? 'warning' : 'success'">
        {{ reviewItems.length }} 项待审查
      </el-tag>
    </div>

    <div v-if="reviewItems.length === 0" class="empty-state">
      <el-empty description="暂无需要审查的项目" />
    </div>

    <div v-else class="review-list">
      <div
        v-for="item in sortedItems"
        :key="item.id"
        class="review-item"
        :class="`severity-${item.severity.toLowerCase()}`"
      >
        <div class="item-header">
          <el-tag
            :type="getSeverityType(item.severity)"
            size="small"
          >
            {{ getSeverityLabel(item.severity) }}
          </el-tag>
          <el-tag size="small" class="ml-2">
            {{ getItemTypeLabel(item.item_type) }}
          </el-tag>
          <span class="confidence">
            置信度: {{ (item.confidence * 100).toFixed(0) }}%
          </span>
        </div>

        <div class="item-body">
          <p class="issue">{{ item.issue }}</p>
          
          <div v-if="item.involved_entities.length > 0" class="involved-entities">
            <span class="label">涉及实体:</span>
            <el-tag
              v-for="entityId in item.involved_entities"
              :key="entityId"
              size="small"
              class="entity-tag"
            >
              {{ getEntityName(entityId) }}
            </el-tag>
          </div>

          <div v-if="item.ai_suggestion" class="ai-suggestion">
            <span class="label">AI 建议:</span>
            <p>{{ item.ai_suggestion }}</p>
          </div>

          <div class="evidence">
            <span class="label">证据:</span>
            <p class="evidence-text">
              {{ item.evidence.quote_or_summary }}
              <span v-if="item.evidence.chapter" class="chapter-ref">
                (第 {{ item.evidence.chapter }} 章)
              </span>
            </p>
          </div>
        </div>

        <div class="item-actions">
          <el-button
            size="small"
            type="success"
            @click="handleAccept(item)"
          >
            采纳
          </el-button>
          <el-button
            size="small"
            @click="handleEdit(item)"
          >
            修正
          </el-button>
          <el-button
            size="small"
            type="info"
            @click="handleSkip(item)"
          >
            跳过
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="reviewItems.length > 0" class="review-footer">
      <el-text size="small" type="info">
        预计审查时间: {{ estimatedTime }} 分钟
      </el-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../stores/app'
import { useWorldMapStore } from '../stores/worldMapStore'
import type { WorldMapReviewItem, ReviewSeverity, ReviewItemType } from '../types/worldMap'

const worldMapStore = useWorldMapStore()
const appStore = useAppStore()
const { reviewItems, spec } = storeToRefs(worldMapStore)

// 按严重程度排序
const sortedItems = computed(() => {
  const severityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  return [...reviewItems.value].sort((a, b) => {
    return severityOrder[a.severity as string] - severityOrder[b.severity as string]
  })
})

// 预计审查时间
const estimatedTime = computed(() => {
  return reviewItems.value.reduce((sum: number, item: any) => sum + item.estimated_review_time_minutes, 0)
})

// 获取实体名称
function getEntityName(entityId: string): string {
  const entity = spec.value?.entities.find((e: any) => e.id === entityId)
  return entity?.canonical_name || entityId
}

// 获取严重程度样式
function getSeverityType(severity: ReviewSeverity): string {
  const typeMap: Record<string, string> = {
    Critical: 'danger',
    High: 'warning',
    Medium: 'info',
    Low: 'info'
  }
  return typeMap[severity]
}

// 获取严重程度标签
function getSeverityLabel(severity: ReviewSeverity): string {
  const labelMap: Record<string, string> = {
    Critical: '严重',
    High: '高',
    Medium: '中',
    Low: '低'
  }
  return labelMap[severity]
}

// 获取项目类型标签
function getItemTypeLabel(type: ReviewItemType): string {
  const labelMap: Record<string, string> = {
    Conflict: '冲突',
    LowConfidence: '低置信度',
    MissingRelation: '缺失关系',
    Ambiguity: '歧义',
    Inconsistency: '不一致'
  }
  return labelMap[type]
}

// 处理采纳
async function handleAccept(item: WorldMapReviewItem) {
  try {
    // TODO: 获取 bookUrl
    const bookUrl = spec.value?.metadata.novel_title || ''
    await worldMapStore.resolveItem(bookUrl, item.id, 'accept')
    appStore.showToast('已采纳 AI 建议')
  } catch (error) {
    appStore.showToast('操作失败', 'error')
  }
}

// 处理修正
function handleEdit(_item: WorldMapReviewItem) {
  appStore.showToast('手动修正功能开发中', 'warning')
  // TODO: 打开编辑对话框
}

// 处理跳过
async function handleSkip(item: WorldMapReviewItem) {
  try {
    const bookUrl = spec.value?.metadata.novel_title || ''
    await worldMapStore.resolveItem(bookUrl, item.id, 'skip')
    appStore.showToast('已跳过此项', 'warning')
  } catch (error) {
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
  border-bottom: 1px solid var(--el-border-color);
}

.review-header h3 {
  margin: 0;
  font-size: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.review-item {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 16px;
  transition: all 0.2s;
}

.review-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.review-item.severity-critical {
  border-left: 4px solid #f56c6c;
}

.review-item.severity-high {
  border-left: 4px solid #e6a23c;
}

.review-item.severity-medium {
  border-left: 4px solid #409eff;
}

.review-item.severity-low {
  border-left: 4px solid #909399;
}

.item-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.confidence {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.item-body {
  margin-bottom: 12px;
}

.issue {
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.involved-entities,
.ai-suggestion,
.evidence {
  margin-bottom: 8px;
}

.label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 8px;
}

.entity-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.ai-suggestion p {
  margin: 4px 0;
  padding: 8px;
  background: #f0f9ff;
  border-left: 3px solid #409eff;
  font-size: 13px;
}

.evidence-text {
  margin: 4px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.chapter-ref {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.review-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color);
  text-align: center;
}
</style>
