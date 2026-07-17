import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceManager from './SourceManager.vue'
import SourceEditorPanel from './source-manager/SourceEditorPanel.vue'
import SourceList from './source-manager/SourceList.vue'
import SourceLoginPanel from './source-manager/SourceLoginPanel.vue'
import { useSourceStore } from '../stores/source'

const apiMocks = vi.hoisted(() => ({
  deleteBookSource: vi.fn(),
  deleteBookSources: vi.fn(),
  deleteInvalidBookSources: vi.fn(),
  getBookSources: vi.fn(),
  loginBookSource: vi.fn(),
  readRemoteSourceFile: vi.fn(),
  readSourceFile: vi.fn(),
  runBookSourceLoginAction: vi.fn(),
  saveBookSource: vi.fn(),
  saveBookSources: vi.fn(),
  testBookSources: vi.fn(),
}))

const appStoreMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}))

vi.mock('../api/source', () => apiMocks)
vi.mock('../stores/app', () => ({
  useAppStore: () => appStoreMock,
}))

describe('SourceManager Legado login flow', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    appStoreMock.showToast.mockReset()
    apiMocks.saveBookSource.mockResolvedValue({ saved: true })
    apiMocks.loginBookSource.mockResolvedValue({
      success: true,
      status: 200,
      mode: 'legadoUi',
      loginUi: [{ name: '邮箱', type: 'text' }],
      loginInfo: { 邮箱: 'saved@example.com' },
      loggedIn: false,
    })
    apiMocks.runBookSourceLoginAction.mockResolvedValue({
      success: true,
      messages: ['登录成功'],
      loggedIn: true,
    })
  })

  it('saves the current editor JSON before requesting login and opens the native panel', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const sourceStore = useSourceStore()
    const source = {
      bookSourceName: '聚合书源',
      bookSourceUrl: 'https://source.example',
      loginUrl: 'old login script',
      enabled: true,
    }
    sourceStore.sources = [source]
    sourceStore.loaded = true

    const wrapper = shallowMount(SourceManager, {
      props: { modelValue: true },
      global: {
        plugins: [pinia],
        stubs: {
          Teleport: true,
          Transition: false,
        },
      },
    })

    wrapper.findComponent(SourceList).vm.$emit('edit', source)
    await nextTick()

    const editedSource = {
      ...source,
      loginUrl: 'new login script',
      loginUi: '[{"name":"邮箱","type":"text"}]',
    }
    const editor = wrapper.findComponent(SourceEditorPanel)
    editor.vm.$emit('update:editorText', JSON.stringify(editedSource))
    await nextTick()
    editor.vm.$emit('login')
    await flushPromises()

    expect(apiMocks.saveBookSource).toHaveBeenCalledWith(editedSource)
    expect(apiMocks.saveBookSource.mock.invocationCallOrder[0])
      .toBeLessThan(apiMocks.loginBookSource.mock.invocationCallOrder[0])
    expect(apiMocks.loginBookSource).toHaveBeenCalledWith(source.bookSourceUrl)

    const loginPanel = wrapper.findComponent(SourceLoginPanel)
    expect(loginPanel.exists()).toBe(true)
    expect(loginPanel.props('modelValue')).toEqual({ 邮箱: 'saved@example.com' })

    loginPanel.vm.$emit('action', { action: 'login()', name: '账号登录' })
    await flushPromises()

    expect(apiMocks.runBookSourceLoginAction).toHaveBeenCalledWith({
      bookSourceUrl: source.bookSourceUrl,
      loginInfo: { 邮箱: 'saved@example.com' },
      action: 'login()',
    })
  })
})
