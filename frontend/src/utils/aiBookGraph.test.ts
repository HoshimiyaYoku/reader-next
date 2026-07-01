import { describe, expect, it } from 'vitest'
import type { AiBookMemoryViewModel } from '../types'
import { buildAiBookRelationshipGraph, layoutAiBookRelationshipGraph } from './aiBookGraph'

describe('aiBookGraph', () => {
  it('builds stable nodes and links from V3 characters, relationships, and locations', () => {
    const memory = createMemory({
      characters: [
        createCharacter('char-lin', '林舟', '受伤'),
        createCharacter('char-shen', '沈月', '失踪'),
      ],
      relationships: [
        createRelationship('rel-1', 'char-lin', 'char-shen', '盟友'),
      ],
      locations: [
        createLocation('loc-north', '北境', '寒冷边地'),
      ],
    })

    const graph = buildAiBookRelationshipGraph(memory)

    expect(graph.nodes.map((node) => node.id)).toEqual(['char-lin', 'char-shen', 'loc-north'])
    expect(graph.links).toEqual([
      { source: 'char-lin', target: 'char-shen', label: '盟友' },
    ])
  })

  it('lays out V3 locations and characters in readable columns with selected-node focus', () => {
    const memory = createMemory({
      characters: [
        createCharacter('char-lin', '林舟', '受伤'),
        createCharacter('char-shen', '沈月', '失踪'),
        createCharacter('char-han', '韩青', '旁观'),
      ],
      relationships: [
        createRelationship('rel-1', 'char-lin', 'char-shen', '盟友'),
      ],
      locations: [
        createLocation('loc-north', '北境', '寒冷边地'),
        createLocation('loc-capital', '帝都', '权力中心'),
      ],
    })

    const graph = buildAiBookRelationshipGraph(memory)
    const layout = layoutAiBookRelationshipGraph(graph, 'char-lin')
    const north = layout.nodes.find((node) => node.id === 'loc-north')!
    const lin = layout.nodes.find((node) => node.id === 'char-lin')!
    const han = layout.nodes.find((node) => node.id === 'char-han')!
    const allyLink = layout.links.find((link) => link.source === 'char-lin' && link.target === 'char-shen')!

    expect(north.lane).toBe('left')
    expect(lin.lane).toBe('right')
    expect(north.x).toBeLessThan(lin.x)
    expect(lin.dimmed).toBe(false)
    expect(north.dimmed).toBe(true)
    expect(han.dimmed).toBe(true)
    expect(allyLink.highlighted).toBe(true)
    expect(allyLink.showLabel).toBe(true)
  })

  it('expands the canvas for dense V3 relationship graphs to avoid node overlap', () => {
    const memory = createMemory({
      characters: Array.from({ length: 14 }, (_, index) => (
        createCharacter(`char-${index + 1}`, `角色${index + 1}`, '活跃')
      )),
      relationships: [],
      locations: [
        createLocation('loc-center', '中心城', '主舞台'),
      ],
    })

    const layout = layoutAiBookRelationshipGraph(buildAiBookRelationshipGraph(memory), 'char-1')
    const characterNodes = layout.nodes
      .filter((node) => node.kind === 'character')
      .sort((a, b) => a.y - b.y)

    expect(layout.height).toBeGreaterThan(520)
    for (let index = 1; index < characterNodes.length; index += 1) {
      const previous = characterNodes[index - 1]!
      const current = characterNodes[index]!
      expect(current.y - previous.y).toBeGreaterThanOrEqual(46)
    }
  })
})

function createMemory(overrides: Partial<Pick<AiBookMemoryViewModel, 'characters' | 'relationships' | 'locations'>> = {}): AiBookMemoryViewModel {
  return {
    bookUrl: 'book-1',
    enabled: true,
    updatedAt: 0,
    summary: {
      current: '',
      recentChanges: [],
      openQuestions: [],
    },
    characters: overrides.characters || [],
    relationships: overrides.relationships || [],
    knowledgeFacts: [],
    locations: overrides.locations || [],
    map: null,
    cleanup: {
      droppedFactsCount: 0,
      droppedByReason: {},
      oldSchemaBackedUp: false,
    },
  }
}
function createCharacter(id: string, name: string, description: string) {
  return {
    id,
    name,
    aliases: [],
    importance: 'moderate',
    description,
    evidence: [],
  }
}

function createRelationship(id: string, sourceCharacterId: string, targetCharacterId: string, label: string) {
  return {
    id,
    sourceCharacterId,
    targetCharacterId,
    group: 'companion' as const,
    label,
    polarity: 'positive' as const,
    strength: 'moderate' as const,
    status: 'active' as const,
    direction: 'undirected',
    summary: label,
    currentDynamics: [],
    evidence: [],
    history: [],
  }
}

function createLocation(id: string, name: string, description: string) {
  return {
    id,
    name,
    aliases: [],
    kind: '地点',
    scale: 'unknown',
    description,
    importance: 'moderate',
    evidence: [],
  }
}
