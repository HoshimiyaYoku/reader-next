import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReaderTtsPanel from './ReaderTtsPanel.vue'

function mountPanel() {
  return mount(ReaderTtsPanel, {
    props: {
      show: true,
      theme: { popup: '#fff', fontColor: '#111' },
      provider: 'system',
      providerLabel: '系统语音',
      isSpeaking: false,
      isLoading: false,
      isPaused: false,
      voices: [],
      voiceName: '',
      rate: 1,
      pitch: 1,
      volume: 1,
      supportsPitch: true,
      openaiModel: '',
      openaiVoice: '',
      openaiSource: 'browser',
      azureRegion: '',
      azureVoice: '',
      stopAfterMinutes: 0,
      timerText: '',
    },
  })
}

describe('ReaderTtsPanel custom timer', () => {
  it('emits a valid custom minute value and clears the input', async () => {
    const wrapper = mountPanel()
    const input = wrapper.get('[aria-label="自定义停止分钟数"]')
    await input.setValue('45')
    await wrapper.get('.tts-custom-timer').trigger('submit')

    expect(wrapper.emitted('timer-change')).toEqual([[45]])
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('accepts up to 24 hours and rejects values above it', async () => {
    const wrapper = mountPanel()
    const input = wrapper.get('[aria-label="自定义停止分钟数"]')
    await input.setValue('1440')
    await wrapper.get('.tts-custom-timer').trigger('submit')
    expect(wrapper.emitted('timer-change')).toEqual([[1440]])

    await input.setValue('1441')
    await wrapper.get('.tts-custom-timer').trigger('submit')
    expect(wrapper.emitted('timer-change')).toEqual([[1440]])
    expect(wrapper.find('.tts-timer-error').text()).toContain('24小时')
  })

  it('rejects invalid values and clears the hint after the input is emptied', async () => {
    const wrapper = mountPanel()
    const input = wrapper.get('[aria-label="自定义停止分钟数"]')
    await input.setValue('3.5')
    await wrapper.get('.tts-custom-timer').trigger('submit')

    expect(wrapper.emitted('timer-change')).toBeUndefined()
    expect(wrapper.find('.tts-timer-error').text()).toContain('整数')

    await input.setValue('')
    expect(wrapper.find('.tts-timer-error').exists()).toBe(false)
  })
})
