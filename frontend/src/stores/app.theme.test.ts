import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'

describe('app theme mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('tracks system color scheme while follow-system mode is selected', () => {
    let onChange: ((event: MediaQueryListEvent) => void) | undefined
    const matchMedia = vi.fn(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        onChange = listener
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMedia)

    const store = useAppStore()
    store.setThemeMode('system')
    expect(store.theme).toBe('light')

    onChange?.({ matches: true } as MediaQueryListEvent)
    expect(store.theme).toBe('dark')
    expect(localStorage.getItem('themeMode')).toBe('system')

    vi.unstubAllGlobals()
  })
})
