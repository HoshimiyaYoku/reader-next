import { describe, expect, it } from 'vitest'
import {
  buildReaderBackgroundStyle,
  formatReaderChapterHtml,
  formatSpeechTimer,
} from './readerViewPresentation'

describe('reader view presentation helpers', () => {
  it('keeps the plain theme when the reader background is disabled', () => {
    expect(buildReaderBackgroundStyle('#fff4dc', {
      enabled: true,
      readerEnabled: false,
      fit: 'cover',
      position: 'center',
      overlay: 0.45,
    }, '')).toEqual({
      backgroundColor: '#fff4dc',
      backgroundImage: 'none',
    })
  })

  it('formats paragraphs with indentation, spacing and search highlights', () => {
    const html = formatReaderChapterHtml('　第一段\n第二段', {
      firstLineIndent: true,
      paragraphSpacing: 0.4,
      searchQuery: '第二',
    })

    expect(html).toContain('class="reader-indent"')
    expect(html).toContain('margin-bottom: 0.4em')
    expect(html).toContain('<mark class="search-highlight">第二</mark>段')
  })

  it('formats long custom speech timers', () => {
    expect(formatSpeechTimer(90 * 60 * 1000, 0)).toBe('1小时30分钟后停止')
    expect(formatSpeechTimer(24 * 60 * 60 * 1000, 0)).toBe('24小时后停止')
  })
})
