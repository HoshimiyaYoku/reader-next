import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBookshelfStore } from './bookshelf'
import { getBookshelfWithCacheInfo } from '../api/bookshelf'
import { listBrowserCacheSummary } from '../utils/browserCache'

vi.mock('../api/bookshelf', () => ({
  getBookshelfWithCacheInfo: vi.fn(),
  getBookGroups: vi.fn(),
  deleteBook: vi.fn(),
  deleteBooks: vi.fn(),
  saveBookGroupId: vi.fn(),
  saveBookGroup: vi.fn(),
  deleteBookGroup: vi.fn(),
  saveBooks: vi.fn(),
}))

vi.mock('../utils/browserCache', () => ({
  deleteBrowserBookCache: vi.fn(),
  listBrowserCacheSummary: vi.fn(),
}))

vi.mock('../utils/recentBooks', () => ({
  clearRecentReadBooks: vi.fn(),
  getRecentReadBookKey: vi.fn((book) => `${book.origin || ''}::${book.bookUrl}`),
  loadRecentReadBooks: vi.fn(() => []),
  removeRecentReadBook: vi.fn(),
}))

describe('bookshelf search state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    localStorage.clear()
    vi.mocked(getBookshelfWithCacheInfo).mockResolvedValue([])
    vi.mocked(listBrowserCacheSummary).mockResolvedValue([])
  })

  it('starts searches in single-source scope by default', () => {
    const store = useBookshelfStore()

    store.startSearch('星门')

    expect(store.searchKey).toBe('星门')
    expect(store.searchScope).toBe('source')
    expect(store.searchSourceUrl).toBe('')
    expect(store.searchGroup).toBe('')
  })


  it('does not display browser cache counts for uploaded local txt books', async () => {
    vi.mocked(getBookshelfWithCacheInfo).mockResolvedValue([
      {
        name: '本地书',
        author: '本地导入',
        origin: 'local-txt',
        bookUrl: 'local-txt:abc',
        cachedChapterCount: 12,
      },
      {
        name: '远程书',
        author: '作者',
        origin: 'https://source.example',
        bookUrl: 'https://book.example/1',
      },
    ] as never)
    vi.mocked(listBrowserCacheSummary).mockResolvedValue([
      { bookUrl: 'local-txt:abc', cachedChapterCount: 12, bytes: 100, updatedAt: 1 },
      { bookUrl: 'https://book.example/1', cachedChapterCount: 3, bytes: 200, updatedAt: 2 },
    ])
    const store = useBookshelfStore()

    await store.fetchBooks()

    expect(store.books.find((book) => book.bookUrl === 'local-txt:abc')?.browserCachedChapterCount).toBe(0)
    expect(store.books.find((book) => book.bookUrl === 'https://book.example/1')?.browserCachedChapterCount).toBe(3)
  })

  it('can start a search with the active explore source selected', () => {
    const store = useBookshelfStore()

    store.startSearch('星门', { sourceUrl: 'https://m.cuoceng.com' })

    expect(store.searchKey).toBe('星门')
    expect(store.searchScope).toBe('source')
    expect(store.searchSourceUrl).toBe('https://m.cuoceng.com')
  })

  it('remembers the last search scope for later searches', () => {
    const store = useBookshelfStore()

    store.searchScope = 'all'
    store.persistSearchPreferences()
    store.clearSearch()
    store.startSearch('星门')

    expect(store.searchScope).toBe('all')
    expect(store.searchSourceUrl).toBe('')
    expect(store.searchGroup).toBe('')
  })

  it('reuses cached search results for the same key and scope', () => {
    const store = useBookshelfStore()
    const book = {
      name: '星门',
      author: '老鹰吃小鸡',
      bookUrl: 'https://book.example/xm',
      origin: 'https://source.example',
    }

    store.cacheSearchResults({
      key: '星门',
      scope: 'source',
      group: '',
      sourceUrl: 'https://source.example',
      results: [book],
    })

    expect(store.getCachedSearchResults({
      key: '星门',
      scope: 'source',
      group: '',
      sourceUrl: 'https://source.example',
    })).toEqual([book])
    expect(store.getCachedSearchResults({
      key: '星门',
      scope: 'all',
      group: '',
      sourceUrl: '',
    })).toBeNull()
  })

  it('pauses an in-progress search and caches partial results for reader return', () => {
    const store = useBookshelfStore()
    const book = {
      name: '星门',
      author: '老鹰吃小鸡',
      bookUrl: 'https://book.example/xm',
      origin: 'https://source.example',
    }
    store.startSearch('星门', { sourceUrl: 'https://source.example' })
    store.searchResults = [book]
    store.isSearching = true

    store.pauseSearch()

    expect(store.isSearching).toBe(false)
    expect(store.getCachedSearchResults({
      key: '星门',
      scope: 'source',
      group: '',
      sourceUrl: 'https://source.example',
    })).toEqual([book])
  })

  it('caches an empty paused search so returning does not restart it', () => {
    const store = useBookshelfStore()
    store.startSearch('无结果', { sourceUrl: 'https://source.example' })
    store.isSearching = true

    store.pauseSearch()

    expect(store.getCachedSearchResults({
      key: '无结果',
      scope: 'source',
      group: '',
      sourceUrl: 'https://source.example',
    })).toEqual([])
  })
})
