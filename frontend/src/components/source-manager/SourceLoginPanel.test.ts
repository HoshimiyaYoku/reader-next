import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SourceLoginPanel from './SourceLoginPanel.vue'

describe('SourceLoginPanel', () => {
  const baseProps = {
    title: '聚合书源',
    sourceUrl: 'https://source.example',
    items: [
      { name: '邮箱', type: 'text' },
      { name: '密码', type: 'password' },
      {
        name: '账号登录',
        type: 'button',
        action: 'login()',
        style: { layout_flexBasisPercent: 0.4 },
      },
      {
        name: '更多设置',
        type: 'button',
        action: '',
        style: { layout_flexBasisPercent: 1 },
      },
    ],
    modelValue: {
      邮箱: 'reader@example.com',
      密码: 'secret-value',
    },
    loggedIn: false,
    loading: false,
    activeAction: '',
    messages: [],
    openUrl: '',
  }

  it('renders saved credentials with a masked password input and preserves fields on edit', async () => {
    const wrapper = mount(SourceLoginPanel, { props: baseProps })
    const password = wrapper.get<HTMLInputElement>('input[type="password"]')

    expect(password.element.value).toBe('secret-value')
    expect(wrapper.text()).not.toContain('secret-value')

    await wrapper.findAll('input')[0].setValue('next@example.com')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{
      邮箱: 'next@example.com',
      密码: 'secret-value',
    }])
  })

  it('emits the original Legado action and treats empty actions as section labels', async () => {
    const wrapper = mount(SourceLoginPanel, { props: baseProps })
    const actionButton = wrapper.get('.login-control-button button')

    await actionButton.trigger('click')

    expect(wrapper.emitted('action')?.[0]).toEqual([{
      action: 'login()',
      name: '账号登录',
    }])
    expect(wrapper.findAll('.login-control-button button')).toHaveLength(1)
    expect(wrapper.get('.login-section-label').text()).toBe('更多设置')
    expect(wrapper.findAll('.login-control-button')[0].attributes('style')).toContain('--login-basis: 40%')
  })

  it('keeps a visible link when the browser cannot auto-open a source page', () => {
    const wrapper = mount(SourceLoginPanel, {
      props: {
        ...baseProps,
        openUrl: 'https://source.example/key',
      },
    })

    const link = wrapper.get<HTMLAnchorElement>('.login-open-link')
    expect(link.attributes('href')).toBe('https://source.example/key')
    expect(link.attributes('target')).toBe('_blank')
  })
})
