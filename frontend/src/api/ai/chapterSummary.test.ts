import { describe, expect, it, vi, beforeEach } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('../http', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}))

const api = await import('./chapterSummary')

describe('ai chapterSummary api', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('reads cached summary with book and chapter urls from ai route', async () => {
    getMock.mockResolvedValueOnce({ data: { summary: null } })

    await expect(api.getChapterSummary('book a', 'chapter 1')).resolves.toEqual({ summary: null })

    expect(getMock).toHaveBeenCalledWith('/ai/chapter-summary', {
      params: { bookUrl: 'book a', chapterUrl: 'chapter 1' },
    })
  })

  it('generates summary through ai backend route', async () => {
    postMock.mockResolvedValueOnce({ data: { summary: { summary: 'ok' } } })

    await api.generateChapterSummary({
      bookUrl: 'book',
      chapterUrl: 'chapter',
      chapterIndex: 1,
      chapterTitle: '第一章',
      content: '正文内容',
      force: true,
      previousChapters: [
        { chapterUrl: 'chapter-0', chapterIndex: 0, chapterTitle: '序章' },
      ],
    })

    expect(postMock).toHaveBeenCalledWith('/ai/chapter-summary/generate', {
      bookUrl: 'book',
      chapterUrl: 'chapter',
      chapterIndex: 1,
      chapterTitle: '第一章',
      content: '正文内容',
      force: true,
      previousChapters: [
        { chapterUrl: 'chapter-0', chapterIndex: 0, chapterTitle: '序章' },
      ],
    })
  })

  it('loads and saves summary config through ai backend route', async () => {
    getMock.mockResolvedValueOnce({ data: { config: { enabled: true } } })
    postMock.mockResolvedValueOnce({ data: { config: { enabled: false } } })

    await expect(api.getChapterSummaryConfig()).resolves.toEqual({ config: { enabled: true } })
    await expect(api.saveChapterSummaryConfig({
      enabled: false,
      autoEnabledDefault: true,
      prompt: 'p',
      detailLevel: 'normal',
      maxWords: 200,
      temperature: 0.3,
      minContentChars: 300,
    })).resolves.toEqual({ config: { enabled: false } })

    expect(getMock).toHaveBeenCalledWith('/ai/chapter-summary/config')
    expect(postMock).toHaveBeenCalledWith('/ai/chapter-summary/config', {
      config: {
        enabled: false,
        autoEnabledDefault: true,
        prompt: 'p',
        detailLevel: 'normal',
        maxWords: 200,
        temperature: 0.3,
        minContentChars: 300,
      },
    })
  })
})
