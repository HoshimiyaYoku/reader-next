<template>
  <div class="search-results">
    <div class="search-header">
      <h2>
        搜索 "{{ searchKey }}"
        <span v-if="isSearching" class="searching-indicator">
          <span class="dot-pulse"></span>
          搜索中...
        </span>
        <span v-else class="result-count">({{ displayResults.length }} 个结果)</span>
      </h2>
      <button class="back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        返回书架
      </button>
    </div>

    <div class="search-filters">
      <div class="filter-tabs" role="tablist" aria-label="搜索范围">
        <button
          type="button"
          class="filter-tab"
          :class="{ active: searchScope === 'all' }"
          @click="searchScope = 'all'"
        >
          全部书源
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ active: searchScope === 'group' }"
          @click="searchScope = 'group'"
        >
          按分组
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ active: searchScope === 'source' }"
          @click="searchScope = 'source'"
        >
          单个书源
        </button>
      </div>

      <div v-if="searchScope === 'group'" class="filter-select-wrap">
        <select v-model="selectedGroup" class="filter-select">
          <option v-for="group in sourceGroups" :key="group" :value="group">
            {{ group }}
          </option>
        </select>
      </div>

      <div v-else-if="searchScope === 'source'" class="filter-select-wrap">
        <select v-model="selectedSourceUrl" class="filter-select">
          <option v-for="source in sourceOptions" :key="source.bookSourceUrl" :value="source.bookSourceUrl">
            {{ source.bookSourceName }}
          </option>
        </select>
      </div>
    </div>

    <BookGrid
      :books="displayResults"
      :is-search="true"
      :loading="isSearching && displayResults.length === 0"
      empty-text="未找到相关书籍"
      @click="handleBookClick"
      @info="handleBookInfo"
      @addToShelf="handleAddToShelf"
    />

    <div class="search-more">
      <button
        type="button"
        class="search-more-btn"
        :disabled="isSearching"
        @click="doSearch(searchKey, true)"
      >
        {{ isSearching ? '正在扩展搜索…' : '搜索更多' }}
      </button>
      <span class="search-more-hint">
        {{ searchHasMoreSources ? '继续搜索尚未完成的书源' : `继续搜索第 ${searchPage + 1} 页` }}
      </span>
    </div>

    <BookDetailModal
      v-model="showBookDetail"
      :book="selectedBook"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBookshelfStore } from '../stores/bookshelf'
import { useReaderStore } from '../stores/reader'
import { useAppStore } from '../stores/app'
import { useSourceStore } from '../stores/source'
import { searchBookMultiSSE } from '../api/search'
import { saveBook } from '../api/bookshelf'
import BookGrid from './BookGrid.vue'
import BookDetailModal from './BookDetailModal.vue'
import type { Book, SearchBook } from '../types'
import { getSearchRequestProgress } from '../utils/searchPagination'

import { storeToRefs } from 'pinia'

const router = useRouter()
const shelfStore = useBookshelfStore()
const readerStore = useReaderStore()
const appStore = useAppStore()
const sourceStore = useSourceStore()

const {
  searchKey,
  searchResults: results,
  isSearching,
  searchScope,
  searchGroup: selectedGroup,
  searchSourceUrl: selectedSourceUrl,
  searchPage,
  searchLastIndex,
  searchHasMoreSources,
} = storeToRefs(shelfStore)

let eventSource: EventSource | null = null
const showBookDetail = ref(false)
const selectedBook = ref<Book | SearchBook | null>(null)

const sourceByUrl = computed(() => {
  return new Map(sourceStore.sources.map((source) => [source.bookSourceUrl, source]))
})

const sourceGroups = computed(() => {
  const groups = new Set<string>()
  for (const source of sourceStore.sources) {
    const parts = (source.bookSourceGroup || '')
      .split(/[;,，；、|/]/)
      .map((item) => item.trim())
      .filter(Boolean)
    for (const group of parts) {
      groups.add(group)
    }
  }
  return Array.from(groups).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})

const sourceOptions = computed(() => {
  return [...sourceStore.sources]
    .filter((source) => source.enabled !== false)
    .sort((a, b) => {
      const orderDiff = (a.customOrder ?? 0) - (b.customOrder ?? 0)
      if (orderDiff !== 0) return orderDiff
      return a.bookSourceName.localeCompare(b.bookSourceName, 'zh-Hans-CN')
    })
})

const displayResults = computed<SearchBook[]>(() => {
  return results.value.map((book) => {
    const source = sourceByUrl.value.get(book.origin)
    return {
      ...book,
      originName: book.originName || source?.bookSourceName || book.origin,
      originGroup: book.originGroup || source?.bookSourceGroup,
    }
  })
})

function closeEventSource() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

function ensureSearchSelection() {
  if (searchScope.value === 'group') {
    const selectedGroupStillValid = selectedGroup.value && sourceGroups.value.includes(selectedGroup.value)
    if (!selectedGroupStillValid && sourceGroups.value.length > 0) {
      selectedGroup.value = sourceGroups.value[0]
    }
  }
  if (searchScope.value === 'source') {
    const selectedSourceStillValid = sourceOptions.value.some((source) => source.bookSourceUrl === selectedSourceUrl.value)
    if (!selectedSourceStillValid && sourceOptions.value.length > 0) {
      selectedSourceUrl.value = sourceOptions.value[0].bookSourceUrl
    }
  }
}

function currentSearchParams(key = searchKey.value) {
  return {
    key,
    scope: searchScope.value,
    group: searchScope.value === 'group' ? selectedGroup.value : '',
    sourceUrl: searchScope.value === 'source' ? selectedSourceUrl.value : '',
  }
}

function cacheCurrentSearch(searchParams: ReturnType<typeof currentSearchParams>) {
  shelfStore.cacheSearchResults({
    ...searchParams,
    page: searchPage.value,
    lastIndex: searchLastIndex.value,
    hasMoreSources: searchHasMoreSources.value,
    results: shelfStore.searchResults,
  })
}

function doSearch(key: string, append = false) {
  if (shelfStore.isSearching) return
  closeEventSource()
  const searchParams = currentSearchParams(key)
  shelfStore.persistSearchPreferences()

  if (searchScope.value === 'group' && !selectedGroup.value) {
    shelfStore.searchResults = []
    shelfStore.isSearching = false
    return
  }

  if (searchScope.value === 'source' && !selectedSourceUrl.value) {
    shelfStore.searchResults = []
    shelfStore.isSearching = false
    return
  }

  const cachedResults = append ? null : shelfStore.getCachedSearchResults(searchParams)
  if (cachedResults !== null) {
    shelfStore.searchResults = cachedResults
    const cachedProgress = shelfStore.getCachedSearchProgress(searchParams)
    searchPage.value = cachedProgress?.page ?? 1
    searchLastIndex.value = cachedProgress?.lastIndex ?? -1
    searchHasMoreSources.value = cachedProgress?.hasMoreSources ?? false
    shelfStore.isSearching = false
    return
  }

  const requestProgress = getSearchRequestProgress({
    page: searchPage.value,
    lastIndex: searchLastIndex.value,
    hasMoreSources: searchHasMoreSources.value,
  }, append)
  if (!append) {
    shelfStore.searchResults = []
    searchPage.value = 1
    searchLastIndex.value = -1
    searchHasMoreSources.value = false
  }
  shelfStore.isSearching = true

  eventSource = searchBookMultiSSE({
    key,
    page: requestProgress.page,
    lastIndex: requestProgress.lastIndex,
    concurrentCount: 24,
    bookSourceGroup: searchScope.value === 'group' ? selectedGroup.value : undefined,
    bookSourceUrl: searchScope.value === 'source' ? selectedSourceUrl.value : undefined,
  })

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.data && Array.isArray(data.data)) {
        const existing = new Set(shelfStore.searchResults.map((r) => `${r.origin}::${r.bookUrl}`))
        const newBooks = data.data.filter((b: SearchBook) => !existing.has(`${b.origin}::${b.bookUrl}`))
        shelfStore.searchResults = [...shelfStore.searchResults, ...newBooks]
      }
    } catch { /* skip */ }
  }

  eventSource.addEventListener('end', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data)
      searchPage.value = Number.isFinite(data.page) ? data.page : requestProgress.page
      searchLastIndex.value = Number.isFinite(data.lastIndex) ? data.lastIndex : requestProgress.lastIndex
      searchHasMoreSources.value = data.hasMore === true
    } catch {
      searchPage.value = requestProgress.page
      searchLastIndex.value = requestProgress.lastIndex
      searchHasMoreSources.value = false
    }
    shelfStore.isSearching = false
    cacheCurrentSearch(searchParams)
    closeEventSource()
  })

  eventSource.addEventListener('error', () => {
    shelfStore.isSearching = false
    closeEventSource()
  })

  eventSource.onerror = () => {
    shelfStore.isSearching = false
    closeEventSource()
  }
}

let lastSearchKey = ''
let lastSearchScope = ''
let lastSearchGroup = ''
let lastSearchSourceUrl = ''

watch(
  [() => shelfStore.searchKey, searchScope, selectedGroup, selectedSourceUrl],
  ([key, scope, group, sourceUrl]) => {
    ensureSearchSelection()
    shelfStore.persistSearchPreferences()
    if (key) {
      // 如果搜索条件没变且已有结果，不重新搜索
      const conditionsUnchanged =
        key === lastSearchKey &&
        scope === lastSearchScope &&
        group === lastSearchGroup &&
        sourceUrl === lastSearchSourceUrl
      if (conditionsUnchanged && shelfStore.searchResults.length > 0) {
        return
      }
      lastSearchKey = key
      lastSearchScope = scope
      lastSearchGroup = group
      lastSearchSourceUrl = sourceUrl
      doSearch(key)
    } else {
      closeEventSource()
      shelfStore.searchResults = []
      shelfStore.isSearching = false
      lastSearchKey = ''
      lastSearchScope = ''
      lastSearchGroup = ''
      lastSearchSourceUrl = ''
    }
  },
  { immediate: true }
)

watch([searchScope, sourceGroups, sourceOptions], () => {
  ensureSearchSelection()
  shelfStore.persistSearchPreferences()
}, { immediate: true })

onMounted(async () => {
  if (sourceStore.sources.length === 0) {
    await sourceStore.fetchSources().catch(() => undefined)
  }
  ensureSearchSelection()
})

onUnmounted(() => {
  shelfStore.pauseSearch()
  closeEventSource()
})

async function handleBookClick(book: Book | SearchBook) {
  const b = book as Book
  if (b.origin && b.bookUrl) {
    await readerStore.loadBook(b)
    await readerStore.loadChapter(readerStore.currentIndex)
    router.push('/reader')
  }
}

function handleBookInfo(book: Book | SearchBook) {
  selectedBook.value = book
  showBookDetail.value = true
}

async function handleAddToShelf(book: Book | SearchBook) {
  try {
    await saveBook({
      name: book.name,
      author: book.author,
      bookUrl: book.bookUrl,
      origin: book.origin,
      coverUrl: book.coverUrl,
    })
    appStore.showToast(`"${book.name}" 已加入书架`, 'success')
    shelfStore.fetchBooks()
  } catch (e: unknown) {
    appStore.showToast((e as Error).message, 'error')
  }
}

defineEmits<{
  back: []
}>()
</script>

<style scoped>
.search-results {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 0 var(--space-6);
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) 0;
  gap: var(--space-4);
}

.search-header h2 {
  font-size: var(--text-xl);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.result-count {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.searching-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-primary);
}

.dot-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: pulse 1.2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  transition: all var(--duration-fast);
}

.back-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.search-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.filter-tabs {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px;
  border-radius: var(--radius-full);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-light);
}

.filter-tab {
  min-height: 34px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: all var(--duration-fast);
}

.filter-tab:hover {
  color: var(--color-text);
  background: var(--color-bg-hover);
}

.filter-tab.active {
  color: white;
  background: var(--color-primary);
}

.filter-select-wrap {
  min-width: min(100%, 280px);
}

.filter-select {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.search-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) 0 calc(var(--space-8) + var(--safe-area-bottom));
}

.search-more-btn {
  min-width: 148px;
  min-height: 44px;
  padding: 0 var(--space-6);
  border-radius: var(--radius-full);
  color: white;
  background: var(--color-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  transition: opacity var(--duration-fast), transform var(--duration-fast);
}

.search-more-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.search-more-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}

.search-more-hint {
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
}

@media (max-width: 720px) {
  .search-results {
    padding: 0 var(--space-4);
  }

  .search-header {
    flex-direction: column;
    align-items: stretch;
  }

  .search-header h2 {
    flex-wrap: wrap;
  }

  .back-btn {
    justify-content: center;
  }

  .filter-tabs {
    width: 100%;
    justify-content: space-between;
  }

  .filter-tab {
    flex: 1;
    padding: 0 var(--space-2);
  }

  .filter-select-wrap {
    width: 100%;
    min-width: 0;
  }
}
</style>
