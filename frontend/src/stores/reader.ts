import { defineStore } from 'pinia'
import {
  defaultConfig,
  loadConfig,
  loadReaderColorStyle,
  normalizeNumber,
  themePresets,
} from './reader/readerConfig'
import type { ReadConfig, ReaderColorMode, ReaderColorStyle } from './reader/readerConfig'
import { useReaderBackground } from './reader/useReaderBackground'

export { fontPresets, themePresets } from './reader/readerConfig'
export type {
  ReadConfig,
  ReaderBackgroundConfig,
  ReaderBackgroundFit,
  ReaderBackgroundPosition,
  ReaderColorMode,
  ReaderColorStyle,
  ThemePreset,
} from './reader/readerConfig'
import { ref, computed, reactive, watch } from 'vue'
import { useAppStore } from './app'
import { useBookshelfStore } from './bookshelf'
import { useAiBookStore } from './aiBook'
import {
  getChapterList,
  getBookContent,
  getBookInfo,
  getShelfBook,
  saveBookProgress,
  setBookSource as apiSetBookSource,
} from '../api/bookshelf'
import type { SaveBookProgressResponse } from '../api/bookshelf'
import {
  getBookmarks,
  saveBookmark,
  deleteBookmark as apiDeleteBookmark,
  deleteBookmarks as apiDeleteBookmarks,
} from '../api/bookmark'
import { getReplaceRules } from '../api/replaceRule'
import type { Book, BookChapter, Bookmark, ReplaceRule } from '../types'
import { getBrowserCachedChapter, setBrowserCachedChapter } from '../utils/browserCache'
import { isLocalTxtBook } from '../utils/localBook'
import { saveRecentReadBook } from '../utils/recentBooks'
import {
  DEFAULT_OPENAI_BASE_URL,
  requestOpenAISpeechAudio,
} from '../utils/openaiSpeech'
import { requestAzureSpeechAudio } from '../utils/azureSpeech'

const READER_SESSION_KEY = 'reader-last-session'
const READER_READ_HISTORY_PREFIX = 'reader-read-history:'
const SERVER_PROGRESS_SCALE = 10000
interface ServerProgressPayload {
  bookUrl: string
  index: number
  position: number
  revision: number
}

interface PersistedReaderSession {
  book: Book
  chapters: BookChapter[]
  currentIndex: number
  chapterScrollProgress: number
  updatedAt: number
}

interface TTSOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (event?: SpeechSynthesisErrorEvent | Error) => void
}

interface PreloadedOpenAIAudio {
  key: string
  blob: Blob
  audio?: HTMLAudioElement
  url?: string
}

const OPENAI_AUDIO_PRELOAD_LIMIT = 8
const REMOTE_SPEECH_AUDIO_BUFFER_COUNT = 2

export type SpeechProvider = 'system' | 'openai' | 'azure'
export type OpenAISpeechSource = 'browser' | 'server'
export type OpenAISpeechFormat = 'mp3' | 'wav' | 'opus' | 'flac' | 'pcm'
export type OpenAISpeechRequestMode = 'chunked' | 'merged'
export type AzureSpeechFormat =
  | 'audio-24khz-48kbitrate-mono-mp3'
  | 'audio-48khz-96kbitrate-mono-mp3'
  | 'riff-24khz-16bit-mono-pcm'
  | 'webm-24khz-16bit-mono-opus'

interface SpeechConfig {
  provider: SpeechProvider
  voiceName: string
  speechRate: number
  speechPitch: number
  speechVolume: number
  stopAfterMinutes: number
  openaiSource: OpenAISpeechSource
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  openaiVoice: string
  openaiFormat: OpenAISpeechFormat
  openaiRequestMode: OpenAISpeechRequestMode
  azureRegion: string
  azureApiKey: string
  azureVoice: string
  azureFormat: AzureSpeechFormat
}

const defaultSpeechConfig: SpeechConfig = {
  provider: 'system',
  voiceName: '',
  speechRate: 1,
  speechPitch: 1,
  speechVolume: 1,
  stopAfterMinutes: 0,
  openaiSource: 'browser',
  openaiBaseUrl: DEFAULT_OPENAI_BASE_URL,
  openaiApiKey: '',
  openaiModel: 'qwen-tts',
  openaiVoice: 'vivian',
  openaiFormat: 'mp3',
  openaiRequestMode: 'chunked',
  azureRegion: '',
  azureApiKey: '',
  azureVoice: 'zh-CN-XiaoxiaoNeural',
  azureFormat: 'audio-24khz-48kbitrate-mono-mp3',
}

function loadSpeechConfig(): SpeechConfig {
  try {
    const saved = localStorage.getItem('reader-speechConfig')
    if (saved) return migrateSpeechConfig(JSON.parse(saved) as Partial<SpeechConfig>)
  } catch { /* ignore */ }
  return { ...defaultSpeechConfig }
}

function migrateSpeechConfig(saved: Partial<SpeechConfig>): SpeechConfig {
  const merged = { ...defaultSpeechConfig, ...saved }
  if (!['system', 'openai', 'azure'].includes(merged.provider)) {
    merged.provider = defaultSpeechConfig.provider
  }
  if (merged.openaiSource !== 'browser' && merged.openaiSource !== 'server') {
    merged.openaiSource = defaultSpeechConfig.openaiSource
  }
  if (!['mp3', 'wav', 'opus', 'flac', 'pcm'].includes(merged.openaiFormat)) {
    merged.openaiFormat = defaultSpeechConfig.openaiFormat
  }
  if (merged.openaiRequestMode !== 'chunked' && merged.openaiRequestMode !== 'merged') {
    merged.openaiRequestMode = defaultSpeechConfig.openaiRequestMode
  }
  if (![
    'audio-24khz-48kbitrate-mono-mp3',
    'audio-48khz-96kbitrate-mono-mp3',
    'riff-24khz-16bit-mono-pcm',
    'webm-24khz-16bit-mono-opus',
  ].includes(merged.azureFormat)) {
    merged.azureFormat = defaultSpeechConfig.azureFormat
  }
  merged.speechRate = normalizeNumber(
    merged.speechRate,
    defaultSpeechConfig.speechRate,
    0.5,
    merged.provider === 'azure' ? 2 : 3,
  )
  merged.speechPitch = normalizeNumber(
    merged.speechPitch,
    defaultSpeechConfig.speechPitch,
    0.5,
    merged.provider === 'azure' ? 1.5 : 2,
  )
  merged.speechVolume = normalizeNumber(
    merged.speechVolume,
    defaultSpeechConfig.speechVolume,
    0,
    1,
  )
  merged.stopAfterMinutes = normalizeNumber(merged.stopAfterMinutes, defaultSpeechConfig.stopAfterMinutes, 0)
  return merged
}

function isSafariSpeechFallbackMode() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const vendor = navigator.vendor || ''
  const isAppleEngine = /Apple/i.test(vendor) || /iPhone|iPad|iPod/i.test(ua)
  return isAppleEngine && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|EdgiOS|Firefox|FxiOS|OPR|OPT|SamsungBrowser|Android/i.test(ua)
}

export const useReaderStore = defineStore('reader', () => {
  type ReaderPanel = 'catalog' | 'settings' | 'bookshelf' | 'source' | 'bookmark' | 'rule' | 'cache' | null
  const appStore = useAppStore()
  const shelfStore = useBookshelfStore()
  const aiBookStore = useAiBookStore()
  const book = ref<Book | null>(null)
  const chapters = ref<BookChapter[]>([])
  const currentIndex = ref(0)
  const content = ref('')
  const loading = ref(false)
  const chaptersLoading = ref(false)
  const bookmarks = ref<Bookmark[]>([])
  const replaceRules = ref<ReplaceRule[]>([])
  const preloadedContent = ref<Map<number, string>>(new Map()) // index -> content
  const isAutoScrolling = ref(false)
  const chapterScrollProgress = ref(0)
  const readChapterKeys = ref<Set<string>>(new Set())
  const progressDirty = ref(false)
  const lastServerProgressKey = ref('')
  const knownProgressRevisions = new Map<string, number>()
  let progressChangeVersion = 0
  let progressSaveQueue: Promise<void> = Promise.resolve()
  let lastProgressConflictKey = ''

  const currentChapter = computed(() => chapters.value[currentIndex.value] || null)
  const hasNext = computed(() => currentIndex.value < chapters.value.length - 1)
  const hasPrev = computed(() => currentIndex.value > 0)

  const readingProgress = computed(() => {
    if (chapters.value.length === 0) return '0%'
    const progress = ((currentIndex.value + chapterScrollProgress.value) / chapters.value.length) * 100
    const normalized = Math.max(0, Math.min(100, progress))
    return `${normalized < 10 ? normalized.toFixed(1) : Math.round(normalized)}%`
  })

  /* ─── Reading config ─── */
  const config = reactive<ReadConfig>(loadConfig())

  function saveConfig() {
    localStorage.setItem('readConfig', JSON.stringify(config))
  }

  function updateConfig<K extends keyof ReadConfig>(key: K, value: ReadConfig[K]) {
    config[key] = value
    if (key === 'enablePreload' && !value) {
      preloadedContent.value.clear()
    }
    saveConfig()
  }

  function resetConfig() {
    Object.assign(config, defaultConfig)
    saveConfig()
  }

  const chineseConverter = ref<((text: string) => string) | null>(null)
  let chineseLoading: Promise<void> | null = null

  async function ensureChineseConverterLoaded() {
    if (chineseConverter.value || chineseLoading) return chineseLoading || Promise.resolve()
    chineseLoading = import('../utils/chinese.js')
      .then((module) => {
        chineseConverter.value = module.traditionalized
      })
      .catch(() => {
        chineseConverter.value = null
      })
      .finally(() => {
        chineseLoading = null
      })
    return chineseLoading
  }

  /* ─── Theme ─── */
  const storedThemeIndex = parseInt(localStorage.getItem('reader-themeIndex') || '0')
  const themeIndex = ref(Number.isInteger(storedThemeIndex) && themePresets[storedThemeIndex]
    ? storedThemeIndex
    : 0)
  const legacyDayTheme = themePresets[themeIndex.value] || themePresets[0]
  const dayColorStyle = reactive(loadReaderColorStyle('reader-dayColorStyle', {
    backgroundColor: legacyDayTheme.body,
    textColor: legacyDayTheme.fontColor,
  }))
  const nightPreset = themePresets[themePresets.length - 1]
  const nightColorStyle = reactive(loadReaderColorStyle('reader-nightColorStyle', {
    backgroundColor: nightPreset.body,
    textColor: nightPreset.fontColor,
  }))
  const themeMode = computed(() => appStore.themeMode)
  const isNight = computed({
    get: () => appStore.theme === 'dark',
    set: (value: boolean) => {
      appStore.setThemeMode(value ? 'dark' : 'light')
      localStorage.setItem('reader-isNight', String(value))
    },
  })

  const currentTheme = computed(() => {
    const colors = isNight.value ? nightColorStyle : dayColorStyle
    return {
      name: isNight.value ? '夜间自定义' : '白天自定义',
      body: colors.backgroundColor,
      content: colors.backgroundColor,
      popup: colors.backgroundColor,
      fontColor: colors.textColor,
    }
  })

  const {
    readerBackgroundConfig,
    readerBackgroundUrl,
    readerBackgroundLoaded,
    readerBackgroundSyncState,
    setReaderBackgroundImage,
    clearReaderBackgroundImage,
    updateReaderBackgroundConfig,
  } = useReaderBackground()

  function setThemeIndex(idx: number) {
    const preset = themePresets[idx]
    if (!preset) return
    themeIndex.value = idx
    dayColorStyle.backgroundColor = preset.body
    dayColorStyle.textColor = preset.fontColor
    persistReaderColorStyle('light')
    appStore.setThemeMode('light')
    localStorage.setItem('reader-themeIndex', String(idx))
    localStorage.setItem('reader-isNight', 'false')
  }

  function setThemeMode(mode: 'system' | ReaderColorMode) {
    appStore.setThemeMode(mode)
    localStorage.setItem('reader-isNight', String(appStore.theme === 'dark'))
  }

  function persistReaderColorStyle(mode: ReaderColorMode) {
    const colors = mode === 'dark' ? nightColorStyle : dayColorStyle
    localStorage.setItem(`reader-${mode === 'dark' ? 'night' : 'day'}ColorStyle`, JSON.stringify(colors))
  }

  function updateReaderColor(mode: ReaderColorMode, key: keyof ReaderColorStyle, value: string) {
    if (!value) return
    const colors = mode === 'dark' ? nightColorStyle : dayColorStyle
    colors[key] = value
    persistReaderColorStyle(mode)
  }

  function applyThemePreset(mode: ReaderColorMode, idx: number) {
    const preset = themePresets[idx]
    if (!preset) return
    const colors = mode === 'dark' ? nightColorStyle : dayColorStyle
    colors.backgroundColor = preset.body
    colors.textColor = preset.fontColor
    if (mode === 'light') {
      themeIndex.value = idx
      localStorage.setItem('reader-themeIndex', String(idx))
    }
    persistReaderColorStyle(mode)
  }

  function toggleNight() {
    isNight.value = !isNight.value
  }

  /* ─── Chinese Conversion (OpenCC) ─── */
  /* ─── Content Filtering (Replace Rules) ─── */
  function applyReplaceRules(text: string) {
    if (!text) return ''
    let result = text
    const currentBook = book.value

    function matchRuleScope(rule: ReplaceRule) {
      const scope = (rule.scope || '').trim()
      if (!scope || scope === '*') return true
      if (!currentBook) return false

      if (scope.startsWith('source:')) {
        return scope.slice('source:'.length) === currentBook.origin
      }

      if (scope.startsWith('book:')) {
        return scope.slice('book:'.length) === currentBook.bookUrl
      }

      const scopeParts = scope.split(';')
      if (scopeParts[0] !== '*' && scopeParts[0] !== currentBook.name) {
        return false
      }
      return scopeParts.length === 1 || scopeParts[1] === currentBook.bookUrl
    }

    // Sort by order and apply enabled rules
    const enabledRules = [...replaceRules.value]
      .filter(r => r.isEnabled && matchRuleScope(r))
      .sort((a, b) => a.order - b.order)

    for (const rule of enabledRules) {
      try {
        if (rule.isRegex) {
          const re = new RegExp(rule.pattern, 'gm')
          result = result.replace(re, rule.replacement)
        } else {
          result = result.replaceAll(rule.pattern, rule.replacement)
        }
      } catch (e) {
        console.error(`Failed to apply rule: ${rule.name}`, e)
      }
    }
    return result
  }

  function convertContent(text: string) {
    if (!text || config.chineseMode !== 'traditional' || !chineseConverter.value) return text
    return chineseConverter.value(text)
  }

  function processContentForDisplay(text: string) {
    return convertContent(applyReplaceRules(text))
  }

  const displayContent = computed(() => {
    return processContentForDisplay(content.value)
  })

  watch(
    () => config.chineseMode,
    (mode) => {
      if (mode === 'traditional') {
        void ensureChineseConverterLoaded()
      }
    },
    { immediate: true },
  )

  function saveReaderSession() {
    if (!book.value || !chapters.value.length) return
    const payload: PersistedReaderSession = {
      book: book.value,
      chapters: chapters.value,
      currentIndex: currentIndex.value,
      chapterScrollProgress: chapterScrollProgress.value,
      updatedAt: Date.now(),
    }
    localStorage.setItem(READER_SESSION_KEY, JSON.stringify(payload))
  }

  function encodeServerProgress(progress = chapterScrollProgress.value) {
    return Math.max(
      0,
      Math.min(SERVER_PROGRESS_SCALE, Math.round(Math.max(0, Math.min(1, progress)) * SERVER_PROGRESS_SCALE)),
    )
  }

  function decodeServerProgress(position?: number | null) {
    if (typeof position !== 'number' || Number.isNaN(position)) return 0
    const normalized = position > 1 ? position / SERVER_PROGRESS_SCALE : position
    return Math.max(0, Math.min(1, normalized))
  }

  function normalizeProgressTimestamp(value?: number | null) {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return 0
    return value < 1_000_000_000_000 ? value * 1000 : value
  }

  async function resolveLatestShelfBook(localBook: Book) {
    if (!localBook.bookUrl) return localBook
    const latest = await getShelfBook(localBook.bookUrl).catch(() => null)
    if (!latest || latest.bookUrl !== localBook.bookUrl) return localBook
    const shelfBook = shelfStore.books.find((item) => item.bookUrl === localBook.bookUrl)
    if (shelfBook) {
      Object.assign(shelfBook, latest)
    }
    return latest
  }

  function currentServerProgressPayload(index = currentIndex.value, progress = chapterScrollProgress.value) {
    if (!book.value) return null
    return {
      bookUrl: book.value.bookUrl,
      index,
      position: encodeServerProgress(progress),
      revision: knownProgressRevisions.get(book.value.bookUrl)
        ?? normalizeProgressRevision(book.value.progressRevision),
    }
  }

  function markProgressDirty() {
    progressDirty.value = true
    progressChangeVersion += 1
  }

  function normalizeProgressRevision(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.trunc(value))
      : 0
  }

  function rememberProgressRevision(bookUrl: string, revision: unknown) {
    const candidate = normalizeProgressRevision(revision)
    const known = knownProgressRevisions.get(bookUrl)
    // A delayed keepalive response can arrive after a newer regular save. A
    // revision learned from either response must therefore never move back.
    const normalized = known == null ? candidate : Math.max(known, candidate)
    knownProgressRevisions.set(bookUrl, normalized)
    if (book.value?.bookUrl === bookUrl) {
      book.value.progressRevision = normalized
    }
    const shelfBook = shelfStore.books.find((item) => item.bookUrl === bookUrl)
    if (shelfBook) {
      shelfBook.progressRevision = normalized
    }
  }

  function progressPayloadKey(payload: Pick<ServerProgressPayload, 'bookUrl' | 'index' | 'position'>) {
    return `${payload.bookUrl}::${payload.index}::${payload.position}`
  }

  function serverProgressMatchesPayload(result: SaveBookProgressResponse, payload: ServerProgressPayload) {
    return result.currentProgress?.index === payload.index
      && result.currentProgress.position === payload.position
  }

  function parseKeepaliveProgressResult(raw: unknown): SaveBookProgressResponse | string | null {
    let value: unknown = raw
    if (value && typeof value === 'object' && 'isSuccess' in value) {
      const envelope = value as { isSuccess?: boolean; data?: unknown }
      if (!envelope.isSuccess) return null
      value = envelope.data
    }
    if (typeof value === 'string') return value
    if (!value || typeof value !== 'object') return null
    const result = value as Partial<SaveBookProgressResponse>
    if (typeof result.accepted !== 'boolean'
      || typeof result.currentRevision !== 'number'
      || !Number.isFinite(result.currentRevision)
      || !result.currentProgress
      || typeof result.currentProgress !== 'object') {
      return null
    }
    return result as SaveBookProgressResponse
  }

  function applyProgressSaveResult(
    payload: ServerProgressPayload,
    submittedChangeVersion: number,
    result: SaveBookProgressResponse | string,
    notifyConflict = true,
  ) {
    if (typeof result === 'string') {
      if (book.value?.bookUrl !== payload.bookUrl) return
      if (progressChangeVersion === submittedChangeVersion) {
        progressDirty.value = false
        lastServerProgressKey.value = progressPayloadKey(payload)
      }
      return
    }

    rememberProgressRevision(payload.bookUrl, result.currentRevision)
    if (book.value?.bookUrl !== payload.bookUrl) return

    // A keepalive and a normal save can race with the same revision. If one
    // wins and the other is rejected, matching server progress means the
    // intended position is already durable and is not a cross-device conflict.
    if (result.accepted || serverProgressMatchesPayload(result, payload)) {
      if (progressChangeVersion === submittedChangeVersion) {
        progressDirty.value = false
        lastServerProgressKey.value = progressPayloadKey(payload)
      }
      return
    }

    if (progressChangeVersion === submittedChangeVersion) {
      progressDirty.value = false
      lastServerProgressKey.value = progressPayloadKey(payload)
    }
    const conflictKey = `${payload.bookUrl}::${result.currentRevision}`
    if (notifyConflict && lastProgressConflictKey !== conflictKey) {
      lastProgressConflictKey = conflictKey
      appStore.showToast('其他设备已保存更新进度，本次旧进度未覆盖', 'warning')
    }
  }

  function syncLocalBookProgress(progress = chapterScrollProgress.value) {
    if (!book.value) return
    const encodedProgress = encodeServerProgress(progress)
    book.value.durChapterPos = encodedProgress
    const shelfBook = shelfStore.books.find((item) => item.bookUrl === book.value?.bookUrl)
    if (shelfBook) {
      shelfBook.durChapterPos = encodedProgress
    }
  }

  function getPersistedReaderSession(): PersistedReaderSession | null {
    try {
      const raw = localStorage.getItem(READER_SESSION_KEY)
      if (!raw) return null
      return JSON.parse(raw) as PersistedReaderSession
    } catch {
      return null
    }
  }

  async function restorePersistedSession() {
    const session = getPersistedReaderSession()
    if (!session?.book || !session.chapters?.length) return false

    loading.value = true
    let restoredBook = session.book
    let restoredChapters = session.chapters
    let nextIndex = Math.max(0, Math.min(session.currentIndex || 0, restoredChapters.length - 1))
    let nextProgress = session.chapterScrollProgress || 0

    const latestBook = await resolveLatestShelfBook(session.book)
    if (
      latestBook !== session.book
      && normalizeProgressTimestamp(latestBook.durChapterTime) > normalizeProgressTimestamp(session.updatedAt)
    ) {
      restoredBook = latestBook
      restoredChapters = await getChapterList({
        bookUrl: latestBook.bookUrl,
        bookSourceUrl: latestBook.origin,
        book: latestBook,
      }).catch(() => session.chapters)
      nextIndex = Math.max(0, Math.min(restoredChapters.length - 1, latestBook.durChapterIndex || 0))
      nextProgress = decodeServerProgress(latestBook.durChapterPos)
    }

    book.value = restoredBook
    rememberProgressRevision(restoredBook.bookUrl, restoredBook.progressRevision)
    currentIndex.value = nextIndex
    chapters.value = restoredChapters
    loadReadChapterHistory(restoredBook)

    try {
      const chapterContent = await fetchChapterContent(nextIndex)
      if (chapterContent == null) return false
      setActiveChapterState(nextIndex, chapterContent, nextProgress)
      markChapterAsRead(nextIndex)
      return true
    } catch {
      return false
    } finally {
      loading.value = false
    }
  }

  function getReadHistoryStorageKey(currentBook?: Book | null) {
    if (!currentBook?.bookUrl) return ''
    return `${READER_READ_HISTORY_PREFIX}${currentBook.bookUrl}`
  }

  function buildReadChapterKey(index: number, chapter?: BookChapter | null, currentBook?: Book | null) {
    if (!currentBook?.bookUrl) return ''
    const sourceKey = currentBook.origin || 'default'
    if (chapter?.url) {
      return `${currentBook.bookUrl}::${sourceKey}::${chapter.url}`
    }
    return `${currentBook.bookUrl}::${sourceKey}::index:${index}`
  }

  function loadReadChapterHistory(currentBook?: Book | null) {
    const storageKey = getReadHistoryStorageKey(currentBook)
    if (!storageKey) {
      readChapterKeys.value = new Set()
      return
    }
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        readChapterKeys.value = new Set()
        return
      }
      const parsed = JSON.parse(raw)
      readChapterKeys.value = new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
    } catch {
      readChapterKeys.value = new Set()
    }
  }

  function persistReadChapterHistory(currentBook?: Book | null) {
    const storageKey = getReadHistoryStorageKey(currentBook)
    if (!storageKey) return
    localStorage.setItem(storageKey, JSON.stringify(Array.from(readChapterKeys.value)))
  }

  function markChapterAsRead(index: number) {
    const key = buildReadChapterKey(index, chapters.value[index], book.value)
    if (!key || readChapterKeys.value.has(key)) return
    const next = new Set(readChapterKeys.value)
    next.add(key)
    readChapterKeys.value = next
    persistReadChapterHistory(book.value)
  }

  function isChapterRead(index: number) {
    return readChapterKeys.value.has(buildReadChapterKey(index, chapters.value[index], book.value))
  }

  /* ─── Auto reading ─── */
  const autoReading = ref(false)
  const autoReadingTimer = ref<number | null>(null)

  function toggleAutoReading() {
    isAutoScrolling.value = !isAutoScrolling.value
    autoReading.value = isAutoScrolling.value
  }

  function stopAutoReading() {
    isAutoScrolling.value = false
    autoReading.value = false
    if (autoReadingTimer.value) {
      clearInterval(autoReadingTimer.value)
      autoReadingTimer.value = null
    }
  }

  /* ─── TTS (Text To Speech) ─── */
  const isSpeaking = ref(false)
  const isSpeechLoading = ref(false)
  const isPaused = ref(false)
  const systemTtsNativeEventsReliable = ref(false)
  const voiceList = ref<SpeechSynthesisVoice[]>([])
  const speechConfig = reactive<SpeechConfig>(loadSpeechConfig())
  const openAISpeechConfigured = computed(() => {
    if (speechConfig.openaiSource === 'server') return true
    return !!speechConfig.openaiBaseUrl.trim()
  })
  const azureSpeechConfigured = computed(() => (
    !!speechConfig.azureRegion.trim()
    && !!speechConfig.azureApiKey.trim()
    && !!speechConfig.azureVoice.trim()
  ))
  const remoteSpeechConfigured = computed(() => (
    speechConfig.provider === 'azure' ? azureSpeechConfigured.value : openAISpeechConfigured.value
  ))
  const speechProviderLabel = computed(() => {
    if (speechConfig.provider === 'openai') return 'OpenAI Speech'
    if (speechConfig.provider === 'azure') return 'Microsoft Azure Speech'
    return '系统语音'
  })
  const speechStopAt = ref(0)
  let speechStopTimer: number | null = null
  let synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis : null
  let currentUtterance: SpeechSynthesisUtterance | null = null
  let currentOpenAIAudio: HTMLAudioElement | null = null
  const remoteSpeechAudioElements: HTMLAudioElement[] = []
  let currentOpenAIAudioUrl = ''
  let currentOpenAIAbortController: AbortController | null = null
  let preloadedOpenAIAudio: PreloadedOpenAIAudio[] = []
  let preloadGeneration = 0
  const inFlightPreloadKeys = new Set<string>()
  const inFlightOpenAIAudioRequests = new Map<string, Promise<Blob>>()
  let currentTTSSessionId = 0
  let mediaSessionConfigured = false

  function logTTS(message: string, payload?: unknown) {
    void message
    void payload
  }

  function captureTTSCaller() {
    try {
      const stack = new Error().stack || ''
      return stack
        .split('\n')
        .slice(2, 5)
        .map((line) => line.trim())
        .join(' | ')
    } catch {
      return ''
    }
  }

  function beginTTSSession() {
    currentTTSSessionId += 1
    logTTS('begin session', { sessionId: currentTTSSessionId })
    return currentTTSSessionId
  }

  function isCurrentTTSSession(sessionId: number) {
    return sessionId === currentTTSSessionId
  }

  function saveSpeechConfig() {
    localStorage.setItem('reader-speechConfig', JSON.stringify(speechConfig))
  }

  function setMediaSessionPlaybackState(state: MediaSessionPlaybackState) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.playbackState = state
    } catch {
      // Media Session is best-effort across mobile browsers.
    }
  }

  function configureMediaSession(rawText = '') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      if (!mediaSessionConfigured) {
        navigator.mediaSession.setActionHandler('play', () => {
          if (currentOpenAIAudio?.paused) {
            void currentOpenAIAudio.play()
          } else if (synth?.paused) {
            synth.resume()
            isPaused.value = false
            isSpeaking.value = true
            setMediaSessionPlaybackState('playing')
          }
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          if (currentOpenAIAudio && !currentOpenAIAudio.paused) {
            currentOpenAIAudio.pause()
          } else if (synth?.speaking && !synth.paused) {
            synth.pause()
            isPaused.value = true
            setMediaSessionPlaybackState('paused')
          }
        })
        navigator.mediaSession.setActionHandler('stop', () => stopTTS())
        mediaSessionConfigured = true
      }
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentChapter.value?.title || book.value?.name || '听书',
          artist: book.value?.author || 'Reader Next',
          album: book.value?.name || 'Reader Next',
        })
      }
      if (rawText) {
        logTTS('media session updated', { text: rawText.slice(0, 40) })
      }
    } catch {
      // Unsupported actions must not block speech playback.
    }
  }

  function fetchVoices() {
    if (!synth) return
    voiceList.value = synth.getVoices().slice().sort((a, b) => {
      const aZh = a.lang.startsWith('zh-')
      const bZh = b.lang.startsWith('zh-')
      if (aZh && !bZh) return -1
      if (!aZh && bZh) return 1
      return a.lang.localeCompare(b.lang)
    })
    if (!speechConfig.voiceName && voiceList.value.length > 0) {
      const zhVoice = voiceList.value.find((v) => v.lang.startsWith('zh-'))
      speechConfig.voiceName = (zhVoice || voiceList.value[0]).name
      saveSpeechConfig()
    }
  }

  function setVoiceName(name: string) {
    speechConfig.voiceName = name
    saveSpeechConfig()
  }

  function setSpeechProvider(provider: SpeechProvider) {
    if (speechConfig.provider === provider) return
    stopTTS(false)
    speechConfig.provider = provider
    if (provider === 'azure') {
      speechConfig.speechRate = Math.min(speechConfig.speechRate, 2)
      speechConfig.speechPitch = Math.min(speechConfig.speechPitch, 1.5)
    }
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechBaseUrl(url: string) {
    speechConfig.openaiBaseUrl = url.trim()
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechSource(source: OpenAISpeechSource) {
    speechConfig.openaiSource = source
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechApiKey(apiKey: string) {
    speechConfig.openaiApiKey = apiKey.trim()
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechModel(model: string) {
    speechConfig.openaiModel = model
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechVoice(voice: string) {
    speechConfig.openaiVoice = voice
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechFormat(format: OpenAISpeechFormat) {
    speechConfig.openaiFormat = format
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setOpenAISpeechRequestMode(mode: OpenAISpeechRequestMode) {
    speechConfig.openaiRequestMode = mode
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setAzureSpeechRegion(region: string) {
    speechConfig.azureRegion = region.trim()
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setAzureSpeechApiKey(apiKey: string) {
    speechConfig.azureApiKey = apiKey.trim()
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setAzureSpeechVoice(voice: string) {
    speechConfig.azureVoice = voice.trim()
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setAzureSpeechFormat(format: AzureSpeechFormat) {
    speechConfig.azureFormat = format
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setSpeechRate(rate: number) {
    const max = speechConfig.provider === 'azure' ? 2 : 3
    speechConfig.speechRate = Math.max(0.5, Math.min(max, rate))
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setSpeechPitch(pitch: number) {
    const max = speechConfig.provider === 'azure' ? 1.5 : 2
    speechConfig.speechPitch = Math.max(0.5, Math.min(max, pitch))
    clearPreloadedOpenAIAudio()
    saveSpeechConfig()
  }

  function setSpeechVolume(volume: number) {
    speechConfig.speechVolume = Math.max(0, Math.min(1, volume))
    if (currentUtterance) {
      currentUtterance.volume = speechConfig.speechVolume
    }
    remoteSpeechAudioElements.forEach((audio) => {
      audio.volume = speechConfig.speechVolume
    })
    saveSpeechConfig()
  }

  function buildOpenAIAudioCacheKey(rawText: string) {
    return [
      speechConfig.provider,
      speechConfig.openaiSource,
      speechConfig.openaiBaseUrl.trim(),
      speechConfig.openaiApiKey.trim(),
      speechConfig.openaiModel,
      speechConfig.openaiVoice,
      speechConfig.openaiFormat,
      speechConfig.azureRegion.trim(),
      speechConfig.azureApiKey.trim(),
      speechConfig.azureVoice,
      speechConfig.azureFormat,
      speechConfig.speechRate.toFixed(1),
      speechConfig.speechPitch.toFixed(1),
      rawText,
    ].join('::')
  }

  async function fetchOpenAIAudioBlob(rawText: string, signal?: AbortSignal) {
    if (speechConfig.provider === 'azure') {
      return requestAzureSpeechAudio({
        region: speechConfig.azureRegion,
        subscriptionKey: speechConfig.azureApiKey,
        input: rawText.slice(0, 4096),
        voice: speechConfig.azureVoice,
        outputFormat: speechConfig.azureFormat,
        rate: speechConfig.speechRate,
        pitch: speechConfig.speechPitch,
        signal,
      })
    }
    return requestOpenAISpeechAudio({
      source: speechConfig.openaiSource,
      baseUrl: speechConfig.openaiBaseUrl,
      apiKey: speechConfig.openaiApiKey || undefined,
      input: rawText.slice(0, 4096),
      model: speechConfig.openaiModel,
      voice: speechConfig.openaiVoice,
      format: speechConfig.openaiFormat,
      speed: speechConfig.speechRate,
      signal,
    })
  }

  function getOrStartOpenAIAudioRequest(rawText: string, signal?: AbortSignal) {
    const key = buildOpenAIAudioCacheKey(rawText)
    const existing = inFlightOpenAIAudioRequests.get(key)
    if (existing) {
      return { key, promise: existing }
    }

    const promise = fetchOpenAIAudioBlob(rawText, signal).finally(() => {
      if (inFlightOpenAIAudioRequests.get(key) === promise) {
        inFlightOpenAIAudioRequests.delete(key)
      }
    })
    inFlightOpenAIAudioRequests.set(key, promise)
    return { key, promise }
  }

  function resetRemoteSpeechAudio(audio: HTMLAudioElement) {
    audio.onplay = null
    audio.onpause = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    try {
      audio.load()
    } catch {
      // Some test and embedded browsers do not implement load().
    }
  }

  function acquireRemoteSpeechAudioBuffer() {
    const reserved = new Set(preloadedOpenAIAudio.map((entry) => entry.audio).filter(Boolean))
    const available = remoteSpeechAudioElements.find((audio) => audio !== currentOpenAIAudio && !reserved.has(audio))
    if (available) return available
    if (remoteSpeechAudioElements.length >= REMOTE_SPEECH_AUDIO_BUFFER_COUNT) return null
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = speechConfig.speechVolume
    remoteSpeechAudioElements.push(audio)
    return audio
  }

  function prepareRemoteSpeechAudioBuffer() {
    const entry = preloadedOpenAIAudio.find((item) => !item.audio)
    if (!entry) return
    const audio = acquireRemoteSpeechAudioBuffer()
    if (!audio) return
    const url = URL.createObjectURL(entry.blob)
    resetRemoteSpeechAudio(audio)
    audio.preload = 'auto'
    audio.volume = speechConfig.speechVolume
    audio.src = url
    entry.audio = audio
    entry.url = url
    try {
      audio.load()
    } catch {
      // Assigning a Blob URL is enough when explicit preload is unavailable.
    }
  }

  function releasePreloadedOpenAIAudio(entries: PreloadedOpenAIAudio[]) {
    entries.forEach((entry) => {
      if (entry.url) URL.revokeObjectURL(entry.url)
      if (entry.audio && entry.audio !== currentOpenAIAudio) {
        resetRemoteSpeechAudio(entry.audio)
      }
    })
  }

  function clearPreloadedOpenAIAudio() {
    preloadGeneration += 1
    inFlightPreloadKeys.clear()
    inFlightOpenAIAudioRequests.clear()
    releasePreloadedOpenAIAudio(preloadedOpenAIAudio)
    preloadedOpenAIAudio = []
  }

  async function preloadOpenAITTS(rawText?: string | string[] | null) {
    if (speechConfig.provider === 'system' || !remoteSpeechConfigured.value) return
    const texts = Array.isArray(rawText) ? rawText : [rawText || '']
    const normalizedTexts = Array.from(new Set(texts.map((item) => item.trim()).filter(Boolean)))
    if (!normalizedTexts.length) return
    const pendingTexts = normalizedTexts.filter((item) => {
      const key = buildOpenAIAudioCacheKey(item)
      return !preloadedOpenAIAudio.some((entry) => entry.key === key) && !inFlightPreloadKeys.has(key)
    })
    if (!pendingTexts.length) return

    const generation = preloadGeneration
    for (const text of pendingTexts.slice(0, OPENAI_AUDIO_PRELOAD_LIMIT)) {
      const key = buildOpenAIAudioCacheKey(text)
      inFlightPreloadKeys.add(key)
      const { promise } = getOrStartOpenAIAudioRequest(text)
      void promise
        .then((blob) => {
          if (generation !== preloadGeneration) return
          const replaced = preloadedOpenAIAudio.filter((entry) => entry.key === key)
          releasePreloadedOpenAIAudio(replaced)
          const nextQueue = preloadedOpenAIAudio.filter((entry) => entry.key !== key)
          nextQueue.push({ key, blob })
          if (nextQueue.length > OPENAI_AUDIO_PRELOAD_LIMIT) {
            releasePreloadedOpenAIAudio(nextQueue.splice(0, nextQueue.length - OPENAI_AUDIO_PRELOAD_LIMIT))
          }
          preloadedOpenAIAudio = nextQueue
          prepareRemoteSpeechAudioBuffer()
        })
        .catch(() => undefined)
        .finally(() => {
          if (generation === preloadGeneration) {
            inFlightPreloadKeys.delete(key)
          }
        })
    }
  }

  function stopOpenAIAudioPlayback() {
    if (currentOpenAIAbortController) {
      currentOpenAIAbortController.abort()
      currentOpenAIAbortController = null
    }
    remoteSpeechAudioElements.forEach(resetRemoteSpeechAudio)
    currentOpenAIAudio = null
    if (currentOpenAIAudioUrl) {
      URL.revokeObjectURL(currentOpenAIAudioUrl)
      currentOpenAIAudioUrl = ''
    }
    releasePreloadedOpenAIAudio(preloadedOpenAIAudio)
    preloadedOpenAIAudio.forEach((entry) => {
      entry.audio = undefined
      entry.url = undefined
    })
    prepareRemoteSpeechAudioBuffer()
  }

  function clearSpeechStopTimer(resetConfig = true) {
    if (speechStopTimer) {
      clearTimeout(speechStopTimer)
      speechStopTimer = null
    }
    speechStopAt.value = 0
    if (resetConfig) {
      speechConfig.stopAfterMinutes = 0
      saveSpeechConfig()
    }
  }

  function setSpeechStopTimer(minutes: number) {
    clearSpeechStopTimer(false)
    const normalized = Number.isFinite(minutes)
      ? Math.max(0, Math.min(1440, Math.round(minutes)))
      : 0
    speechConfig.stopAfterMinutes = normalized
    saveSpeechConfig()
    if (!normalized) {
      speechStopAt.value = 0
      return
    }
    speechStopAt.value = Date.now() + normalized * 60 * 1000
    speechStopTimer = window.setTimeout(() => {
      stopTTS()
      clearSpeechStopTimer(false)
      speechConfig.stopAfterMinutes = 0
      saveSpeechConfig()
      appStore.showToast('朗读已按定时设置停止', 'success')
    }, normalized * 60 * 1000)
  }

  function startSystemTTS(rawText: string, options: TTSOptions, sessionId: number) {
    if (!synth) return
    isSpeechLoading.value = false
    if (!voiceList.value.length) {
      fetchVoices()
    }

    const utterance = new SpeechSynthesisUtterance(rawText)
    currentUtterance = utterance
    const safariSpeechFallback = isSafariSpeechFallbackMode() && !systemTtsNativeEventsReliable.value

    const selectedVoice = voiceList.value.find((voice) => voice.name === speechConfig.voiceName)
    utterance.lang = selectedVoice?.lang || 'zh-CN'
    utterance.voice = selectedVoice || null
    utterance.rate = speechConfig.speechRate
    utterance.pitch = speechConfig.speechPitch
    utterance.volume = speechConfig.speechVolume
    logTTS('system speak queued', {
      sessionId,
      voice: utterance.voice?.name || utterance.lang,
      rate: utterance.rate,
      pitch: utterance.pitch,
      text: rawText.slice(0, 80),
    })

    let completed = false
    let finishWatchdog: number | null = null
    const startedAt = Date.now()
    let lastProgressAt = startedAt
    let sawStart = false
    let sawBoundary = false
    let pausedStartedAt: number | null = null
    let pausedAccumulatedMs = 0

    const clearFinishWatchdog = () => {
      if (finishWatchdog) {
        clearTimeout(finishWatchdog)
        finishWatchdog = null
      }
    }

    const effectiveElapsed = () => {
      const now = Date.now()
      const currentPaused = pausedStartedAt ? now - pausedStartedAt : 0
      return now - startedAt - pausedAccumulatedMs - currentPaused
    }

    const finalizePlayback = (kind: 'end' | 'error' | 'interrupted', event?: SpeechSynthesisErrorEvent) => {
      if (completed) return
      completed = true
      clearFinishWatchdog()
      if (currentUtterance === utterance) {
        currentUtterance = null
      }
      if (!isCurrentTTSSession(sessionId)) return
      isSpeaking.value = false
      isPaused.value = false
      logTTS('system finalize', {
        sessionId,
        kind,
        error: event?.error,
        speaking: synth?.speaking,
        pending: synth?.pending,
      })
      if (kind === 'end') {
        options.onEnd?.()
        return
      }
      if (kind === 'error') {
        setMediaSessionPlaybackState('none')
        options.onError?.(event)
      }
    }

    const forceFinalizeEnd = (reason: string) => {
      logTTS('system watchdog force end', {
        sessionId,
        reason,
        speaking: synth?.speaking,
        pending: synth?.pending,
        elapsed: effectiveElapsed(),
        text: rawText.slice(0, 40),
      })
      finalizePlayback('end')
      window.setTimeout(() => {
        if (!isCurrentTTSSession(sessionId)) return
        try {
          synth?.cancel()
        } catch {
          // ignore platform-specific cancel errors
        }
      }, 0)
    }

    const scheduleFinishWatchdog = () => {
      clearFinishWatchdog()
      const estimatedMs = safariSpeechFallback
        ? Math.max(2400, Math.ceil((rawText.length / Math.max(0.6, speechConfig.speechRate)) * 235))
        : Math.max(2800, Math.ceil((rawText.length / Math.max(0.6, speechConfig.speechRate)) * 280))
      const noStartTimeoutMs = safariSpeechFallback
        ? estimatedMs + Math.max(400, Math.ceil(rawText.length * 22))
        : 0
      const hardTimeoutMs = safariSpeechFallback
        ? estimatedMs + Math.max(1800, Math.ceil(rawText.length * 80))
        : Math.min(120000, estimatedMs + Math.max(4000, Math.ceil(rawText.length * 120)))
      logTTS('system watchdog scheduled', {
        sessionId,
        estimatedMs,
        noStartTimeoutMs,
        hardTimeoutMs,
        safariSpeechFallback,
        text: rawText.slice(0, 40),
      })
      const checkFinish = () => {
        if (completed || !isCurrentTTSSession(sessionId) || currentUtterance !== utterance) return
        if (synth?.paused || isPaused.value) {
          if (pausedStartedAt == null) {
            pausedStartedAt = Date.now()
          }
          lastProgressAt = Date.now()
          finishWatchdog = window.setTimeout(checkFinish, 600)
          return
        }
        if (pausedStartedAt != null) {
          pausedAccumulatedMs += Date.now() - pausedStartedAt
          pausedStartedAt = null
        }
        const elapsed = effectiveElapsed()
        const idleMs = Date.now() - lastProgressAt
        if (!synth?.speaking && !synth?.pending) {
          logTTS('system watchdog finalize end', { sessionId })
          finalizePlayback('end')
          return
        }
        if (sawBoundary && idleMs > 1800 && elapsed > Math.max(2200, estimatedMs * 0.75)) {
          forceFinalizeEnd('boundary-idle')
          return
        }
        if (safariSpeechFallback && !sawStart && elapsed > noStartTimeoutMs) {
          forceFinalizeEnd('no-start-timeout')
          return
        }
        if (elapsed > hardTimeoutMs) {
          forceFinalizeEnd('hard-timeout')
          return
        }
        finishWatchdog = window.setTimeout(checkFinish, 600)
      }
      finishWatchdog = window.setTimeout(checkFinish, safariSpeechFallback ? Math.min(estimatedMs, 1200) : estimatedMs)
    }

    utterance.onstart = () => {
      if (!isCurrentTTSSession(sessionId) || currentUtterance !== utterance) return
      isSpeaking.value = true
      isPaused.value = false
      setMediaSessionPlaybackState('playing')
      sawStart = true
      systemTtsNativeEventsReliable.value = true
      lastProgressAt = Date.now()
      logTTS('system onstart', { sessionId, text: rawText.slice(0, 40) })
      options.onStart?.()
    }
    utterance.onboundary = () => {
      if (!isCurrentTTSSession(sessionId) || currentUtterance !== utterance) return
      sawBoundary = true
      lastProgressAt = Date.now()
    }
    utterance.onend = () => {
      logTTS('system onend', { sessionId, text: rawText.slice(0, 40) })
      finalizePlayback('end')
    }
    utterance.onerror = (event) => {
      const interrupted = event.error === 'interrupted' || event.error === 'canceled'
      logTTS('system onerror', { sessionId, error: event.error, interrupted, text: rawText.slice(0, 40) })
      finalizePlayback(interrupted ? 'interrupted' : 'error', event)
    }

    synth.speak(utterance)
    logTTS('system speak invoked', {
      sessionId,
      speaking: synth.speaking,
      pending: synth.pending,
      text: rawText.slice(0, 40),
    })
    scheduleFinishWatchdog()
  }

  async function startOpenAITTS(rawText: string, options: TTSOptions, sessionId: number) {
    if (!remoteSpeechConfigured.value) {
      const error = new Error(speechConfig.provider === 'azure'
        ? '请先配置 Azure 区域、密钥和音色'
        : '请先配置 OpenAI Speech')
      appStore.showToast(error.message, 'warning')
      options.onError?.(error)
      return
    }
    if (speechConfig.provider === 'openai' && speechConfig.openaiSource === 'server') {
      const serverConfig = await aiBookStore.loadServerModelConfig()
      if (!serverConfig?.canUseServerModel) {
        const error = new Error('当前账号没有使用后端模型配置的权限')
        appStore.showToast(error.message, 'warning')
        options.onError?.(error)
        return
      }
      if (!serverConfig.config.speech.enabled) {
        const error = new Error('后端 OpenAI Speech 未启用')
        appStore.showToast(error.message, 'warning')
        options.onError?.(error)
        return
      }
      if (!isCurrentTTSSession(sessionId)) return
    }

    isSpeechLoading.value = true
    logTTS('openai speak queued', {
      sessionId,
      provider: speechConfig.provider,
      model: speechConfig.openaiModel,
      voice: speechConfig.provider === 'azure' ? speechConfig.azureVoice : speechConfig.openaiVoice,
      text: rawText.slice(0, 80),
    })
    const playBlob = (
      blob: Blob,
      controller: AbortController,
      bufferedEntry?: PreloadedOpenAIAudio,
    ) => {
      const releaseUnusedBufferedEntry = () => {
        if (!bufferedEntry) return
        releasePreloadedOpenAIAudio([bufferedEntry])
        bufferedEntry.audio = undefined
        bufferedEntry.url = undefined
      }
      if (controller.signal.aborted || !isCurrentTTSSession(sessionId)) {
        releaseUnusedBufferedEntry()
        return
      }
      isSpeechLoading.value = false
      let audio = bufferedEntry?.audio || acquireRemoteSpeechAudioBuffer()
      if (!audio) {
        const releasable = preloadedOpenAIAudio.find((entry) => entry.audio && entry.audio !== currentOpenAIAudio)
        if (releasable) {
          releasePreloadedOpenAIAudio([releasable])
          releasable.audio = undefined
          releasable.url = undefined
          audio = acquireRemoteSpeechAudioBuffer()
        }
      }
      if (!audio) {
        currentOpenAIAbortController = null
        isSpeaking.value = false
        isPaused.value = false
        options.onError?.(new Error(`${speechProviderLabel.value} 音频缓冲区不可用`))
        return
      }
      const audioUrl = bufferedEntry?.url || URL.createObjectURL(blob)
      if (!bufferedEntry?.audio) {
        resetRemoteSpeechAudio(audio)
        audio.src = audioUrl
      }
      if (bufferedEntry) {
        bufferedEntry.audio = undefined
        bufferedEntry.url = undefined
      }
      currentOpenAIAudioUrl = audioUrl
      audio.volume = speechConfig.speechVolume
      currentOpenAIAudio = audio
      currentOpenAIAbortController = null

      let audioReleased = false
      const releaseAudio = () => {
        if (audioReleased) return
        audioReleased = true
        if (currentOpenAIAudio === audio) currentOpenAIAudio = null
        if (currentOpenAIAudioUrl === audioUrl) currentOpenAIAudioUrl = ''
        URL.revokeObjectURL(audioUrl)
        resetRemoteSpeechAudio(audio)
        prepareRemoteSpeechAudioBuffer()
      }

      audio.onplay = () => {
        if (!isCurrentTTSSession(sessionId) || currentOpenAIAudio !== audio) return
        isSpeaking.value = true
        isPaused.value = false
        setMediaSessionPlaybackState('playing')
        logTTS('openai onplay', { sessionId, text: rawText.slice(0, 40) })
        options.onStart?.()
      }

      audio.onpause = () => {
        if (!isCurrentTTSSession(sessionId) || currentOpenAIAudio !== audio) return
        if (!audio.ended) {
          isPaused.value = true
          isSpeaking.value = false
          setMediaSessionPlaybackState('paused')
        }
      }

      audio.onended = () => {
        releaseAudio()
        if (!isCurrentTTSSession(sessionId)) return
        isSpeaking.value = false
        isPaused.value = false
        logTTS('openai onended', { sessionId, text: rawText.slice(0, 40) })
        options.onEnd?.()
      }

      audio.onerror = () => {
        releaseAudio()
        if (!isCurrentTTSSession(sessionId)) return
        isSpeaking.value = false
        isPaused.value = false
        const error = new Error(`${speechProviderLabel.value} 音频播放失败`)
        setMediaSessionPlaybackState('none')
        logTTS('openai onerror', { sessionId, text: rawText.slice(0, 40) })
        options.onError?.(error)
      }

      return audio.play().catch((error: Error) => {
        if (!isCurrentTTSSession(sessionId)) return
        isSpeechLoading.value = false
        isSpeaking.value = false
        isPaused.value = false
        releaseAudio()
        logTTS('openai play catch', { sessionId, message: error.message, text: rawText.slice(0, 40) })
        options.onError?.(error)
      })
    }

    const controller = new AbortController()
    currentOpenAIAbortController = controller

    const key = buildOpenAIAudioCacheKey(rawText)
    const takeBufferedAudio = () => {
      const bufferedIndex = preloadedOpenAIAudio.findIndex((entry) => entry.key === key)
      return bufferedIndex >= 0 ? preloadedOpenAIAudio.splice(bufferedIndex, 1)[0] : undefined
    }
    const cached = takeBufferedAudio()
    if (cached) {
      void Promise.resolve(playBlob(cached.blob, controller, cached))
      prepareRemoteSpeechAudioBuffer()
      return
    }

    const inFlight = inFlightOpenAIAudioRequests.get(key)
    if (inFlight) {
      void inFlight.then((blob) => {
        const buffered = takeBufferedAudio()
        const playback = playBlob(blob, controller, buffered)
        prepareRemoteSpeechAudioBuffer()
        return playback
      }).catch((error: Error) => {
        if (controller.signal.aborted || !isCurrentTTSSession(sessionId)) return
        isSpeechLoading.value = false
        isSpeaking.value = false
        isPaused.value = false
        currentOpenAIAbortController = null
        currentOpenAIAudio = null
        logTTS('openai inflight catch', { sessionId, message: error.message, text: rawText.slice(0, 40) })
        options.onError?.(error)
      })
      return
    }

    const started = getOrStartOpenAIAudioRequest(rawText, controller.signal)
    void started.promise.then((blob) => {
      return playBlob(blob, controller)
    }).catch((error: Error) => {
      if (controller.signal.aborted || !isCurrentTTSSession(sessionId)) return
      isSpeechLoading.value = false
      isSpeaking.value = false
      isPaused.value = false
      currentOpenAIAbortController = null
      currentOpenAIAudio = null
      logTTS('openai request catch', { sessionId, message: error.message, text: rawText.slice(0, 40) })
      appStore.showToast(error.message || `${speechProviderLabel.value} 请求失败`, 'error')
      options.onError?.(error)
    })
  }

  function startTTS(text?: string, options: TTSOptions = {}, interruptCurrent = true) {
    const hasActiveSystemSpeech = !!synth && (synth.speaking || synth.pending || !!currentUtterance)
    const hasActiveOpenAISpeech = !!currentOpenAIAudio || !!currentOpenAIAbortController

    if (interruptCurrent && (hasActiveSystemSpeech || hasActiveOpenAISpeech || isSpeaking.value || isSpeechLoading.value)) {
      stopTTS(false)
    }

    const rawText = (text || content.value.replace(/<[^>]+>/g, '')).trim()
    if (!rawText) return

    configureMediaSession(rawText)
    const sessionId = beginTTSSession()
    logTTS('startTTS', {
      sessionId,
      provider: speechConfig.provider,
      interruptCurrent,
      text: rawText.slice(0, 80),
    })

    if (
      !interruptCurrent &&
      speechConfig.provider === 'system' &&
      synth &&
      !synth.speaking &&
      isSafariSpeechFallbackMode() &&
      !systemTtsNativeEventsReliable.value
    ) {
      try {
        logTTS('startTTS cleanup idle system synth', { sessionId })
        synth.cancel()
      } catch {
        // ignore platform-specific cancel errors
      }
    }

    if (speechConfig.provider !== 'system') {
      void startOpenAITTS(rawText, options, sessionId)
      return
    }

    startSystemTTS(rawText, options, sessionId)
  }

  function pauseTTS() {
    if (speechConfig.provider !== 'system') {
      if (!currentOpenAIAudio) return
      if (currentOpenAIAudio.paused) {
        void currentOpenAIAudio.play()
        isPaused.value = false
        isSpeaking.value = true
        setMediaSessionPlaybackState('playing')
      } else {
        currentOpenAIAudio.pause()
        isPaused.value = true
        isSpeaking.value = false
        setMediaSessionPlaybackState('paused')
      }
      return
    }

    if (!synth) return
    if (synth.speaking && !synth.paused) {
      synth.pause()
      isPaused.value = true
      setMediaSessionPlaybackState('paused')
    } else if (synth.paused) {
      synth.resume()
      isPaused.value = false
      setMediaSessionPlaybackState('playing')
    }
  }

  function stopTTS(resetCallbacks = true) {
    const sessionId = beginTTSSession()
    logTTS('stopTTS', {
      sessionId,
      resetCallbacks,
      provider: speechConfig.provider,
      caller: captureTTSCaller(),
    })
    if (synth) {
      synth.cancel()
      currentUtterance = null
    }
    stopOpenAIAudioPlayback()
    isSpeechLoading.value = false
    isSpeaking.value = false
    isPaused.value = false
    setMediaSessionPlaybackState('none')
    if (resetCallbacks) {
      clearSpeechStopTimer()
    }
  }

  /* ─── Book / chapter ops ─── */
  async function loadBook(b: Book) {
    loading.value = true
    let latestBook = await resolveLatestShelfBook(b)
    if (!isLocalTxtBook(latestBook)) {
      const bookInfo = await getBookInfo(
        latestBook.bookUrl,
        latestBook.origin,
        latestBook,
      ).catch(() => null)
      if (bookInfo) {
        latestBook = { ...latestBook, ...bookInfo }
      }
    }
    book.value = latestBook
    rememberProgressRevision(latestBook.bookUrl, latestBook.progressRevision)
    chapters.value = []
    content.value = ''
    appStore.markBookOpened(latestBook.bookUrl)
    currentIndex.value = latestBook.durChapterIndex || 0
    chapterScrollProgress.value = 0
    preloadedContent.value.clear()
    loadReadChapterHistory(latestBook)
    progressDirty.value = false
    lastServerProgressKey.value = ''
    chaptersLoading.value = true
    try {
      chapters.value = await getChapterList({
        bookUrl: latestBook.bookUrl,
        ...(latestBook.tocUrl ? { tocUrl: latestBook.tocUrl } : {}),
        bookSourceUrl: latestBook.origin,
        book: latestBook,
      })
      if (chapters.value.length) {
        currentIndex.value = Math.max(0, Math.min(currentIndex.value, chapters.value.length - 1))
      }
      saveReaderSession()
    } catch (error) {
      loading.value = false
      throw error
    } finally {
      chaptersLoading.value = false
    }
  }

  function setActiveChapterState(index: number, chapterContent: string, progress = 0) {
    currentIndex.value = index
    content.value = chapterContent
    chapterScrollProgress.value = Math.max(0, Math.min(1, progress))
    if (book.value) {
      book.value.durChapterIndex = index
      book.value.durChapterTitle = chapters.value[index]?.title || book.value.durChapterTitle
      book.value.durChapterTime = Date.now()
      const shelfBook = shelfStore.books.find((item) => item.bookUrl === book.value?.bookUrl)
      if (shelfBook) {
        shelfBook.durChapterIndex = book.value.durChapterIndex
        shelfBook.durChapterTitle = book.value.durChapterTitle
        shelfBook.durChapterTime = book.value.durChapterTime
      }
    }
    syncLocalBookProgress(chapterScrollProgress.value)
    if (book.value) {
      saveRecentReadBook(book.value)
    }
    localStorage.setItem('reader-currentIndex', String(index))
    saveReaderSession()
    markProgressDirty()
  }

  async function persistProgress(index = currentIndex.value, progress = chapterScrollProgress.value) {
    const snapshot = currentServerProgressPayload(index, progress)
    if (!snapshot) return
    const submittedChangeVersion = progressChangeVersion
    const save = async () => {
      const payload: ServerProgressPayload = {
        ...snapshot,
        revision: knownProgressRevisions.get(snapshot.bookUrl) ?? snapshot.revision,
      }
      const result = await saveBookProgress(payload).catch(() => null)
      if (result == null) return
      applyProgressSaveResult(payload, submittedChangeVersion, result)
    }
    const pending = progressSaveQueue.then(save, save)
    progressSaveQueue = pending.catch(() => undefined)
    await pending
  }

  async function flushProgressToServer(force = false) {
    const payload = currentServerProgressPayload()
    if (!payload) return
    const nextKey = progressPayloadKey(payload)
    if (!force && !progressDirty.value && lastServerProgressKey.value === nextKey) return
    await persistProgress(payload.index, chapterScrollProgress.value)
  }

  function flushProgressToServerKeepalive(force = false) {
    const payload = currentServerProgressPayload()
    if (!payload || typeof fetch === 'undefined') return
    const nextKey = progressPayloadKey(payload)
    if (!force && !progressDirty.value && lastServerProgressKey.value === nextKey) return

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const token = localStorage.getItem('accessToken')?.trim()
    if (token) {
      headers.Authorization = token
    }
    const secureKey = localStorage.getItem('secureKey')?.trim()
    if (secureKey) {
      headers['X-Secure-Key'] = secureKey
    }

    const submittedChangeVersion = progressChangeVersion
    void fetch('/reader3/saveBookProgress', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).then(async (response) => {
      if (!response.ok) return
      const raw = await response.json().catch(() => null)
      const result = parseKeepaliveProgressResult(raw)
      if (result == null) return
      applyProgressSaveResult(payload, submittedChangeVersion, result, false)
    }).catch(() => undefined)
  }

  async function fetchChapterContent(index: number, forceRefresh = false) {
    if (!book.value || !chapters.value[index]) return null

    if (!forceRefresh && preloadedContent.value.has(index)) {
      return preloadedContent.value.get(index) || null
    }

    const chapter = chapters.value[index]

    const isLocalTxt = isLocalTxtBook(book.value)
    const useBrowserCache = !isLocalTxt
    const browserCached = useBrowserCache
      ? await getBrowserCachedChapter(book.value.bookUrl, chapter.url).catch(() => null)
      : null

    if (!forceRefresh && browserCached) {
      return browserCached
    }

    if (!appStore.isOnline && !isLocalTxt) {
      if (browserCached) {
        return browserCached
      }
      throw new Error('当前处于离线状态，且该章节未缓存到浏览器')
    }

    let chapterContent = ''
    try {
      chapterContent = await getBookContent({
        chapterUrl: chapter.url,
        bookUrl: book.value.bookUrl,
        bookSourceUrl: book.value.origin,
        book: book.value,
        chapter,
        nextChapterUrl: chapters.value[index + 1]?.url,
        refresh: forceRefresh ? 1 : 0,
      })
    } catch (error) {
      if (browserCached) {
        appStore.showToast('网络请求失败，已切换到本地缓存章节', 'warning')
        return browserCached
      }
      throw error
    }

    if (useBrowserCache) {
      await setBrowserCachedChapter({
        bookUrl: book.value.bookUrl,
        chapterUrl: chapter.url,
        chapterTitle: chapter.title,
        content: chapterContent,
      }).catch(() => undefined)
    }

    return chapterContent
  }

  async function loadChapter(index: number, forceRefresh = false) {
    if (!book.value || !chapters.value[index]) return

    loading.value = true
    try {
      const chapterContent = await fetchChapterContent(index, forceRefresh)
      if (chapterContent == null) return

      const previousSavedIndex = book.value.durChapterIndex ?? 0
      const previousSavedProgress = decodeServerProgress(book.value.durChapterPos)
      const isOpeningSavedChapter = !forceRefresh && index === previousSavedIndex
      const initialProgress = isOpeningSavedChapter ? previousSavedProgress : 0

      setActiveChapterState(index, chapterContent, initialProgress)
      markChapterAsRead(index)
      appStore.markChapterRead(book.value.bookUrl, index, chapters.value.length)

      if (!isOpeningSavedChapter) {
        await persistProgress(index, 0)
      }

      if (config.enablePreload) {
        setTimeout(() => preloadAroundChapter(index), forceRefresh ? 1500 : 1000)
      }
    } finally {
      loading.value = false
    }
  }

  async function preloadAroundChapter(index: number) {
    if (!book.value || !config.enablePreload) return
    const targets = [index + 1, index + 2, index - 1]
      .filter((target, pos, list) => target >= 0 && target < chapters.value.length && list.indexOf(target) === pos)
    for (const target of targets) {
      await preloadNextChapter(target)
    }
  }

  async function preloadNextChapter(index: number) {
    if (!book.value || !config.enablePreload || index >= chapters.value.length || preloadedContent.value.has(index)) return
    
    // Keep max 3 preloaded chapters
    if (preloadedContent.value.size > 3) {
      const firstKey = preloadedContent.value.keys().next().value
      if (firstKey !== undefined) preloadedContent.value.delete(firstKey)
    }

    try {
      const res = await fetchChapterContent(index)
      if (!res) return
      preloadedContent.value.set(index, res)
    } catch { /* ignore */ }
  }

  function normalizeChapterTitle(title?: string) {
    return (title || '')
      .replace(/\s+/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .toLowerCase()
  }

  function resolveChapterIndexByTitle(list: BookChapter[], targetTitle?: string, fallbackIndex = 0) {
    if (!list.length) return 0
    const normalizedTarget = normalizeChapterTitle(targetTitle)
    if (!normalizedTarget) {
      return Math.max(0, Math.min(list.length - 1, fallbackIndex))
    }

    const exactIndex = list.findIndex((chapter) => normalizeChapterTitle(chapter.title) === normalizedTarget)
    if (exactIndex >= 0) return exactIndex

    const partialIndex = list.findIndex((chapter) => {
      const title = normalizeChapterTitle(chapter.title)
      return title.includes(normalizedTarget) || normalizedTarget.includes(title)
    })
    if (partialIndex >= 0) return partialIndex

    return Math.max(0, Math.min(list.length - 1, fallbackIndex))
  }

  /* ─── Switch Source ─── */
  async function switchSource(newUrl: string, sourceUrl: string) {
    if (!book.value) return
    const previousChapterTitle = currentChapter.value?.title || book.value.durChapterTitle
    const previousIndex = currentIndex.value
    const previousProgress = chapterScrollProgress.value
    loading.value = true
    try {
      const updatedBook = await apiSetBookSource({
        bookUrl: book.value.bookUrl,
        newUrl,
        bookSourceUrl: sourceUrl,
      })
      if (!updatedBook) return null

      await loadBook(updatedBook)
      const targetIndex = resolveChapterIndexByTitle(
        chapters.value,
        previousChapterTitle,
        typeof updatedBook.durChapterIndex === 'number' ? updatedBook.durChapterIndex : previousIndex,
      )
      await loadChapter(targetIndex)
      setChapterScrollProgress(previousProgress)
      await shelfStore.fetchBooks().catch(() => undefined)
      return updatedBook
    } finally {
      loading.value = false
    }
  }

  async function refreshContent() {
    if (!book.value || !chapters.value[currentIndex.value]) return
    loading.value = true
    try {
      const chapterContent = await fetchChapterContent(currentIndex.value, true)
      if (chapterContent == null) return
      setActiveChapterState(currentIndex.value, chapterContent, chapterScrollProgress.value)
      void preloadAroundChapter(currentIndex.value)
    } finally {
      loading.value = false
    }
  }

  async function refreshChapters() {
    if (!book.value) return
    chaptersLoading.value = true
    try {
      preloadedContent.value.clear()
      chapters.value = await getChapterList({
        bookUrl: book.value.bookUrl,
        ...(book.value.tocUrl ? { tocUrl: book.value.tocUrl } : {}),
        bookSourceUrl: book.value.origin,
        book: book.value,
        refresh: 1,
      })
      const targetIndex = Math.max(0, Math.min(chapters.value.length - 1, currentIndex.value))
      if (chapters.value[targetIndex]) {
        await loadChapter(targetIndex, true)
      }
    } finally {
      chaptersLoading.value = false
    }
  }

  function setChapterScrollProgress(value: number) {
    chapterScrollProgress.value = Math.max(0, Math.min(1, value))
    syncLocalBookProgress(chapterScrollProgress.value)
    saveReaderSession()
    markProgressDirty()
  }

  async function nextChapter() {
    if (hasNext.value) {
      const completedBook = book.value ? { ...book.value } : null
      const completedChapter = currentChapter.value ? { ...currentChapter.value } : null
      const completedContent = content.value
      await loadChapter(currentIndex.value + 1)
      if (completedBook && completedChapter && completedContent) {
        void (async () => {
          const loadedMemory = (await aiBookStore.load(completedBook).catch(() => null)) as { enabled?: boolean } | null
          if (!loadedMemory || !loadedMemory.enabled) return null
          return aiBookStore.generateChapterMemory({
            bookUrl: completedBook.bookUrl,
            chapterIndex: completedChapter.index,
            mode: 'auto',
          })
        })().catch(() => null)
      }
    }
  }

  async function prevChapter() {
    if (hasPrev.value) {
      await loadChapter(currentIndex.value - 1)
    }
  }

  /* ─── Replace Rules ─── */
  async function fetchReplaceRules() {
    try {
      replaceRules.value = await getReplaceRules()
    } catch { /* ignore */ }
  }

  /* ─── Bookmarks ─── */
  async function fetchBookmarks() {
    try {
      const all = await getBookmarks()
      // Filter for current book
      if (book.value) {
        bookmarks.value = all.filter(b => b.bookName === book.value?.name && b.bookAuthor === book.value?.author)
      } else {
        bookmarks.value = all
      }
    } catch { /* ignore */ }
  }

  async function addBookmark(pos: number = 0, snippet: string = '') {
    if (!book.value || !currentChapter.value) return
    const b: Bookmark = {
      bookName: book.value.name,
      bookAuthor: book.value.author,
      chapterIndex: currentIndex.value,
      chapterName: currentChapter.value.title,
      chapterPos: pos,
      bookText: snippet || content.value.slice(0, 50).replace(/<[^>]+>/g, ''),
      time: Date.now(),
      content: '',
    }
    await saveBookmark(b)
    await fetchBookmarks()
  }

  async function removeBookmark(b: Bookmark) {
    await apiDeleteBookmark(b)
    await fetchBookmarks()
  }

  async function removeBookmarks(items: Bookmark[]) {
    if (!items.length) return
    await apiDeleteBookmarks(items)
    await fetchBookmarks()
  }

  function clear() {
    book.value = null
    chapters.value = []
    content.value = ''
    currentIndex.value = 0
    chapterScrollProgress.value = 0
    readChapterKeys.value = new Set()
    stopAutoReading()
  }

  /* ─── Panel visibility ─── */
  const activePanel = ref<ReaderPanel>(null)
  const panelParent = ref<ReaderPanel>(null)

  function openPanel(panel: ReaderPanel, parent: ReaderPanel = null) {
    activePanel.value = panel
    panelParent.value = parent
  }

  function togglePanel(panel: ReaderPanel, parent: ReaderPanel = null) {
    if (activePanel.value === panel) {
      closePanel()
      return
    }
    openPanel(panel, parent)
  }

  function backPanel() {
    if (panelParent.value) {
      activePanel.value = panelParent.value
      panelParent.value = null
      return
    }
    activePanel.value = null
  }

  function closePanel() {
    activePanel.value = null
    panelParent.value = null
  }

  return {
    book, chapters, currentIndex, content, loading, chaptersLoading,
    currentChapter, hasNext, hasPrev, readingProgress,
      loadBook, loadChapter, fetchChapterContent, setActiveChapterState, refreshContent, nextChapter, prevChapter, clear,
      chapterScrollProgress, setChapterScrollProgress,
      getPersistedReaderSession, restorePersistedSession,
      persistProgress, flushProgressToServer, flushProgressToServerKeepalive,
      config, updateConfig, resetConfig, saveConfig,
    themeIndex, themeMode, isNight, currentTheme, dayColorStyle, nightColorStyle,
    setThemeIndex, setThemeMode, updateReaderColor, applyThemePreset, toggleNight,
    readerBackgroundConfig, readerBackgroundUrl, readerBackgroundLoaded, readerBackgroundSyncState,
    setReaderBackgroundImage, clearReaderBackgroundImage, updateReaderBackgroundConfig,
    autoReading, autoReadingTimer, toggleAutoReading, stopAutoReading,
    activePanel, openPanel, togglePanel, backPanel, closePanel,
    bookmarks, fetchBookmarks, addBookmark, removeBookmark, removeBookmarks,
    readChapterKeys, isChapterRead, markChapterAsRead,
    replaceRules, fetchReplaceRules,
    switchSource, preloadNextChapter, preloadAroundChapter,
    refreshChapters,
    isSpeaking, isSpeechLoading, isPaused, startTTS, pauseTTS, stopTTS,
    voiceList, speechConfig, speechStopAt, speechProviderLabel, openAISpeechConfigured, azureSpeechConfigured,
    systemTtsNativeEventsReliable,
    fetchVoices, setVoiceName, setSpeechProvider, setSpeechRate, setSpeechPitch, setSpeechVolume, setSpeechStopTimer, clearSpeechStopTimer,
    setOpenAISpeechSource, setOpenAISpeechBaseUrl, setOpenAISpeechApiKey, setOpenAISpeechModel, setOpenAISpeechVoice, setOpenAISpeechFormat, setOpenAISpeechRequestMode, preloadOpenAITTS,
    setAzureSpeechRegion, setAzureSpeechApiKey, setAzureSpeechVoice, setAzureSpeechFormat,
    displayContent, processContentForDisplay,
    isAutoScrolling,
  }
})
