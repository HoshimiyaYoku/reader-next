import http from '../http'
import type {
  ChapterSummaryConfig,
  ChapterSummaryConfigResponse,
  ChapterSummaryResponse,
  GenerateChapterSummaryRequest,
} from '../../types'

export function getChapterSummary(bookUrl: string, chapterUrl: string) {
  return http
    .get<ChapterSummaryResponse>('/ai/chapter-summary', { params: { bookUrl, chapterUrl } })
    .then((r) => r.data)
}

export function generateChapterSummary(payload: GenerateChapterSummaryRequest) {
  return http
    .post<ChapterSummaryResponse>('/ai/chapter-summary/generate', payload)
    .then((r) => r.data)
}

export function getChapterSummaryConfig() {
  return http
    .get<ChapterSummaryConfigResponse>('/ai/chapter-summary/config')
    .then((r) => r.data)
}

export function saveChapterSummaryConfig(config: ChapterSummaryConfig) {
  return http
    .post<ChapterSummaryConfigResponse>('/ai/chapter-summary/config', { config })
    .then((r) => r.data)
}
