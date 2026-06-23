import http from './http'
import type { AiBookAnyMemory, AiBookCatchupStatus } from '../types'

export function getAiBookMemory(bookUrl: string) {
  return http.post<AiBookAnyMemory | null>('/getAiBookMemory', { bookUrl }).then((r) => r.data)
}

export function saveAiBookMemory(memory: AiBookAnyMemory) {
  return http.post<AiBookAnyMemory>('/saveAiBookMemory', memory).then((r) => r.data)
}

export function deleteAiBookMemory(bookUrl: string) {
  return http.post<{ deleted: boolean }>('/deleteAiBookMemory', { bookUrl }).then((r) => r.data)
}

export function startAiBookCatchup(params: { bookUrl: string; targetChapterIndex?: number }) {
  return http.post<AiBookCatchupStatus>('/aiBookCatchup/start', params).then((r) => r.data)
}

export function getAiBookCatchupStatus(bookUrl: string) {
  return http.post<AiBookCatchupStatus>('/aiBookCatchup/status', { bookUrl }).then((r) => r.data)
}

export function pauseAiBookCatchup(bookUrl: string) {
  return http.post<AiBookCatchupStatus>('/aiBookCatchup/pause', { bookUrl }).then((r) => r.data)
}

export function cancelAiBookCatchup(bookUrl: string) {
  return http.post<AiBookCatchupStatus>('/aiBookCatchup/cancel', { bookUrl }).then((r) => r.data)
}
