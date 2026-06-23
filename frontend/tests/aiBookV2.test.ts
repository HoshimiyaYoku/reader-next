import { describe, expect, it } from 'vitest'
import { toAiBookDisplayMemory } from '../src/utils/aiBookV2'

describe('aiBookV2 display conversion', () => {
  it('tolerates old partial V2 memories', () => {
    const display = toAiBookDisplayMemory({
      schemaVersion: 2,
      bookUrl: 'book-url',
      bookName: 'book',
      enabled: true,
      updatedAt: 1,
      summary: { current: 'known', recentChanges: [], openQuestions: [] },
    } as any)

    expect(display.summary).toBe('known')
    expect(display.worldview).toEqual([])
    expect(display.characters).toEqual([])
    expect(display.relationships).toEqual([])
    expect(display.locations).toEqual([])
    expect(display.map).toBeNull()
    expect(display.mapDirty).toBe(false)
  })
})
