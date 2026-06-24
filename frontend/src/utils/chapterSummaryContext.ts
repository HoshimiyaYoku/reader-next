import type { AiBookChapterMemoryViewModel, AiBookMemoryViewModel } from '../types'

export type ChapterSummaryContextKind = 'character' | 'relation' | 'clue' | 'fact' | 'location'

export interface ChapterSummaryContextRow {
  kind: ChapterSummaryContextKind
  title: string
  detail: string
  meta: string
  label: string
  importance: 'high' | 'medium' | 'low'
}

export interface ChapterSummaryContextSection {
  key: 'characters' | 'relationships' | 'clues' | 'facts' | 'locations'
  title: string
  rows: ChapterSummaryContextRow[]
}

export function buildChapterSummaryContext(input: {
  memory: AiBookMemoryViewModel | null
  chapter: AiBookChapterMemoryViewModel | null
  currentChapterIndex: number
  limit?: number
}) {
  const limit = input.limit ?? 5
  const memory = input.memory
  const digest = input.chapter?.digest

  const characterRows: ChapterSummaryContextRow[] = compactRows([
    ...(digest?.characterStates || []).map((item) => ({
      kind: 'character' as const,
      title: item.name,
      detail: item.status || item.description || '本章出现',
      meta: chapterMeta(item.lastSeenChapterIndex ?? input.currentChapterIndex),
      label: kindLabel('character'),
      importance: 'medium' as const,
    })),
    ...(digest?.characterStates?.length ? [] : (memory?.characters || []).slice(0, 3).map((item) => ({
      kind: 'character' as const,
      title: item.name,
      detail: item.description || '人物',
      meta: chapterMeta(item.lastSeenChapterIndex ?? input.currentChapterIndex),
      label: kindLabel('character'),
      importance: importance(item.importance),
    }))),
  ])

  const relationRows: ChapterSummaryContextRow[] = compactRows([
    ...(digest?.characterRelations || []).map((item) => ({
      kind: 'relation' as const,
      title: `${item.source} · ${item.target}`,
      detail: item.description || item.status || item.kind,
      meta: item.kind,
      label: kindLabel('relation'),
      importance: item.status === 'developing' || item.strength === 'critical' ? 'high' as const : 'medium' as const,
    })),
    ...(digest?.characterRelations?.length ? [] : (memory?.relationships || []).slice(0, 3).map((item) => ({
      kind: 'relation' as const,
      title: item.label || `${item.sourceCharacterId} · ${item.targetCharacterId}`,
      detail: item.currentDynamics[0] || item.summary,
      meta: item.kind,
      label: kindLabel('relation'),
      importance: item.status === 'developing' || item.strength === 'critical' ? 'high' as const : 'medium' as const,
    }))),
  ])

  const clueRows: ChapterSummaryContextRow[] = compactRows((memory?.summary.openQuestions || []).map((item) => ({
    kind: 'clue' as const,
    title: '未解问题',
    detail: item,
    meta: '伏笔',
    label: kindLabel('clue'),
    importance: 'high' as const,
  })))

  const factRows: ChapterSummaryContextRow[] = uniqueRows(compactRows([
    ...(digest?.knowledgeFacts || []).map((item) => ({
      kind: 'fact' as const,
      title: item.title,
      detail: item.content,
      meta: item.category,
      label: kindLabel('fact'),
      importance: importance(item.importance),
    })),
    ...(memory?.knowledgeFacts || []).map((item) => ({
      kind: 'fact' as const,
      title: item.title,
      detail: item.content,
      meta: item.category,
      label: kindLabel('fact'),
      importance: importance(item.importance),
    })),
  ]))

  const locationRows: ChapterSummaryContextRow[] = uniqueRows(compactRows([
    ...(digest?.locations || []).map((item) => ({
      kind: 'location' as const,
      title: item.name,
      detail: item.description || item.status || '地点',
      meta: item.kind || 'location',
      label: kindLabel('location'),
      importance: 'medium' as const,
    })),
    ...(memory?.locations || []).map((item) => ({
      kind: 'location' as const,
      title: item.name,
      detail: item.description || item.currentStatus || '地点',
      meta: item.kind || 'location',
      label: kindLabel('location'),
      importance: importance(item.importance),
    })),
  ]))

  const moreSections: ChapterSummaryContextSection[] = [
    { key: 'characters', title: '人物', rows: characterRows },
    { key: 'relationships', title: '关系', rows: relationRows },
    { key: 'clues', title: '伏笔', rows: clueRows },
    { key: 'facts', title: '设定', rows: factRows },
    { key: 'locations', title: '地点', rows: locationRows },
  ]

  const focusRows = [relationRows, clueRows, characterRows, factRows, locationRows]
    .flatMap((rows) => rows)
    .slice(0, limit)

  return { focusRows, moreSections }
}


function kindLabel(kind: ChapterSummaryContextKind) {
  return {
    character: '人物',
    relation: '关系',
    clue: '伏笔',
    fact: '设定',
    location: '地点',
  }[kind]
}

function compactRows(rows: ChapterSummaryContextRow[]) {
  return rows.filter((row) => row.title.trim() && row.detail.trim())
}

function uniqueRows(rows: ChapterSummaryContextRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.kind}:${row.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function importance(value: string | undefined | null): 'high' | 'medium' | 'low' {
  if (value === 'high') return 'high'
  if (value === 'low') return 'low'
  return 'medium'
}

function chapterMeta(index: number) {
  return `第 ${index + 1} 章`
}
