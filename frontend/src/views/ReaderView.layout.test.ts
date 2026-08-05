import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/styles/reader-view.css'), 'utf8')

function ruleBody(pattern: RegExp) {
  return source.match(pattern)?.groups?.body ?? ''
}

describe('ReaderView summary heading layout', () => {
  it('keeps long chapter titles from squeezing the summary tabs', () => {
    const leftColumn = ruleBody(/\.chapter-summary-header > :first-child,\s*\.chapter-summary-sider-head > :first-child\s*\{(?<body>[^}]*)\}/)
    const tabs = ruleBody(/\.summary-tabs\s*\{(?<body>[^}]*)\}/)

    expect(leftColumn).toContain('min-width: 0')
    expect(leftColumn).toContain('overflow: hidden')
    expect(tabs).toContain('flex: 0 0 auto')
  })
})
