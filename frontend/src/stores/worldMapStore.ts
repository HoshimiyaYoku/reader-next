import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  WorldMapSpec,
  WorldMapReviewItem,
  PlacedEntity,
  UnplacedEntity
} from '../types/worldMap'
import {
  getWorldMapSpec,
  buildWorldMap,
  generateCoordinates,
  getReviewItems,
  resolveReviewItem,
  updateWorldMap
} from '../api/worldMap'

export const useWorldMapStore = defineStore('worldMap', () => {
  // State
  const spec = ref<WorldMapSpec | null>(null)
  const loading = ref(false)
  const selectedEntityId = ref<string | null>(null)
  const sidebarTab = ref<'entities' | 'review'>('entities')

  // Getters
  const placedEntities = computed<PlacedEntity[]>(() => {
    return spec.value?.coordinates?.placed || []
  })

  const unplacedEntities = computed<UnplacedEntity[]>(() => {
    return spec.value?.coordinates?.unplaced || []
  })

  const reviewItems = computed<WorldMapReviewItem[]>(() => {
    return spec.value?.review_items || []
  })

  const automationRate = computed(() => {
    return spec.value?.statistics?.automation_rate || 0
  })

  const totalEntities = computed(() => {
    return spec.value?.entities?.length || 0
  })

  const coordinateCoverage = computed(() => {
    return spec.value?.statistics?.coordinate_coverage_rate || 0
  })

  // Actions
  async function loadSpec(bookUrl: string) {
    loading.value = true
    try {
      const result = await getWorldMapSpec(bookUrl)
      if (result) {
        spec.value = result
      } else {
        spec.value = null
      }
    } catch (error) {
      spec.value = null
      console.error('加载世界地图失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function buildMap(bookUrl: string, novelTitle: string) {
    loading.value = true
    try {
      const result = await buildWorldMap({ book_url: bookUrl, novel_title: novelTitle })
      spec.value = result
      return result
    } catch (error) {
      console.error('构建世界地图失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function generateMapCoordinates(bookUrl: string) {
    loading.value = true
    try {
      const result = await generateCoordinates({ book_url: bookUrl })
      if (result && spec.value) {
        spec.value.coordinates = result
      }
      return result
    } catch (error) {
      console.error('生成坐标失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function updateMap(bookUrl: string, endChapter: number) {
    loading.value = true
    try {
      const result = await updateWorldMap({ book_url: bookUrl, end_chapter: endChapter })
      spec.value = result.spec
      return result
    } catch (error) {
      console.error('更新世界地图失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadReviewItems(bookUrl: string) {
    loading.value = true
    try {
      const result = await getReviewItems(bookUrl)
      if (result && spec.value) {
        spec.value.review_items = result
      }
      return result
    } catch (error) {
      console.error('加载审查清单失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function resolveItem(bookUrl: string, itemId: string, resolution: string, comment?: string) {
    loading.value = true
    try {
      const result = await resolveReviewItem({
        book_url: bookUrl,
        item_id: itemId,
        resolution,
        comment
      })
      if (result) {
        spec.value = result
      }
      return result
    } catch (error) {
      console.error('修正审查项失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  function selectEntity(entityId: string | null) {
    selectedEntityId.value = entityId
  }

  function setSidebarTab(tab: 'entities' | 'review') {
    sidebarTab.value = tab
  }

  function reset() {
    spec.value = null
    selectedEntityId.value = null
    sidebarTab.value = 'entities'
  }

  return {
    // State
    spec,
    loading,
    selectedEntityId,
    sidebarTab,
    // Getters
    placedEntities,
    unplacedEntities,
    reviewItems,
    automationRate,
    totalEntities,
    coordinateCoverage,
    // Actions
    loadSpec,
    buildMap,
    generateMapCoordinates,
    updateMap,
    loadReviewItems,
    resolveItem,
    selectEntity,
    setSidebarTab,
    reset
  }
})
