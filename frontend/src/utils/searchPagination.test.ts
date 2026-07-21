import { describe, expect, it } from 'vitest'
import { getSearchRequestProgress } from './searchPagination'

describe('getSearchRequestProgress', () => {
  it('starts a new search from the first source on page one', () => {
    expect(getSearchRequestProgress({ page: 4, lastIndex: 20, hasMoreSources: true }, false))
      .toEqual({ page: 1, lastIndex: -1 })
  })

  it('continues scanning remaining sources before increasing depth', () => {
    expect(getSearchRequestProgress({ page: 1, lastIndex: 23, hasMoreSources: true }, true))
      .toEqual({ page: 1, lastIndex: 23 })
  })

  it('moves to the next result page after all sources are scanned', () => {
    expect(getSearchRequestProgress({ page: 1, lastIndex: 57, hasMoreSources: false }, true))
      .toEqual({ page: 2, lastIndex: -1 })
  })
})
