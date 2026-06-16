<template>
  <div class="entity-panel">
    <div class="panel-header">
      <h3>实体列表</h3>
      <span class="count-badge">{{ totalEntities }} 个实体</span>
    </div>

    <div class="panel-toolbar">
      <input v-model="searchText" class="control" placeholder="搜索实体" />
      <select v-model="filterType" class="control">
        <option value="">全部类型</option>
        <option value="settlement">聚落</option>
        <option value="region">区域</option>
        <option value="terrain">地形</option>
        <option value="water">水系</option>
        <option value="transit">交通</option>
        <option value="fantasy">超自然</option>
      </select>
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
          <span class="level-badge" :class="`level-${entity.evidence.level.toLowerCase()}`">
            {{ entity.evidence.level }}
          </span>
        </div>

        <div class="entity-meta">
          <span>{{ getEntityTypeLabel(entity.entity_type) }}</span>
          <span v-if="entity.subtype" class="separator">·</span>
          <span v-if="entity.subtype">{{ entity.subtype }}</span>
          <span v-if="entity.first_chapter" class="separator">·</span>
          <span v-if="entity.first_chapter">第 {{ entity.first_chapter }} 章</span>
        </div>

        <div v-if="entity.description" class="entity-desc">{{ entity.description }}</div>

        <div v-if="entity.aliases.length" class="entity-aliases">
          别名：{{ entity.aliases.join(', ') }}
        </div>

        <div class="entity-status" :class="{ placed: isPlaced(entity.id) }">
          {{ isPlaced(entity.id) ? '● 已定位' : '○ 未定位' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorldMapStore } from '../stores/worldMapStore'
import type { EntityType } from '../types/worldMap'

const worldMapStore = useWorldMapStore()
const { spec, selectedEntityId, placedEntities } = storeToRefs(worldMapStore)

const searchText = ref('')
const filterType = ref<EntityType | ''>('')
const totalEntities = computed(() => spec.value?.entities.length || 0)

const filteredEntities = computed(() => {
  const entities = spec.value?.entities || []
  const text = searchText.value.trim().toLowerCase()
  return entities.filter((entity) => {
    const matchesType = !filterType.value || entity.entity_type === filterType.value
    const matchesText = !text
      || entity.canonical_name.toLowerCase().includes(text)
      || entity.aliases.some((alias) => alias.toLowerCase().includes(text))
    return matchesType && matchesText
  })
})

function isPlaced(entityId: string): boolean {
  return placedEntities.value.some((entity) => entity.entity_id === entityId)
}

function getEntityTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    settlement: '聚落',
    region: '区域',
    terrain: '地形',
    water: '水系',
    transit: '交通',
    fantasy: '超自然',
  }
  return labels[type] || type
}

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
  border-bottom: 1px solid var(--el-border-color, #e5e7eb);
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.count-badge,
.level-badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
}

.level-a { background: #ecfdf5; color: #047857; }
.level-b { background: #eff6ff; color: #1d4ed8; }
.level-c { background: #f5f3ff; color: #6d28d9; }
.level-conflict { background: #fef2f2; color: #b91c1c; }
.level-unknown { background: #f3f4f6; color: #6b7280; }

.panel-toolbar {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color, #e5e7eb);
  display: grid;
  gap: 8px;
}

.control {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  background: #fff;
}

.entity-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.entity-item {
  padding: 12px;
  border: 1px solid var(--el-border-color, #e5e7eb);
  border-radius: 10px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.entity-item:hover,
.entity-item.active {
  background: #eff6ff;
  border-color: #2563eb;
}

.entity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.entity-name {
  font-weight: 600;
  font-size: 14px;
}

.entity-meta,
.entity-aliases,
.entity-status {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.separator { margin: 0 4px; }

.entity-desc {
  font-size: 13px;
  color: #374151;
  margin-bottom: 8px;
  line-height: 1.45;
}

.entity-status.placed {
  color: #047857;
}
</style>
