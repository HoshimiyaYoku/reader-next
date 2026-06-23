import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/AiBookView.vue', import.meta.url), 'utf8')

describe('AiBookView v3 cutover', () => {
  it('aiBook_view_renders_relationships_from_view_model', () => {
    expect(source).toContain('chapterMemory.value?.digest?.characterRelations')
    expect(source).not.toContain('toAiBookDisplayMemory')
    expect(source).not.toContain('isAiBookMemoryV2')
  })

  it('aiBook_view_renders_character_state_from_view_model', () => {
    expect(source).toContain('chapterMemory.value?.digest?.characterStates')
    expect(source).toContain('memoryView.summary.current')
  })

  it('aiBook_view_calls_generate_action', () => {
    expect(source).toContain('aiStore.generateChapterMemory({')
    expect(source).toContain('aiStore.loadChapterMemory(')
    expect(source).not.toContain('updateToCurrentFallback')
    expect(source).not.toContain('getBookContent(')
  })

  it('aiBook_view_calls_map_generate_action', () => {
    expect(source).toContain('aiStore.generateMap({')
    expect(source).not.toContain('aiStore.redrawMap(')
  })
})
