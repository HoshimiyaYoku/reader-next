import { describe, expect, it } from 'vitest'
import {
  resolveViewportHeightCssValue,
  shouldUseLayoutViewportForStandalone,
} from './viewport'

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

describe('resolveViewportHeightCssValue', () => {
  it('does not lock standalone mode to a potentially stale launch measurement', () => {
    expect(resolveViewportHeightCssValue(780, true, true)).toBe('100lvh')
  })

  it('uses the legacy full viewport unit when lvh is unavailable', () => {
    expect(resolveViewportHeightCssValue(780, true, false)).toBe('100vh')
  })

  it('keeps measured height in a regular browser tab', () => {
    expect(resolveViewportHeightCssValue(780.126, false, true)).toBe('780.13px')
  })
})
