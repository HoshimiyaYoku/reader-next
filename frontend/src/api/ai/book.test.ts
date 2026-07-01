import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('../http', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}))

const api = await import('./book')

describe('ai book api', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('aiBook_api_has_no_save_raw_memory', () => {
    expect('saveAiBookMemory' in api).toBe(false)
    expect('deleteAiBookMemory' in api).toBe(false)
  })

  it('uses ai book memory and chapter endpoints', async () => {
    getMock
      .mockResolvedValueOnce({ data: { memory: { bookUrl: 'book' } } })
      .mockResolvedValueOnce({ data: { chapter: { chapterIndex: 3 }, memory: { bookUrl: 'book' } } })
    postMock
      .mockResolvedValueOnce({ data: { memory: { bookUrl: 'book', enabled: false } } })
      .mockResolvedValueOnce({ data: { memory: { bookUrl: 'book', enabled: true } } })
      .mockResolvedValueOnce({ data: { chapter: { chapterIndex: 3 }, memory: { bookUrl: 'book' } } })
      .mockResolvedValueOnce({ data: { memory: { bookUrl: 'book', map: {} } } })

    await api.getAiBookMemory('book')
    await api.getAiBookChapterMemory({ bookUrl: 'book', chapterIndex: 3 })
    await api.resetAiBookMemory('book')
    await api.setAiBookEnabled({ bookUrl: 'book', enabled: true })
    await api.generateAiBookChapterMemory({ bookUrl: 'book', chapterIndex: 3, mode: 'auto' })
    await api.generateAiBookMap({ bookUrl: 'book', sourceChapterIndex: 3, prompt: '地图' })

    expect(getMock).toHaveBeenNthCalledWith(1, '/ai/book/memory', { params: { bookUrl: 'book' } })
    expect(getMock).toHaveBeenNthCalledWith(2, '/ai/book/chapter-memory', {
      params: { bookUrl: 'book', chapterIndex: 3 },
    })
    expect(postMock).toHaveBeenNthCalledWith(1, '/ai/book/memory/reset', { bookUrl: 'book' })
    expect(postMock).toHaveBeenNthCalledWith(2, '/ai/book/enabled', { bookUrl: 'book', enabled: true })
    expect(postMock).toHaveBeenNthCalledWith(3, '/ai/book/chapter-memory/generate', {
      bookUrl: 'book',
      chapterIndex: 3,
      mode: 'auto',
    })
    expect(postMock).toHaveBeenNthCalledWith(4, '/ai/book/map/generate', {
      bookUrl: 'book',
      sourceChapterIndex: 3,
      prompt: '地图',
    })
  })

  it('uses ai book catchup endpoints', async () => {
    postMock
      .mockResolvedValueOnce({ data: { status: 'running', bookUrl: 'book' } })
      .mockResolvedValueOnce({ data: { status: 'canceled', bookUrl: 'book' } })
    getMock.mockResolvedValueOnce({ data: { status: 'running', bookUrl: 'book' } })

    await api.startAiBookCatchup({ bookUrl: 'book', targetChapterIndex: 9 })
    await api.getAiBookCatchupStatus('book')
    await api.cancelAiBookCatchup('book')

    expect(postMock).toHaveBeenNthCalledWith(1, '/ai/book/catchup/start', {
      bookUrl: 'book',
      targetChapterIndex: 9,
    })
    expect(getMock).toHaveBeenNthCalledWith(1, '/ai/book/catchup/status', {
      params: { bookUrl: 'book' },
    })
    expect(postMock).toHaveBeenNthCalledWith(2, '/ai/book/catchup/cancel', { bookUrl: 'book' })
  })
})
