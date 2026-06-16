<template>
  <div class="world-map-canvas">
    <div class="canvas-toolbar">
      <el-button-group>
        <el-button size="small" @click="zoomIn">放大</el-button>
        <el-button size="small" @click="zoomOut">缩小</el-button>
        <el-button size="small" @click="resetView">重置</el-button>
      </el-button-group>
      <el-tag class="ml-2">{{ placedCount }} / {{ totalCount }} 实体已定位</el-tag>
    </div>

    <div class="canvas-container" ref="containerRef">
      <svg
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
        class="map-svg"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @wheel="onWheel"
      >
        <!-- 关系连线 -->
        <g class="relations-layer">
          <line
            v-for="rel in visibleRelations"
            :key="rel.id"
            :x1="getEntityX(rel.from_id)"
            :y1="getEntityY(rel.from_id)"
            :x2="getEntityX(rel.to_id)"
            :y2="getEntityY(rel.to_id)"
            :class="['relation-line', `relation-${rel.relation_type.toLowerCase()}`]"
            :stroke-width="1"
          />
        </g>

        <!-- 实体节点 -->
        <g class="entities-layer">
          <g
            v-for="entity in placedEntities"
            :key="entity.entity_id"
            :class="['entity-node', { selected: selectedEntityId === entity.entity_id }]"
            @click="onEntityClick(entity.entity_id)"
          >
            <circle
              :cx="entity.x"
              :cy="entity.y"
              :r="getNodeRadius(entity)"
              :class="['entity-circle', `confidence-${entity.confidence.toLowerCase()}`]"
            />
            <text
              :x="entity.x"
              :y="entity.y - 12"
              class="entity-label"
              text-anchor="middle"
            >
              {{ getEntityName(entity.entity_id) }}
            </text>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorldMapStore } from '../stores/worldMapStore'
import type { PlacedEntity } from '../types/worldMap'

const worldMapStore = useWorldMapStore()
const { placedEntities, spec, selectedEntityId } = storeToRefs(worldMapStore)

const containerRef = ref<HTMLElement>()

// 视口控制
const viewBox = ref({
  x: 0,
  y: 0,
  width: 100,
  height: 100
})

// 拖拽状态
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// 统计
const placedCount = computed(() => placedEntities.value.length)
const totalCount = computed(() => spec.value?.entities.length || 0)

// 可见关系
const visibleRelations = computed(() => {
  if (!spec.value) return []
  const placedIds = new Set(placedEntities.value.map(e => e.entity_id))
  return spec.value.relations.filter(
    rel => placedIds.has(rel.from_id) && placedIds.has(rel.to_id)
  )
})

// 获取实体坐标
function getEntityX(entityId: string): number {
  const entity = placedEntities.value.find(e => e.entity_id === entityId)
  return entity?.x || 0
}

function getEntityY(entityId: string): number {
  const entity = placedEntities.value.find(e => e.entity_id === entityId)
  return entity?.y || 0
}

// 获取实体名称
function getEntityName(entityId: string): string {
  const entity = spec.value?.entities.find(e => e.id === entityId)
  return entity?.canonical_name || entityId
}

// 获取节点半径
function getNodeRadius(entity: PlacedEntity): number {
  const baseRadius = 3
  switch (entity.confidence) {
    case 'Fixed':
      return baseRadius * 1.5
    case 'Relative':
      return baseRadius * 1.2
    default:
      return baseRadius
  }
}

// 交互处理
function onEntityClick(entityId: string) {
  worldMapStore.selectEntity(entityId)
}

function onMouseDown(e: MouseEvent) {
  if (e.button === 0) {
    isDragging.value = true
    dragStart.value = { x: e.clientX, y: e.clientY }
  }
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return

  const dx = (e.clientX - dragStart.value.x) * (viewBox.value.width / (containerRef.value?.clientWidth || 800))
  const dy = (e.clientY - dragStart.value.y) * (viewBox.value.height / (containerRef.value?.clientHeight || 600))

  viewBox.value.x -= dx
  viewBox.value.y -= dy

  dragStart.value = { x: e.clientX, y: e.clientY }
}

function onMouseUp() {
  isDragging.value = false
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const scale = e.deltaY > 0 ? 1.1 : 0.9
  const newWidth = viewBox.value.width * scale
  const newHeight = viewBox.value.height * scale

  // 以鼠标位置为中心缩放
  const rect = (e.target as SVGSVGElement).getBoundingClientRect()
  const mouseX = ((e.clientX - rect.left) / rect.width) * viewBox.value.width + viewBox.value.x
  const mouseY = ((e.clientY - rect.top) / rect.height) * viewBox.value.height + viewBox.value.y

  viewBox.value.x = mouseX - (mouseX - viewBox.value.x) * scale
  viewBox.value.y = mouseY - (mouseY - viewBox.value.y) * scale
  viewBox.value.width = newWidth
  viewBox.value.height = newHeight
}

function zoomIn() {
  const scale = 0.8
  viewBox.value.width *= scale
  viewBox.value.height *= scale
}

function zoomOut() {
  const scale = 1.25
  viewBox.value.width *= scale
  viewBox.value.height *= scale
}

function resetView() {
  viewBox.value = { x: 0, y: 0, width: 100, height: 100 }
}

// 自动适配视口
function fitToContent() {
  if (placedEntities.value.length === 0) return

  const xs = placedEntities.value.map(e => e.x)
  const ys = placedEntities.value.map(e => e.y)

  const minX = Math.min(...xs) - 10
  const maxX = Math.max(...xs) + 10
  const minY = Math.min(...ys) - 10
  const maxY = Math.max(...ys) + 10

  viewBox.value = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

onMounted(() => {
  fitToContent()
})
</script>

<style scoped>
.world-map-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.canvas-toolbar {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
}

.canvas-container {
  flex: 1;
  overflow: hidden;
  background: #f5f7fa;
}

.map-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.map-svg:active {
  cursor: grabbing;
}

/* 关系线样式 */
.relation-line {
  stroke: #909399;
  stroke-opacity: 0.4;
}

.relation-directional {
  stroke: #409eff;
}

.relation-adjacent {
  stroke: #67c23a;
}

.relation-contains {
  stroke: #e6a23c;
}

/* 实体节点样式 */
.entity-node {
  cursor: pointer;
  transition: all 0.2s;
}

.entity-node:hover .entity-circle {
  stroke-width: 2;
}

.entity-node.selected .entity-circle {
  stroke: #409eff;
  stroke-width: 3;
}

.entity-circle {
  stroke: #333;
  stroke-width: 1;
}

.confidence-fixed {
  fill: #67c23a;
}

.confidence-relative {
  fill: #e6a23c;
}

.confidence-tentative {
  fill: #f56c6c;
}

.entity-label {
  font-size: 10px;
  fill: #333;
  pointer-events: none;
  user-select: none;
}
</style>
