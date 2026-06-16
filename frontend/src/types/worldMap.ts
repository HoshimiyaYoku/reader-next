// 世界地图类型定义

export interface WorldMapMetadata {
  novel_title: string
  source_type: string
  start_chapter: number
  end_chapter: number
  allow_later_chapter_info: boolean
  spec_version: string
  analysis_date: string
  notes?: string
}

export interface WorldMapEntity {
  id: string
  canonical_name: string
  aliases: string[]
  entity_type: string
  sub_type?: string
  faction_id?: string
  geographic_features?: string
  description?: string
  first_appearance_chapter?: number
  related_regions: string[]
  has_explicit_spatial_relations: boolean
  has_explicit_distance_relations: boolean
  evidence_level: EvidenceLevel
  evidence: Evidence
  notes?: string
}

export interface WorldMapRelation {
  id: string
  from_id: string
  to_id: string
  relation_type: RelationType
  direction?: Direction
  is_directional: boolean
  is_reversible: boolean
  evidence: Evidence
  first_appearance_chapter?: number
  notes?: string
}

export interface WorldMapRoute {
  id: string
  start_id: string
  end_id: string
  transport_method?: string
  duration?: string
  distance?: string
  waypoints: string[]
  obstacles: string[]
  is_regular_route: boolean
  is_dangerous: boolean
  is_trade_route: boolean
  evidence: Evidence
  notes?: string
}

export interface WorldMapFaction {
  id: string
  name: string
  faction_type: string
  core_regions: string[]
  controlled_regions: string[]
  borders: string[]
  influence_zones: string[]
  important_cities: string[]
  transport_hubs: string[]
  borders_with_other_factions: string[]
  conflicts_with: string[]
  evidence: Evidence
  uncertain_regions: string[]
}

export interface WorldMapConstraints {
  hard: Constraint[]
  soft: Constraint[]
  unknown_areas: UnknownArea[]
  forbidden_inferences: ForbiddenInference[]
}

export interface Constraint {
  id: string
  description: string
  involved_entities: string[]
  constraint_type: string
  evidence: Evidence
  impact_on_map?: string
}

export interface UnknownArea {
  id: string
  subject: string
  unknown_content: string
  why_unknown: string
  allow_speculation: boolean
  required_evidence?: string
}

export interface ForbiddenInference {
  id: string
  forbidden_content: string
  easy_to_misinterpret_reason: string
  correct_handling: string
}

export interface WorldMapConflict {
  id: string
  involved_entities: string[]
  conflict_info_a: string
  conflict_info_b: string
  evidence_a: Evidence
  evidence_b: Evidence
  conflict_type: string
  impact_scope: string
  current_handling: ConflictHandling
  allow_coordinate_draft: boolean
}

export interface WorldMapCoordinates {
  placed: PlacedEntity[]
  unplaced: UnplacedEntity[]
  status: CoordinateStatus
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
  issue: string
  involved_entities: string[]
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
  coordinates?: WorldMapCoordinates
  review_items: WorldMapReviewItem[]
  statistics: WorldMapStatistics
}

export interface Evidence {
  chapter?: number
  quote_or_summary: string
  source_context?: string
  evidence_level: EvidenceLevel
}

// Enums
export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'Conflict' | 'Unknown'
export type RelationType = 'Directional' | 'Adjacent' | 'Contains' | 'Blocks' | 'Path'
export type Direction = 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Northwest' | 'Southeast' | 'Southwest'
export type CoordinateConfidence = 'Fixed' | 'Relative' | 'Tentative' | 'Forbidden' | 'Unresolved'
export type CoordinateStatus = 'Feasible' | 'Partial' | 'Blocked'
export type ConflictHandling = 'Unresolved' | 'PreferA' | 'PreferB' | 'Merge' | 'NeedHuman'
export type ReviewItemType = 'Conflict' | 'LowConfidence' | 'MissingRelation' | 'Ambiguity' | 'Inconsistency'
export type ReviewSeverity = 'Critical' | 'High' | 'Medium' | 'Low'

// API Request/Response types
export interface BuildWorldMapRequest {
  book_url: string
  novel_title: string
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
  resolution: string
  comment?: string
}
