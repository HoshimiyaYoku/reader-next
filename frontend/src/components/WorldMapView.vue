<template>
  <div class="world-map-view">
    <!-- 工具栏 -->
    <div class="map-toolbar">
      <div class="toolbar-left">
        <el-button
          type="primary"
          :loading="loading"
          @click="handleBuildMap"
          v-if="!spec"
        >
          构建地图
        </el-button>
        <el-button
          :loading="loading"
          @click="handleGenerateCoordinates"
          v-if="spec && !spec.coordinates"
        >
          生成坐标
        </el-button>
        <el-button-group v-if="spec">
          <el-button
            :type="sidebarTab === 'entities' ? 'primary' : ''"
            @click="setSidebarTab('entities')"
          >
            实体
          </el-button>
          <el-button
            :type="sidebarTab === 'review' ? 'primary' : ''"
            @click="setSidebarTab('review')"
          >
            审查 <el-badge :value="reviewItems.length" v-if="reviewItems.length > 0" />
          </el-button>
        </el-button-group>
      </div>
      
      <div class="toolbar-stats" v-if="spec">
        <el-tag type="success">
          自动化率: {{ (automationRate * 100).toFixed(0) }}%
        </el-tag>
        <el-tag type="info">
          坐标覆盖: {{ (coordinateCoverage * 100).toFixed(0) }}%
        </el-tag>
      </div>
    </div>

    <!-- 主体内容 -->
    <div class="map-body" v-if="spec">
      <div class="map-main">
        <WorldMapCanvas v-if="spec.coordinates" />
        <el-empty v-else description="尚未生成坐标，点击上方按钮生成" />
      </div>

      <div class="map-sidebar">
        <MapEntityPanel v-if="sidebarTab === 'entities'" />
        <MapReviewPanel v-else-if="sidebarTab === 'review'" />
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else description="暂无地图数据，点击构建地图开始" />
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
const {
  spec,
  loading,
  sidebarTab,
  reviewItems,
  automationRate,
  coordinateCoverage
} = storeToRefs(worldMapStore)

const { setSidebarTab } = worldMapStore

// 构建地图
async function handleBuildMap() {
  try {
    await worldMapStore.buildMap(props.bookUrl, props.bookName)
    appStore.showToast('地图构建成功', 'success')
  } catch (error) {
    appStore.showToast('地图构建失败', 'error')
  }
}

// 生成坐标
async function handleGenerateCoordinates() {
  try {
    await worldMapStore.generateMapCoordinates(props.bookUrl)
    appStore.showToast('坐标生成成功', 'success')
  } catch (error) {
    appStore.showToast('坐标生成失败', 'error')
  }
}

// 加载地图
onMounted(async () => {
  try {
    await worldMapStore.loadSpec(props.bookUrl)
  } catch (error) {
    // 地图不存在是正常情况
    console.log('暂无地图数据')
  }
})
</script>

<style scoped>
.world-map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.map-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
  background: #fff;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.toolbar-stats {
  display: flex;
  gap: 8px;
}

.map-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.map-main {
  flex: 1;
  overflow: hidden;
}

.map-sidebar {
  width: 320px;
  border-left: 1px solid var(--el-border-color);
  overflow: hidden;
}
</style>
