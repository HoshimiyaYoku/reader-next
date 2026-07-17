import type { Book } from '../types'

export function isBookOnShelf(books: Book[], bookUrl?: string) {
  return !!bookUrl && books.some((book) => book.bookUrl === bookUrl)
}

export function buildReaderShelfBook(
  book: Book,
  currentIndex: number,
  currentChapterTitle?: string,
): Book {
  return {
    ...book,
    durChapterIndex: currentIndex,
    durChapterTitle: currentChapterTitle || book.durChapterTitle,
  }
}
