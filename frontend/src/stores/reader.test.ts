import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'
import { useReaderStore } from './reader'
import { getBookContent, getBookInfo, getChapterList, getShelfBook, saveBookProgress } from '../api/bookshelf'
import { getBrowserCachedChapter, setBrowserCachedChapter } from '../utils/browserCache'
import { requestAzureSpeechAudio } from '../utils/azureSpeech'
import { requestOpenAISpeechAudio } from '../utils/openaiSpeech'
import {
  fetchReaderBackgroundImage,
  fetchReaderBackgroundMetadata,
  removeReaderBackground,
  updateReaderBackgroundSettings,
  uploadReaderBackground,
} from '../api/readerBackground'
import {
  deleteReaderBackground,
  getReaderBackground,
  saveReaderBackground,
} from '../utils/readerBackground'
import type { Book } from '../types'

const readerBackgroundCache = vi.hoisted(() => ({ blobs: new Map<string, Blob>() }))

vi.mock('../api/bookshelf', () => ({
  getChapterList: vi.fn(),
  getBookContent: vi.fn(),
  getBookInfo: vi.fn(),
  getShelfBook: vi.fn(),
  saveBookProgress: vi.fn(),
  setBookSource: vi.fn(),
}))

vi.mock('../api/bookmark', () => ({
  getBookmarks: vi.fn(),
  saveBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  deleteBookmarks: vi.fn(),
}))

vi.mock('../api/replaceRule', () => ({
  getReplaceRules: vi.fn(),
}))

vi.mock('../utils/browserCache', () => ({
  getBrowserCachedChapter: vi.fn(),
  setBrowserCachedChapter: vi.fn(),
}))

vi.mock('../utils/recentBooks', () => ({
  saveRecentReadBook: vi.fn(),
}))

vi.mock('../utils/openaiSpeech', () => ({
  DEFAULT_OPENAI_BASE_URL: 'https://api.openai.com/v1',
  requestOpenAISpeechAudio: vi.fn(),
}))

vi.mock('../utils/azureSpeech', () => ({
  requestAzureSpeechAudio: vi.fn(),
}))

vi.mock('../api/readerBackground', () => ({
  fetchReaderBackgroundImage: vi.fn(),
  fetchReaderBackgroundMetadata: vi.fn(),
  removeReaderBackground: vi.fn(),
  updateReaderBackgroundSettings: vi.fn(),
  uploadReaderBackground: vi.fn(),
}))

vi.mock('../utils/readerBackground', () => ({
  deleteReaderBackground: vi.fn(),
  getReaderBackground: vi.fn(),
  saveReaderBackground: vi.fn(),
}))


const aiBookStoreMock = {
  memoryView: null as any,
  isServerModelAdmin: false,
  canUseServerModel: false,
  serverModelConfig: null as any,
  load: vi.fn(),
  generateChapterMemory: vi.fn(),
  loadChapterMemory: vi.fn(),
  loadServerModelConfig: vi.fn().mockResolvedValue(null),
}

vi.mock('./aiBook', () => ({
  useAiBookStore: () => aiBookStoreMock,
}))

beforeEach(() => {
  readerBackgroundCache.blobs.clear()
  vi.mocked(getReaderBackground).mockReset()
  vi.mocked(getReaderBackground).mockImplementation(async (key = 'reader-background') => (
    readerBackgroundCache.blobs.get(key) || null
  ))
  vi.mocked(saveReaderBackground).mockReset()
  vi.mocked(saveReaderBackground).mockImplementation(async (blob, key = 'reader-background') => {
    readerBackgroundCache.blobs.set(key, blob)
  })
  vi.mocked(deleteReaderBackground).mockReset()
  vi.mocked(deleteReaderBackground).mockImplementation(async (key = 'reader-background') => {
    readerBackgroundCache.blobs.delete(key)
  })
  vi.mocked(fetchReaderBackgroundMetadata).mockReset()
  vi.mocked(fetchReaderBackgroundMetadata).mockResolvedValue(null)
  vi.mocked(fetchReaderBackgroundImage).mockReset()
  vi.mocked(removeReaderBackground).mockReset()
  vi.mocked(removeReaderBackground).mockResolvedValue({ deleted: true })
  vi.mocked(updateReaderBackgroundSettings).mockReset()
  vi.mocked(uploadReaderBackground).mockReset()
})

describe('reader local txt chapters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    vi.mocked(getBookContent).mockReset()
    vi.mocked(getChapterList).mockReset()
    vi.mocked(getBookInfo).mockReset()
    vi.mocked(getBookInfo).mockRejectedValue(new Error('book info not mocked'))
    vi.mocked(getShelfBook).mockReset()
    vi.mocked(saveBookProgress).mockReset()
    vi.mocked(saveBookProgress).mockResolvedValue('ok')
    vi.mocked(getBrowserCachedChapter).mockReset()
    vi.mocked(setBrowserCachedChapter).mockReset()
    vi.mocked(requestAzureSpeechAudio).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('switches chinese mode back to simplified after traditional conversion is loaded', async () => {
    const readerStore = useReaderStore()
    readerStore.content = '爱学习'

    readerStore.updateConfig('chineseMode', 'traditional')
    await vi.dynamicImportSettled()
    expect(readerStore.displayContent).toBe('愛學習')

    readerStore.updateConfig('chineseMode', 'simplified')

    expect(readerStore.displayContent).toBe('爱学习')
  })

  it('keeps typography shared while day and night colors are configured separately', () => {
    const readerStore = useReaderStore()
    readerStore.updateConfig('fontSize', 22)
    readerStore.updateReaderColor('light', 'backgroundColor', '#fff4dc')
    readerStore.updateReaderColor('light', 'textColor', '#3a2a1e')
    readerStore.updateReaderColor('dark', 'backgroundColor', '#101722')
    readerStore.updateReaderColor('dark', 'textColor', '#d7deea')

    readerStore.setThemeMode('light')
    expect(readerStore.currentTheme.body).toBe('#fff4dc')
    expect(readerStore.currentTheme.fontColor).toBe('#3a2a1e')

    readerStore.setThemeMode('dark')
    expect(readerStore.currentTheme.body).toBe('#101722')
    expect(readerStore.currentTheme.fontColor).toBe('#d7deea')
    expect(readerStore.config.fontSize).toBe(22)
  })

  it('normalizes persisted background display settings', () => {
    localStorage.setItem('reader-backgroundConfig', JSON.stringify({
      enabled: 'yes',
      fit: 'stretch',
      position: 'left',
      overlay: 3,
    }))
    const readerStore = useReaderStore()

    expect(readerStore.readerBackgroundConfig).toMatchObject({
      enabled: true,
      fit: 'cover',
      position: 'center',
      overlay: 0.9,
    })

    readerStore.updateReaderBackgroundConfig('overlay', Number.NaN)
    expect(readerStore.readerBackgroundConfig.overlay).toBe(0.9)
  })

  it('enables the selection action menu once without overriding a later user choice', () => {
    localStorage.setItem('readConfig', JSON.stringify({ selectAction: 'ignore' }))
    const migratedStore = useReaderStore()

    expect(migratedStore.config.selectAction).toBe('popup')
    expect(localStorage.getItem('reader-selection-menu-default-v1')).toBe('1')

    migratedStore.updateConfig('selectAction', 'ignore')
    setActivePinia(createPinia())
    const reloadedStore = useReaderStore()
    expect(reloadedStore.config.selectAction).toBe('ignore')
  })

  it('preloads Azure Speech with the configured voice, rate, and pitch', async () => {
    vi.mocked(requestAzureSpeechAudio).mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
    const readerStore = useReaderStore()
    readerStore.setSpeechProvider('azure')
    readerStore.setAzureSpeechRegion('eastasia')
    readerStore.setAzureSpeechApiKey('azure-key')
    readerStore.setAzureSpeechVoice('zh-CN-XiaoxiaoNeural')
    readerStore.setSpeechRate(1.2)
    readerStore.setSpeechPitch(0.9)

    await readerStore.preloadOpenAITTS('测试朗读')

    expect(requestAzureSpeechAudio).toHaveBeenCalledWith(expect.objectContaining({
      region: 'eastasia',
      subscriptionKey: 'azure-key',
      input: '测试朗读',
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.2,
      pitch: 0.9,
    }))
  })

  it('clamps Azure prosody to the official range', () => {
    const readerStore = useReaderStore()
    readerStore.setSpeechProvider('azure')
    readerStore.setSpeechRate(3)
    readerStore.setSpeechPitch(2)

    expect(readerStore.speechConfig.speechRate).toBe(2)
    expect(readerStore.speechConfig.speechPitch).toBe(1.5)
  })

  it('fetches uploaded local txt content from backend even when browser reports offline', async () => {
    vi.mocked(getBookContent).mockResolvedValue('本地正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    const appStore = useAppStore()
    const readerStore = useReaderStore()
    appStore.setOnlineStatus(false)
    readerStore.book = {
      name: '本地书',
      author: '本地导入',
      origin: 'local-txt',
      bookUrl: 'local-txt:abc123',
    }
    readerStore.chapters = [
      { title: '第一章', url: 'local-txt:abc123#0', index: 0 },
    ]

    await expect(readerStore.fetchChapterContent(0)).resolves.toBe('本地正文')

    expect(getBrowserCachedChapter).not.toHaveBeenCalled()
    expect(getBookContent).toHaveBeenCalledWith(expect.objectContaining({
      chapterUrl: 'local-txt:abc123#0',
      bookUrl: 'local-txt:abc123',
      bookSourceUrl: 'local-txt',
      book: expect.objectContaining({ bookUrl: 'local-txt:abc123' }),
      chapter: { title: '第一章', url: 'local-txt:abc123#0', index: 0 },
      refresh: 0,
    }))
  })

  it('loads the latest server reading progress before opening a stale local book', async () => {
    const staleBook: Book = {
      name: '同步书',
      author: '作者',
      origin: 'source-1',
      bookUrl: 'book-1',
      durChapterIndex: 1,
      durChapterPos: 1200,
      durChapterTitle: '旧章节',
    }
    const serverBook: Book = {
      ...staleBook,
      durChapterIndex: 5,
      durChapterPos: 7200,
      durChapterTime: 1_765_000_000,
      durChapterTitle: '新章节',
    }
    vi.mocked(getShelfBook).mockResolvedValue(serverBook)
    vi.mocked(getChapterList).mockResolvedValue([
      { title: '第1章', url: 'chapter-1', index: 0 },
      { title: '第2章', url: 'chapter-2', index: 1 },
      { title: '第3章', url: 'chapter-3', index: 2 },
      { title: '第4章', url: 'chapter-4', index: 3 },
      { title: '第5章', url: 'chapter-5', index: 4 },
      { title: '第6章', url: 'chapter-6', index: 5 },
    ])
    const readerStore = useReaderStore()

    await readerStore.loadBook(staleBook)

    expect(getShelfBook).toHaveBeenCalledWith('book-1')
    expect(readerStore.book?.durChapterIndex).toBe(5)
    expect(readerStore.book?.durChapterPos).toBe(7200)
    expect(readerStore.currentIndex).toBe(5)
    expect(getChapterList).toHaveBeenCalledWith(expect.objectContaining({
      bookUrl: 'book-1',
      bookSourceUrl: 'source-1',
      book: serverBook,
    }))
  })

  it('prefers newer server progress when restoring the persisted reader session', async () => {
    const localBook: Book = {
      name: '恢复书',
      author: '作者',
      origin: 'source-1',
      bookUrl: 'book-restore',
      durChapterIndex: 1,
      durChapterPos: 1000,
      durChapterTitle: '旧章节',
    }
    const serverBook: Book = {
      ...localBook,
      durChapterIndex: 4,
      durChapterPos: 6400,
      durChapterTime: 1_765_000_000,
      durChapterTitle: '新章节',
    }
    const chapters = [
      { title: '第1章', url: 'chapter-1', index: 0 },
      { title: '第2章', url: 'chapter-2', index: 1 },
      { title: '第3章', url: 'chapter-3', index: 2 },
      { title: '第4章', url: 'chapter-4', index: 3 },
      { title: '第5章', url: 'chapter-5', index: 4 },
    ]
    localStorage.setItem('reader-last-session', JSON.stringify({
      book: localBook,
      chapters,
      currentIndex: 1,
      chapterScrollProgress: 0.1,
      updatedAt: 1_000,
    }))
    vi.mocked(getShelfBook).mockResolvedValue(serverBook)
    vi.mocked(getChapterList).mockResolvedValue(chapters)
    vi.mocked(getBookContent).mockResolvedValue('服务端进度章节正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    vi.mocked(setBrowserCachedChapter).mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.setOnlineStatus(true)
    const readerStore = useReaderStore()

    const restored = await readerStore.restorePersistedSession()

    expect(getShelfBook).toHaveBeenCalledWith('book-restore')
    expect(getChapterList).toHaveBeenCalledWith(expect.objectContaining({
      bookUrl: 'book-restore',
      bookSourceUrl: 'source-1',
      book: serverBook,
    }))
    expect(readerStore.chapters.length).toBe(5)
    expect(getBrowserCachedChapter).toHaveBeenCalledWith('book-restore', 'chapter-5')
    expect(getBookContent).toHaveBeenCalledWith(expect.objectContaining({
      chapterUrl: 'chapter-5',
      bookUrl: 'book-restore',
      bookSourceUrl: 'source-1',
      book: expect.objectContaining({ bookUrl: 'book-restore' }),
      chapter: { title: '第5章', url: 'chapter-5', index: 4 },
      refresh: 0,
    }))
    expect(restored).toBe(true)
    expect(readerStore.currentIndex).toBe(4)
    expect(readerStore.book?.durChapterPos).toBe(6400)
  })

  it('does not replace the persisted reader session with another server book', async () => {
    const localBook: Book = {
      name: '本地正在阅读',
      author: '作者甲',
      origin: 'source-1',
      bookUrl: 'book-local',
      durChapterIndex: 1,
      durChapterPos: 2500,
      durChapterTitle: '本地第二章',
    }
    const otherServerBook: Book = {
      name: '其他设备最近阅读',
      author: '作者乙',
      origin: 'source-2',
      bookUrl: 'book-other',
      durChapterIndex: 8,
      durChapterPos: 8000,
      durChapterTime: 1_765_000_000,
      durChapterTitle: '其他书第九章',
    }
    const chapters = [
      { title: '本地第一章', url: 'local-chapter-1', index: 0 },
      { title: '本地第二章', url: 'local-chapter-2', index: 1 },
    ]
    localStorage.setItem('reader-last-session', JSON.stringify({
      book: localBook,
      chapters,
      currentIndex: 1,
      chapterScrollProgress: 0.25,
      updatedAt: 1_000,
    }))
    vi.mocked(getShelfBook).mockResolvedValue(otherServerBook)
    vi.mocked(getBookContent).mockResolvedValue('本地第二章正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    vi.mocked(setBrowserCachedChapter).mockResolvedValue(undefined)
    useAppStore().setOnlineStatus(true)
    const readerStore = useReaderStore()

    const restored = await readerStore.restorePersistedSession()

    expect(restored).toBe(true)
    expect(readerStore.book?.bookUrl).toBe('book-local')
    expect(readerStore.currentIndex).toBe(1)
    expect(readerStore.chapterScrollProgress).toBe(0.25)
    expect(getChapterList).not.toHaveBeenCalled()
    expect(getBookContent).toHaveBeenCalledWith(expect.objectContaining({
      chapterUrl: 'local-chapter-2',
      bookUrl: 'book-local',
      bookSourceUrl: 'source-1',
      book: expect.objectContaining({ bookUrl: 'book-local' }),
    }))
  })

  it('keeps newer local session even when server has a deeper older chapter', async () => {
    const localBook: Book = {
      name: '恢复书',
      author: '作者',
      origin: 'source-1',
      bookUrl: 'book-restore',
      durChapterIndex: 0,
      durChapterPos: 0,
      durChapterTitle: '第1章',
    }
    const serverBook: Book = {
      ...localBook,
      durChapterIndex: 4,
      durChapterPos: 6400,
      durChapterTime: 1_765_000_000,
      durChapterTitle: '第5章',
    }
    const chapters = [
      { title: '第1章', url: 'chapter-1', index: 0 },
      { title: '第2章', url: 'chapter-2', index: 1 },
      { title: '第3章', url: 'chapter-3', index: 2 },
      { title: '第4章', url: 'chapter-4', index: 3 },
      { title: '第5章', url: 'chapter-5', index: 4 },
    ]
    localStorage.setItem('reader-last-session', JSON.stringify({
      book: localBook,
      chapters,
      currentIndex: 0,
      chapterScrollProgress: 0,
      updatedAt: Date.now(),
    }))
    vi.mocked(getShelfBook).mockResolvedValue(serverBook)
    vi.mocked(getChapterList).mockResolvedValue(chapters)
    vi.mocked(getBookContent).mockResolvedValue('服务端进度章节正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    vi.mocked(setBrowserCachedChapter).mockResolvedValue(undefined)
    useAppStore().setOnlineStatus(true)
    const readerStore = useReaderStore()

    const restored = await readerStore.restorePersistedSession()

    expect(restored).toBe(true)
    expect(readerStore.currentIndex).toBe(0)
    expect(readerStore.book?.durChapterPos).toBe(0)
    expect(getBookContent).toHaveBeenCalledWith(expect.objectContaining({
      chapterUrl: 'chapter-1',
      bookUrl: 'book-restore',
      bookSourceUrl: 'source-1',
      book: expect.objectContaining({ bookUrl: 'book-restore' }),
      chapter: { title: '第1章', url: 'chapter-1', index: 0 },
      refresh: 0,
    }))
  })

  it('serializes progress saves and advances the revision used by the next save', async () => {
    let resolveFirst!: (value: {
      accepted: boolean
      currentRevision: number
      currentProgress: { bookUrl: string; index: number; position: number }
    }) => void
    vi.mocked(saveBookProgress)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce({
        accepted: true,
        currentRevision: 3,
        currentProgress: { bookUrl: 'book-progress', index: 1, position: 2000 },
      })
    const readerStore = useReaderStore()
    readerStore.book = {
      name: '进度书', author: '作者', origin: 'source-1', bookUrl: 'book-progress', progressRevision: 1,
    }

    readerStore.setActiveChapterState(1, '正文', 0.1)
    const firstSave = readerStore.persistProgress()
    await vi.waitFor(() => expect(saveBookProgress).toHaveBeenCalledTimes(1))
    readerStore.setChapterScrollProgress(0.2)
    const secondSave = readerStore.persistProgress()
    resolveFirst({
      accepted: true,
      currentRevision: 2,
      currentProgress: { bookUrl: 'book-progress', index: 1, position: 1000 },
    })
    await Promise.all([firstSave, secondSave])

    expect(vi.mocked(saveBookProgress).mock.calls).toEqual([
      [{ bookUrl: 'book-progress', index: 1, position: 1000, revision: 1 }],
      [{ bookUrl: 'book-progress', index: 1, position: 2000, revision: 2 }],
    ])
    expect(readerStore.book.progressRevision).toBe(3)
    await readerStore.flushProgressToServer()
    expect(saveBookProgress).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer server progress on conflict and uses its revision after the user moves again', async () => {
    vi.mocked(saveBookProgress)
      .mockResolvedValueOnce({
        accepted: false,
        currentRevision: 6,
        currentProgress: { bookUrl: 'book-conflict', index: 7, position: 8000 },
      })
      .mockResolvedValueOnce({
        accepted: true,
        currentRevision: 7,
        currentProgress: { bookUrl: 'book-conflict', index: 1, position: 2100 },
      })
    const appStore = useAppStore()
    const readerStore = useReaderStore()
    readerStore.book = {
      name: '冲突书', author: '作者', origin: 'source-1', bookUrl: 'book-conflict', progressRevision: 5,
    }
    readerStore.setActiveChapterState(1, '正文', 0.2)

    await readerStore.persistProgress()

    expect(readerStore.book.progressRevision).toBe(6)
    expect(appStore.toasts.some((toast) => toast.message.includes('旧进度未覆盖'))).toBe(true)
    await readerStore.flushProgressToServer()
    expect(saveBookProgress).toHaveBeenCalledTimes(1)

    readerStore.setChapterScrollProgress(0.21)
    await readerStore.flushProgressToServer()
    expect(saveBookProgress).toHaveBeenLastCalledWith({
      bookUrl: 'book-conflict', index: 1, position: 2100, revision: 6,
    })
    expect(readerStore.book.progressRevision).toBe(7)
  })

  it('treats an identical rejected save as already synchronized', async () => {
    vi.mocked(saveBookProgress).mockResolvedValue({
      accepted: false,
      currentRevision: 4,
      currentProgress: { bookUrl: 'book-duplicate', index: 2, position: 3500 },
    })
    const appStore = useAppStore()
    const readerStore = useReaderStore()
    readerStore.book = {
      name: '重复保存书', author: '作者', origin: 'source-1', bookUrl: 'book-duplicate', progressRevision: 3,
    }
    readerStore.setActiveChapterState(2, '正文', 0.35)

    await readerStore.persistProgress()

    expect(readerStore.book.progressRevision).toBe(4)
    expect(appStore.toasts.some((toast) => toast.message.includes('旧进度未覆盖'))).toBe(false)
    await readerStore.flushProgressToServer()
    expect(saveBookProgress).toHaveBeenCalledTimes(1)
  })

  it('parses keepalive responses and sends both authentication headers', async () => {
    localStorage.setItem('accessToken', ' user-token ')
    localStorage.setItem('secureKey', ' server-key ')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        isSuccess: true,
        data: {
          accepted: true,
          currentRevision: 9,
          currentProgress: { bookUrl: 'book-keepalive', index: 3, position: 4200 },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const readerStore = useReaderStore()
    readerStore.book = {
      name: '保活书', author: '作者', origin: 'source-1', bookUrl: 'book-keepalive', progressRevision: 8,
    }
    readerStore.setActiveChapterState(3, '正文', 0.42)

    readerStore.flushProgressToServerKeepalive(true)
    await vi.waitFor(() => expect(readerStore.book?.progressRevision).toBe(9))

    expect(fetchMock).toHaveBeenCalledWith('/reader3/saveBookProgress', expect.objectContaining({
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'user-token',
        'X-Secure-Key': 'server-key',
      },
      body: JSON.stringify({ bookUrl: 'book-keepalive', index: 3, position: 4200, revision: 8 }),
    }))
    await readerStore.flushProgressToServer()
    expect(saveBookProgress).not.toHaveBeenCalled()
  })
})

describe('reader background synchronization', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    let objectUrlIndex = 0
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => `blob:background-${++objectUrlIndex}`),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('downloads a newer server background and applies its display settings', async () => {
    const image = new Blob(['remote-image'], { type: 'image/webp' })
    vi.mocked(fetchReaderBackgroundMetadata).mockResolvedValue({
      enabled: true,
      fit: 'contain',
      position: 'top',
      overlay: 0.6,
      contentType: 'image/webp',
      byteSize: image.size,
      updatedAt: 100,
      etag: 'remote-v1',
    })
    vi.mocked(fetchReaderBackgroundImage).mockResolvedValue({ blob: image, etag: 'remote-v1' })

    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundLoaded).toBe(true))

    expect(store.readerBackgroundUrl).toBe('blob:background-1')
    expect(store.readerBackgroundConfig).toMatchObject({
      enabled: true,
      fit: 'contain',
      position: 'top',
      overlay: 0.6,
    })
    expect(saveReaderBackground).toHaveBeenCalledWith(
      image,
      expect.stringMatching(/^reader-background:/),
    )
    expect(localStorage.setItem).toHaveBeenCalledWith(
      expect.stringMatching(/^reader-backgroundServerEtag:/),
      'remote-v1',
    )
    expect(store.readerBackgroundSyncState).toBe('synced')
  })

  it('migrates an existing browser-only background to the server', async () => {
    const image = new Blob(['local-image'], { type: 'image/webp' })
    localStorage.setItem('accessToken', 'migration-user')
    readerBackgroundCache.blobs.set('reader-background', image)
    vi.mocked(uploadReaderBackground).mockResolvedValue({
      enabled: true,
      fit: 'cover',
      position: 'center',
      overlay: 0.45,
      contentType: 'image/webp',
      byteSize: image.size,
      updatedAt: 101,
      etag: 'migrated-v1',
    })

    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundLoaded).toBe(true))

    expect(uploadReaderBackground).toHaveBeenCalledWith(image, {
      enabled: true,
      fit: 'cover',
      position: 'center',
      overlay: 0.45,
    })
    expect(localStorage.removeItem).toHaveBeenCalledWith(
      expect.stringMatching(/^reader-backgroundPendingSync:/),
    )
    expect(store.readerBackgroundSyncState).toBe('synced')
  })

  it('keeps a failed upload pending and retries it when the browser comes online', async () => {
    const image = new Blob(['offline-image'], { type: 'image/webp' })
    const metadata = {
      enabled: true,
      fit: 'cover' as const,
      position: 'center' as const,
      overlay: 0.45,
      contentType: 'image/webp',
      byteSize: image.size,
      updatedAt: 102,
      etag: 'retried-v1',
    }
    vi.mocked(fetchReaderBackgroundMetadata)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(metadata)
    vi.mocked(uploadReaderBackground)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(metadata)
    const appStore = useAppStore()
    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundLoaded).toBe(true))

    await store.setReaderBackgroundImage(image)
    expect(store.readerBackgroundSyncState).toBe('pending')
    expect(localStorage.setItem).toHaveBeenCalledWith(
      expect.stringMatching(/^reader-backgroundPendingSync:/),
      expect.stringContaining('"operation":"upload"'),
    )

    appStore.setOnlineStatus(false)
    await Promise.resolve()
    appStore.setOnlineStatus(true)
    await vi.waitFor(() => expect(store.readerBackgroundSyncState).toBe('synced'))

    expect(uploadReaderBackground).toHaveBeenCalledTimes(2)
    expect(localStorage.removeItem).toHaveBeenCalledWith(
      expect.stringMatching(/^reader-backgroundPendingSync:/),
    )
  })

  it('does not resurrect a server background deleted from another device', async () => {
    const image = new Blob(['old-server-image'], { type: 'image/webp' })
    const metadata = {
      enabled: true,
      fit: 'cover' as const,
      position: 'center' as const,
      overlay: 0.45,
      contentType: 'image/webp',
      byteSize: image.size,
      updatedAt: 103,
      etag: 'deleted-later',
    }
    vi.mocked(fetchReaderBackgroundMetadata)
      .mockResolvedValueOnce(metadata)
      .mockResolvedValue(null)
    vi.mocked(fetchReaderBackgroundImage).mockResolvedValue({ blob: image, etag: metadata.etag })
    const appStore = useAppStore()
    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundSyncState).toBe('synced'))

    appStore.setOnlineStatus(false)
    await Promise.resolve()
    appStore.setOnlineStatus(true)
    await vi.waitFor(() => expect(store.readerBackgroundUrl).toBe(''))

    expect(uploadReaderBackground).not.toHaveBeenCalled()
    expect(store.readerBackgroundConfig.enabled).toBe(false)
  })

  it('uploads the newest blob after two rapid background changes', async () => {
    const first = new Blob(['first-image'], { type: 'image/webp' })
    const second = new Blob(['second-image'], { type: 'image/webp' })
    const firstMetadata = {
      enabled: true,
      fit: 'cover' as const,
      position: 'center' as const,
      overlay: 0.45,
      contentType: 'image/webp',
      byteSize: first.size,
      updatedAt: 104,
      etag: 'first-v1',
    }
    const secondMetadata = {
      ...firstMetadata,
      byteSize: second.size,
      updatedAt: 105,
      etag: 'second-v1',
    }
    let resolveFirstUpload!: (metadata: typeof firstMetadata) => void
    vi.mocked(fetchReaderBackgroundMetadata)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(secondMetadata)
    vi.mocked(uploadReaderBackground)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstUpload = resolve
      }))
      .mockResolvedValueOnce(secondMetadata)
    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundLoaded).toBe(true))

    const firstSave = store.setReaderBackgroundImage(first)
    await vi.waitFor(() => expect(uploadReaderBackground).toHaveBeenCalledTimes(1))
    const secondSave = store.setReaderBackgroundImage(second)
    resolveFirstUpload(firstMetadata)
    await Promise.all([firstSave, secondSave])

    expect(uploadReaderBackground).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadReaderBackground).mock.calls[1][0]).toBe(second)
    expect(store.readerBackgroundSyncState).toBe('synced')
  })

  it('still uploads when IndexedDB cannot save the local cache', async () => {
    const image = new Blob(['server-only-image'], { type: 'image/webp' })
    const metadata = {
      enabled: true,
      fit: 'cover' as const,
      position: 'center' as const,
      overlay: 0.45,
      contentType: 'image/webp',
      byteSize: image.size,
      updatedAt: 106,
      etag: 'server-only-v1',
    }
    vi.mocked(saveReaderBackground).mockRejectedValue(new Error('quota'))
    vi.mocked(uploadReaderBackground).mockResolvedValue(metadata)
    vi.mocked(fetchReaderBackgroundImage).mockResolvedValue({ blob: image, etag: metadata.etag })
    vi.mocked(fetchReaderBackgroundMetadata)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(metadata)
    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundLoaded).toBe(true))

    await store.setReaderBackgroundImage(image)

    expect(uploadReaderBackground).toHaveBeenCalledWith(image, expect.any(Object))
    expect(store.readerBackgroundSyncState).toBe('synced')
  })

  it('switches to an isolated cache when the signed-in account changes', async () => {
    localStorage.setItem('accessToken', 'token-a')
    const firstImage = new Blob(['account-a'], { type: 'image/webp' })
    const secondImage = new Blob(['account-b'], { type: 'image/webp' })
    const firstMetadata = {
      enabled: true,
      fit: 'cover' as const,
      position: 'center' as const,
      overlay: 0.45,
      contentType: 'image/webp',
      byteSize: firstImage.size,
      updatedAt: 107,
      etag: 'account-a-v1',
    }
    const secondMetadata = {
      ...firstMetadata,
      byteSize: secondImage.size,
      updatedAt: 108,
      etag: 'account-b-v1',
    }
    vi.mocked(fetchReaderBackgroundMetadata)
      .mockResolvedValueOnce(firstMetadata)
      .mockResolvedValue(secondMetadata)
    vi.mocked(fetchReaderBackgroundImage)
      .mockResolvedValueOnce({ blob: firstImage, etag: firstMetadata.etag })
      .mockResolvedValue({ blob: secondImage, etag: secondMetadata.etag })
    const appStore = useAppStore()
    const store = useReaderStore()
    await vi.waitFor(() => expect(store.readerBackgroundUrl).toBe('blob:background-1'))

    localStorage.setItem('accessToken', 'token-b')
    appStore.updateUserInfo({ username: 'account-b', accessToken: 'token-b' })
    await vi.waitFor(() => expect(store.readerBackgroundUrl).toBe('blob:background-2'))

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:background-1')
    expect(uploadReaderBackground).not.toHaveBeenCalled()
    expect(readerBackgroundCache.blobs.size).toBe(2)
  })
})

describe('reader summary display config', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults key points to card style', () => {
    const store = useReaderStore()
    expect(store.config.chapterSummaryKeyPointStyle).toBe('card')
  })
})


describe('reader ai book auto-update', () => {
  beforeEach(() => {
    aiBookStoreMock.memoryView = null
    aiBookStoreMock.load.mockReset()
    aiBookStoreMock.generateChapterMemory.mockReset()
    aiBookStoreMock.loadChapterMemory.mockReset()
    aiBookStoreMock.loadServerModelConfig.mockReset()
    aiBookStoreMock.loadServerModelConfig.mockResolvedValue(null)
  })

  it('reader auto-update no longer passes chapterContent into aiBook store', async () => {
    aiBookStoreMock.load.mockResolvedValue({ enabled: true, bookUrl: 'book-1' })
    aiBookStoreMock.generateChapterMemory.mockResolvedValue({})
    vi.mocked(getBookContent).mockResolvedValue('下一章正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    vi.mocked(setBrowserCachedChapter).mockResolvedValue(undefined)

    const appStore = useAppStore()
    appStore.setOnlineStatus(true)
    const readerStore = useReaderStore()
    readerStore.book = {
      name: '测试书',
      author: '作者',
      origin: 'source-1',
      bookUrl: 'book-1',
    }
    readerStore.chapters = [
      { title: '第一章', url: 'chapter-1', index: 0 },
      { title: '第二章', url: 'chapter-2', index: 1 },
    ]
    readerStore.currentIndex = 0
    readerStore.content = '第一章正文'

    await readerStore.nextChapter()

    expect(aiBookStoreMock.load).toHaveBeenCalledWith(expect.objectContaining({ bookUrl: 'book-1' }))
    expect(aiBookStoreMock.generateChapterMemory).toHaveBeenCalledWith({
      bookUrl: 'book-1',
      chapterIndex: 0,
      mode: 'auto',
    })
    expect(aiBookStoreMock.generateChapterMemory.mock.calls[0][0]).not.toHaveProperty('chapterContent')
  })


  it('swallows background ai book generate failures after chapter switch', async () => {
    aiBookStoreMock.load.mockResolvedValue({ enabled: true, bookUrl: 'book-1' })
    aiBookStoreMock.generateChapterMemory.mockRejectedValue(new Error('AI失败'))
    vi.mocked(getBookContent).mockResolvedValue('下一章正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    vi.mocked(setBrowserCachedChapter).mockResolvedValue(undefined)

    const appStore = useAppStore()
    appStore.setOnlineStatus(true)
    const readerStore = useReaderStore()
    readerStore.book = {
      name: '测试书',
      author: '作者',
      origin: 'source-1',
      bookUrl: 'book-1',
    }
    readerStore.chapters = [
      { title: '第一章', url: 'chapter-1', index: 0 },
      { title: '第二章', url: 'chapter-2', index: 1 },
    ]
    readerStore.currentIndex = 0
    readerStore.content = '第一章正文'

    await expect(readerStore.nextChapter()).resolves.toBeUndefined()
    await Promise.resolve()
    await Promise.resolve()

    expect(aiBookStoreMock.generateChapterMemory).toHaveBeenCalledWith({
      bookUrl: 'book-1',
      chapterIndex: 0,
      mode: 'auto',
    })
  })
})

describe('reader remote speech audio buffers', () => {
  class FakeAudio {
    static instances: FakeAudio[] = []
    src = ''
    preload = ''
    volume = 1
    paused = true
    ended = false
    playCount = 0
    onplay: (() => void) | null = null
    onpause: (() => void) | null = null
    onended: (() => void) | null = null
    onerror: (() => void) | null = null

    constructor() {
      FakeAudio.instances.push(this)
    }

    load() {}
    removeAttribute(name: string) {
      if (name === 'src') this.src = ''
    }
    pause() {
      this.paused = true
    }
    play() {
      this.paused = false
      this.playCount += 1
      this.onplay?.()
      return Promise.resolve()
    }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    vi.stubGlobal('Audio', FakeAudio)
    let objectUrlIndex = 0
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => `blob:tts-${++objectUrlIndex}`),
      revokeObjectURL: vi.fn(),
    })
    FakeAudio.instances = []
    vi.mocked(requestOpenAISpeechAudio).mockReset()
    vi.mocked(requestOpenAISpeechAudio).mockImplementation(async ({ input }) => (
      new Blob([input], { type: 'audio/mpeg' })
    ))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prepares two audio elements and alternates them without creating a third', async () => {
    const store = useReaderStore()
    store.setSpeechProvider('openai')
    await store.preloadOpenAITTS(['第一段', '第二段'])
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(2))

    store.startTTS('第一段', {
      onEnd: () => store.startTTS('第二段', {}, false),
    })
    await vi.waitFor(() => expect(FakeAudio.instances.some((audio) => audio.playCount === 1)).toBe(true))
    const firstAudio = FakeAudio.instances.find((audio) => audio.playCount === 1)
    expect(firstAudio).toBeDefined()

    firstAudio!.ended = true
    firstAudio!.onended?.()
    await vi.waitFor(() => expect(FakeAudio.instances.reduce((sum, audio) => sum + audio.playCount, 0)).toBe(2))

    expect(FakeAudio.instances).toHaveLength(2)
    expect(FakeAudio.instances.every((audio) => audio.playCount === 1)).toBe(true)
  })

  it('releases a prepared buffer when its shared request resolves after playback was stopped', async () => {
    let resolveRequest!: (blob: Blob) => void
    vi.mocked(requestOpenAISpeechAudio).mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    const store = useReaderStore()
    store.setSpeechProvider('openai')

    await store.preloadOpenAITTS('稍后播放')
    store.startTTS('稍后播放')
    store.stopTTS(false)
    resolveRequest(new Blob(['稍后播放'], { type: 'audio/mpeg' }))

    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tts-1')
    expect(FakeAudio.instances.reduce((sum, audio) => sum + audio.playCount, 0)).toBe(0)
  })

  it('does not let an old preload generation clear a newer same-key request marker', async () => {
    const resolvers: Array<(blob: Blob) => void> = []
    vi.mocked(requestOpenAISpeechAudio).mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    const store = useReaderStore()
    store.setSpeechProvider('openai')

    await store.preloadOpenAITTS('相同文本')
    store.setOpenAISpeechRequestMode('merged')
    await store.preloadOpenAITTS('相同文本')
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(2)

    resolvers[0]!(new Blob(['旧配置'], { type: 'audio/mpeg' }))
    await Promise.resolve()
    await Promise.resolve()
    await store.preloadOpenAITTS('相同文本')
    resolvers[1]!(new Blob(['新配置'], { type: 'audio/mpeg' }))

    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(2)
  })
})
