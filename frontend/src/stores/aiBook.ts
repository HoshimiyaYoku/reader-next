import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getAiModelConfig } from '../api/ai/model'
import {
  cancelAiBookCatchup,
  generateAiBookMap,
  generateAiBookChapterMemory,
  getAiBookCatchupStatus,
  getAiBookChapterMemory,
  getAiBookMemory,
  resetAiBookMemory,
  setAiBookEnabled,
  startAiBookCatchup,
} from '../api/ai/book'
import type {
  AiBookCatchupStatus,
  AiBookChapterMemoryViewModel,
  AiBookConfig,
  AiBookGenerationMode,
  AiBookMemoryViewModel,
  AiServerModelConfigResponse,
  Book,
  BookChapter,
} from '../types'
import { useAppStore } from './app'
import { getAiBookConfig, saveAiBookConfig } from '../utils/aiBookConfig'

type GenerationPhase = 'idle' | 'loading' | 'text' | 'error'
interface LoadServerModelConfigOptions {
  force?: boolean
}

export const useAiBookStore = defineStore('aiBook', () => {
  const appStore = useAppStore()
  const memoryView = ref<AiBookMemoryViewModel | null>(null)
  const chapterMemory = ref<AiBookChapterMemoryViewModel | null>(null)
  const catchupStatus = ref<AiBookCatchupStatus | null>(null)
  const loading = ref(false)
  const phase = ref<GenerationPhase>('idle')
  const statusText = ref('')
  const catchupPolling = ref(false)
  const updatingChapterKeys = new Set<string>()

  const username = computed(() => appStore.userInfo?.username || 'default')
  const config = ref<AiBookConfig>(getAiBookConfig(username.value))
  const serverModelConfig = ref<AiServerModelConfigResponse | null>(null)
  const isBusy = computed(() => (
    loading.value
    || phase.value === 'loading'
    || phase.value === 'text'
    || catchupPolling.value
  ))
  const canUseServerModel = computed(() => Boolean(serverModelConfig.value?.canUseServerModel))
  const isServerModelAdmin = computed(() => Boolean(serverModelConfig.value?.isAdmin))
  let serverModelConfigRequest: Promise<AiServerModelConfigResponse | null> | null = null

  async function loadServerModelConfig(options: LoadServerModelConfigOptions = {}) {
    if (!options.force && serverModelConfig.value) {
      return serverModelConfig.value
    }
    if (!options.force && serverModelConfigRequest) {
      return serverModelConfigRequest
    }

    const request = getAiModelConfig()
      .then((next) => {
        serverModelConfig.value = next
        return next
      })
      .catch(() => {
        serverModelConfig.value = null
        return null
      })
      .finally(() => {
        if (serverModelConfigRequest === request) {
          serverModelConfigRequest = null
        }
      })

    serverModelConfigRequest = request
    return request
  }

  function refreshConfig() {
    config.value = getAiBookConfig(username.value)
    return config.value
  }

  function persistConfig(next: AiBookConfig) {
    config.value = saveAiBookConfig(username.value, next)
    return config.value
  }

  async function load(book: Book) {
    loading.value = true
    statusText.value = '加载 AI 资料...'
    memoryView.value = null
    chapterMemory.value = null
    try {
      const response = await getAiBookMemory(book.bookUrl)
      applyMemoryResponse(response.memory)
      return memoryView.value
    } catch (error) {
      memoryView.value = null
      chapterMemory.value = null
      throw error
    } finally {
      loading.value = false
      if (phase.value === 'idle') {
        statusText.value = ''
      }
    }
  }

  async function loadChapterMemory(bookUrl: string, chapterIndex: number) {
    loading.value = true
    statusText.value = `加载第 ${chapterIndex + 1} 章 AI 资料...`
    chapterMemory.value = null
    try {
      const response = await getAiBookChapterMemory({ bookUrl, chapterIndex })
      applyChapterResponse(response.memory, response.chapter)
      return chapterMemory.value
    } catch (error) {
      chapterMemory.value = null
      throw error
    } finally {
      loading.value = false
      if (phase.value === 'idle') {
        statusText.value = ''
      }
    }
  }

  async function setEnabled(book: Book, enabled: boolean) {
    phase.value = 'loading'
    statusText.value = enabled ? '开启 AI 资料...' : '关闭 AI 资料...'
    try {
      const response = await setAiBookEnabled({ bookUrl: book.bookUrl, enabled })
      applyMemoryResponse(response.memory)
      return memoryView.value
    } finally {
      phase.value = 'idle'
      statusText.value = ''
    }
  }

  async function reset(book: Book) {
    phase.value = 'loading'
    statusText.value = '重置 AI 资料...'
    try {
      const response = await resetAiBookMemory(book.bookUrl)
      applyMemoryResponse(response.memory)
      chapterMemory.value = null
      return memoryView.value
    } finally {
      phase.value = 'idle'
      statusText.value = ''
    }
  }

  async function generateChapterMemory(params: { bookUrl: string; chapterIndex: number; mode?: AiBookGenerationMode }) {
    phase.value = 'text'
    statusText.value = `生成第 ${params.chapterIndex + 1} 章 AI 资料...`
    try {
      const response = await generateAiBookChapterMemory(params)
      applyChapterResponse(response.memory, response.chapter)
      phase.value = 'idle'
      statusText.value = ''
      return chapterMemory.value
    } catch (error) {
      setActionError((error as Error).message || 'AI 资料更新失败')
      throw error
    }
  }

  async function generateMap(params: { bookUrl: string; sourceChapterIndex?: number; prompt?: string }) {
    phase.value = 'loading'
    statusText.value = '生成 AI 地图...'
    try {
      const response = await generateAiBookMap(params)
      applyMemoryResponse(response.memory)
      phase.value = 'idle'
      statusText.value = ''
      return memoryView.value?.map || null
    } catch (error) {
      setActionError((error as Error).message || 'AI 地图生成失败')
      throw error
    }
  }

  async function startCatchup(params: { bookUrl: string; targetChapterIndex?: number }) {
    catchupPolling.value = true
    try {
      catchupStatus.value = await startAiBookCatchup(params)
      return catchupStatus.value
    } finally {
      catchupPolling.value = false
    }
  }

  async function loadCatchupStatus(bookUrl: string) {
    catchupPolling.value = true
    try {
      catchupStatus.value = await getAiBookCatchupStatus(bookUrl)
      return catchupStatus.value
    } finally {
      catchupPolling.value = false
    }
  }

  async function cancelCatchup(bookUrl: string) {
    catchupPolling.value = true
    try {
      catchupStatus.value = await cancelAiBookCatchup(bookUrl)
      return catchupStatus.value
    } finally {
      catchupPolling.value = false
    }
  }

  async function autoUpdateCompletedChapter(params: {
    book: Book
    chapter: BookChapter
    chapterContent: string
    chapters?: BookChapter[]
  }) {
    const current = memoryView.value?.bookUrl === params.book.bookUrl
      ? memoryView.value
      : await load(params.book).catch(() => null)
    if (!current?.enabled) return null
    await generateChapterMemory({
      bookUrl: params.book.bookUrl,
      chapterIndex: params.chapter.index,
      mode: 'auto',
    }).catch(() => null)
    return memoryView.value
  }

  async function runChapterUpdate(params: {
    book: Book
    chapter: BookChapter
    chapterContent: string
    current?: AiBookMemoryViewModel | null
    allowSkip?: boolean
    throwOnError?: boolean
    chapters?: BookChapter[]
  }): Promise<AiBookMemoryViewModel> {
    const key = `${params.book.bookUrl}::${params.chapter.index}`
    if (updatingChapterKeys.has(key)) {
      return resolveMemoryViewFallback(memoryView.value, params.book, params.current)
    }
    updatingChapterKeys.add(key)
    try {
      await generateChapterMemory({
        bookUrl: params.book.bookUrl,
        chapterIndex: params.chapter.index,
        mode: params.allowSkip ? 'auto' : 'manual',
      })
      return resolveMemoryViewFallback(memoryView.value, params.book, params.current)
    } catch (error) {
      applyLocalError(params.chapter.index, params.chapter.title, (error as Error).message || 'AI 资料更新失败')
      if (params.throwOnError) {
        throw error
      }
      return resolveMemoryViewFallback(memoryView.value, params.book, params.current)
    } finally {
      updatingChapterKeys.delete(key)
    }
  }

  function applyMemoryResponse(next: AiBookMemoryViewModel) {
    memoryView.value = next
  }

  function applyChapterResponse(nextMemory: AiBookMemoryViewModel, nextChapter: AiBookChapterMemoryViewModel) {
    memoryView.value = nextMemory
    chapterMemory.value = nextChapter
  }

  function applyLocalError(chapterIndex: number, chapterTitle: string, message: string) {
    if (!memoryView.value) {
      return
    }
    memoryView.value = {
      ...memoryView.value,
      lastError: message,
      lastErrorChapterIndex: chapterIndex,
      lastErrorChapterTitle: chapterTitle,
    }
  }

  function setActionError(message: string) {
    phase.value = 'error'
    statusText.value = message
  }

  return {
    memoryView,
    chapterMemory,
    catchupStatus,
    loading,
    phase,
    statusText,
    catchupPolling,
    isBusy,
    config,
    serverModelConfig,
    canUseServerModel,
    isServerModelAdmin,
    loadServerModelConfig,
    refreshConfig,
    persistConfig,
    load,
    loadChapterMemory,
    setEnabled,
    reset,
    generateChapterMemory,
    generateMap,
    startCatchup,
    loadCatchupStatus,
    cancelCatchup,
    // temporary wrappers until Task 7 switches AiBookView/reader.ts to V3 actions directly
    autoUpdateCompletedChapter,
    runChapterUpdate,
  }
})

function resolveMemoryViewFallback(next: AiBookMemoryViewModel | null, book: Book, current?: AiBookMemoryViewModel | null): AiBookMemoryViewModel {
  return next || current || {
      bookUrl: book.bookUrl,
      bookName: book.name,
      author: book.author,
      enabled: false,
      updatedAt: Date.now(),
      summary: {
        current: '',
        recentChanges: [],
        openQuestions: [],
      },
      characters: [],
      relationships: [],
      knowledgeFacts: [],
      locations: [],
      map: null,
      cleanup: {
        droppedFactsCount: 0,
        droppedByReason: {},
        oldSchemaBackedUp: false,
      },
      catchupStats: null,
      lastError: null,
      lastErrorChapterIndex: null,
      lastErrorChapterTitle: null,
    }
}
