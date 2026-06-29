import { describe, expect, it } from 'vitest'
import { describeCatchupProgress, describeCatchupDetail } from './aiBookCatchupStatus'
import type { AiBookCatchupStatus } from '../types'

describe('aiBookCatchupStatus', () => {
  it('shows relative task progress with cumulative processed chapter', () => {
    const status: AiBookCatchupStatus = {
      status: 'failed',
      bookUrl: 'book-1',
      startChapterIndex: 37,
      targetChapterIndex: 1031,
      totalChapters: 1032,
      completedChapters: 6,
      processedChapterIndex: 42,
      processedChapterTitle: '第43章 联盟和法赛第一关',
      currentChapterIndex: 43,
      currentChapterTitle: '第44章 飞剑',
      updatedAt: 10,
      error: 'bad request',
    }

    expect(describeCatchupProgress(status)).toBe(
      '本次 6/1032 · 累计到 第 43 章 · 目标 第 1032 章',
    )
    expect(describeCatchupDetail(status)).toBe('失败在 第 44 章 · 第44章 飞剑：bad request')
  })
})
