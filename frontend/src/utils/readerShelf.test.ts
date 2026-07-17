import { describe, expect, it } from 'vitest'
import type { Book } from '../types'
import { buildReaderShelfBook, isBookOnShelf } from './readerShelf'

const book: Book = {
  name: '测试书籍',
  author: '测试作者',
  bookUrl: 'https://example.com/book/1',
  origin: 'https://example.com/source',
  durChapterIndex: 1,
  durChapterTitle: '旧章节',
}

describe('reader shelf helpers', () => {
  it('matches a shelf book by bookUrl', () => {
    expect(isBookOnShelf([book], book.bookUrl)).toBe(true)
    expect(isBookOnShelf([book], 'https://example.com/book/2')).toBe(false)
    expect(isBookOnShelf([book])).toBe(false)
  })

  it('keeps book metadata and records the current reading chapter', () => {
    expect(buildReaderShelfBook(book, 8, '当前章节')).toEqual({
      ...book,
      durChapterIndex: 8,
      durChapterTitle: '当前章节',
    })
  })
})
