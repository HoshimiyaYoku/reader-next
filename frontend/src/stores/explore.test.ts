import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useExploreStore } from './explore'
import { useSourceStore } from './source'
import { getBookSources } from '../api/source'
import { exploreBook, exploreBookGlobal, getExploreKinds } from '../api/explore'
import type { BookSource } from '../types'

vi.mock('../api/source', () => ({
  getBookSources: vi.fn(),
}))

vi.mock('../api/explore', () => ({
  exploreBook: vi.fn(),
  exploreBookGlobal: vi.fn(),
  getExploreKinds: vi.fn(),
}))

const getBookSourcesMock = vi.mocked(getBookSources)
const exploreBookMock = vi.mocked(exploreBook)
const exploreBookGlobalMock = vi.mocked(exploreBookGlobal)
const getExploreKindsMock = vi.mocked(getExploreKinds)

describe('explore store source sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getBookSourcesMock.mockReset()
    exploreBookMock.mockReset()
    exploreBookGlobalMock.mockReset()
    getExploreKindsMock.mockReset()
    exploreBookMock.mockResolvedValue([])
    exploreBookGlobalMock.mockResolvedValue({ books: [], nextCursor: 12, hasMore: false, failed: 0 })
    getExploreKindsMock.mockRejectedValue(new Error('backend parser unavailable'))
  })

  it('starts in global explore mode when explore sources are loaded', async () => {
    const sourceStore = useSourceStore()
    sourceStore.sources = [sourceWithExplore()]
    const store = useExploreStore()

    await store.init()

    expect(store.activeSourceUrl).toBe(store.globalExploreSourceUrl)
    expect(store.categories.map((category) => category.title).slice(0, 4)).toEqual([
      '综合',
      '排行',
      '新书',
      '完本',
    ])
    expect(store.activeCategoryUrl).toBe('mixed')
    expect(exploreBookGlobalMock).toHaveBeenCalledWith({
      category: 'mixed',
      cursor: 0,
      limit: 20,
      scanLimit: 96,
      concurrentCount: 16,
    })
  })

  it('can switch from global mode back to a concrete source', async () => {
    const sourceStore = useSourceStore()
    sourceStore.sources = [sourceWithExplore()]
    const store = useExploreStore()

    await store.init()
    await store.setSource('https://m.cuoceng.com')

    expect(store.activeSourceUrl).toBe('https://m.cuoceng.com')
    expect(store.categories.map((category) => category.title)).toEqual(['书 库', '排 行'])
    expect(store.activeCategoryUrl).toBe('/book/category/catalog.html')
  })

  it('uses backend parsed explore kinds for js exploreUrl sources', async () => {
    const sourceStore = useSourceStore()
    sourceStore.sources = [sourceWithJsExplore()]
    getExploreKindsMock.mockResolvedValue([{ title: '玄幻', url: '/xuanhuan' }])
    const store = useExploreStore()

    await store.init()
    await store.setSource('https://js.example')

    expect(getExploreKindsMock).toHaveBeenCalledWith({ bookSourceUrl: 'https://js.example' })
    expect(store.categories).toEqual([{ title: '玄幻', url: '/xuanhuan' }])
    expect(store.activeCategoryUrl).toBe('/xuanhuan')
  })
})

function sourceWithExplore(): BookSource {
  return {
    bookSourceName: 'm.cuoceng.com',
    bookSourceUrl: 'https://m.cuoceng.com',
    enabledExplore: true,
    exploreUrl: JSON.stringify([
      {
        style: { layout_flexBasisPercent: 1.0, layout_flexGrow: 1 },
        title: '书 库',
        url: '/book/category/catalog.html',
      },
      {
        style: { layout_flexBasisPercent: 0.25, layout_flexGrow: 1 },
        title: '排 行',
        url: '/book/ranking.html',
      },
    ]),
  }
}

function sourceWithJsExplore(): BookSource {
  return {
    bookSourceName: 'js source',
    bookSourceUrl: 'https://js.example',
    enabledExplore: true,
    exploreUrl: '@js:JSON.stringify([{title:"玄幻",url:"/xuanhuan"}])',
  }
}
