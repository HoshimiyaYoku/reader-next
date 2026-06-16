// 世界地图类型定义（与后端 WorldMapSpec wire contract 对齐：snake_case）

export interface WorldMapMetadata {
  source_type: string
  novel_title: string
  allow_later_chapter_info: boolean
  start_chapter: number
  end_chapter: number
  spec_version: string
  analysis_date: string
  notes?: string | null
  created_at?: number
  updated_at?: number
  total_entities?: number
  total_relations?: number
}

export interface WorldMapEntity {
  id: string
  canonical_name: string
  aliases: string[]
  entity_type: EntityType
  subtype?: string | null
  first_chapter: number
  evidence: Evidence
  description?: string | null
  faction_id?: string | null
  related_entity_ids: string[]
}

export interface WorldMapRelation {
  id: string
  from_id: string
  to_id: string
  relation_type: RelationType
  direction?: Direction | null
  bidirectional: boolean
  evidence: Evidence
  constraint_type: ConstraintType
}

export interface WorldMapRoute {
  id: string
  from_id: string
  to_id: string
  transport_mode?: string | null
  distance?: number | null
  time?: string | null
  via: string[]
  blocks: string[]
  is_trade_route: boolean
  evidence: Evidence
}

export interface WorldMapFaction {
  id: string
  name: string
  faction_type: string
  core_entities: string[]
  controlled_entities: string[]
  influence_entities: string[]
  borders: string[]
  evidence: Evidence
}

export interface WorldMapConstraints {
  hard: Constraint[]
  soft: Constraint[]
}

export interface Constraint {
  id: string
  constraint_type: string
  entities: string[]
  description: string
  evidence: Evidence
  priority: number
}

export interface WorldMapConflict {
  id: string
  entities: string[]
  info_a: string
  info_b: string
  evidence_a: Evidence
  evidence_b: Evidence
  resolution_hint: ResolutionHint
  reason: string
  status: ConflictStatus
}

export interface WorldMapCoordinates {
  status: CoordinateStatus
  reason?: string | null
  placed: PlacedEntity[]
  unplaced: UnplacedEntity[]
}

export interface PlacedEntity {
  entity_id: string
  x: number
  y: number
  confidence: CoordinateConfidence
  constraints_satisfied: string[]
}

export interface UnplacedEntity {
  entity_id: string
  reason: string
  confidence: number
}

export interface WorldMapReviewItem {
  id: string
  item_type: ReviewItemType
  severity: ReviewSeverity
  involved_entities: string[]
  issue: string
  ai_suggestion?: string
  evidence: Evidence
  confidence: number
  estimated_review_time_minutes: number
  needs_human_judgment: boolean
}

export interface WorldMapStatistics {
  total_entities: number
  total_relations: number
  total_routes: number
  total_factions: number
  total_hard_constraints: number
  total_soft_constraints: number
  total_conflicts: number
  total_review_items: number
  total_issues?: number
  auto_resolved?: number
  need_human?: number
  automation_rate: number
  coordinate_coverage_rate: number
}

export interface WorldMapSpec {
  metadata: WorldMapMetadata
  entities: WorldMapEntity[]
  relations: WorldMapRelation[]
  routes: WorldMapRoute[]
  factions: WorldMapFaction[]
  constraints: WorldMapConstraints
  conflicts: WorldMapConflict[]
  coordinates?: WorldMapCoordinates | null
  review_items: WorldMapReviewItem[]
  statistics: WorldMapStatistics
}

export interface Evidence {
  level: EvidenceLevel
  chapter: number
  quote: string
  context?: string | null
}

export type EntityType = 'settlement' | 'region' | 'terrain' | 'water' | 'transit' | 'fantasy'
export type EvidenceLevel = 'A' | 'B' | 'C' | 'Unknown' | 'Conflict'
export type RelationType = 'direction' | 'nearby' | 'contains' | 'blocks' | 'route'
export type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest'
export type ConstraintType = 'hard' | 'soft'
export type ResolutionHint = 'PreferA' | 'PreferB' | 'IgnoreBoth' | 'Unresolvable'
export type ConflictStatus = 'Resolved' | 'Unresolved'
export type CoordinateConfidence = 'Fixed' | 'Relative' | 'Tentative' | 'Forbidden' | 'Unresolved'
export type CoordinateStatus = 'Feasible' | 'Partial' | 'Blocked'
export type ReviewItemType = 'Conflict' | 'UncertainPosition' | 'CriticalError'
export type ReviewSeverity = 'High' | 'Medium' | 'Low'

// API Request/Response types
export interface BuildWorldMapRequest {
  book_url: string
  novel_title: string
}

export interface SaveWorldMapRequest {
  book_url: string
  spec: WorldMapSpec
}

export interface UpdateWorldMapRequest {
  book_url: string
  end_chapter: number
}

export interface UpdateWorldMapResponse {
  spec: WorldMapSpec
  added_entities: number
  added_relations: number
}

export interface GenerateCoordinatesRequest {
  book_url: string
}

export interface ResolveReviewRequest {
  book_url: string
  item_id: string
  resolution: 'accept' | 'skip' | string
  comment?: string
}
