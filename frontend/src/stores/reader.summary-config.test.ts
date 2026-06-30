import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReaderStore } from './reader'

describe('reader summary display config', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults key points to card style', () => {
    const store = useReaderStore()
    expect(store.config.chapterSummaryKeyPointStyle).toBe('card')
  })

  it('migrates legacy ai panel keys from readConfig', () => {
    localStorage.setItem('readConfig', JSON.stringify({
      showChapterSummary: false,
      chapterSummaryLayout: 'side',
      chapterSummarySiderWidth: 420,
      chapterSummaryFontSize: 18,
      chapterSummaryActiveTab: 'content',
    }))

    const store = useReaderStore()

    expect(store.config.showAiPanel).toBe(false)
    expect(store.config.aiPanelLayout).toBe('side')
    expect(store.config.aiPanelSiderWidth).toBe(420)
    expect(store.config.aiPanelFontSize).toBe(18)
    expect(store.config.aiPanelActiveTab).toBe('summary')
  })

  it('normalizes invalid numeric read config values', () => {
    localStorage.setItem('readConfig', JSON.stringify({
      lineHeight: null,
      paragraphSpacing: 'bad',
      fontSize: 0,
    }))

    const store = useReaderStore()

    expect(store.config.lineHeight).toBe(1.8)
    expect(store.config.paragraphSpacing).toBe(0.2)
    expect(store.config.fontSize).toBe(18)
  })

  it('normalizes invalid numeric speech config values', () => {
    localStorage.setItem('reader-speechConfig', JSON.stringify({
      speechRate: null,
      speechPitch: 'bad',
      stopAfterMinutes: -1,
    }))

    const store = useReaderStore()

    expect(store.speechConfig.speechRate).toBe(1)
    expect(store.speechConfig.speechPitch).toBe(1)
    expect(store.speechConfig.stopAfterMinutes).toBe(0)
  })
})
