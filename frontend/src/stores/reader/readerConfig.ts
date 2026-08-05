const SELECTION_MENU_DEFAULT_MIGRATION_KEY = 'reader-selection-menu-default-v1'
const READER_BACKGROUND_CONFIG_KEY = 'reader-backgroundConfig'

/* ─── Reading config type ─── */
export interface ReadConfig {
  fontSize: number
  fontWeight: number
  fontFamily: string
  lineHeight: number
  paragraphSpacing: number
  firstLineIndent: boolean
  fontColor: string
  pageWidth: number
  pageMode: 'auto' | 'mobile'
  readMethod: '上下滑动' | '左右翻页' | '上下滚动' | '上下滚动2'
  animateDuration: number
  autoPageMode: 'pixel' | 'paragraph'
  scrollPixel: number
  pageSpeed: number
  clickAction: 'next' | 'auto' | 'none'
  selectAction: 'popup' | 'ignore'
  chineseMode: 'simplified' | 'traditional'
  specialMode: 'normal' | 'simple'
  enablePreload: boolean
  showAiPanel: boolean
  enableChapterSummaryAuto: boolean
  aiPanelLayout: 'auto' | 'side'
  aiPanelSiderWidth: number
  aiPanelFontSize: number
  chapterSummaryKeyPointStyle: 'card' | 'list'
  aiPanelActiveTab: 'summary' | 'relationships' | 'map' | 'settings'
}

export const defaultConfig: ReadConfig = {
  fontSize: 18,
  fontWeight: 400,
  fontFamily: 'system',
  lineHeight: 1.8,
  paragraphSpacing: 0.2,
  firstLineIndent: true,
  fontColor: '',
  pageWidth: 800,
  pageMode: 'auto',
  readMethod: '上下滑动',
  animateDuration: 300,
  autoPageMode: 'pixel',
  scrollPixel: 1,
  pageSpeed: 1000,
  clickAction: 'auto',
  selectAction: 'popup',
  chineseMode: 'simplified',
  specialMode: 'normal',
  enablePreload: false,
  showAiPanel: true,
  enableChapterSummaryAuto: true,
  aiPanelLayout: 'auto',
  aiPanelSiderWidth: 360,
  aiPanelFontSize: 16,
  chapterSummaryKeyPointStyle: 'card',
  aiPanelActiveTab: 'summary',
}

export function loadConfig(): ReadConfig {
  try {
    const saved = localStorage.getItem('readConfig')
    if (saved) {
      const migrated = migrateLegacyReadConfig(JSON.parse(saved))
      if (!localStorage.getItem(SELECTION_MENU_DEFAULT_MIGRATION_KEY)) {
        migrated.selectAction = 'popup'
        localStorage.setItem(SELECTION_MENU_DEFAULT_MIGRATION_KEY, '1')
      }
      return migrated
    }
    localStorage.setItem(SELECTION_MENU_DEFAULT_MIGRATION_KEY, '1')
  } catch { /* ignore */ }
  return { ...defaultConfig }
}

export function migrateLegacyReadConfig(saved: Partial<ReadConfig> & Record<string, unknown>): ReadConfig {
  const normalized = { ...saved } as Record<string, unknown>
  if (normalized.showAiPanel === undefined && normalized.showChapterSummary !== undefined) {
    normalized.showAiPanel = normalized.showChapterSummary
  }
  if (normalized.aiPanelLayout === undefined && normalized.chapterSummaryLayout !== undefined) {
    normalized.aiPanelLayout = normalized.chapterSummaryLayout
  }
  if (normalized.aiPanelSiderWidth === undefined && normalized.chapterSummarySiderWidth !== undefined) {
    normalized.aiPanelSiderWidth = normalized.chapterSummarySiderWidth
  }
  if (normalized.aiPanelFontSize === undefined && normalized.chapterSummaryFontSize !== undefined) {
    normalized.aiPanelFontSize = normalized.chapterSummaryFontSize
  }
  if (normalized.aiPanelActiveTab === undefined && normalized.chapterSummaryActiveTab !== undefined) {
    normalized.aiPanelActiveTab = normalized.chapterSummaryActiveTab === 'content'
      ? 'summary'
      : normalized.chapterSummaryActiveTab
  }
  if (normalized.aiPanelActiveTab === 'content') {
    normalized.aiPanelActiveTab = 'summary'
  }
  if (!['summary', 'relationships', 'map', 'settings'].includes(String(normalized.aiPanelActiveTab || ''))) {
    normalized.aiPanelActiveTab = 'summary'
  }
  const merged = { ...defaultConfig, ...normalized } as ReadConfig
  merged.fontSize = normalizeNumber(merged.fontSize, defaultConfig.fontSize, 1)
  merged.fontWeight = normalizeNumber(merged.fontWeight, defaultConfig.fontWeight, 1)
  merged.lineHeight = normalizeNumber(merged.lineHeight, defaultConfig.lineHeight, 0.1)
  merged.paragraphSpacing = normalizeNumber(merged.paragraphSpacing, defaultConfig.paragraphSpacing, 0)
  merged.pageWidth = normalizeNumber(merged.pageWidth, defaultConfig.pageWidth, 1)
  merged.animateDuration = normalizeNumber(merged.animateDuration, defaultConfig.animateDuration, 0)
  merged.scrollPixel = normalizeNumber(merged.scrollPixel, defaultConfig.scrollPixel, 1)
  merged.pageSpeed = normalizeNumber(merged.pageSpeed, defaultConfig.pageSpeed, 1)
  merged.aiPanelSiderWidth = normalizeNumber(merged.aiPanelSiderWidth, defaultConfig.aiPanelSiderWidth, 1)
  merged.aiPanelFontSize = normalizeNumber(merged.aiPanelFontSize, defaultConfig.aiPanelFontSize, 1)
  return merged
}

export function normalizeNumber(
  value: unknown,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
    ? Math.min(value, max)
    : fallback
}

/* ─── Theme presets ─── */
export interface ThemePreset {
  name: string
  body: string
  content: string
  fontColor: string
  popup: string
}

export const themePresets: ThemePreset[] = [
  { name: '默认', body: '#f5ede4', content: '#fff9f0', fontColor: '#333', popup: '#fff' },
  { name: '纯白', body: '#ffffff', content: '#ffffff', fontColor: '#333', popup: '#fff' },
  { name: '琥珀', body: '#f5e6ce', content: '#faf0e4', fontColor: '#5b4636', popup: '#faf0e4' },
  { name: '薄荷', body: '#e0f0e8', content: '#eaf5ef', fontColor: '#2d4a3e', popup: '#eaf5ef' },
  { name: '天蓝', body: '#dce8f0', content: '#e8f0f6', fontColor: '#2c3e50', popup: '#e8f0f6' },
  { name: '粉白', body: '#f5e4e8', content: '#faf0f3', fontColor: '#4a2d36', popup: '#faf0f3' },
  { name: '浅灰', body: '#eaeaea', content: '#f5f5f5', fontColor: '#333', popup: '#f5f5f5' },
  { name: '暗灰', body: '#808080', content: '#999', fontColor: '#eee', popup: '#888' },
  { name: '暗夜', body: '#141414', content: '#16213e', fontColor: '#c8c8c8', popup: '#141414' },
]

export type ReaderColorMode = 'light' | 'dark'
export interface ReaderColorStyle {
  backgroundColor: string
  textColor: string
}

export type ReaderBackgroundFit = 'cover' | 'contain'
export type ReaderBackgroundPosition = 'top' | 'center' | 'bottom'
export interface ReaderBackgroundConfig {
  enabled: boolean
  readerEnabled: boolean
  fit: ReaderBackgroundFit
  position: ReaderBackgroundPosition
  overlay: number
}

export const defaultReaderBackgroundConfig: ReaderBackgroundConfig = {
  enabled: true,
  readerEnabled: false,
  fit: 'cover',
  position: 'center',
  overlay: 0.45,
}

export function loadReaderBackgroundConfig(): ReaderBackgroundConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(READER_BACKGROUND_CONFIG_KEY) || '{}') as Partial<ReaderBackgroundConfig>
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : defaultReaderBackgroundConfig.enabled,
      readerEnabled: typeof saved.readerEnabled === 'boolean'
        ? saved.readerEnabled
        : defaultReaderBackgroundConfig.readerEnabled,
      fit: saved.fit === 'contain' ? 'contain' : 'cover',
      position: ['top', 'center', 'bottom'].includes(String(saved.position))
        ? saved.position as ReaderBackgroundPosition
        : defaultReaderBackgroundConfig.position,
      overlay: normalizeNumber(saved.overlay, defaultReaderBackgroundConfig.overlay, 0, 0.9),
    }
  } catch {
    return { ...defaultReaderBackgroundConfig }
  }
}

export function loadReaderColorStyle(key: string, fallback: ReaderColorStyle): ReaderColorStyle {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as Partial<ReaderColorStyle>
    return {
      backgroundColor: typeof saved.backgroundColor === 'string' && saved.backgroundColor
        ? saved.backgroundColor
        : fallback.backgroundColor,
      textColor: typeof saved.textColor === 'string' && saved.textColor
        ? saved.textColor
        : fallback.textColor,
    }
  } catch {
    return { ...fallback }
  }
}

/* ─── Font presets ─── */
export const fontPresets = [
  { label: '系统', value: 'system', family: '' },
  { label: '黑体', value: 'heiti', family: '"SimHei", "STHeiti", "Heiti SC", sans-serif' },
  { label: '楷体', value: 'kaiti', family: '"KaiTi", "STKaiti", "BiauKai", serif' },
  { label: '宋体', value: 'songti', family: '"SimSun", "STSong", "Songti SC", serif' },
  { label: '仿宋', value: 'fangsong', family: '"FangSong", "STFangsong", serif' },
]
