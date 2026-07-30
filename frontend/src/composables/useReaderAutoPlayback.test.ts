import { computed, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReaderAutoPlayback } from './useReaderAutoPlayback'

function createStore() {
  const spoken: Array<{
    text: string
    options: { onEnd: () => void; onError: () => void }
  }> = []
  const store = {
    isSpeaking: false,
    isPaused: false,
    isAutoScrolling: false,
    hasNext: false,
    hasPrev: false,
    currentIndex: 0,
    systemTtsNativeEventsReliable: true,
    speechConfig: {
      provider: 'system',
      openaiRequestMode: 'chunked',
    },
    startTTS: vi.fn((text, options) => {
      store.isSpeaking = true
      spoken.push({ text, options })
    }),
    stopTTS: vi.fn(() => {
      store.isSpeaking = false
    }),
    preloadOpenAITTS: vi.fn(),
  }
  return { store, spoken }
}

function createPlayback(
  store: ReturnType<typeof createStore>['store'],
  container: HTMLElement,
  chapterText: HTMLElement,
  horizontal?: {
    pageIndex: { value: number }
    showPage: (pageIndex: number) => void
  },
) {
  return useReaderAutoPlayback(
    store as never,
    computed(() => ({
      autoPageMode: 'paragraph',
      clickAction: 'auto',
      scrollPixel: 1,
      pageSpeed: 1000,
      fontSize: 18,
      lineHeight: 1.8,
    })),
    computed(() => false),
    ref(container),
    ref(chapterText),
    vi.fn(),
    vi.fn(),
    horizontal
      ? {
          isEnabled: computed(() => true),
          getPageIndex: () => horizontal.pageIndex.value,
          showPage: horizontal.showPage,
        }
      : undefined,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useReaderAutoPlayback reading position', () => {
  it('starts at the first paragraph on the current horizontal page', () => {
    const container = document.createElement('div')
    const chapterText = document.createElement('div')
    chapterText.innerHTML = `
      <section class="horizontal-page"><p>第一页</p></section>
      <section class="horizontal-page"><p>当前页顶部</p><p>当前页下一段</p></section>
    `
    container.appendChild(chapterText)
    const { store, spoken } = createStore()
    const pageIndex = ref(1)
    const playback = createPlayback(store, container, chapterText, {
      pageIndex,
      showPage: (next) => {
        pageIndex.value = next
      },
    })

    playback.startSpeech()

    expect(spoken[0]?.text).toBe('当前页顶部')
  })

  it('turns the horizontal page as speech advances', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const chapterText = document.createElement('div')
    chapterText.innerHTML = `
      <section class="horizontal-page"><p>当前页</p></section>
      <section class="horizontal-page"><p>下一页</p></section>
    `
    container.appendChild(chapterText)
    const { store, spoken } = createStore()
    const pageIndex = ref(0)
    const showPage = vi.fn((next: number) => {
      pageIndex.value = next
    })
    const playback = createPlayback(store, container, chapterText, { pageIndex, showPage })

    playback.startSpeech()
    spoken[0]?.options.onEnd()
    vi.runAllTimers()

    expect(showPage).toHaveBeenCalledWith(1)
    expect(spoken[1]?.text).toBe('下一页')
  })

  it('keeps merged speech within one horizontal page before turning', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const chapterText = document.createElement('div')
    chapterText.innerHTML = `
      <section class="horizontal-page"><p>当前页第一段</p><p>当前页第二段</p></section>
      <section class="horizontal-page"><p>下一页第一段</p></section>
    `
    container.appendChild(chapterText)
    const { store, spoken } = createStore()
    store.speechConfig.provider = 'openai'
    store.speechConfig.openaiRequestMode = 'merged'
    const pageIndex = ref(0)
    const showPage = vi.fn((next: number) => {
      pageIndex.value = next
    })
    const playback = createPlayback(store, container, chapterText, { pageIndex, showPage })

    playback.startSpeech()

    expect(spoken[0]?.text).toBe('当前页第一段\n当前页第二段')
    spoken[0]?.options.onEnd()
    vi.runAllTimers()
    expect(showPage).toHaveBeenCalledWith(1)
    expect(spoken[1]?.text).toBe('下一页第一段')
  })

  it('continues from an explicitly started paragraph instead of the old viewport paragraph', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const chapterText = document.createElement('div')
    chapterText.innerHTML = '<p>屏幕旧段</p><p>指定起点</p><p>正确下一段</p>'
    container.appendChild(chapterText)
    const paragraphs = chapterText.querySelectorAll('p')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
    vi.spyOn(paragraphs[0]!, 'getBoundingClientRect').mockReturnValue({ bottom: 80 } as DOMRect)
    const { store, spoken } = createStore()
    store.speechConfig.provider = 'openai'
    const playback = createPlayback(store, container, chapterText)

    playback.startSpeech(paragraphs[1] as HTMLElement)
    expect(spoken[0]?.text).toBe('指定起点')
    spoken[0]?.options.onEnd()
    vi.runAllTimers()

    expect(spoken[1]?.text).toBe('正确下一段')
  })

  it('lets manual next override a pending automatic transition', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const chapterText = document.createElement('div')
    chapterText.innerHTML = '<p>第一段</p><p>第二段</p><p>第三段</p>'
    container.appendChild(chapterText)
    const paragraphs = chapterText.querySelectorAll('p')
    const { store, spoken } = createStore()
    store.speechConfig.provider = 'openai'
    const playback = createPlayback(store, container, chapterText)

    playback.startSpeech(paragraphs[0] as HTMLElement)
    spoken[0]?.options.onEnd()
    playback.speechNext()
    vi.runAllTimers()

    expect(spoken.map((item) => item.text)).toEqual(['第一段', '第二段'])
  })

  it('ignores an old reading marker when starting from a new vertical position', () => {
    const container = document.createElement('div')
    const chapterText = document.createElement('div')
    chapterText.innerHTML = '<p class="reading">旧位置</p><p>当前页面顶部</p>'
    container.appendChild(chapterText)
    const paragraphs = chapterText.querySelectorAll('p')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
    vi.spyOn(paragraphs[0]!, 'getBoundingClientRect').mockReturnValue({ bottom: 20 } as DOMRect)
    vi.spyOn(paragraphs[1]!, 'getBoundingClientRect').mockReturnValue({ bottom: 80 } as DOMRect)
    const { store, spoken } = createStore()
    const playback = createPlayback(store, container, chapterText)

    playback.startSpeech()

    expect(spoken[0]?.text).toBe('当前页面顶部')
  })
})
