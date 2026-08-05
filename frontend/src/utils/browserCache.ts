const DB_NAME = 'reader-browser-cache'
const DB_VERSION = 1
const STORE_NAME = 'chapters'
export const BROWSER_CACHE_MAX_BYTES = 200 * 1024 * 1024
export const BROWSER_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
const CLEANUP_WRITE_THRESHOLD_BYTES = 5 * 1024 * 1024
let dbPromise: Promise<IDBDatabase> | null = null
let lastCleanupAt = 0
let bytesWrittenSinceCleanup = 0
let cleanupPromise: Promise<BrowserCacheCleanupResult> | null = null

export interface BrowserChapterCacheRecord {
  key: string
  bookUrl: string
  chapterUrl: string
  chapterTitle: string
  content: string
  size: number
  updatedAt: number
}

export interface BrowserBookCacheSummary {
  bookUrl: string
  cachedChapterCount: number
  bytes: number
  updatedAt: number
}

export interface BrowserCacheCleanupOptions {
  maxBytes?: number
  maxAgeMs?: number
  minBytesToFree?: number
  now?: number
}

export interface BrowserCacheCleanupResult {
  deletedRecords: number
  deletedBytes: number
  remainingBytes: number
}

function cacheKey(bookUrl: string, chapterUrl: string) {
  return `${bookUrl}::${chapterUrl}`
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('bookUrl', 'bookUrl', { unique: false })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }
    }).catch((error: unknown) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise!
}

async function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    let handlerCompleted = false
    let transactionCompleted = false
    let result: T

    handler(store)
      .then((value) => {
        result = value
        handlerCompleted = true
        if (transactionCompleted) resolve(result)
      })
      .catch((error) => {
        reject(error)
      })
    tx.oncomplete = () => {
      transactionCompleted = true
      if (handlerCompleted) resolve(result)
    }
    tx.onerror = () => {
      reject(tx.error)
    }
    tx.onabort = () => {
      reject(tx.error)
    }
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function recordSize(record: BrowserChapterCacheRecord) {
  return Number.isFinite(record.size) && record.size >= 0
    ? record.size
    : new Blob([record.content || '']).size
}

function normalizeLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback
  return Number.isFinite(value) ? Math.max(0, value) : fallback
}

async function runBrowserCacheCleanup(
  options: BrowserCacheCleanupOptions = {},
): Promise<BrowserCacheCleanupResult> {
  const now = Number.isFinite(options.now) ? options.now! : Date.now()
  const maxBytes = normalizeLimit(options.maxBytes, BROWSER_CACHE_MAX_BYTES)
  const maxAgeMs = normalizeLimit(options.maxAgeMs, BROWSER_CACHE_MAX_AGE_MS)
  const minBytesToFree = normalizeLimit(options.minBytesToFree, 0)

  const result = await withStore('readwrite', async (store) => {
    const records = (await requestToPromise(store.getAll())) as BrowserChapterCacheRecord[]
    const oldestFirst = records
      .map((record) => ({
        record,
        size: recordSize(record),
        updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt)
    const expiredKeys = new Set(
      oldestFirst
        .filter((item) => now - item.updatedAt > maxAgeMs)
        .map((item) => item.record.key),
    )
    let remainingBytes = oldestFirst.reduce((total, item) => total + item.size, 0)
    const recordsToDelete = oldestFirst.filter((item) => expiredKeys.has(item.record.key))

    for (const item of recordsToDelete) {
      remainingBytes -= item.size
    }
    let deletedBytes = recordsToDelete.reduce((total, item) => total + item.size, 0)
    for (const item of oldestFirst) {
      if (remainingBytes <= maxBytes && deletedBytes >= minBytesToFree) break
      if (expiredKeys.has(item.record.key)) continue
      recordsToDelete.push(item)
      expiredKeys.add(item.record.key)
      remainingBytes -= item.size
      deletedBytes += item.size
    }

    await Promise.all(recordsToDelete.map((item) => requestToPromise(store.delete(item.record.key))))
    return {
      deletedRecords: recordsToDelete.length,
      deletedBytes,
      remainingBytes: Math.max(0, remainingBytes),
    }
  })

  lastCleanupAt = now
  bytesWrittenSinceCleanup = 0
  return result
}

async function maybeCleanupBrowserCache(writtenBytes = 0) {
  bytesWrittenSinceCleanup += Math.max(0, writtenBytes)
  const now = Date.now()
  const cleanupDue = lastCleanupAt === 0
    || now - lastCleanupAt >= CLEANUP_INTERVAL_MS
    || bytesWrittenSinceCleanup >= CLEANUP_WRITE_THRESHOLD_BYTES
  if (!cleanupDue) return

  if (!cleanupPromise) {
    cleanupPromise = runBrowserCacheCleanup()
      .catch(() => ({ deletedRecords: 0, deletedBytes: 0, remainingBytes: 0 }))
      .finally(() => {
        cleanupPromise = null
      })
  }
  await cleanupPromise
}

export async function cleanupBrowserCache(options: BrowserCacheCleanupOptions = {}) {
  return runBrowserCacheCleanup(options)
}

export async function getBrowserCachedChapter(bookUrl: string, chapterUrl: string) {
  const record = await withStore('readonly', async (store) => {
    const result = await requestToPromise(store.get(cacheKey(bookUrl, chapterUrl)))
    return result as BrowserChapterCacheRecord | undefined
  })
  if (!record) {
    void maybeCleanupBrowserCache()
    return null
  }

  try {
    await withStore('readwrite', async (store) => {
      const latest = await requestToPromise(store.get(record.key)) as BrowserChapterCacheRecord | undefined
      if (latest) {
        latest.updatedAt = Date.now()
        await requestToPromise(store.put(latest))
      }
    })
  } catch {
    // A failed LRU touch must never turn a cache hit into a reading failure.
  }
  void maybeCleanupBrowserCache()
  return record.content || null
}

export async function setBrowserCachedChapter(params: {
  bookUrl: string
  chapterUrl: string
  chapterTitle?: string
  content: string
}) {
  // Free expired entries before writing, which also helps when the browser quota is already tight.
  await maybeCleanupBrowserCache()
  const size = new Blob([params.content]).size
  const record: BrowserChapterCacheRecord = {
    key: cacheKey(params.bookUrl, params.chapterUrl),
    bookUrl: params.bookUrl,
    chapterUrl: params.chapterUrl,
    chapterTitle: params.chapterTitle || '',
    content: params.content,
    size,
    updatedAt: Date.now(),
  }
  const putRecord = () => withStore('readwrite', async (store) => {
    await requestToPromise(store.put(record))
  })

  try {
    await putRecord()
  } catch {
    try {
      await cleanupBrowserCache({ minBytesToFree: Math.max(size, CLEANUP_WRITE_THRESHOLD_BYTES) })
    } catch {
      // Retry once even when cleanup itself was only partially successful.
    }
    await putRecord()
  }
  // Cleanup errors are intentionally swallowed so a successfully cached chapter remains readable.
  await maybeCleanupBrowserCache(size)
}

export async function deleteBrowserBookCache(bookUrl: string) {
  return withStore('readwrite', async (store) => {
    const index = store.index('bookUrl')
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(bookUrl)))
    await Promise.all((records as BrowserChapterCacheRecord[]).map((record) => requestToPromise(store.delete(record.key))))
  })
}

export async function countBrowserBookCache(bookUrl: string) {
  const summaries = await listBrowserCacheSummary()
  return summaries.find((item) => item.bookUrl === bookUrl)?.cachedChapterCount || 0
}

export async function listBrowserCachedChapterUrls(bookUrl: string) {
  return withStore('readonly', async (store) => {
    const index = store.index('bookUrl')
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(bookUrl)))
    return new Set((records as BrowserChapterCacheRecord[]).map((record) => record.chapterUrl).filter(Boolean))
  })
}

export async function listBrowserCacheSummary(): Promise<BrowserBookCacheSummary[]> {
  return withStore('readonly', async (store) => {
    const records = await requestToPromise(store.getAll())
    const summaryMap = new Map<string, BrowserBookCacheSummary>()

    ;(records as BrowserChapterCacheRecord[]).forEach((record) => {
      const current = summaryMap.get(record.bookUrl) || {
        bookUrl: record.bookUrl,
        cachedChapterCount: 0,
        bytes: 0,
        updatedAt: 0,
      }
      current.cachedChapterCount += 1
      current.bytes += record.size || 0
      current.updatedAt = Math.max(current.updatedAt, record.updatedAt || 0)
      summaryMap.set(record.bookUrl, current)
    })

    return Array.from(summaryMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  })
}

export async function clearAllBrowserCache() {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.clear())
  })
  lastCleanupAt = Date.now()
  bytesWrittenSinceCleanup = 0
}
