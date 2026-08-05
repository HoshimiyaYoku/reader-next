import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('./http', () => ({
  default: {
    get: getMock,
    post: postMock,
    delete: deleteMock,
  },
}))

const api = await import('./readerBackground')

describe('reader background api', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    deleteMock.mockReset()
  })

  it('reads metadata and authenticated image data from separate endpoints', async () => {
    const metadata = {
      contentType: 'image/webp',
      byteSize: 12,
      updatedAt: 10,
      etag: 'hash',
      enabled: true,
      fit: 'cover',
      position: 'center',
      overlay: 0.45,
    }
    const image = new Blob(['image'], { type: 'image/webp' })
    getMock
      .mockResolvedValueOnce({ data: metadata })
      .mockResolvedValueOnce({ data: image, headers: { etag: '"hash"' } })

    await expect(api.fetchReaderBackgroundMetadata()).resolves.toEqual(metadata)
    await expect(api.fetchReaderBackgroundImage()).resolves.toEqual({ blob: image, etag: 'hash' })
    expect(getMock).toHaveBeenNthCalledWith(1, '/reader-background')
    expect(getMock).toHaveBeenNthCalledWith(2, '/reader-background/image', {
      responseType: 'blob',
    })
  })

  it('uploads image and display settings as multipart fields', async () => {
    postMock.mockResolvedValueOnce({ data: { etag: 'hash' } })
    const image = new Blob(['image'], { type: 'image/webp' })
    const settings = {
      enabled: true,
      readerEnabled: true,
      fit: 'contain' as const,
      position: 'bottom' as const,
      overlay: 0.6,
    }

    await api.uploadReaderBackground(image, settings)

    const [, form, config] = postMock.mock.calls[0]
    expect(postMock.mock.calls[0][0]).toBe('/reader-background')
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(form.get('enabled')).toBe('true')
    expect(form.get('readerEnabled')).toBe('true')
    expect(form.get('fit')).toBe('contain')
    expect(form.get('position')).toBe('bottom')
    expect(form.get('overlay')).toBe('0.6')
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('updates settings and removes the remote image', async () => {
    const settings = {
      enabled: false,
      readerEnabled: false,
      fit: 'cover' as const,
      position: 'top' as const,
      overlay: 0.2,
    }
    postMock.mockResolvedValueOnce({ data: { ...settings, etag: 'hash' } })
    deleteMock.mockResolvedValueOnce({ data: { deleted: true } })

    await api.updateReaderBackgroundSettings(settings)
    await expect(api.removeReaderBackground()).resolves.toEqual({ deleted: true })

    expect(postMock).toHaveBeenCalledWith('/reader-background/settings', settings)
    expect(deleteMock).toHaveBeenCalledWith('/reader-background')
  })
})
