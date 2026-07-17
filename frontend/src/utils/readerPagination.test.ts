import { describe, expect, it } from 'vitest'
import {
  clampPageIndex,
  chooseSavedChapterProgress,
  getPageIndexFromProgress,
  getPageProgress,
  normalizePageCount,
} from './readerPagination'

describe('reader horizontal pagination helpers', () => {
  it('normalizes the page count and clamps page indices', () => {
    expect(normalizePageCount(0)).toBe(1)
    expect(clampPageIndex(-2, 8)).toBe(0)
    expect(clampPageIndex(12, 8)).toBe(7)
  })

  it('converts page indices to chapter progress', () => {
    expect(getPageProgress(0, 5)).toBe(0)
    expect(getPageProgress(2, 5)).toBe(0.5)
    expect(getPageProgress(4, 5)).toBe(1)
    expect(getPageProgress(0, 1)).toBe(1)
  })

  it('restores a page index from saved chapter progress', () => {
    expect(getPageIndexFromProgress(0, 5)).toBe(0)
    expect(getPageIndexFromProgress(0.5, 5)).toBe(2)
    expect(getPageIndexFromProgress(1, 5)).toBe(4)
  })

  it('prefers the chapter-specific position over a newer zero server position', () => {
    const chapterSaved = { chapterIndex: 3, progress: 0.75, updatedAt: 100 }
    const serverSaved = { chapterIndex: 3, progress: 0, updatedAt: 200 }

    expect(chooseSavedChapterProgress(3, chapterSaved, null, serverSaved)).toEqual({
      position: chapterSaved,
      source: 'chapter',
    })
  })

  it('uses the newer server position when only a legacy record exists', () => {
    const legacySaved = { chapterIndex: 3, progress: 0.25, updatedAt: 100 }
    const serverSaved = { chapterIndex: 3, progress: 0.5, updatedAt: 200 }

    expect(chooseSavedChapterProgress(3, null, legacySaved, serverSaved)).toEqual({
      position: serverSaved,
      source: 'server',
    })
  })
})
