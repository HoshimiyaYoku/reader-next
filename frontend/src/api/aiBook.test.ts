import { beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()

vi.mock('./http', () => ({
  default: {
    post: postMock,
  },
}))

const api = await import('./aiBook')

describe('aiBook catchup api', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('starts catchup with target chapter index', async () => {
    postMock.mockResolvedValueOnce({ data: { status: 'running', bookUrl: 'book', totalChapters: 2, completedChapters: 0, updatedAt: 1 } })

    await api.startAiBookCatchup({ bookUrl: 'book', targetChapterIndex: 199 })

    expect(postMock).toHaveBeenCalledWith('/aiBookCatchup/start', {
      bookUrl: 'book',
      targetChapterIndex: 199,
    })
  })

  it('reads, pauses and cancels catchup status by book url', async () => {
    postMock
      .mockResolvedValueOnce({ data: { status: 'running', bookUrl: 'book', totalChapters: 2, completedChapters: 1, updatedAt: 1 } })
      .mockResolvedValueOnce({ data: { status: 'pausing', bookUrl: 'book', totalChapters: 2, completedChapters: 1, updatedAt: 2 } })
      .mockResolvedValueOnce({ data: { status: 'idle', bookUrl: 'book', totalChapters: 0, completedChapters: 0, updatedAt: 3 } })

    await api.getAiBookCatchupStatus('book')
    await api.pauseAiBookCatchup('book')
    await api.cancelAiBookCatchup('book')

    expect(postMock).toHaveBeenNthCalledWith(1, '/aiBookCatchup/status', { bookUrl: 'book' })
    expect(postMock).toHaveBeenNthCalledWith(2, '/aiBookCatchup/pause', { bookUrl: 'book' })
    expect(postMock).toHaveBeenNthCalledWith(3, '/aiBookCatchup/cancel', { bookUrl: 'book' })
  })
})
