<template>
  <div class="entity-panel">
    <div class="panel-header">
      <h3>实体列表</h3>
      <el-tag>{{ totalEntities }} 个实体</el-tag>
    </div>

    <div class="panel-toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索实体"
        size="small"
        clearable
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-select
        v-model="filterType"
        placeholder="筛选类型"
        size="small"
        class="mt-2"
        style="width: 100%"
        clearable
      >
        <el-option label="全部" value="" />
        <el-option label="城市" value="Settlement" />
        <el-option label="政治实体" value="PoliticalRegion" />
        <el-option label="地形" value="Terrain" />
        <el-option label="水系" value="Hydrology" />
      </el-select>
    </div>

    <div class="entity-list">
      <div
        v-for="entity in filteredEntities"
        :key="entity.id"
        class="entity-item"
        :class="{ active: selectedEntityId === entity.id }"
        @click="handleEntityClick(entity.id)"
      >
        <div class="entity-header">
          <span class="entity-name">{{ entity.canonical_name }}</span>
          <el-tag
            :type="getEvidenceLevelType(entity.evidence_level)"
            size="small"
          >
            {{ entity.evidence_level }}
          </el-tag>
        </div>

        <div class="entity-meta">
          <el-text size="small" type="info">{{ entity.entity_type }}</el-text>
          <span v-if="entity.sub_type" class="separator">·</span>
          <el-text v-if="entity.sub_type" size="small" type="info">
            {{ entity.sub_type }}
          </el-text>
        </div>

        <div v-if="entity.description" class="entity-desc">
          {{ entity.description }}
        </div>

        <div v-if="entity.aliases.length > 0" class="entity-aliases">
          <el-text size="small" type="info">别名: </el-text>
          <el-text size="small">{{ entity.aliases.join(', ') }}</el-text>
        </div>

        <div class="entity-status">
          <el-icon
            v-if="isPlaced(entity.id)"
            color="#67c23a"
            title="已定位"
          >
            <CircleCheckFilled />
          </el-icon>
          <el-icon
            v-else
            color="#909399"
            title="未定位"
          >
            <CircleCloseFilled />
          </el-icon>
          <el-text size="small" type="info" class="ml-1">
            {{ isPlaced(entity.id) ? '已定位' : '未定位' }}
          </el-text>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useWorldMapStore } from '../stores/worldMapStore'
import type { EvidenceLevel } from '../types/worldMap'

const worldMapStore = useWorldMapStore()
const { spec, selectedEntityId, placedEntities } = storeToRefs(worldMapStore)

const searchText = ref('')
const filterType = ref('')

const totalEntities = computed(() => spec.value?.entities.length || 0)

// 过滤后的实体
const filteredEntities = computed(() => {
  if (!spec.value?.entities) return []

  let entities = spec.value.entities

  // 按类型过滤
  if (filterType.value) {
    entities = entities.filter((e: any) => e.entity_type === filterType.value)
  }

  // 按搜索文本过滤
  if (searchText.value) {
    const text = searchText.value.toLowerCase()
    entities = entities.filter((e: any) => 
      e.canonical_name.toLowerCase().includes(text) ||
      e.aliases.some((alias: string) => alias.toLowerCase().includes(text))
    )
  }

  return entities
})

// 检查实体是否已定位
function isPlaced(entityId: string): boolean {
  return placedEntities.value.some((e: any) => e.entity_id === entityId)
}

// 获取证据等级样式
function getEvidenceLevelType(level: EvidenceLevel): string {
  const typeMap: Record<string, string> = {
    A: 'success',
    B: 'primary',
    C: 'info',
    D: 'warning',
    Conflict: 'danger',
    Unknown: 'info'
  }
  return typeMap[level] || 'info'
}

// 处理实体点击
function handleEntityClick(entityId: string) {
  worldMapStore.selectEntity(entityId)
}
</script>

<style scoped>
.entity-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.panel-toolbar {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color);
}

.entity-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.entity-item {
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.entity-item:hover {
  background: #f5f7fa;
  border-color: #409eff;
}

.entity-item.active {
  background: #ecf5ff;
  border-color: #409eff;
}

.entity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.entity-name {
  font-weight: 500;
  font-size: 14px;
}

.entity-meta {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.separator {
  margin: 0 4px;
  color: var(--el-text-color-secondary);
}

.entity-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
  line-height: 1.4;
}

.entity-aliases {
  font-size: 12px;
  margin-bottom: 8px;
}

.entity-status {
  display: flex;
  align-items: center;
}
</style>
