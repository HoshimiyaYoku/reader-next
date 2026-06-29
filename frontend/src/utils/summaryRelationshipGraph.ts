import type {
  AiBookMemoryViewModel,
  AiBookRelationshipGroup,
  AiBookRelationStrength,
  AiBookRelationView,
} from '../types'

export interface SummaryRelationshipGraphNode {
  id: string
  name: string
  description: string
  isProtagonist: boolean
  x: number
  y: number
}

export interface SummaryRelationshipGraphLink {
  id: string
  sourceId: string
  targetId: string
  label: string
  summary: string
  group: AiBookRelationshipGroup
  strength: AiBookRelationStrength
  path: string
}

export interface SummaryRelationshipGraphGroupedRow {
  group: AiBookRelationshipGroup
  label: string
  rows: Array<{ id: string; name: string; label: string; summary: string; group: AiBookRelationshipGroup; strength: AiBookRelationStrength }>
}

export interface SummaryRelationshipGraphView {
  protagonist: SummaryRelationshipGraphNode | null
  nodes: SummaryRelationshipGraphNode[]
  links: SummaryRelationshipGraphLink[]
  rows: Array<{ id: string; name: string; label: string; summary: string; group: AiBookRelationshipGroup; strength: AiBookRelationStrength }>
  groupedRows: SummaryRelationshipGraphGroupedRow[]
  emptyReason: string
}

export function buildSummaryRelationshipGraph(input: {
  memory: AiBookMemoryViewModel | null
  currentChapterIndex: number
  limit?: number
  graphLimit?: number
}): SummaryRelationshipGraphView {
  const memory = input.memory
  if (!memory) {
    return empty('暂无人物关系资料，可先生成 AI资料。')
  }
  if (memory.relationships.length === 0 || memory.characters.length === 0) {
    return empty('人物关系不足，继续阅读后会补全。')
  }

  const characterById = new Map(memory.characters.map((item) => [item.id, item]))
  const protagonistId = findProtagonistId(memory, input.currentChapterIndex, characterById)
  if (!protagonistId) return empty('人物关系不足，继续阅读后会补全。')
  const protagonist = characterById.get(protagonistId)
  if (!protagonist) return empty('人物关系不足，继续阅读后会补全。')

  const grouped = new Map<string, AiBookRelationView[]>()
  for (const relation of memory.relationships) {
    const otherId = relation.sourceCharacterId === protagonistId
      ? relation.targetCharacterId
      : relation.targetCharacterId === protagonistId
        ? relation.sourceCharacterId
        : ''
    if (!otherId || otherId === protagonistId || !characterById.has(otherId)) continue
    grouped.set(otherId, [...(grouped.get(otherId) || []), relation])
  }

  const related = [...grouped.entries()]
    .map(([characterId, relations]) => ({ characterId, relations, score: relationshipScore(relations, input.currentChapterIndex) }))
    .sort((a, b) => b.score - a.score)

  const totalLimit = input.limit ?? 15
  const graphNodeLimit = input.graphLimit ?? 5
  const allRelated = related.slice(0, totalLimit)
  const graphRelated = allRelated.slice(0, graphNodeLimit)

  if (allRelated.length === 0) return empty('人物关系不足，继续阅读后会补全。')

  const protagonistRelations = memory.relationships.filter(
    (r) => r.sourceCharacterId === protagonistId || r.targetCharacterId === protagonistId,
  )
  const center: SummaryRelationshipGraphNode = {
    id: protagonist.id,
    name: pickDisplayName(protagonist.name, protagonist.aliases, protagonistRelations),
    description: protagonist.description || '主角',
    isProtagonist: true,
    x: 50,
    y: 50,
  }

  const outerNodes = graphRelated.map((item, index) => {
    const character = characterById.get(item.characterId)!
    const angle = -90 + (360 / graphRelated.length) * index
    const radius = 34
    const rad = angle * Math.PI / 180
    return {
      id: character.id,
      name: pickDisplayName(character.name, character.aliases, item.relations),
      description: character.description || '',
      isProtagonist: false,
      x: Math.round((50 + Math.cos(rad) * radius) * 10) / 10,
      y: Math.round((50 + Math.sin(rad) * radius) * 10) / 10,
    }
  })

  const nodeById = new Map([center, ...outerNodes].map((node) => [node.id, node]))
  const links = graphRelated.map((item) => {
    const node = nodeById.get(item.characterId)!
    const label = aggregateLabel(item.relations)
    const summary = aggregateSummary(item.relations)
    return {
      id: item.characterId,
      sourceId: protagonistId,
      targetId: item.characterId,
      label,
      summary,
      group: primaryGroup(item.relations),
      strength: strongest(item.relations.map((relation) => relation.strength)),
      path: `M 50 50 L ${node.x} ${node.y}`,
    }
  })

  const allCharacterById = new Map(allRelated.map((item) => {
    const character = characterById.get(item.characterId)!
    return [item.characterId, {
      name: pickDisplayName(character.name, character.aliases, item.relations),
    }]
  }))

  const rows = allRelated.map((item) => ({
    id: item.characterId,
    name: allCharacterById.get(item.characterId)?.name || item.characterId,
    label: aggregateLabel(item.relations),
    summary: aggregateSummary(item.relations),
    group: primaryGroup(item.relations),
    strength: strongest(item.relations.map((relation) => relation.strength)),
  }))

  return {
    protagonist: center,
    nodes: [center, ...outerNodes],
    links,
    rows,
    groupedRows: buildGroupedRows(rows),
    emptyReason: '',
  }
}

function empty(emptyReason: string): SummaryRelationshipGraphView {
  return { protagonist: null, nodes: [], links: [], rows: [], groupedRows: [], emptyReason }
}

function pickDisplayName(
  canonicalName: string,
  aliases: string[],
  relations: AiBookRelationView[],
): string {
  if (!aliases.length) return canonicalName
  const dynamicsText = relations
    .flatMap((r) => r.currentDynamics || [])
    .join(' ')
  if (!dynamicsText) return canonicalName
  if (!dynamicsText.includes(canonicalName)) {
    for (const alias of aliases) {
      if (alias && dynamicsText.includes(alias)) return alias
    }
  }
  return canonicalName
}

function findProtagonistId(
  memory: AiBookMemoryViewModel,
  currentChapterIndex: number,
  characterById: Map<string, AiBookMemoryViewModel['characters'][number]>,
) {
  const scores = new Map<string, number>()
  for (const character of memory.characters) {
    scores.set(character.id, (character.importance === 'high' ? 4 : 0) + recencyScore(character.lastSeenChapterIndex, currentChapterIndex))
  }
  for (const relation of memory.relationships) {
    if (relation.sourceCharacterId === relation.targetCharacterId) continue
    if (!characterById.has(relation.sourceCharacterId) || !characterById.has(relation.targetCharacterId)) continue
    scores.set(relation.sourceCharacterId, (scores.get(relation.sourceCharacterId) || 0) + 10)
    scores.set(relation.targetCharacterId, (scores.get(relation.targetCharacterId) || 0) + 10)
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

function relationshipScore(relations: AiBookRelationView[], currentChapterIndex: number) {
  return relations.reduce((score, relation) => score
    + strengthScore(relation.strength)
    + (relation.status === 'developing' ? 6 : 0)
    + recencyScore(relation.lastUpdatedChapterIndex, currentChapterIndex)
    + relation.currentDynamics.length
    + relation.history.length
    + relation.evidence.length, 0)
}

function recencyScore(index: number | null | undefined, currentChapterIndex: number) {
  if (index == null) return 0
  return Math.max(0, 8 - Math.abs(currentChapterIndex - index))
}

function strengthScore(strength: AiBookRelationStrength) {
  return { critical: 8, strong: 6, moderate: 4, weak: 2, unknown: 0 }[strength] || 0
}

function aggregateLabel(relations: AiBookRelationView[]) {
  return unique(relations.flatMap((relation) => [
    relation.label,
    relation.label ? '' : labelForGroup(relation.group),
  ])).slice(0, 3).join(' / ')
}

function aggregateSummary(relations: AiBookRelationView[]) {
  return relations.flatMap((relation) => [...relation.currentDynamics, relation.summary]).find(Boolean) || '关系仍在发展'
}

function primaryGroup(relations: AiBookRelationView[]): AiBookRelationshipGroup {
  return [...relations].sort((a, b) => groupScore(b.group) - groupScore(a.group))[0]?.group || 'unknown'
}

function strongest(strengths: AiBookRelationStrength[]) {
  return strengths.sort((a, b) => strengthScore(b) - strengthScore(a))[0] || 'unknown'
}

function labelForGroup(group: AiBookRelationshipGroup) {
  return {
    opposition: '对立 / 威胁',
    family: '家庭 / 照料',
    romance: '情感 / 爱恋',
    companion: '伙伴 / 友方',
    authority: '师长 / 权威',
    association: '关联 / 中立',
    unknown: '未明',
  }[group]
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

const GROUP_ORDER: AiBookRelationshipGroup[] = ['opposition', 'family', 'romance', 'companion', 'authority', 'association', 'unknown']

const GROUP_LABELS: Record<AiBookRelationshipGroup, string> = {
  opposition: '对立 / 威胁',
  family: '家庭 / 照料',
  romance: '情感 / 爱恋',
  companion: '伙伴 / 友方',
  authority: '师长 / 权威',
  association: '关联 / 中立',
  unknown: '未明',
}

function groupScore(group: AiBookRelationshipGroup) {
  const index = GROUP_ORDER.indexOf(group)
  return index === -1 ? 0 : GROUP_ORDER.length - index
}

function buildGroupedRows(rows: SummaryRelationshipGraphView['rows']): SummaryRelationshipGraphGroupedRow[] {
  const byGroup = new Map<AiBookRelationshipGroup, typeof rows>()
  for (const row of rows) {
    const list = byGroup.get(row.group) || []
    list.push(row)
    byGroup.set(row.group, list)
  }
  return GROUP_ORDER
    .filter((group) => byGroup.has(group))
    .map((group) => ({
      group,
      label: GROUP_LABELS[group],
      rows: byGroup.get(group)!.sort((a, b) => strengthScore(b.strength) - strengthScore(a.strength)),
    }))
}
