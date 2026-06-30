import http from '../http'
import type {
  AiBookCatchupStatus,
  AiBookChapterMemoryViewResponse,
  AiBookGenerationMode,
  AiBookMemoryViewResponse,
} from '../../types'

export function getAiBookMemory(bookUrl: string) {
  return http.get<AiBookMemoryViewResponse>('/ai/book/memory', { params: { bookUrl } }).then((r) => r.data)
}

export function getAiBookChapterMemory(params: { bookUrl: string; chapterIndex: number }) {
  return http.get<AiBookChapterMemoryViewResponse>('/ai/book/chapter-memory', { params }).then((r) => r.data)
}

export function resetAiBookMemory(bookUrl: string) {
  return http.post<AiBookMemoryViewResponse>('/ai/book/memory/reset', { bookUrl }).then((r) => r.data)
}

export function setAiBookEnabled(params: { bookUrl: string; enabled: boolean }) {
  return http.post<AiBookMemoryViewResponse>('/ai/book/enabled', params).then((r) => r.data)
}

export function generateAiBookChapterMemory(params: { bookUrl: string; chapterIndex: number; mode?: AiBookGenerationMode }) {
  return http.post<AiBookChapterMemoryViewResponse>('/ai/book/chapter-memory/generate', params).then((r) => r.data)
}

export function startAiBookCatchup(params: { bookUrl: string; targetChapterIndex?: number }) {
  return http.post<AiBookCatchupStatus>('/ai/book/catchup/start', params).then((r) => r.data)
}

export function getAiBookCatchupStatus(bookUrl: string) {
  return http.get<AiBookCatchupStatus>('/ai/book/catchup/status', { params: { bookUrl } }).then((r) => r.data)
}

export function cancelAiBookCatchup(bookUrl: string) {
  return http.post<AiBookCatchupStatus>('/ai/book/catchup/cancel', { bookUrl }).then((r) => r.data)
}
