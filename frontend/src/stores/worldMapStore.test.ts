import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorldMapStore } from './worldMapStore'
import { getWorldMapSpec } from '../api/worldMap'
import type { WorldMapSpec } from '../types/worldMap'

vi.mock('../api/worldMap', () => ({
  getWorldMapSpec: vi.fn(),
  buildWorldMap: vi.fn(),
  generateCoordinates: vi.fn(),
  getReviewItems: vi.fn(),
  resolveReviewItem: vi.fn(),
  updateWorldMap: vi.fn(),
}))

describe('worldMapStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getWorldMapSpec).mockReset()
  })

  it('clears stale spec when the current book has no world map', async () => {
    const store = useWorldMapStore()
    vi.mocked(getWorldMapSpec).mockResolvedValueOnce(createSpec('旧书'))
    await store.loadSpec('old-book')
    expect(store.spec?.metadata.novel_title).toBe('旧书')

    vi.mocked(getWorldMapSpec).mockRejectedValueOnce(new Error('not found'))
    await expect(store.loadSpec('new-book')).rejects.toThrow('not found')

    expect(store.spec).toBeNull()
  })
})

function createSpec(title: string): WorldMapSpec {
  return {
    metadata: {
      novel_title: title,
      source_type: 'ai_memory',
      start_chapter: 0,
      end_chapter: 0,
      allow_later_chapter_info: false,
      spec_version: '2.0',
      analysis_date: '2026-06-16',
    },
    entities: [],
    relations: [],
    routes: [],
    factions: [],
    constraints: {
      hard: [],
      soft: [],
    },
    conflicts: [],
    review_items: [],
    statistics: {
      total_entities: 0,
      total_relations: 0,
      total_routes: 0,
      total_factions: 0,
      total_hard_constraints: 0,
      total_soft_constraints: 0,
      total_conflicts: 0,
      total_review_items: 0,
      automation_rate: 0,
      coordinate_coverage_rate: 0,
    },
  }
}
