import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupBrowserCache,
  clearAllBrowserCache,
  getBrowserCachedChapter,
  listBrowserCacheSummary,
  setBrowserCachedChapter,
} from './browserCache'

interface MemoryDatabase {
  stores: Map<string, Map<IDBValidKey, unknown>>
}

let failNextPut = false

interface MutableRequest<T> {
  result: T
  error: DOMException | null
  onsuccess: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

interface MutableOpenRequest extends MutableRequest<IDBDatabase | undefined> {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null
}

interface MutableTransaction {
  error: DOMException | null
  oncomplete: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  onabort: ((event: Event) => void) | null
  objectStore: (name: string) => IDBObjectStore
}

function installMemoryIndexedDb() {
  if (typeof indexedDB !== 'undefined') return
  const databases = new Map<string, MemoryDatabase>()

  const factory = {
    open(name: string) {
      const request: MutableOpenRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }
      queueMicrotask(() => {
        const isNew = !databases.has(name)
        const memoryDb = databases.get(name) || { stores: new Map() }
        databases.set(name, memoryDb)
        const database = {
          objectStoreNames: { contains: (storeName: string) => memoryDb.stores.has(storeName) },
          createObjectStore(storeName: string) {
            if (!memoryDb.stores.has(storeName)) memoryDb.stores.set(storeName, new Map())
            return { createIndex() {} } as unknown as IDBObjectStore
          },
          transaction(storeName: string) {
            const records = memoryDb.stores.get(storeName)
            if (!records) throw new Error(`Missing object store: ${storeName}`)
            let pending = 0
            let completed = false
            const transaction: MutableTransaction = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: () => store,
            }
            const completeLater = () => {
              queueMicrotask(() => {
                if (!completed && pending === 0) {
                  completed = true
                  transaction.oncomplete?.(new Event('complete'))
                }
              })
            }
            const makeRequest = <T>(operation: () => T) => {
              pending += 1
              const childRequest: MutableRequest<T | undefined> = {
                result: undefined,
                error: null,
                onsuccess: null,
                onerror: null,
              }
              queueMicrotask(() => {
                try {
                  childRequest.result = operation()
                  childRequest.onsuccess?.(new Event('success'))
                } catch (error) {
                  childRequest.error = error as DOMException
                  childRequest.onerror?.(new Event('error'))
                } finally {
                  pending -= 1
                  completeLater()
                }
              })
              return childRequest as unknown as IDBRequest<T>
            }
            const store = {
              get(key: IDBValidKey) {
                return makeRequest(() => structuredClone(records.get(key)))
              },
              getAll() {
                return makeRequest(() => Array.from(records.values(), (value) => structuredClone(value)))
              },
              put(value: { key: IDBValidKey }) {
                return makeRequest(() => {
                  if (failNextPut) {
                    failNextPut = false
                    throw new DOMException('simulated quota exhaustion', 'QuotaExceededError')
                  }
                  records.set(value.key, structuredClone(value))
                  return value.key
                })
              },
              delete(key: IDBValidKey) {
                return makeRequest(() => {
                  records.delete(key)
                  return undefined
                })
              },
              clear() {
                return makeRequest(() => {
                  records.clear()
                  return undefined
                })
              },
              index(indexName: string) {
                if (indexName !== 'bookUrl') throw new Error(`Unsupported index: ${indexName}`)
                return {
                  getAll(query: { value: unknown }) {
                    return makeRequest(() => Array.from(records.values())
                      .filter((value) => (value as { bookUrl?: unknown }).bookUrl === query.value)
                      .map((value) => structuredClone(value)))
                  },
                }
              },
            } as unknown as IDBObjectStore
            completeLater()
            return transaction as unknown as IDBTransaction
          },
          close() {},
          onversionchange: null,
        } as unknown as IDBDatabase
        request.result = database
        if (isNew) request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent)
        request.onsuccess?.(new Event('success'))
      })
      return request as unknown as IDBOpenDBRequest
    },
  } as unknown as IDBFactory

  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: { only: (value: unknown) => ({ value }) },
  })
}

installMemoryIndexedDb()

describe('browser chapter cache governance', () => {
  beforeEach(async () => {
    failNextPut = false
    await clearAllBrowserCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes expired chapters', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    await setBrowserCachedChapter({
      bookUrl: 'book-expired',
      chapterUrl: 'chapter-1',
      content: 'expired',
    })

    const result = await cleanupBrowserCache({ now: 2_001, maxAgeMs: 1_000 })

    expect(result.deletedRecords).toBe(1)
    expect(await getBrowserCachedChapter('book-expired', 'chapter-1')).toBeNull()
  })

  it('evicts least-recently-used chapters to stay within the byte quota', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    await setBrowserCachedChapter({
      bookUrl: 'book-lru',
      chapterUrl: 'chapter-old',
      content: 'aaaaaa',
    })
    vi.setSystemTime(2_000)
    await setBrowserCachedChapter({
      bookUrl: 'book-lru',
      chapterUrl: 'chapter-new',
      content: 'bbbbbb',
    })
    vi.setSystemTime(3_000)
    expect(await getBrowserCachedChapter('book-lru', 'chapter-old')).toBe('aaaaaa')

    const result = await cleanupBrowserCache({
      now: 3_000,
      maxAgeMs: 10_000,
      maxBytes: 6,
    })

    expect(result.deletedRecords).toBe(1)
    expect(await getBrowserCachedChapter('book-lru', 'chapter-old')).toBe('aaaaaa')
    expect(await getBrowserCachedChapter('book-lru', 'chapter-new')).toBeNull()
  })

  it('can reserve room for a failed write by trimming oldest data', async () => {
    await setBrowserCachedChapter({
      bookUrl: 'book-retry',
      chapterUrl: 'chapter-1',
      content: '1234',
    })
    await setBrowserCachedChapter({
      bookUrl: 'book-retry',
      chapterUrl: 'chapter-2',
      content: '5678',
    })

    const result = await cleanupBrowserCache({ minBytesToFree: 4 })
    const summaries = await listBrowserCacheSummary()

    expect(result.deletedBytes).toBeGreaterThanOrEqual(4)
    expect(summaries.find((item) => item.bookUrl === 'book-retry')?.cachedChapterCount).toBe(1)
  })

  it('cleans the oldest data and retries a failed write once', async () => {
    await setBrowserCachedChapter({
      bookUrl: 'book-retry-write',
      chapterUrl: 'chapter-old',
      content: 'old',
    })
    failNextPut = true

    await setBrowserCachedChapter({
      bookUrl: 'book-retry-write',
      chapterUrl: 'chapter-new',
      content: 'new',
    })

    expect(await getBrowserCachedChapter('book-retry-write', 'chapter-old')).toBeNull()
    expect(await getBrowserCachedChapter('book-retry-write', 'chapter-new')).toBe('new')
  })
})
