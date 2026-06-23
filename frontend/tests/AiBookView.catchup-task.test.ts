import { describe, expect, it } from 'vitest'
import source from '../src/views/AiBookView.vue?raw'

describe('AiBookView catchup task controls', () => {
  it('wires store-backed catchup start cancel and polling controls', () => {
    expect(source).toContain('aiStore.startCatchup({')
    expect(source).toContain('aiStore.cancelCatchup(book.value.bookUrl)')
    expect(source).toContain('aiStore.loadCatchupStatus(book.value.bookUrl)')
    expect(source).toContain('补齐任务')
    expect(source).toContain('scheduleCatchupPoll')
    expect(source).toContain('onUnmounted')
    expect(source).toContain('取消补齐')
  })

  it('keeps AI book load errors visible instead of rendering a blank page', () => {
    expect(source).toContain('AI资料加载失败')
    expect(source).toContain('loadError')
    expect(source).toContain('class="ai-empty-panel"')
  })
})
