import http from './http'

export type ReaderBackgroundFit = 'cover' | 'contain'
export type ReaderBackgroundPosition = 'top' | 'center' | 'bottom'

export interface ReaderBackgroundSettings {
  enabled: boolean
  readerEnabled?: boolean
  fit: ReaderBackgroundFit
  position: ReaderBackgroundPosition
  overlay: number
}

export interface ReaderBackgroundMetadata extends ReaderBackgroundSettings {
  contentType: string
  byteSize: number
  updatedAt: number
  etag: string
}

export interface ReaderBackgroundImage {
  blob: Blob
  etag: string
}

export function fetchReaderBackgroundMetadata() {
  return http
    .get<ReaderBackgroundMetadata | null>('/reader-background')
    .then((response) => response.data)
}

export function fetchReaderBackgroundImage() {
  return http
    .get<Blob>('/reader-background/image', { responseType: 'blob' })
    .then((response) => ({
      blob: response.data,
      etag: String(response.headers.etag || '').replace(/^W\//, '').replace(/^"|"$/g, ''),
    }))
}

export function uploadReaderBackground(image: Blob, settings: ReaderBackgroundSettings) {
  const form = new FormData()
  form.append('file', image, backgroundFileName(image.type))
  form.append('enabled', String(settings.enabled))
  form.append('readerEnabled', String(settings.readerEnabled ?? false))
  form.append('fit', settings.fit)
  form.append('position', settings.position)
  form.append('overlay', String(settings.overlay))
  return http
    .post<ReaderBackgroundMetadata>('/reader-background', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((response) => response.data)
}

export function updateReaderBackgroundSettings(settings: ReaderBackgroundSettings) {
  return http
    .post<ReaderBackgroundMetadata>('/reader-background/settings', settings)
    .then((response) => response.data)
}

export function removeReaderBackground() {
  return http
    .delete<{ deleted: boolean }>('/reader-background')
    .then((response) => response.data)
}

function backgroundFileName(contentType: string) {
  const extension = contentType === 'image/jpeg'
    ? 'jpg'
    : contentType.replace(/^image\//, '') || 'bin'
  return `reader-background.${extension}`
}
