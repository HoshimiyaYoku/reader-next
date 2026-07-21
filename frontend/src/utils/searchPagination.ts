export interface SearchProgress {
  page: number
  lastIndex: number
  hasMoreSources: boolean
}

export function getSearchRequestProgress(progress: SearchProgress, append: boolean) {
  if (!append) return { page: 1, lastIndex: -1 }
  if (progress.hasMoreSources) {
    return { page: Math.max(1, progress.page), lastIndex: progress.lastIndex }
  }
  return { page: Math.max(1, progress.page) + 1, lastIndex: -1 }
}
