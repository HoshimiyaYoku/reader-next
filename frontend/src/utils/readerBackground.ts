const DB_NAME = 'reader-preferences'
const DB_VERSION = 1
const STORE_NAME = 'assets'
const BACKGROUND_KEY = 'reader-background'

export const READER_BACKGROUND_MAX_FILE_SIZE = 15 * 1024 * 1024
export const READER_BACKGROUND_MAX_DIMENSION = 2560
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])

interface ReaderAssetRecord {
  key: string
  blob: Blob
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器不支持本地图片存储'))
  }
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
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
    }).catch((error: unknown) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>) {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    let result: T
    run(store)
      .then((value) => {
        result = value
      })
      .catch(reject)
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export function validateReaderBackgroundFile(file: File) {
  const normalizedType = file.type.toLowerCase()
  const hasSupportedExtension = /\.(?:jpe?g|png|webp|avif)$/i.test(file.name)
  if (!SUPPORTED_IMAGE_TYPES.has(normalizedType) && !(normalizedType === '' && hasSupportedExtension)) {
    throw new Error('仅支持 JPG、PNG、WebP 或 AVIF 图片')
  }
  if (!file.size) {
    throw new Error('图片文件为空')
  }
  if (file.size > READER_BACKGROUND_MAX_FILE_SIZE) {
    throw new Error('原图不能超过 15MB')
  }
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      }
    } catch {
      // Some Safari versions can display formats that createImageBitmap cannot decode.
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  await image.decode()
  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  }
}

export async function prepareReaderBackground(file: File) {
  validateReaderBackgroundFile(file)
  let decoded: Awaited<ReturnType<typeof decodeImage>>
  try {
    decoded = await decodeImage(file)
  } catch {
    throw new Error('图片无法读取或格式已损坏')
  }

  try {
    if (!decoded.width || !decoded.height) {
      throw new Error('图片尺寸无效')
    }
    const scale = Math.min(1, READER_BACKGROUND_MAX_DIMENSION / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(decoded.source, 0, 0, width, height)
    const optimized = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.86)
    })
    if (!optimized?.size) return file
    return optimized.size < file.size || scale < 1 ? optimized : file
  } finally {
    decoded.cleanup()
  }
}

export async function getReaderBackground(key = BACKGROUND_KEY) {
  return withStore('readonly', async (store) => {
    const record = await requestToPromise(store.get(key)) as ReaderAssetRecord | undefined
    return record?.blob instanceof Blob ? record.blob : null
  })
}

export async function saveReaderBackground(blob: Blob, key = BACKGROUND_KEY) {
  return withStore('readwrite', async (store) => {
    await requestToPromise(store.put({
      key,
      blob,
      updatedAt: Date.now(),
    } satisfies ReaderAssetRecord))
  })
}

export async function deleteReaderBackground(key = BACKGROUND_KEY) {
  return withStore('readwrite', async (store) => {
    await requestToPromise(store.delete(key))
  })
}
