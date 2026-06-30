import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const appStoreMock = {
  isLoggedIn: false,
  userInfo: null,
  showLoginModal: false,
  showSourceManager: false,
  showUserManager: false,
  showWebdavManager: false,
  isSecureMode: false,
  secureKeyRequired: false,
  adminAuthorized: false,
  needSecureKey: false,
  secureKey: '',
  canCheckVersionUpdate: true,
  hasVersionUpdateReminder: true,
  versionUpdateLoading: false,
  versionUpdate: {
    currentVersion: 'v1.0.9',
    latestVersion: 'v1.0.10',
    latestName: 'v1.0.10',
    releaseUrl: 'https://example.com/release',
    publishedAt: '2026-07-01T00:00:00Z',
    updateAvailable: true,
    shouldRemind: true,
    dismissedVersion: null,
    checkedAt: 1_783_000_000,
    error: null,
  },
  isOnline: true,
  pwaReady: true,
  pwaUpdateAvailable: true,
  deferredInstallPrompt: null,
  theme: 'light' as const,
  readingStatsSummary: {
    totalTimeText: '1分钟',
    openedBooks: 0,
    readChapters: 0,
    completedBooks: 0,
  },
  clearUser: vi.fn(),
  fetchUserInfo: vi.fn(),
  setSecureKey: vi.fn(),
  showToast: vi.fn(),
  setTheme: vi.fn(),
  installPwa: vi.fn(),
  applyPwaUpdate: vi.fn(),
  dismissVersionUpdateReminder: vi.fn(),
  checkVersionUpdate: vi.fn(),
}

const shelfStoreMock = {
  fetchBooks: vi.fn(),
}

vi.mock('../stores/app', () => ({
  useAppStore: () => appStoreMock,
}))

vi.mock('../stores/bookshelf', () => ({
  useBookshelfStore: () => shelfStoreMock,
}))

vi.mock('../api/user', () => ({
  changePassword: vi.fn(),
  logout: vi.fn(),
}))

describe('SettingsDrawer update copy', () => {
  beforeEach(() => {
    appStoreMock.showToast.mockReset()
    appStoreMock.installPwa.mockReset()
    appStoreMock.applyPwaUpdate.mockReset()
    appStoreMock.dismissVersionUpdateReminder.mockReset()
    appStoreMock.checkVersionUpdate.mockReset()
    shelfStoreMock.fetchBooks.mockReset()
  })

  it('separates server deployment updates from browser-side frontend updates', async () => {
    const wrapper = mount(await import('./SettingsDrawer.vue').then((mod) => mod.default), {
      props: { modelValue: true },
      global: {
        stubs: {
          Teleport: true,
          Transition: false,
        },
      },
    })

    const text = wrapper.text()

    expect(wrapper.find('.deploy-status-card').exists()).toBe(true)
    expect(wrapper.find('.frontend-update-card').exists()).toBe(true)
    expect(text).toContain('需手动部署')
    expect(text).toContain('请查看 Release 并手动更新 Docker / 服务端。')
    expect(text).toContain('仅刷新浏览器里的前端资源，不会更新 Docker 或服务端。')
    expect(text).toContain('应用前端更新')
  })
})
