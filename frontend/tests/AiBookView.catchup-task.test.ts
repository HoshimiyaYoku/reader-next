import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/AiBookView.vue', import.meta.url), 'utf8')

describe('AiBookView catchup task controls', () => {
  it('wires backend catchup start pause and polling controls', () => {
    expect(source).toContain('startAiBookCatchup')
    expect(source).toContain('pauseAiBookCatchup')
    expect(source).toContain('getAiBookCatchupStatus')
    expect(source).toContain('补齐任务')
    expect(source).toContain('scheduleCatchupPoll')
    expect(source).toContain('onUnmounted')
  })
})
