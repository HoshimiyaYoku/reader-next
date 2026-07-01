<template>
  <section class="ai-book-map-panel reader-ui-font" role="tabpanel" :style="bodyStyle">
    <article class="panel-card map-card">
      <div class="panel-head map-head">
        <div>
          <h2>地图</h2>
          <p>{{ statusCopy }}</p>
        </div>
        <button class="secondary-btn" :disabled="busy" type="button" @click="$emit('generate')">
          {{ map?.artifacts?.imageUrl ? '重新生成' : '生成地图' }}
        </button>
      </div>

      <div v-if="map?.artifacts?.imageUrl" class="map-image-frame">
        <img :src="map.artifacts.imageUrl" alt="AI 生成地图" />
      </div>
      <div v-else-if="map?.blueprint" class="map-blueprint">
        <div class="map-node-list">
          <span v-for="place in map.blueprint.content.places" :key="place.id">{{ place.label }}</span>
        </div>
        <ul v-if="map.blueprint.content.connections.length" class="map-edge-list">
          <li v-for="edge in map.blueprint.content.connections" :key="edge.id">
            {{ placeLabel(edge.sourcePlaceId) }} → {{ placeLabel(edge.targetPlaceId) }}
            <small>{{ edge.kind }}</small>
          </li>
        </ul>
      </div>
      <div v-else-if="locations.length" class="map-blueprint">
        <div class="map-node-list">
          <span v-for="location in locations" :key="location.id">{{ location.name }}</span>
        </div>
      </div>
      <div v-else class="empty-state">暂无地点资料，暂时无法生成地图。</div>

      <p v-if="map?.status?.dirty" class="map-warning">
        {{ map.status.dirtyReason || '地图资料已更新，建议重新生成。' }}
      </p>
      <p v-if="map?.status?.lastError" class="map-error">{{ map.status.lastError }}</p>
      <ul v-if="map?.blueprint?.warnings?.length" class="map-warning-list">
        <li v-for="warning in map.blueprint.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { AiBookLocationView, AiBookMapView } from '../../types'

const props = defineProps<{
  map?: AiBookMapView | null
  locations?: AiBookLocationView[]
  busy?: boolean
  bodyStyle?: CSSProperties
  statusText?: string
}>()

defineEmits<{
  generate: []
}>()

const locations = computed(() => props.locations || props.map?.locations || [])
const statusCopy = computed(() => {
  if (props.statusText) return props.statusText
  if (props.busy) return '正在生成地图...'
  if (props.map?.artifacts?.imageUrl) return '已生成地图图片'
  if (props.map?.blueprint) return '使用地图蓝图展示 fallback'
  if (locations.value.length) return '可根据地点资料生成地图'
  return '等待地点资料'
})

function placeLabel(placeId: string) {
  const place = props.map?.blueprint?.content.places.find((item) => item.id === placeId)
  return place?.label || placeId
}
</script>

<style scoped>
.ai-book-map-panel {
  display: block;
}

.map-card {
  display: grid;
  gap: 14px;
}

.map-image-frame {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
}

.map-image-frame img {
  display: block;
  width: 100%;
}

.map-blueprint {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px dashed rgba(100, 116, 139, 0.35);
  border-radius: 16px;
}

.map-node-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.map-node-list span {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.1);
  color: #334155;
  font-size: 13px;
}

.map-edge-list,
.map-warning-list {
  margin: 0;
  padding-left: 18px;
  color: #64748b;
  font-size: 13px;
}

.map-warning {
  margin: 0;
  color: #92400e;
}

.map-error {
  margin: 0;
  color: #b91c1c;
}
</style>
