import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { exploreBook, getExploreKinds } from '../api/explore'
import { useSourceStore } from './source'
import type { SearchBook, BookSource } from '../types'
import {
  getInitialExploreCategoryUrl,
  parseExploreCategories,
  type ExploreCategory,
} from '../utils/exploreCategories'

export const useExploreStore = defineStore('explore', () => {
  const sourceStore = useSourceStore()

  const activeSourceUrl = ref<string>('')
  const activeCategoryUrl = ref<string>('')
  
  const books = ref<SearchBook[]>([])
  const loading = ref(false)
  const page = ref(1)
  const hasMore = ref(true)
  const error = ref<string | null>(null)
  const categories = ref<ExploreCategory[]>([])
  let categoryLoadId = 0

  // 筛选出启用了 explore 的书源
  const exploreSources = computed(() => {
    return sourceStore.sources.filter((s: BookSource) => s.enabledExplore && s.exploreUrl)
  })

  // 当前选中的书源对象
  const currentSource = computed(() => {
    return sourceStore.sources.find((s: BookSource) => s.bookSourceUrl === activeSourceUrl.value)
  })

  async function ensureActiveSource() {
    if (exploreSources.value.length === 0) {
      activeSourceUrl.value = ''
      activeCategoryUrl.value = ''
      categories.value = []
      books.value = []
      hasMore.value = false
      return
    }

    const activeSourceStillValid = exploreSources.value.some((source) => source.bookSourceUrl === activeSourceUrl.value)
    if (!activeSourceUrl.value || !activeSourceStillValid) {
      await setSource(exploreSources.value[0].bookSourceUrl)
      return
    }

    if (categories.value.length === 0 && currentSource.value) {
      await loadCategories(currentSource.value)
    }

    if (!categories.value.some((category) => category.url === activeCategoryUrl.value)) {
      const firstCategoryUrl = getInitialExploreCategoryUrl(categories.value)
      if (firstCategoryUrl) {
        setCategory(firstCategoryUrl)
      }
    }
  }

  async function loadCategories(source: BookSource) {
    const loadId = ++categoryLoadId
    let next: ExploreCategory[]
    try {
      next = await getExploreKinds({ bookSourceUrl: source.bookSourceUrl })
    } catch {
      next = parseExploreCategories(source.exploreUrl)
    }
    if (loadId === categoryLoadId && activeSourceUrl.value === source.bookSourceUrl) {
      categories.value = next
    }
  }

  async function setSource(url: string) {
    const sourceChanged = activeSourceUrl.value !== url
    if (sourceChanged) {
      activeSourceUrl.value = url
      activeCategoryUrl.value = ''
      categories.value = []
      books.value = []
      hasMore.value = false
    }

    const source = currentSource.value
    if (!source) {
      categories.value = []
      activeCategoryUrl.value = ''
      books.value = []
      hasMore.value = false
      return
    }

    await loadCategories(source)
    if (activeSourceUrl.value !== source.bookSourceUrl) return

    const firstCategoryUrl = getInitialExploreCategoryUrl(categories.value)
    if (!firstCategoryUrl) {
      activeCategoryUrl.value = ''
      books.value = []
      hasMore.value = false
      return
    }

    const activeCategoryStillValid = categories.value.some((category) => category.url === activeCategoryUrl.value)
    if (sourceChanged || !activeCategoryStillValid) {
      setCategory(firstCategoryUrl)
    }
  }

  function setCategory(url: string) {
    const nextUrl = url.trim()
    if (!nextUrl) return
    if (activeCategoryUrl.value !== nextUrl) {
      activeCategoryUrl.value = nextUrl
      void resetAndFetch()
    }
  }

  async function resetAndFetch() {
    books.value = []
    page.value = 1
    hasMore.value = true
    error.value = null
    await fetchMore()
  }

  async function fetchMore() {
    if (loading.value || !hasMore.value || !activeSourceUrl.value || !activeCategoryUrl.value) return

    loading.value = true
    error.value = null
    try {
      const result = await exploreBook({
        bookSourceUrl: activeSourceUrl.value,
        ruleFindUrl: activeCategoryUrl.value,
        page: page.value,
      })

      if (result && result.length > 0) {
        books.value.push(...result)
        page.value++
      } else {
        hasMore.value = false
      }
    } catch (err: any) {
      error.value = err.message || '加载失败'
      hasMore.value = false
    } finally {
      loading.value = false
    }
  }

  // 初始化时加载书源数据
  async function init() {
    if (sourceStore.sources.length === 0) {
      await sourceStore.fetchSources()
    }
    await ensureActiveSource()
  }

  watch(exploreSources, () => {
    void ensureActiveSource()
  })

  return {
    activeSourceUrl,
    activeCategoryUrl,
    books,
    loading,
    page,
    hasMore,
    error,
    exploreSources,
    currentSource,
    categories,
    init,
    setSource,
    setCategory,
    fetchMore,
    resetAndFetch,
  }
})
