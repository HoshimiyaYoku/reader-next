import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/components/reader/ReadSettings.vue'), 'utf8')
describe('ReadSettings summary ownership', () => {
 it('does not expose duplicate chapter summary management', () => {
  expect(source).not.toContain('chapter-summary-settings')
  expect(source).not.toContain('saveChapterSummarySettings')
  expect(source).not.toContain('chapterSummaryDraft')
  expect(source).not.toContain('Prompt')
 })
})
