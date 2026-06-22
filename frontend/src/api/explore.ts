import http from './http'
import type { SearchBook } from '../types'
import type { ExploreCategory } from '../utils/exploreCategories'

export interface ExploreBookParams {
  bookSourceUrl: string
  ruleFindUrl: string
  page?: number
}

/**
 * 获取探索发现的书本列表
 * 对应后端 /reader3/exploreBook 接口
 */
export function exploreBook(params: ExploreBookParams) {
  return http.post<SearchBook[]>('/exploreBook', params).then((r) => r.data)
}

export interface ExploreBookGlobalResult {
  books: SearchBook[]
  nextCursor: number
  hasMore: boolean
  failed: number
}

export function exploreBookGlobal(params: {
  category: string
  cursor: number
  limit?: number
  scanLimit?: number
  concurrentCount?: number
}) {
  return http.post<ExploreBookGlobalResult>('/exploreBookGlobal', params).then((r) => r.data)
}

export function getExploreKinds(params: { bookSourceUrl: string }) {
  return http.post<{ title?: unknown; url?: unknown }[]>('/getExploreKinds', params).then((r) =>
    r.data
      .map(
        (item): ExploreCategory => ({
          title: String(item.title || '').trim(),
          url: String(item.url || '').trim(),
        }),
      )
      .filter((item) => item.title),
  )
}
