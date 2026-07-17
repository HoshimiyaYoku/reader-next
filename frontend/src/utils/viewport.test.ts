import { describe, expect, it } from 'vitest'
import { shouldUseLayoutViewportForStandalone } from './viewport'

describe('shouldUseLayoutViewportForStandalone', () => {
  it('detects standards-based standalone display mode', () => {
    expect(shouldUseLayoutViewportForStandalone(true, false)).toBe(true)
  })

  it('detects the iOS navigator.standalone fallback', () => {
    expect(shouldUseLayoutViewportForStandalone(false, true)).toBe(true)
  })

  it('keeps visual viewport sizing in a regular browser tab', () => {
    expect(shouldUseLayoutViewportForStandalone(false, false)).toBe(false)
  })
})
