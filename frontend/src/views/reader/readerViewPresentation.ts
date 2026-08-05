import type { ReaderBackgroundConfig } from '../../stores/reader'

export function buildReaderBackgroundStyle(
  themeBody: string,
  background: ReaderBackgroundConfig,
  imageUrl: string,
) {
  if (!imageUrl) {
    return {
      backgroundColor: themeBody,
      backgroundImage: 'none',
    }
  }
  const overlayColor = colorWithAlpha(themeBody, background.overlay)
  return {
    backgroundColor: themeBody,
    backgroundImage: `linear-gradient(${overlayColor}, ${overlayColor}), url("${imageUrl}")`,
    backgroundPosition: `center ${background.position}`,
    backgroundSize: background.fit,
    backgroundRepeat: 'no-repeat',
  }
}

export function formatReaderClock(now: number) {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatSpeechTimer(stopAt: number, now: number) {
  if (!stopAt) return ''
  const remainMs = stopAt - now
  if (remainMs <= 0) return ''
  const totalMinutes = Math.ceil(remainMs / 60000)
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return minutes ? `${hours}小时${minutes}分钟后停止` : `${hours}小时后停止`
  }
  return `${totalMinutes}分钟后停止`
}

export function formatReaderChapterHtml(
  rawText: string,
  options: {
    firstLineIndent: boolean
    paragraphSpacing: number
    searchQuery?: string
  },
) {
  if (!rawText) return ''
  let text = rawText

  if (options.searchQuery) {
    try {
      const regex = new RegExp(`(${options.searchQuery})`, 'gi')
      text = text.replace(regex, '<mark class="search-highlight">$1</mark>')
    } catch { /* invalid regex */ }
  }

  const stripLeadingIndent = (line: string) => line.replace(/^[\u3000\u00A0 \t]+/, '')

  if (/<[a-z][\s\S]*>/i.test(text)) {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = text
    const paragraphs = Array.from(wrapper.querySelectorAll('p')) as HTMLParagraphElement[]
    if (paragraphs.length) {
      paragraphs.forEach((paragraph) => {
        const plainText = (paragraph.textContent || '').replace(/^[\u3000\u00A0 \t]+/, '').trim()
        if (!plainText) {
          paragraph.remove()
          return
        }
        paragraph.innerHTML = paragraph.innerHTML.replace(/^[\u3000\u00A0 \t]+/, '')
        paragraph.style.marginTop = '0'
        paragraph.style.marginBottom = `${options.paragraphSpacing}em`
        paragraph.classList.toggle('reader-indent', options.firstLineIndent)
      })
      return wrapper.innerHTML
    }
  }

  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const content = stripLeadingIndent(line.trimEnd())
      return `<p${options.firstLineIndent ? ' class="reader-indent"' : ''} style="margin-top: 0; margin-bottom: ${options.paragraphSpacing}em;">${content}</p>`
    })
    .join('')
}

function colorWithAlpha(color: string, alpha: number) {
  const normalized = color.trim().replace(/^#/, '')
  const hex = normalized.length === 3
    ? normalized.split('').map((item) => `${item}${item}`).join('')
    : normalized
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`
}
