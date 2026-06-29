import type { Book, SearchBook } from '../types'

type BookLike = Pick<Book | SearchBook, 'origin' | 'bookUrl'>

export function isLocalBook(book?: BookLike | null) {
  if (!book) return false
  const origin = book.origin?.trim()
  const bookUrl = book.bookUrl?.trim()
  if (origin === 'local-txt' || bookUrl?.startsWith('local-txt:')) return true
  if (origin === 'local-epub' || bookUrl?.startsWith('local-epub:')) return true
  if (origin === 'local-pdf' || bookUrl?.startsWith('local-pdf:')) return true
  if (origin === 'local-mobi' || bookUrl?.startsWith('local-mobi:')) return true
  return false
}

// Keep backward-compatible alias
export const isLocalTxtBook = isLocalBook
