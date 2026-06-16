<template>
  <div class="world-map-view">
    <div class="map-toolbar">
      <div class="toolbar-left">
        <button v-if="!spec" class="btn btn-primary" :disabled="loading" @click="handleBuildMap">
          构建地图
        </button>
        <button v-if="spec && !spec.coordinates" class="btn" :disabled="loading" @click="handleGenerateCoordinates">
          生成坐标
        </button>

        <div v-if="spec" class="tab-switch">
          <button
            class="tab-btn"
            :class="{ active: sidebarTab === 'entities' }"
            @click="setSidebarTab('entities')"
          >
            实体
          </button>
          <button
            class="tab-btn"
            :class="{ active: sidebarTab === 'review' }"
            @click="setSidebarTab('review')"
          >
            审查
            <span v-if="reviewItems.length" class="tab-count">{{ reviewItems.length }}</span>
          </button>
        </div>
      </div>

      <div v-if="spec" class="toolbar-stats">
        <span class="stat-badge success">自动化率 {{ formatRate(automationRate) }}</span>
        <span class="stat-badge info">坐标覆盖 {{ formatRate(coordinateCoverage) }}</span>
      </div>
    </div>

    <div v-if="spec" class="map-body">
      <div class="map-main">
        <WorldMapCanvas v-if="spec.coordinates" />
        <div v-else class="empty-state inline">尚未生成坐标，点击上方按钮生成</div>
      </div>

      <div class="map-sidebar">
        <MapEntityPanel v-if="sidebarTab === 'entities'" />
        <MapReviewPanel v-else :book-url="bookUrl" />
      </div>
    </div>

    <div v-else class="empty-state">暂无地图数据，点击构建地图开始</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../stores/app'
import { useWorldMapStore } from '../stores/worldMapStore'
import WorldMapCanvas from './WorldMapCanvas.vue'
import MapEntityPanel from './MapEntityPanel.vue'
import MapReviewPanel from './MapReviewPanel.vue'

const props = defineProps<{
  bookUrl: string
  bookName: string
}>()

const worldMapStore = useWorldMapStore()
const appStore = useAppStore()
const { spec, loading, sidebarTab, reviewItems, automationRate, coordinateCoverage } = storeToRefs(worldMapStore)
const { setSidebarTab } = worldMapStore

function formatRate(rate: number) {
  return `${Math.round(rate * 100)}%`
}

async function handleBuildMap() {
  try {
    await worldMapStore.buildMap(props.bookUrl, props.bookName)
    appStore.showToast('地图构建成功', 'success')
  } catch (error) {
    appStore.showToast('地图构建失败', 'error')
  }
}

async function handleGenerateCoordinates() {
  try {
    await worldMapStore.generateMapCoordinates(props.bookUrl)
    appStore.showToast('坐标生成成功', 'success')
  } catch (error) {
    appStore.showToast('坐标生成失败', 'error')
  }
}

onMounted(async () => {
  try {
    await worldMapStore.loadSpec(props.bookUrl)
  } catch {
    console.log('暂无地图数据')
  }
})
</script>

<style scoped>
.world-map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.map-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color, #e5e7eb);
  gap: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tab-switch {
  display: inline-flex;
  border: 1px solid var(--el-border-color, #d1d5db);
  border-radius: 8px;
  overflow: hidden;
}

.tab-btn,
.btn {
  border: 0;
  background: #f9fafb;
  color: #111827;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
}

.tab-btn.active,
.btn-primary {
  background: #2563eb;
  color: #fff;
}

.tab-btn + .tab-btn,
.btn + .btn {
  border-left: 1px solid rgba(255, 255, 255, 0.16);
}

.tab-count {
  margin-left: 6px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 6px;
  border-radius: 999px;
}

.toolbar-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.stat-badge.success { background: #ecfdf5; color: #047857; }
.stat-badge.info { background: #eff6ff; color: #1d4ed8; }

.map-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.map-main {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.map-sidebar {
  width: 340px;
  border-left: 1px solid var(--el-border-color, #e5e7eb);
  overflow: hidden;
  min-width: 300px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  background: #f9fafb;
  font-size: 14px;
}

.empty-state.inline {
  height: 100%;
}
</style>
