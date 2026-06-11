# AI资料 V2 结构化知识库设计

## 背景

当前 AI资料已经能按阅读进度生成摘要、世界观、角色、关系和地图，但长篇阅读时体验不稳定：

- 世界观摘要容易变成最近章节复述。
- 基础设定缺少稳定分类，条目越积越乱。
- 人物关系按文本名称粗合并，方向、状态和重要性容易混在一起。
- 地点层级缺少可靠身份和父子关系，地图重绘前后不一致。
- 前后端数据模型不一致，后端保存时会丢失前端生成的 `category`、`importance`、`parentName`、地图降级原因等字段。

根因不是单一 prompt 问题，而是当前实现把“长期知识库”压成一个前端生成、后端保存的扁平 JSON。模型既负责抽取，也负责合并、去重、纠错和地图判断，代码层缺少稳定约束。

## 目标

把 AI资料改成一套随已读章节演进的轻量结构化知识库：

1. 摘要分层：章节摘要、阶段摘要、当前全局摘要分开保存。
2. 世界观沉淀成可复用设定，不再混入章节流水账。
3. 角色、关系、地点使用稳定 ID 和证据来源，支持冲突修正。
4. 地图基于结构化地点图生成，图片只是渲染产物。
5. 保持现有 OpenAI 兼容模型配置和后端代理能力。
6. 兼容旧 AI资料读取，并提供重新生成 V2 的路径。

## 非目标

本次不做：

- 独立向量数据库、图数据库或全文 RAG 服务。
- 跨书籍共享世界观。
- 未读章节推断、剧透预测或联网补资料。
- 人工编辑器的完整 CRUD 工作台。
- 复杂多模型编排平台。
- 地图图片模型质量兜底到专业制图工具。

## 推荐方案

采用“V2 JSON 知识库 + 代码确定性合并”的方案。

后端仍保存一份 JSON，但不再用字段不完整的 Rust 强类型结构吞掉前端扩展字段。前端或后端先让模型只输出当前章节的 `ChapterKnowledgePatch`，再由代码把 patch 合并进 `AiBookMemoryV2`。

选择这个方案的原因：

- 改动比图数据库/RAG 小，适合当前 Reader-Rust 架构。
- 可以立刻修复字段丢失、分类丢失、地图层级丢失。
- 知识合并由代码控制，可测试、可回滚、可逐步增强。
- 将来如果要上 RAG，可以从 `chapterDigests` 和 `evidence` 自然扩展。

## V2 数据模型

顶层结构：

```ts
interface AiBookMemoryV2 {
  schemaVersion: 2
  bookUrl: string
  bookName?: string
  author?: string
  enabled: boolean
  processedChapterIndex?: number
  processedChapterTitle?: string
  updatedAt: number
  lastError?: string

  summary: AiBookSummaryState
  chapterDigests: AiBookChapterDigest[]
  arcs: AiBookArcSummary[]
  worldFacts: AiBookWorldFact[]
  characters: AiBookCharacterV2[]
  relationships: AiBookRelationshipV2[]
  locations: AiBookLocationV2[]
  mapState: AiBookMapState
  renderArtifacts: AiBookRenderArtifacts
}
```

### Summary

```ts
interface AiBookSummaryState {
  current: string
  recentChanges: string[]
  openQuestions: string[]
}
```

- `current` 是已读范围内的全局局势，不写成“第 X 章发生了什么”。
- `recentChanges` 只保留最近 5-10 条关键变化。
- `openQuestions` 记录未确认悬念，必须来自已读章节。

### Chapter Digest

```ts
interface AiBookChapterDigest {
  chapterIndex: number
  chapterTitle: string
  digest: string
  keyEvents: string[]
  touchedEntityIds: string[]
  createdAt: number
}
```

章节摘要只服务于回溯和压缩，不直接展示为世界观。

### Arc Summary

```ts
interface AiBookArcSummary {
  id: string
  startChapterIndex: number
  endChapterIndex: number
  title: string
  summary: string
  keyEntityIds: string[]
}
```

每 20-50 章或每卷生成一个阶段摘要。V1 的单一 `summary` 不再承担长期全文压缩。

### World Fact

```ts
interface AiBookWorldFact {
  id: string
  category: '基础规则' | '势力制度' | '历史传说' | '技术/魔法' | '社会文化' | '地理环境' | '组织体系' | '未确认信息'
  title: string
  content: string
  confidence: '已知' | '推断' | '未知'
  importance: 'high' | 'medium' | 'low'
  firstSeenChapterIndex: number
  lastConfirmedChapterIndex: number
  evidence: AiBookEvidence[]
  supersedes?: string[]
}
```

世界观条目必须是跨章节可复用事实。章节行动、战斗过程、调查过程放进 digest 或角色状态，不进入 worldFacts。

### Character

```ts
interface AiBookCharacterV2 {
  id: string
  name: string
  aliases: string[]
  importance: 'high' | 'medium' | 'low'
  ambiguous?: boolean
  currentStatus: string
  faction?: string
  currentLocationId?: string
  description?: string
  firstSeenChapterIndex?: number
  lastSeenChapterIndex?: number
  statusHistory: AiBookEntityState[]
  evidence: AiBookEvidence[]
}
```

角色身份由 `id` 承载，名称只是显示字段。合并时优先用别名、上下文和现有实体匹配，避免同一人多卡片。

### Entity State

```ts
interface AiBookEntityState {
  chapterIndex: number
  chapterTitle: string
  status: string
  locationId?: string
  faction?: string
  evidence?: AiBookEvidence
}
```

状态历史只记录关键变化，不保存每章快照。角色和地点都可复用这个结构。

### Relationship

```ts
interface AiBookRelationshipV2 {
  id: string
  sourceCharacterId: string
  targetEntityId: string
  targetKind: 'character' | 'location' | 'organization'
  relationType: string
  direction: 'directed' | 'undirected'
  currentStatus?: string
  description?: string
  importance: 'high' | 'medium' | 'low'
  firstSeenChapterIndex?: number
  lastSeenChapterIndex?: number
  evidence: AiBookEvidence[]
}
```

人物关系默认不自动反向重复。师徒、上下级、敌对、控制、归属等关系保留方向；亲属、同伴等可以标记为 `undirected`。

### Location

```ts
interface AiBookLocationV2 {
  id: string
  name: string
  aliases: string[]
  kind: string
  scale: 'world' | 'continent' | 'country' | 'region' | 'city' | 'district' | 'site' | 'building' | 'room' | 'unknown'
  parentId?: string
  description: string
  currentStatus?: string
  relatedCharacterIds: string[]
  firstSeenChapterIndex?: number
  lastSeenChapterIndex?: number
  evidence: AiBookEvidence[]
  mapHints?: {
    anchor?: string
    relativeTo?: string
    routeTo?: string[]
  }
}
```

地点层级只用 `parentId` 表达，不再依赖易丢失的 `parentName`。展示时再解析成名称。

### Evidence

```ts
interface AiBookEvidence {
  chapterIndex: number
  chapterTitle: string
  quote?: string
  note: string
}
```

证据片段限制长度。它的用途是让合并、纠错和用户信任有依据，不是保存全文。

### Map State

```ts
interface AiBookMapState {
  dirty: boolean
  reason?: string
  lastRenderedAt?: number
  sourceChapterIndex?: number
  mapPrompt?: string
  nodes: AiBookMapNode[]
  edges: AiBookMapEdge[]
}
```

地图节点来自 `locations`，边来自父子层级、路线、区域连接和重要人物移动。图片地图生成失败时，页面展示结构化地图图谱，而不是临时拼一个关系图。

```ts
interface AiBookMapNode {
  id: string
  locationId: string
  label: string
  scale: AiBookLocationV2['scale']
  parentNodeId?: string
  status?: string
}

interface AiBookMapEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  kind: 'contains' | 'route' | 'adjacent' | 'character-movement'
  label?: string
  evidence?: AiBookEvidence
}
```

`contains` 来自地点父子关系，`route` 和 `adjacent` 来自章节明确路线或区域边界，`character-movement` 只保留会影响地图理解的关键移动。

### Render Artifacts

```ts
interface AiBookRenderArtifacts {
  mapImageUrl?: string
  mapImagePrompt?: string
  mapFallbackReason?: string
}
```

图片、prompt、fallback 原因都是渲染产物，不参与知识合并。

## 生成流程

V2 更新一章时分三步：

1. Extract：模型读取当前章节和精简上下文，只输出 `ChapterKnowledgePatch`。
2. Reconcile：代码把 patch 合并进 V2 memory，执行去重、身份匹配、层级校验、重要性过滤。
3. Compact：达到阈值时生成或更新阶段摘要，刷新 `summary.current`。

### Extract Prompt

模型输出格式：

```ts
interface ChapterKnowledgePatch {
  chapterDigest: AiBookChapterDigest
  facts: Partial<AiBookWorldFact>[]
  characters: Partial<AiBookCharacterV2>[]
  relationships: Partial<AiBookRelationshipV2>[]
  locations: Partial<AiBookLocationV2>[]
  mapChanges: {
    changed: boolean
    reason?: string
    affectedLocationNames: string[]
    routeHints: string[]
  }
}
```

规则：

- 模型只抽取本章新增或本章确认的信息。
- 每个重要实体必须带证据。
- 不能输出未读信息。
- 不确定信息写成 `confidence: '推断'` 或放入 `openQuestions`。
- 低价值路人、寒暄关系、一次性地点默认不输出。

### Context Budget

每次模型调用只给：

- 当前章节正文，限制 24000 字符。
- 当前全局摘要。
- 最近 3-5 个 chapterDigests。
- 与本章标题/内容可能相关的角色、地点、关系摘要。
- 已有世界观标题列表和少量高重要条目。

不再把整份 memory 无脑塞给模型。

## 合并规则

### 身份匹配

合并实体时依次尝试：

1. patch 显式引用现有 `id`。
2. 名称与别名精确匹配。
3. 名称规范化匹配，例如空格、圆点、繁简符号差异。
4. 同名但阵营/位置/描述明显冲突时保留为新实体，并标记 `ambiguous`。

### 字段更新

- 当前状态、当前位置、lastSeen 用最新章节覆盖。
- description、world fact content 只在信息更完整时替换。
- confidence 从 `未知 -> 推断 -> 已知` 单向提升，除非后续证据明确推翻。
- importance 可以提升，降低需有明确原因。
- evidence 追加但限制每实体最多 5-8 条，优先保留 firstSeen、lastConfirmed、冲突修正证据。

### 关系去重

关系 key 使用：

```text
sourceId + targetKind + targetId + relationType + direction
```

不是简单按显示名称拼接。反向重复只在 `direction: 'undirected'` 时合并。

### 地点层级校验

地点 parent 必须满足 scale 大于子地点：

```text
world > continent > country > region > city > district > site > building > room
```

不满足时不保存 parent，改为在 `openQuestions` 或 evidence note 中记录“父级不确定”。

### 地图 dirty 判断

只有这些变化触发地图 dirty：

- 新增 high/medium 地点。
- 地点 parentId 或 scale 变化。
- 新增路线、区域边界、活动区域。
- 关键地点状态变化影响地图表达。

单纯人物状态、普通人物关系变化不触发地图重绘。

## 后端设计

### 存储

`ai_book_memories` 表可继续使用现有 JSON 列。后端改为保存 JSON value，避免未知字段丢失。

接口仍保留：

- `GET/POST /reader3/getAiBookMemory`
- `POST /reader3/saveAiBookMemory`
- `POST /reader3/deleteAiBookMemory`

保存时后端只校验：

- `bookUrl` 必须存在且匹配书架书籍。
- `schemaVersion` 缺失时按 V1 兼容。
- `updatedAt` 缺失或无效时补当前时间。
- `bookName`、`author` 缺失时从书架补齐。

### V1 兼容

读取旧数据时：

- 如果没有 `schemaVersion`，前端按 V1 展示。
- 页面提供“升级为 V2 / 重新生成 AI资料”动作。
- 不自动把 V1 粗暴迁移成 V2，避免把旧的错误层级和章节流水账固化。

### 可选后端合并

第一阶段合并可以继续放前端，减少后端改动。第二阶段再把 `reconcileAiBookMemoryV2` 移到共享逻辑或后端服务，解决多端并发更新和后台自动更新。

## 前端设计

### 页面信息架构

保留 5 个主 tab，但内容重排：

- 总览：当前局势、最近变化、未解问题、阶段摘要入口。
- 世界观：按 category 展示 worldFacts，支持重要性筛选和证据展开。
- 角色：角色卡片显示当前状态、阵营、位置、最近出现；详情展开状态时间线。
- 关系：关系图和关系列表共用稳定关系数据，支持按人物/重要性/关系类型过滤。
- 地图：优先展示结构化地点图；图片地图作为“生成图片地图”结果展示。
- 设置：保留模型配置，新增 V2 重建和压缩策略。

### 地图页

地图页分两层：

1. 结构化地图：由 `locations + mapState.nodes/edges` 渲染，稳定、可交互、可过滤。
2. 图片地图：由图片模型根据 `mapState` 生成，作为视觉增强。

图片生成失败不影响结构化地图使用。

### 状态反馈

更新过程中显示明确阶段：

- 正在抽取章节资料。
- 正在合并知识库。
- 正在压缩阶段摘要。
- 正在更新地图。
- 保存失败或模型失败。

错误信息写入 `lastError`，但不覆盖已成功保存的 memory。

## 文件边界

建议新增或重构：

```text
frontend/src/types/aiBook.ts
frontend/src/utils/aiBookV2Schema.ts
frontend/src/utils/aiBookV2Generation.ts
frontend/src/utils/aiBookV2Reconcile.ts
frontend/src/utils/aiBookV2Presentation.ts
frontend/src/utils/aiBookV2Map.ts
frontend/src/utils/aiBookV2Migration.ts
frontend/src/views/AiBookView.vue
src/model/ai_book.rs
src/service/ai_book_service.rs
src/api/handlers/ai_book.rs
```

`AiBookView.vue` 当前承担展示、设置、更新入口和部分 display normalize。V2 应把纯逻辑移到 utils，页面只负责状态和渲染。

## 实施阶段

### 阶段 1：止血与兼容

- 后端保存 JSON value，修复字段丢失。
- 补齐 Rust V1 字段或改为透明 JSON round-trip。
- 增加后端 round-trip 测试，覆盖 `category`、`importance`、`parentName`、`fallbackReason`。
- 前端读取时保留 V1 展示。

### 阶段 2：V2 schema 与前端合并器

- 新增 V2 类型和空 memory 创建函数。
- 新增 `ChapterKnowledgePatch` prompt。
- 实现 `reconcileAiBookMemoryV2`。
- 增加合并单测：人物别名、关系方向、地点层级、世界观去章节化、地图 dirty。

### 阶段 3：页面 V2 展示

- 总览改为全局局势 + 最近变化 + 未解问题。
- 世界观改读 `worldFacts`。
- 角色页显示状态时间线。
- 关系页改用稳定 ID。
- 地图页先渲染结构化图，再接图片地图产物。

### 阶段 4：压缩与重建

- 每 N 章生成或更新 arc summary。
- 新增“从第 1 章重建 V2 AI资料”和“从当前章节继续”。
- 对旧 V1 memory 提供只读兼容和一键重建。

## 测试策略

后端：

- `saveAiBookMemory` 对未知 JSON 字段 round-trip 不丢失。
- `bookUrl` 缺失、错书、非书架书仍拒绝。
- V1 memory 读取仍能返回。

前端单测：

- Extract prompt 不直接包含未通过工具读取的章节正文。
- V2 patch 合并能保留证据和稳定 ID。
- 同一角色别名合并，冲突同名不误合并。
- 有向关系不被反向吞掉，无向关系能去重。
- 地点 parent scale 校验阻止城市挂到建筑下。
- 世界观过滤章节流水账。
- 地图 dirty 只由地点结构变化触发。

构建验证：

- `cd frontend && npm run build`
- `cargo test`

## 风险

- V2 schema 变大，长篇书籍 JSON 会增长。需要限制 evidence 数量和阶段摘要数量。
- 前端合并器复杂度上升。必须用纯函数和单测兜住。
- 模型不稳定仍会输出脏 patch。代码层要拒绝低置信、低重要、缺证据的关键实体。
- 旧 V1 数据质量参差，不适合自动迁移成 V2。默认重建更稳。
- 地图图片仍受图片模型能力影响。结构化地图必须作为主可用路径。

## 验收标准

- 保存 AI资料后，`category`、`importance`、`parentId/parentName`、地图 fallback 信息不丢。
- 连续更新 50 章后，总览不是最近一章摘要，而是已读全局局势。
- 世界观条目不出现“本章/第 X 章/剧情经过”类标题。
- 主要角色不会因别名重复成多个卡片。
- 关系图不会出现大量反向重复和低价值“认识/相关”边。
- 地点树不会出现国家挂城市下、城市挂建筑下的层级错误。
- 图片地图生成失败时，结构化地图仍可用。
- 旧 V1 资料仍能打开，且用户能选择重建 V2。
