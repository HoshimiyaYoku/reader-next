// ─── API 统一返回 ───
export interface ApiResponse<T = unknown> {
  isSuccess: boolean
  errorMsg: string
  data: T
}

// ─── 书籍 ───
export interface Book {
  name: string
  author: string
  bookUrl: string
  origin: string
  originName?: string
  coverUrl?: string
  tocUrl?: string
  charset?: string
  customCoverUrl?: string
  canUpdate?: boolean
  durChapterIndex?: number
  durChapterPos?: number
  durChapterTime?: number
  durChapterTitle?: string
  intro?: string
  latestChapterTitle?: string
  lastCheckTime?: number
  totalChapterNum?: number
  type?: number
  group?: number
  wordCount?: string
  infoHtml?: string
  tocHtml?: string
  kind?: string
  updateTime?: string
  variable?: string
  cachedChapterCount?: number
  browserCachedChapterCount?: number
  recentKind?: 'book' | 'rss'
  rssSourceUrl?: string
  rssLink?: string
  rssPubDate?: string
}

// ─── 搜索结果 ───
export interface SearchBook {
  name: string
  author: string
  bookUrl: string
  origin: string
  originName?: string
  originGroup?: string
  coverUrl?: string
  tocUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
  updateTime?: string
  wordCount?: string
  variable?: string
  bookSourceUrls?: string[]
}

// ─── 章节 ───
export interface BookChapter {
  title: string
  url: string
  index: number
  baseUrl?: string
  bookUrl?: string
  variable?: string
}

// ─── 书源 ───
export interface BookSource {
  bookSourceName: string
  bookSourceGroup?: string
  bookSourceUrl: string
  bookSourceType?: number
  enabled?: boolean
  enabledExplore?: boolean
  enabledCookieJar?: boolean
  customOrder?: number
  weight?: number
  searchUrl?: string
  exploreUrl?: string
  header?: string
  loginUrl?: string
  loginCheckJs?: string
  loadWithBaseUrl?: boolean
  singleUrl?: boolean
  ruleSearch?: Record<string, unknown>
  ruleExplore?: Record<string, unknown>
  ruleBookInfo?: Record<string, unknown>
  ruleToc?: Record<string, unknown>
  ruleContent?: Record<string, unknown>
}

export interface BookSourceTestResult {
  bookSourceName: string
  bookSourceUrl: string
  valid: boolean
  searchOk: boolean
  exploreOk: boolean
  keyword: string
  exploreUrl?: string
  searchError?: string
  exploreError?: string
  markedInvalid: boolean
  group?: string
}

export interface BookSourceTestResponse {
  total: number
  valid: number
  invalid: number
  markedInvalid: number
  results: BookSourceTestResult[]
}

// ─── 分组 ───
export interface BookGroup {
  groupId: number
  groupName: string
  orderNo?: number
}

// ─── 用户 ───
export interface UserInfo {
  username: string
  lastLoginAt?: number
  accessToken: string
  enableWebdav?: boolean
  enableLocalStore?: boolean
  enableAiModel?: boolean
  createdAt?: number
  isAdmin?: boolean
}

// ─── 应用更新 ───
export interface VersionUpdateInfo {
  currentVersion: string
  latestVersion: string | null
  latestName: string | null
  releaseUrl: string | null
  publishedAt: string | null
  updateAvailable: boolean
  shouldRemind: boolean
  dismissedVersion: string | null
  checkedAt: number
  error: string | null
}

// ─── 书签 ───
export interface Bookmark {
  time?: number
  bookName: string
  bookAuthor: string
  chapterIndex?: number
  chapterPos?: number
  chapterName?: string
  bookText?: string
  content?: string
}

// ─── 净化规则 ───
export interface ReplaceRule {
  id: number
  name: string
  group?: string
  pattern: string
  replacement: string
  scope?: string
  isEnabled: boolean
  isRegex: boolean
  order: number
}

// ─── RSS ───
export interface RssSource {
  sourceUrl: string
  sourceName: string
  sourceIcon?: string
  sourceGroup?: string
  sourceComment?: string
  enabled?: boolean
  enabledCookieJar?: boolean
  concurrentRate?: string
  header?: string
  loginUrl?: string
  loginCheckJs?: string
  sortUrl?: string
  singleUrl?: boolean
  articleStyle?: number
  ruleArticles?: string
  ruleNextPage?: string
  ruleTitle?: string
  rulePubDate?: string
  ruleDescription?: string
  ruleImage?: string
  ruleLink?: string
  ruleContent?: string
  style?: string
  enableJs?: boolean
  loadWithBaseUrl?: boolean
  customOrder?: number
  lastUpdateTime?: number
}

export interface RssArticle {
  origin: string
  sort: string
  title: string
  order: number
  link: string
  pubDate?: string
  description?: string
  content?: string
  image?: string
  read?: boolean
  variable?: string
}

// ─── AI 设定集 ───
export interface AiBookConfig {
  modelSource: 'browser' | 'server'
  textBaseUrl: string
  textApiKey: string
  textModel: string
  textPath: string
  textUseFullUrl: boolean
  imageBaseUrl: string
  imageApiKey: string
  imageModel: string
  imagePath: string
  imageSize: string
  imageUseFullUrl: boolean
  useBackendProxy: boolean
}

export type TextProviderPreset = 'chat' | 'responses' | 'gemini' | 'anthropic' | 'custom'
export type ImageProviderPreset = 'openai-image' | 'custom'
export type SpeechProviderPreset = 'openai-speech' | 'custom'

export interface AiModelEndpointConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  path: string
  useFullUrl: boolean
}

export interface AiImageModelConfig extends AiModelEndpointConfig {
  imageSize: string
}

export interface AiSpeechModelConfig extends AiModelEndpointConfig {
  voice: string
  responseFormat: string
}


export interface ChapterSummaryConfig {
  enabled: boolean
  autoEnabledDefault: boolean
  prompt: string
  detailLevel: 'short' | 'normal' | 'detailed'
  maxWords: number
  temperature: number
  minContentChars: number
}

export interface ChapterSummaryConfigResponse {
  config: ChapterSummaryConfig
  canUseServerModel: boolean
  isAdmin: boolean
}

export interface ChapterSummaryRecord {
  bookUrl: string
  chapterUrl: string
  chapterIndex?: number
  chapterTitle?: string
  summary: string
  keyPoints: string[]
  promptVersion: string
  model: string
  createdAt: number
  updatedAt: number
}

export interface ChapterSummaryResponse {
  summary: ChapterSummaryRecord | null
}

export interface GenerateChapterSummaryRequest {
  bookUrl: string
  chapterUrl: string
  chapterIndex?: number
  chapterTitle?: string
  content: string
  force?: boolean
  previousChapters?: ChapterSummaryContextChapter[]
}

export interface ChapterSummaryContextChapter {
  chapterUrl: string
  chapterIndex?: number
  chapterTitle?: string
}

export interface AiServerModelConfig {
  text: AiModelEndpointConfig
  image: AiImageModelConfig
  speech: AiSpeechModelConfig
}

export interface AiServerModelConfigResponse {
  config: AiServerModelConfig
  canUseServerModel: boolean
  isAdmin: boolean
}

export interface AiBookModelUpdate {
  memory: AiBookMemoryViewModel
  shouldRegenerateMap: boolean
  mapPrompt?: string
}

export type AiBookCatchupTaskStatus =
  | 'idle'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'canceling'
  | 'canceled'
  | 'completed'
  | 'failed'

export interface AiBookCatchupStatus {
  status: AiBookCatchupTaskStatus
  bookUrl: string
  currentStage?: string | null
  startChapterIndex?: number
  targetChapterIndex?: number
  currentChapterIndex?: number
  currentChapterTitle?: string
  processedChapterIndex?: number
  processedChapterTitle?: string
  totalChapters: number
  completedChapters: number
  updatedAt: number | string
  error?: string | null
  stats?: AiBookCatchupStats | null
}

export type AiBookImportance = 'high' | 'medium' | 'low'
export type AiBookConfidence = '已知' | '推断' | '未知'
export type AiBookLocationScale =
  | 'world'
  | 'continent'
  | 'country'
  | 'region'
  | 'city'
  | 'district'
  | 'site'
  | 'building'
  | 'room'
  | 'unknown'

export interface AiBookEvidence {
  chapterIndex: number
  chapterTitle: string
  quote?: string
  note: string
}

export interface AiBookSummaryState {
  current: string
  recentChanges: string[]
  openQuestions: string[]
}

export interface AiBookCharacterAbilityView {
  name: string
  level?: string | null
  status?: string | null
  knowledgeFactId?: string | null
  evidence: AiBookEvidence[]
}

export interface AiBookCharacterView {
  id: string
  name: string
  aliases: string[]
  importance: string
  description?: string | null
  firstSeenChapterIndex?: number | null
  lastSeenChapterIndex?: number | null
  evidence: AiBookEvidence[]
}

export interface AiBookCharacterStateView {
  characterId: string
  currentStatus?: string | null
  currentLocationId?: string | null
  affiliations: string[]
  abilities: AiBookCharacterAbilityView[]
  resources: string[]
  lastSeenChapterIndex?: number | null
  evidence: AiBookEvidence[]
}

export type AiBookRelationshipGroup =
  | 'unknown'
  | 'family'
  | 'romance'
  | 'companion'
  | 'authority'
  | 'opposition'
  | 'association'

export type AiBookRelationPolarity = 'neutral' | 'positive' | 'negative' | 'mixed'
export type AiBookRelationStrength = 'unknown' | 'weak' | 'moderate' | 'strong' | 'critical'
export type AiBookRelationStatus = 'unknown' | 'active' | 'distant' | 'broken' | 'developing'

export interface AiBookRelationChangeView {
  chapterIndex: number
  chapterTitle: string
  previousGroup?: AiBookRelationshipGroup | null
  nextGroup: AiBookRelationshipGroup
  previousPolarity?: AiBookRelationPolarity | null
  nextPolarity: AiBookRelationPolarity
  previousStatus?: AiBookRelationStatus | null
  nextStatus: AiBookRelationStatus
  note: string
  evidence: AiBookEvidence[]
}

export interface AiBookRelationView {
  id: string
  sourceCharacterId: string
  targetCharacterId: string
  group: AiBookRelationshipGroup
  label: string
  polarity: AiBookRelationPolarity
  strength: AiBookRelationStrength
  status: AiBookRelationStatus
  direction: string
  summary: string
  currentDynamics: string[]
  firstSeenChapterIndex?: number | null
  lastUpdatedChapterIndex?: number | null
  evidence: AiBookEvidence[]
  history: AiBookRelationChangeView[]
}

export type AiBookFactCategory =
  | 'unknown'
  | 'basicRule'
  | 'powerFaction'
  | 'historyLegend'
  | 'techMagic'
  | 'socialCulture'
  | 'geography'
  | 'organization'
  | 'unconfirmed'

export type AiBookFactConfidence = 'unknown' | 'low' | 'medium' | 'high'
export type AiBookFactImportance = 'unknown' | 'low' | 'medium' | 'high'

export interface AiBookKnowledgeFactView {
  id: string
  category: AiBookFactCategory
  title: string
  content: string
  confidence: AiBookFactConfidence
  importance: AiBookFactImportance
  firstSeenChapterIndex?: number | null
  lastConfirmedChapterIndex?: number | null
  evidence: AiBookEvidence[]
}

export interface AiBookLocationView {
  id: string
  name: string
  aliases: string[]
  kind: string
  scale: string
  parentLocationId?: string | null
  description: string
  currentStatus?: string | null
  importance: string
  firstSeenChapterIndex?: number | null
  lastSeenChapterIndex?: number | null
  evidence: AiBookEvidence[]
}

export interface AiBookLocationEdgeView {
  source: string
  target: string
  kind: 'unknown' | 'contains' | 'adjacent' | 'leadsTo' | 'partOf' | 'near'
  description?: string | null
}

export interface AiBookMapStatusView {
  dirty: boolean
  dirtyReason?: string | null
  sourceChapterIndex?: number | null
  sourceChapterTitle?: string | null
  lastBlueprintGeneratedAt?: number | null
  lastImageGeneratedAt?: number | null
  lastError?: string | null
}

export interface AiBookMapSourceRefView {
  sourceType: string
  key: string
}

export interface AiBookMapBlueprintPlaceView {
  id: string
  sourceRef: AiBookMapSourceRefView
  label: string
  kind?: string | null
  shortDescription?: string | null
  importance?: string | null
  relatedCharacters: string[]
}

export interface AiBookMapBlueprintConnectionView {
  id: string
  sourceRef: AiBookMapSourceRefView
  sourcePlaceId: string
  targetPlaceId: string
  kind: string
  label?: string | null
  description?: string | null
  confidence?: string | null
}

export interface AiBookMapBlueprintSourceView {
  sourceChapterIndex?: number | null
  sourceChapterTitle?: string | null
  compiledAt: number
  prompt?: string | null
}

export interface AiBookMapBlueprintContentView {
  places: AiBookMapBlueprintPlaceView[]
  connections: AiBookMapBlueprintConnectionView[]
}

export interface AiBookMapLayoutGroupView {
  id: string
  label: string
  placeIds: string[]
}

export interface AiBookMapLayoutPlacementView {
  placeId: string
  x?: number | null
  y?: number | null
}

export interface AiBookMapBlueprintLayoutView {
  mode: string
  groups: AiBookMapLayoutGroupView[]
  placements: AiBookMapLayoutPlacementView[]
  highlightedPlaceIds: string[]
  currentPlaceIds: string[]
}

export interface AiBookMapImageGuideView {
  aspectRatio: string
  style: string
  labelPolicy: string
  mustInclude: string[]
  mustAvoid: string[]
}

export interface AiBookMapBlueprintView {
  version: number
  source: AiBookMapBlueprintSourceView
  content: AiBookMapBlueprintContentView
  layout: AiBookMapBlueprintLayoutView
  imageGuide: AiBookMapImageGuideView
  warnings: string[]
}

export interface AiBookMapArtifactsView {
  imageUrl?: string | null
  imagePrompt?: string | null
  scaffoldUrl?: string | null
  generatedAt?: number | null
  blueprintVersion?: number | null
  model?: string | null
  provider?: string | null
  updatedAt?: number | null
}

export interface AiBookMapView {
  status?: AiBookMapStatusView | null
  blueprint?: AiBookMapBlueprintView | null
  artifacts?: AiBookMapArtifactsView | null
  locations: AiBookLocationView[]
  locationEdges: AiBookLocationEdgeView[]
}

export interface AiBookCatchupStats {
  totalModelCalls: number
  digestCalls: number
  patchCalls: number
  skippedPatchChapters: number
  totalInputBytes: number
  totalOutputBytes: number
  lastCallLatencyMs?: number | null
  averageCallLatencyMs?: number | null
  lastChapterIndex?: number | null
  updatedAt: number
}

export interface AiBookMemoryViewModel {
  bookUrl: string
  bookName?: string | null
  author?: string | null
  enabled: boolean
  processedChapterIndex?: number | null
  processedChapterTitle?: string | null
  updatedAt: number
  summary: AiBookSummaryState
  characters: AiBookCharacterView[]
  relationships: AiBookRelationView[]
  knowledgeFacts: AiBookKnowledgeFactView[]
  locations: AiBookLocationView[]
  map?: AiBookMapView | null
  cleanup: {
    droppedFactsCount: number
    droppedByReason: Record<string, number>
    oldSchemaBackedUp: boolean
  }
  catchupStats?: AiBookCatchupStats | null
  lastError?: string | null
  lastErrorChapterIndex?: number | null
  lastErrorChapterTitle?: string | null
}

export interface AiBookChapterDigestView {
  chapterIndex: number
  chapterTitle: string
  summary: string
  keyPoints: string[]
  characters: Array<{
    name: string
    aliases: string[]
    status: string
    faction?: string | null
    location?: string | null
    description?: string | null
    lastSeenChapter?: string | null
  }>
  characterStates: Array<{
    name: string
    status: string
    description?: string | null
    lastSeenChapterIndex?: number | null
    lastSeenChapterTitle?: string | null
    updatedAt?: number | null
  }>
  characterRelations: Array<{
    source: string
    target: string
    group: AiBookRelationshipGroup
    label: string
    polarity: AiBookRelationPolarity
    strength: AiBookRelationStrength
    status: AiBookRelationStatus
    direction: string
    summary?: string | null
    description?: string | null
  }>
  knowledgeFacts: Array<{
    title: string
    content: string
    category: AiBookFactCategory
    confidence: AiBookFactConfidence
    importance: AiBookFactImportance
  }>
  locations: Array<{
    name: string
    kind?: string | null
    description: string
    status?: string | null
    relatedCharacters: string[]
    firstSeenChapter?: string | null
  }>
  locationEdges: AiBookLocationEdgeView[]
}

export interface AiBookChapterMemoryViewModel {
  bookUrl: string
  chapterIndex: number
  chapterTitle?: string | null
  digest?: AiBookChapterDigestView | null
  characters: AiBookCharacterView[]
  relationships: AiBookRelationView[]
  knowledgeFacts: AiBookKnowledgeFactView[]
  locations: AiBookLocationView[]
  generationStatus: string
  lastError?: string | null
}

export interface AiBookMemoryViewResponse {
  memory: AiBookMemoryViewModel
}

export interface AiBookChapterMemoryViewResponse {
  chapter: AiBookChapterMemoryViewModel
  memory: AiBookMemoryViewModel
}

export type AiBookGenerationMode = 'manual' | 'auto'
