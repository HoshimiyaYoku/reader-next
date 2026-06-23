import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/AiBookView.vue', import.meta.url), 'utf8')

describe('AiBookView catchup task controls', () => {
  it('wires backend catchup start pause and polling controls', () => {
    expect(source).toContain('startAiBookCatchup')
    expect(source).toContain('cancelAiBookCatchup')
    expect(source).toContain('getAiBookCatchupStatus')
    expect(source).toContain('补齐任务')
    expect(source).toContain('scheduleCatchupPoll')
    expect(source).toContain('onUnmounted')
    expect(source).toContain('取消补齐')
  })

  it('keeps AI book load errors visible instead of rendering a blank page', () => {
    expect(source).toContain('AI资料加载失败')
    expect(source).toContain('loadError')
    expect(source).toContain('class="ai-empty-panel"')
    expect(source).not.toContain("appStore.showToast((error as Error).message || 'AI资料加载失败', 'error')\n    router.replace('/')")
  })
})
