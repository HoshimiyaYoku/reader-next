import { describe, expect, it } from 'vitest'
import { isLocalBook, isLocalTxtBook } from './localBook'

describe('isLocalBook', () => {
  it('detects uploaded local txt books by origin or url', () => {
    expect(isLocalBook({ origin: 'local-txt', bookUrl: 'anything' })).toBe(true)
    expect(isLocalBook({ origin: 'remote', bookUrl: 'local-txt:abc' })).toBe(true)
    expect(isLocalBook({ origin: 'remote', bookUrl: 'https://example.test/book' })).toBe(false)
    expect(isLocalBook(null)).toBe(false)
  })

  it('detects uploaded local epub books by origin or url', () => {
    expect(isLocalBook({ origin: 'local-epub', bookUrl: 'anything' })).toBe(true)
    expect(isLocalBook({ origin: 'remote', bookUrl: 'local-epub:abc' })).toBe(true)
  })

  it('detects uploaded local pdf books by origin or url', () => {
    expect(isLocalBook({ origin: 'local-pdf', bookUrl: 'anything' })).toBe(true)
    expect(isLocalBook({ origin: 'remote', bookUrl: 'local-pdf:abc' })).toBe(true)
  })
})

describe('isLocalTxtBook (backward-compatible alias)', () => {
  it('is the same function as isLocalBook', () => {
    expect(isLocalTxtBook).toBe(isLocalBook)
  })
})
