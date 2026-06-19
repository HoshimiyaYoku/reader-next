import http from './http'
import type {
  ChapterSummaryConfig,
  ChapterSummaryConfigResponse,
  ChapterSummaryResponse,
  GenerateChapterSummaryRequest,
} from '../types'

export function getChapterSummary(bookUrl: string, chapterUrl: string) {
  return http
    .get<ChapterSummaryResponse>('/chapterSummary', { params: { bookUrl, chapterUrl } })
    .then((r) => r.data)
}

export function generateChapterSummary(payload: GenerateChapterSummaryRequest) {
  return http
    .post<ChapterSummaryResponse>('/chapterSummary/generate', payload)
    .then((r) => r.data)
}

export function getChapterSummaryConfig() {
  return http
    .get<ChapterSummaryConfigResponse>('/chapterSummary/config')
    .then((r) => r.data)
}

export function saveChapterSummaryConfig(config: ChapterSummaryConfig) {
  return http
    .post<ChapterSummaryConfigResponse>('/chapterSummary/config', { config })
    .then((r) => r.data)
}
