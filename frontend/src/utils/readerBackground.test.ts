import { describe, expect, it } from 'vitest'
import {
  deleteReaderBackground,
  getReaderBackground,
  READER_BACKGROUND_MAX_FILE_SIZE,
  saveReaderBackground,
  validateReaderBackgroundFile,
} from './readerBackground'

describe('reader background validation', () => {
  it('accepts supported image formats', () => {
    const file = new File(['image'], 'background.webp', { type: 'image/webp' })
    expect(() => validateReaderBackgroundFile(file)).not.toThrow()
    const mobileFile = new File(['image'], 'background.jpg', { type: '' })
    expect(() => validateReaderBackgroundFile(mobileFile)).not.toThrow()
  })

  it('rejects executable image formats and oversized files', () => {
    const svg = new File(['<svg/>'], 'background.svg', { type: 'image/svg+xml' })
    expect(() => validateReaderBackgroundFile(svg)).toThrow('仅支持')

    const oversized = {
      type: 'image/jpeg',
      size: READER_BACKGROUND_MAX_FILE_SIZE + 1,
    } as File
    expect(() => validateReaderBackgroundFile(oversized)).toThrow('15MB')
  })

  it('persists and removes the image blob in browser storage', async () => {
    const blob = new Blob(['background'], { type: 'image/webp' })
    if (typeof indexedDB === 'undefined') {
      await expect(saveReaderBackground(blob)).rejects.toThrow('不支持本地图片存储')
      return
    }
    await saveReaderBackground(blob)

    const stored = await getReaderBackground()
    expect(stored?.type).toBe('image/webp')
    expect(await stored?.text()).toBe('background')

    await deleteReaderBackground()
    expect(await getReaderBackground()).toBeNull()
  })
})
