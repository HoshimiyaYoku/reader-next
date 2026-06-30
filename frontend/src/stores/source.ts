import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBookSources } from '../api/source'
import type { BookSource } from '../types'

export const useSourceStore = defineStore('source', () => {
  const sources = ref<BookSource[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  let loadingTask: Promise<void> | null = null

  async function fetchSources(options: { force?: boolean } = {}) {
    if (loaded.value && !options.force) return
    if (loadingTask) return loadingTask
    loading.value = true
    loadingTask = getBookSources()
      .then((list) => {
        sources.value = list
        loaded.value = true
      })
      .finally(() => {
        loading.value = false
        loadingTask = null
      })
    return loadingTask
  }

  return {
    sources,
    loading,
    loaded,
    fetchSources
  }
})
