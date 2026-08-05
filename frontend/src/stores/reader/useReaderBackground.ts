import { reactive, ref, watch } from 'vue'
import { useAppStore } from '../app'
import {
  deleteReaderBackground,
  getReaderBackground,
  saveReaderBackground,
} from '../../utils/readerBackground'
import {
  fetchReaderBackgroundImage,
  fetchReaderBackgroundMetadata,
  removeReaderBackground as removeServerReaderBackground,
  updateReaderBackgroundSettings,
  uploadReaderBackground,
} from '../../api/readerBackground'
import type { ReaderBackgroundMetadata } from '../../api/readerBackground'
import {
  defaultReaderBackgroundConfig,
  loadReaderBackgroundConfig,
  normalizeNumber,
} from './readerConfig'
import type { ReaderBackgroundConfig } from './readerConfig'

const READER_BACKGROUND_CONFIG_KEY = 'reader-backgroundConfig'
const READER_BACKGROUND_ETAG_KEY = 'reader-backgroundServerEtag'
const READER_BACKGROUND_PENDING_KEY = 'reader-backgroundPendingSync'
const READER_BACKGROUND_SERVER_STATE_KEY = 'reader-backgroundServerState'
const READER_BACKGROUND_LEGACY_CLAIMED_KEY = 'reader-backgroundLegacyClaimed'
const READER_BACKGROUND_LEGACY_ASSET_KEY = 'reader-background'
const READER_BACKGROUND_SETTINGS_SYNC_DELAY_MS = 500

type ReaderBackgroundSyncOperation = 'upload' | 'settings' | 'delete'
interface PendingReaderBackgroundSync {
  operation: ReaderBackgroundSyncOperation
  nonce: number
}

export function useReaderBackground() {
  const appStore = useAppStore()
  const readerBackgroundConfig = reactive(loadReaderBackgroundConfig())
  const readerBackgroundUrl = ref('')
  const readerBackgroundLoaded = ref(false)
  const readerBackgroundSyncState = ref<'loading' | 'synced' | 'pending' | 'local'>('loading')
  const readerBackgroundNamespace = ref(resolveReaderBackgroundNamespace())
  let readerBackgroundObjectUrl = ''
  let readerBackgroundSyncQueue: Promise<void> = Promise.resolve()
  let readerBackgroundPendingNonce = Date.now()
  let readerBackgroundSettingsTimer: ReturnType<typeof setTimeout> | null = null
  let readerBackgroundSyncGeneration = 0
  const pendingReaderBackgroundBlobs = new Map<string, { nonce: number; blob: Blob }>()

  function hashReaderBackgroundIdentity(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  }

  function resolveReaderBackgroundNamespace() {
    const username = appStore.userInfo?.username?.trim()
    const accessToken = localStorage.getItem('accessToken')?.trim()
    const secureKey = localStorage.getItem('secureKey')?.trim()
    const identity = username
      ? `user:${username}`
      : accessToken
        ? `token:${accessToken}`
        : secureKey
          ? `secure:${secureKey}`
          : 'anonymous'
    return hashReaderBackgroundIdentity(identity)
  }

  function readerBackgroundStorageKey(base: string, namespace: string) {
    return `${base}:${namespace}`
  }

  function readerBackgroundAssetKey(namespace: string) {
    return readerBackgroundStorageKey(READER_BACKGROUND_LEGACY_ASSET_KEY, namespace)
  }

  function isActiveReaderBackgroundSync(namespace: string, generation: number) {
    return readerBackgroundNamespace.value === namespace
      && readerBackgroundSyncGeneration === generation
  }

  function persistReaderBackgroundConfig() {
    localStorage.setItem(READER_BACKGROUND_CONFIG_KEY, JSON.stringify(readerBackgroundConfig))
  }

  function readerBackgroundSettings() {
    return {
      enabled: readerBackgroundConfig.enabled,
      readerEnabled: readerBackgroundConfig.readerEnabled,
      fit: readerBackgroundConfig.fit,
      position: readerBackgroundConfig.position,
      overlay: readerBackgroundConfig.overlay,
    }
  }

  function readPendingReaderBackgroundSync(namespace: string): PendingReaderBackgroundSync | null {
    try {
      const key = readerBackgroundStorageKey(READER_BACKGROUND_PENDING_KEY, namespace)
      const saved = JSON.parse(localStorage.getItem(key) || 'null') as Partial<PendingReaderBackgroundSync> | null
      if (
        !saved
        || !['upload', 'settings', 'delete'].includes(String(saved.operation))
        || typeof saved.nonce !== 'number'
        || !Number.isFinite(saved.nonce)
      ) return null
      return saved as PendingReaderBackgroundSync
    } catch {
      return null
    }
  }

  function markReaderBackgroundPending(
    namespace: string,
    operation: ReaderBackgroundSyncOperation,
  ) {
    const current = readPendingReaderBackgroundSync(namespace)
    const nextOperation = operation === 'settings' && current?.operation === 'upload'
      ? 'upload'
      : operation
    readerBackgroundPendingNonce = Math.max(Date.now(), readerBackgroundPendingNonce + 1)
    const pending: PendingReaderBackgroundSync = {
      operation: nextOperation,
      nonce: readerBackgroundPendingNonce,
    }
    localStorage.setItem(
      readerBackgroundStorageKey(READER_BACKGROUND_PENDING_KEY, namespace),
      JSON.stringify(pending),
    )
    if (readerBackgroundNamespace.value === namespace) {
      readerBackgroundSyncState.value = 'pending'
    }
    return pending
  }

  function clearReaderBackgroundPending(namespace: string, nonce: number) {
    if (readPendingReaderBackgroundSync(namespace)?.nonce === nonce) {
      localStorage.removeItem(readerBackgroundStorageKey(READER_BACKGROUND_PENDING_KEY, namespace))
    }
    const pendingBlob = pendingReaderBackgroundBlobs.get(namespace)
    if (pendingBlob?.nonce === nonce) pendingReaderBackgroundBlobs.delete(namespace)
  }

  function applyServerReaderBackgroundMetadata(
    metadata: ReaderBackgroundMetadata,
    namespace: string,
    generation: number,
    applySettings = true,
  ) {
    if (applySettings && isActiveReaderBackgroundSync(namespace, generation)) {
      readerBackgroundConfig.enabled = metadata.enabled
      readerBackgroundConfig.readerEnabled = typeof metadata.readerEnabled === 'boolean'
        ? metadata.readerEnabled
        : defaultReaderBackgroundConfig.readerEnabled
      readerBackgroundConfig.fit = metadata.fit
      readerBackgroundConfig.position = metadata.position
      readerBackgroundConfig.overlay = normalizeNumber(
        metadata.overlay,
        defaultReaderBackgroundConfig.overlay,
        0,
        0.9,
      )
      persistReaderBackgroundConfig()
    }
    localStorage.setItem(readerBackgroundStorageKey(READER_BACKGROUND_ETAG_KEY, namespace), metadata.etag)
    localStorage.setItem(readerBackgroundStorageKey(READER_BACKGROUND_SERVER_STATE_KEY, namespace), 'present')
  }

  function replaceReaderBackgroundUrl(blob: Blob | null) {
    if (readerBackgroundObjectUrl) {
      URL.revokeObjectURL(readerBackgroundObjectUrl)
      readerBackgroundObjectUrl = ''
    }
    readerBackgroundObjectUrl = blob ? URL.createObjectURL(blob) : ''
    readerBackgroundUrl.value = readerBackgroundObjectUrl
  }

  async function claimLegacyReaderBackground(namespace: string) {
    let localBlob = await getReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => null)
    if (localBlob) return localBlob
    const canClaimLegacy = Boolean(localStorage.getItem('accessToken')?.trim() || appStore.isLoggedIn)
    if (localStorage.getItem(READER_BACKGROUND_LEGACY_CLAIMED_KEY) || !canClaimLegacy) return null
    localBlob = await getReaderBackground(READER_BACKGROUND_LEGACY_ASSET_KEY).catch(() => null)
    if (!localBlob) return null
    localStorage.setItem(READER_BACKGROUND_LEGACY_CLAIMED_KEY, namespace)
    await saveReaderBackground(localBlob, readerBackgroundAssetKey(namespace)).catch(() => undefined)
    await deleteReaderBackground(READER_BACKGROUND_LEGACY_ASSET_KEY).catch(() => undefined)
    return localBlob
  }

  async function performPendingReaderBackgroundSync(
    namespace: string,
    generation: number,
    pending: PendingReaderBackgroundSync,
  ) {
    if (pending.operation === 'delete') {
      await removeServerReaderBackground()
      await deleteReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => undefined)
      localStorage.removeItem(readerBackgroundStorageKey(READER_BACKGROUND_ETAG_KEY, namespace))
      localStorage.setItem(readerBackgroundStorageKey(READER_BACKGROUND_SERVER_STATE_KEY, namespace), 'absent')
    } else if (pending.operation === 'upload') {
      const pendingBlob = pendingReaderBackgroundBlobs.get(namespace)
      const image = pendingBlob?.nonce === pending.nonce
        ? pendingBlob.blob
        : await getReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => null)
      if (!image) throw new Error('等待同步的背景图片已不存在')
      const metadata = await uploadReaderBackground(image, readerBackgroundSettings())
      applyServerReaderBackgroundMetadata(
        metadata,
        namespace,
        generation,
        readPendingReaderBackgroundSync(namespace)?.nonce === pending.nonce,
      )
    } else {
      try {
        const metadata = await updateReaderBackgroundSettings(readerBackgroundSettings())
        applyServerReaderBackgroundMetadata(
          metadata,
          namespace,
          generation,
          readPendingReaderBackgroundSync(namespace)?.nonce === pending.nonce,
        )
      } catch (error) {
        const image = await getReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => null)
        if (!image) throw error
        const metadata = await uploadReaderBackground(image, readerBackgroundSettings())
        applyServerReaderBackgroundMetadata(
          metadata,
          namespace,
          generation,
          readPendingReaderBackgroundSync(namespace)?.nonce === pending.nonce,
        )
      }
    }
    clearReaderBackgroundPending(namespace, pending.nonce)
  }

  async function synchronizeReaderBackground(namespace: string, generation: number) {
    let localBlob = await getReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => null)
    const pending = readPendingReaderBackgroundSync(namespace)
    if (pending) {
      await performPendingReaderBackgroundSync(namespace, generation, pending)
      localBlob = await getReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => localBlob)
      if (readPendingReaderBackgroundSync(namespace)) {
        if (isActiveReaderBackgroundSync(namespace, generation)) readerBackgroundSyncState.value = 'pending'
        return
      }
    }

    let metadata = await fetchReaderBackgroundMetadata()
    if (!isActiveReaderBackgroundSync(namespace, generation)) return
    if (readPendingReaderBackgroundSync(namespace)) {
      readerBackgroundSyncState.value = 'pending'
      return
    }
    if (!metadata) {
      const etagKey = readerBackgroundStorageKey(READER_BACKGROUND_ETAG_KEY, namespace)
      const stateKey = readerBackgroundStorageKey(READER_BACKGROUND_SERVER_STATE_KEY, namespace)
      const wasPreviouslySynchronized = localStorage.getItem(stateKey) === 'present'
        || Boolean(localStorage.getItem(etagKey))
      if (localBlob && !wasPreviouslySynchronized) {
        const migration = markReaderBackgroundPending(namespace, 'upload')
        pendingReaderBackgroundBlobs.set(namespace, { nonce: migration.nonce, blob: localBlob })
        await performPendingReaderBackgroundSync(namespace, generation, migration)
      } else {
        await deleteReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => undefined)
        localStorage.removeItem(etagKey)
        localStorage.setItem(stateKey, 'absent')
        if (isActiveReaderBackgroundSync(namespace, generation)) {
          replaceReaderBackgroundUrl(null)
          readerBackgroundConfig.enabled = false
          persistReaderBackgroundConfig()
        }
      }
      readerBackgroundSyncState.value = readPendingReaderBackgroundSync(namespace) ? 'pending' : 'synced'
      return
    }

    const etagKey = readerBackgroundStorageKey(READER_BACKGROUND_ETAG_KEY, namespace)
    const cachedEtag = localStorage.getItem(etagKey)
    applyServerReaderBackgroundMetadata(metadata, namespace, generation)
    if (!localBlob || cachedEtag !== metadata.etag) {
      let downloaded: Blob | null = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const image = await fetchReaderBackgroundImage()
        if (!image.etag || image.etag === metadata.etag) {
          downloaded = image.blob
          break
        }
        const latestMetadata = await fetchReaderBackgroundMetadata()
        if (!latestMetadata) break
        metadata = latestMetadata
        applyServerReaderBackgroundMetadata(metadata, namespace, generation)
      }
      if (!downloaded) throw new Error('背景图片同步期间发生变化，请稍后重试')
      if (!isActiveReaderBackgroundSync(namespace, generation)) return
      if (readPendingReaderBackgroundSync(namespace)) {
        readerBackgroundSyncState.value = 'pending'
        return
      }
      localBlob = downloaded
      await saveReaderBackground(localBlob, readerBackgroundAssetKey(namespace)).catch(() => undefined)
      replaceReaderBackgroundUrl(localBlob)
    } else if (!readerBackgroundUrl.value) {
      replaceReaderBackgroundUrl(localBlob)
    }
    readerBackgroundSyncState.value = readPendingReaderBackgroundSync(namespace) ? 'pending' : 'synced'
  }

  function queueReaderBackgroundSync() {
    const run = async () => {
      const namespace = readerBackgroundNamespace.value
      const generation = readerBackgroundSyncGeneration
      try {
        await synchronizeReaderBackground(namespace, generation)
      } catch {
        if (isActiveReaderBackgroundSync(namespace, generation)) {
          readerBackgroundSyncState.value = readPendingReaderBackgroundSync(namespace) ? 'pending' : 'local'
        }
      }
    }
    const pending = readerBackgroundSyncQueue.then(run, run)
    readerBackgroundSyncQueue = pending.catch(() => undefined)
    return pending
  }

  async function loadReaderBackground(namespace: string, generation: number) {
    const localBlob = await claimLegacyReaderBackground(namespace)
    if (!isActiveReaderBackgroundSync(namespace, generation)) return
    replaceReaderBackgroundUrl(localBlob)
    if (localBlob) readerBackgroundSyncState.value = 'local'
    await queueReaderBackgroundSync()
    if (isActiveReaderBackgroundSync(namespace, generation)) readerBackgroundLoaded.value = true
  }

  async function setReaderBackgroundImage(blob: Blob) {
    if (!(blob instanceof Blob) || !blob.size) {
      throw new Error('背景图片数据无效')
    }
    const namespace = readerBackgroundNamespace.value
    const pending = markReaderBackgroundPending(namespace, 'upload')
    pendingReaderBackgroundBlobs.set(namespace, { nonce: pending.nonce, blob })
    await saveReaderBackground(blob, readerBackgroundAssetKey(namespace)).catch(() => undefined)
    replaceReaderBackgroundUrl(blob)
    readerBackgroundConfig.enabled = true
    persistReaderBackgroundConfig()
    await queueReaderBackgroundSync()
    return readerBackgroundSyncState.value
  }

  async function clearReaderBackgroundImage() {
    const namespace = readerBackgroundNamespace.value
    markReaderBackgroundPending(namespace, 'delete')
    pendingReaderBackgroundBlobs.delete(namespace)
    await deleteReaderBackground(readerBackgroundAssetKey(namespace)).catch(() => undefined)
    replaceReaderBackgroundUrl(null)
    readerBackgroundConfig.enabled = false
    persistReaderBackgroundConfig()
    await queueReaderBackgroundSync()
    return readerBackgroundSyncState.value
  }

  function updateReaderBackgroundConfig<K extends keyof ReaderBackgroundConfig>(
    key: K,
    value: ReaderBackgroundConfig[K],
  ) {
    if (key === 'overlay') {
      readerBackgroundConfig.overlay = normalizeNumber(value, readerBackgroundConfig.overlay, 0, 0.9)
    } else if (key === 'fit' && (value === 'cover' || value === 'contain')) {
      readerBackgroundConfig.fit = value
    } else if (key === 'position' && (value === 'top' || value === 'center' || value === 'bottom')) {
      readerBackgroundConfig.position = value
    } else if (key === 'enabled' && typeof value === 'boolean') {
      readerBackgroundConfig.enabled = value
    } else if (key === 'readerEnabled' && typeof value === 'boolean') {
      readerBackgroundConfig.readerEnabled = value
    }
    persistReaderBackgroundConfig()
    if (readerBackgroundUrl.value) {
      markReaderBackgroundPending(readerBackgroundNamespace.value, 'settings')
      if (readerBackgroundSettingsTimer) clearTimeout(readerBackgroundSettingsTimer)
      readerBackgroundSettingsTimer = setTimeout(() => {
        readerBackgroundSettingsTimer = null
        void queueReaderBackgroundSync()
      }, READER_BACKGROUND_SETTINGS_SYNC_DELAY_MS)
    }
  }

  void loadReaderBackground(readerBackgroundNamespace.value, readerBackgroundSyncGeneration)
  watch(() => appStore.isOnline, (online) => {
    if (online) void queueReaderBackgroundSync()
  })
  watch(() => [appStore.userInfo?.username || '', appStore.isLoggedIn] as const, () => {
    const nextNamespace = resolveReaderBackgroundNamespace()
    if (nextNamespace === readerBackgroundNamespace.value) {
      void queueReaderBackgroundSync()
      return
    }
    readerBackgroundNamespace.value = nextNamespace
    readerBackgroundSyncGeneration += 1
    readerBackgroundLoaded.value = false
    readerBackgroundSyncState.value = 'loading'
    replaceReaderBackgroundUrl(null)
    if (readerBackgroundSettingsTimer) {
      clearTimeout(readerBackgroundSettingsTimer)
      readerBackgroundSettingsTimer = null
    }
    void loadReaderBackground(nextNamespace, readerBackgroundSyncGeneration)
  })


  return {
    readerBackgroundConfig,
    readerBackgroundUrl,
    readerBackgroundLoaded,
    readerBackgroundSyncState,
    setReaderBackgroundImage,
    clearReaderBackgroundImage,
    updateReaderBackgroundConfig,
  }
}
