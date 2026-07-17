export function normalizePageCount(totalPages: number) {
  return Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1))
}

export function clampPageIndex(pageIndex: number, totalPages: number) {
  const maxPageIndex = normalizePageCount(totalPages) - 1
  const normalizedIndex = Number.isFinite(pageIndex) ? Math.round(pageIndex) : 0
  return Math.max(0, Math.min(maxPageIndex, normalizedIndex))
}

export function getPageProgress(pageIndex: number, totalPages: number) {
  const pageCount = normalizePageCount(totalPages)
  if (pageCount <= 1) return 1
  return clampPageIndex(pageIndex, pageCount) / (pageCount - 1)
}

export function getPageIndexFromProgress(progress: number, totalPages: number) {
  const pageCount = normalizePageCount(totalPages)
  const normalizedProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0
  return clampPageIndex(normalizedProgress * (pageCount - 1), pageCount)
}

export interface SavedChapterProgress {
  chapterIndex: number
  progress: number
  updatedAt: number
}

export function chooseSavedChapterProgress<T extends SavedChapterProgress>(
  currentChapterIndex: number,
  chapterSaved: T | null,
  legacySaved: T | null,
  serverSaved: T | null,
) {
  if (chapterSaved?.chapterIndex === currentChapterIndex) {
    return { position: chapterSaved, source: 'chapter' as const }
  }

  let position = legacySaved?.chapterIndex === currentChapterIndex ? legacySaved : null
  let source: 'legacy' | 'server' | 'none' = position ? 'legacy' : 'none'
  if (
    serverSaved?.chapterIndex === currentChapterIndex
    && (!position || serverSaved.updatedAt > position.updatedAt)
  ) {
    position = serverSaved
    source = 'server'
  }
  return { position, source }
}
