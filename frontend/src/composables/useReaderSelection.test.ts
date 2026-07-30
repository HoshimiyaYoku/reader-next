import { describe, expect, it } from 'vitest'
import { findSelectionStartParagraph } from './useReaderSelection'

describe('findSelectionStartParagraph', () => {
  it('returns the first paragraph covered by a multi-paragraph selection', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <p>选择前的段落</p>
      <p><span>选区第一段</span></p>
      <p>选区第二段</p>
      <p>选择后的段落</p>
    `
    const paragraphs = container.querySelectorAll('p')
    const firstSelectedText = paragraphs[1]?.querySelector('span')?.firstChild
    const secondSelectedText = paragraphs[2]?.firstChild
    expect(firstSelectedText).toBeTruthy()
    expect(secondSelectedText).toBeTruthy()

    const range = document.createRange()
    range.setStart(firstSelectedText!, 2)
    range.setEnd(secondSelectedText!, 4)

    expect(findSelectionStartParagraph(container, range)).toBe(paragraphs[1])
  })

  it('returns the containing paragraph for a selection inside one paragraph', () => {
    const container = document.createElement('div')
    container.innerHTML = '<p>本段前文和选中文字</p>'
    const paragraph = container.querySelector('p')!
    const text = paragraph.firstChild!
    const range = document.createRange()
    range.setStart(text, 5)
    range.setEnd(text, 9)

    expect(findSelectionStartParagraph(container, range)).toBe(paragraph)
  })
})
