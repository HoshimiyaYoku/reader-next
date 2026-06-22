import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { exploreBook, exploreBookGlobal, getExploreKinds } from '../api/explore'
import { useSourceStore } from './source'
import type { SearchBook, BookSource } from '../types'
import {
  getInitialExploreCategoryUrl,
  parseExploreCategories,
  type ExploreCategory,
} from '../utils/exploreCategories'

const GLOBAL_EXPLORE_SOURCE_URL = '__global_explore__'
const GLOBAL_EXPLORE_CATEGORIES: ExploreCategory[] = [
  { title: '综合', url: 'mixed' },
  { title: '排行', url: 'rank' },
  { title: '新书', url: 'new' },
  { title: '完本', url: 'finished' },
  { title: '玄幻', url: 'fantasy' },
  { title: '都市', url: 'urban' },
  { title: '历史', url: 'history' },
  { title: '科幻', url: 'sci-fi' },
  { title: '悬疑', url: 'suspense' },
]

export const useExploreStore = defineStore('explore', () => {
  const sourceStore = useSourceStore()

  const activeSourceUrl = ref<string>('')
  const activeCategoryUrl = ref<string>('')
  
  const books = ref<SearchBook[]>([])
  const loading = ref(false)
  const page = ref(1)
  const globalCursor = ref(0)
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

  const globalExploreSourceUrl = computed(() => GLOBAL_EXPLORE_SOURCE_URL)
  const isGlobalMode = computed(() => activeSourceUrl.value === GLOBAL_EXPLORE_SOURCE_URL)

  async function ensureActiveSource() {
    if (exploreSources.value.length === 0) {
      activeSourceUrl.value = ''
      activeCategoryUrl.value = ''
      categories.value = []
      books.value = []
      hasMore.value = false
      return
    }

    if (!activeSourceUrl.value || isGlobalMode.value) {
      await setSource(GLOBAL_EXPLORE_SOURCE_URL)
      return
    }

    const activeSourceStillValid = exploreSources.value.some((source) => source.bookSourceUrl === activeSourceUrl.value)
    if (!activeSourceStillValid) {
      await setSource(GLOBAL_EXPLORE_SOURCE_URL)
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

  async function setGlobalSource() {
    activeSourceUrl.value = GLOBAL_EXPLORE_SOURCE_URL
    categories.value = GLOBAL_EXPLORE_CATEGORIES
    if (!categories.value.some((category) => category.url === activeCategoryUrl.value)) {
      await setCategory(categories.value[0].url)
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
    if (url === GLOBAL_EXPLORE_SOURCE_URL) {
      await setGlobalSource()
      return
    }

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
      await setCategory(firstCategoryUrl)
    }
  }

  async function setCategory(url: string) {
    const nextUrl = url.trim()
    if (!nextUrl) return
    if (activeCategoryUrl.value !== nextUrl) {
      activeCategoryUrl.value = nextUrl
      await resetAndFetch()
    }
  }

  async function resetAndFetch() {
    books.value = []
    page.value = 1
    globalCursor.value = 0
    hasMore.value = true
    error.value = null
    await fetchMore()
  }

  async function fetchMore() {
    if (loading.value || !hasMore.value || !activeSourceUrl.value || !activeCategoryUrl.value) return

    loading.value = true
    error.value = null
    try {
      if (isGlobalMode.value) {
        const result = await exploreBookGlobal({
          category: activeCategoryUrl.value,
          cursor: globalCursor.value,
          limit: 20,
          scanLimit: 96,
          concurrentCount: 16,
        })
        if (result.books.length > 0) {
          books.value.push(...result.books)
        }
        globalCursor.value = result.nextCursor
        hasMore.value = result.hasMore
        return
      }

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
    globalExploreSourceUrl,
    isGlobalMode,
    categories,
    init,
    setSource,
    setCategory,
    fetchMore,
    resetAndFetch,
  }
})
