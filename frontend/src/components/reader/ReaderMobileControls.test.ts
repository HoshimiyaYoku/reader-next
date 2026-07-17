import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ReaderMobileControls from './ReaderMobileControls.vue'

describe('ReaderMobileControls horizontal pagination', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('shows the real page count and emits the dragged page index', async () => {
    const wrapper = mount(ReaderMobileControls, {
      props: {
        show: true,
        horizontalPageMode: true,
        currentPage: 3,
        totalPages: 8,
        pageProgress: 2 / 7,
      },
    })

    expect(wrapper.text()).toContain('第 3/8 页')
    const slider = wrapper.get('input[type="range"]')
    expect(slider.attributes('max')).toBe('8')
    expect(slider.attributes('value')).toBe('3')

    await slider.setValue('6')

    expect(wrapper.emitted('seekPage')).toEqual([[5]])
  })
})
