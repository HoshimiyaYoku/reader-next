use serde::{Deserialize, Serialize};

// ============================================
// World Map Spec V2 - 结构化地图规格书
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapSpec {
    pub metadata: WorldMapMetadata,
    pub entities: Vec<WorldMapEntity>,
    pub relations: Vec<WorldMapRelation>,
    pub routes: Vec<WorldMapRoute>,
    pub factions: Vec<WorldMapFaction>,
    pub constraints: WorldMapConstraints,
    pub conflicts: Vec<WorldMapConflict>,
    pub coordinates: Option<WorldMapCoordinates>,
    #[serde(alias = "reviewItems")]
    pub review_items: Vec<WorldMapReviewItem>,
    pub statistics: WorldMapStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "snake_case")]
pub struct WorldMapMetadata {
    #[serde(alias = "sourceType")]
    pub source_type: String,
    #[serde(alias = "novelTitle")]
    pub novel_title: String,
    #[serde(alias = "allowLaterChapterInfo")]
    pub allow_later_chapter_info: bool,
    #[serde(alias = "startChapter")]
    pub start_chapter: i32,
    #[serde(alias = "endChapter")]
    pub end_chapter: i32,
    #[serde(alias = "specVersion")]
    pub spec_version: String,
    #[serde(alias = "analysisDate")]
    pub analysis_date: String,
    pub notes: Option<String>,
    #[serde(alias = "createdAt")]
    pub created_at: i64,
    #[serde(alias = "updatedAt")]
    pub updated_at: i64,
    #[serde(alias = "totalEntities")]
    pub total_entities: usize,
    #[serde(alias = "totalRelations")]
    pub total_relations: usize,
}

impl Default for WorldMapMetadata {
    fn default() -> Self {
        Self {
            source_type: "ai_memory".to_string(),
            novel_title: String::new(),
            allow_later_chapter_info: false,
            start_chapter: 0,
            end_chapter: 0,
            spec_version: "2.0".to_string(),
            analysis_date: String::new(),
            notes: None,
            created_at: 0,
            updated_at: 0,
            total_entities: 0,
            total_relations: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "snake_case")]
pub struct WorldMapEntity {
    pub id: String,
    #[serde(alias = "canonicalName")]
    pub canonical_name: String,
    pub aliases: Vec<String>,
    #[serde(alias = "entityType")]
    pub entity_type: EntityType,
    pub subtype: Option<String>,
    #[serde(alias = "firstChapter")]
    pub first_chapter: i32,
    pub evidence: Evidence,
    pub description: Option<String>,
    #[serde(alias = "factionId")]
    pub faction_id: Option<String>,
    #[serde(alias = "relatedEntityIds")]
    pub related_entity_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EntityType {
    Settlement,  // 聚落
    Region,      // 政治区域
    Terrain,     // 地形
    Water,       // 水系
    Transit,     // 交通节点
    Fantasy,     // 超自然区域
}

impl Default for EntityType {
    fn default() -> Self {
        Self::Settlement
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "snake_case")]
pub struct Evidence {
    pub level: EvidenceLevel,
    pub chapter: i32,
    pub quote: String,
    pub context: Option<String>,
}

impl Default for Evidence {
    fn default() -> Self {
        Self {
            level: EvidenceLevel::Unknown,
            chapter: 0,
            quote: String::new(),
            context: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum EvidenceLevel {
    A,         // 原文直接说明
    B,         // 原文明显暗示
    C,         // 多条信息共同约束
    #[serde(alias = "unknown", alias = "UNKNOWN")]
    Unknown,   // 原文未说明
    #[serde(alias = "conflict", alias = "CONFLICT")]
    Conflict,  // 原文存在冲突
}

impl Default for EvidenceLevel {
    fn default() -> Self {
        Self::Unknown
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapRelation {
    pub id: String,
    #[serde(alias = "fromId")]
    pub from_id: String,
    #[serde(alias = "toId")]
    pub to_id: String,
    #[serde(alias = "relationType")]
    pub relation_type: RelationType,
    pub direction: Option<Direction>,
    pub bidirectional: bool,
    pub evidence: Evidence,
    #[serde(alias = "constraintType")]
    pub constraint_type: ConstraintType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RelationType {
    Direction,  // 方位关系
    Nearby,     // 邻接
    Contains,   // 包含
    Blocks,     // 阻隔
    Route,      // 路径
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    North,
    South,
    East,
    West,
    Northeast,
    Northwest,
    Southeast,
    Southwest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConstraintType {
    Hard,  // 不可违反
    Soft,  // 辅助布局
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapRoute {
    pub id: String,
    #[serde(alias = "fromId")]
    pub from_id: String,
    #[serde(alias = "toId")]
    pub to_id: String,
    #[serde(alias = "transportMode")]
    pub transport_mode: Option<String>,
    pub distance: Option<f64>,
    pub time: Option<String>,
    pub via: Vec<String>,
    pub blocks: Vec<String>,
    #[serde(alias = "isTradeRoute")]
    pub is_trade_route: bool,
    pub evidence: Evidence,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapFaction {
    pub id: String,
    pub name: String,
    #[serde(alias = "factionType")]
    pub faction_type: String,
    #[serde(alias = "coreEntities")]
    pub core_entities: Vec<String>,
    #[serde(alias = "controlledEntities")]
    pub controlled_entities: Vec<String>,
    #[serde(alias = "influenceEntities")]
    pub influence_entities: Vec<String>,
    pub borders: Vec<String>,
    pub evidence: Evidence,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapConstraints {
    pub hard: Vec<Constraint>,
    pub soft: Vec<Constraint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct Constraint {
    pub id: String,
    #[serde(alias = "constraintType")]
    pub constraint_type: String,
    pub entities: Vec<String>,
    pub description: String,
    pub evidence: Evidence,
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapConflict {
    pub id: String,
    pub entities: Vec<String>,
    #[serde(alias = "infoA")]
    pub info_a: String,
    #[serde(alias = "infoB")]
    pub info_b: String,
    #[serde(alias = "evidenceA")]
    pub evidence_a: Evidence,
    #[serde(alias = "evidenceB")]
    pub evidence_b: Evidence,
    #[serde(alias = "resolutionHint")]
    pub resolution_hint: ResolutionHint,
    pub reason: String,
    pub status: ConflictStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum ResolutionHint {
    #[serde(alias = "prefera")]
    PreferA,       // 倾向A
    #[serde(alias = "preferb")]
    PreferB,       // 倾向B
    #[serde(alias = "ignoreboth")]
    IgnoreBoth,    // 忽略两者
    #[serde(alias = "unresolvable")]
    Unresolvable,  // 无法解决
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum ConflictStatus {
    #[serde(alias = "resolved")]
    Resolved,
    #[serde(alias = "unresolved")]
    Unresolved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorldMapCoordinates {
    pub status: CoordinateStatus,
    pub reason: Option<String>,
    pub placed: Vec<PlacedEntity>,
    pub unplaced: Vec<UnplacedEntity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum CoordinateStatus {
    #[serde(alias = "feasible")]
    Feasible,  // 可生成完整地图
    #[serde(alias = "partial")]
    Partial,   // 部分地点可定位
    #[serde(alias = "blocked")]
    Blocked,   // 无法生成地图
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct PlacedEntity {
    #[serde(alias = "entityId")]
    pub entity_id: String,
    pub x: f64,
    pub y: f64,
    pub confidence: CoordinateConfidence,
    #[serde(alias = "constraintsSatisfied")]
    pub constraints_satisfied: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum CoordinateConfidence {
    #[serde(alias = "fixed")]
    Fixed,       // 硬约束确定
    #[serde(alias = "relative")]
    Relative,    // 相对位置
    #[serde(alias = "tentative")]
    Tentative,   // 临时布局
    #[serde(alias = "forbidden")]
    Forbidden,   // 信息不足
    #[serde(alias = "unresolved")]
    Unresolved,  // 存在冲突
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct UnplacedEntity {
    #[serde(alias = "entityId")]
    pub entity_id: String,
    pub reason: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "snake_case")]
pub struct WorldMapReviewItem {
    pub id: String,
    #[serde(alias = "itemType")]
    pub item_type: ReviewItemType,
    pub severity: Severity,
    #[serde(alias = "entities", alias = "involvedEntities")]
    pub involved_entities: Vec<String>,
    pub issue: String,
    #[serde(alias = "aiSuggestion")]
    pub ai_suggestion: String,
    pub confidence: f64,
    pub evidence: Evidence,
    #[serde(alias = "estimatedReviewTimeMinutes")]
    pub estimated_review_time_minutes: usize,
    #[serde(alias = "needsHumanJudgment")]
    pub needs_human_judgment: bool,
}

impl Default for WorldMapReviewItem {
    fn default() -> Self {
        Self {
            id: String::new(),
            item_type: ReviewItemType::Conflict,
            severity: Severity::Low,
            involved_entities: vec![],
            issue: String::new(),
            ai_suggestion: String::new(),
            confidence: 0.0,
            evidence: Evidence::default(),
            estimated_review_time_minutes: 3,
            needs_human_judgment: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum ReviewItemType {
    #[serde(alias = "conflict")]
    Conflict,           // 冲突
    #[serde(alias = "uncertainposition")]
    UncertainPosition,  // 位置不确定
    #[serde(alias = "criticalerror")]
    CriticalError,      // 严重错误
}

impl Default for ReviewItemType {
    fn default() -> Self {
        Self::Conflict
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum Severity {
    #[serde(alias = "high")]
    High,
    #[serde(alias = "medium")]
    Medium,
    #[serde(alias = "low")]
    Low,
}

impl Default for Severity {
    fn default() -> Self {
        Self::Low
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "snake_case")]
pub struct WorldMapStatistics {
    #[serde(alias = "totalEntities")]
    pub total_entities: usize,
    #[serde(alias = "totalRelations")]
    pub total_relations: usize,
    #[serde(alias = "totalRoutes")]
    pub total_routes: usize,
    #[serde(alias = "totalFactions")]
    pub total_factions: usize,
    #[serde(alias = "totalHardConstraints")]
    pub total_hard_constraints: usize,
    #[serde(alias = "totalSoftConstraints")]
    pub total_soft_constraints: usize,
    #[serde(alias = "totalConflicts")]
    pub total_conflicts: usize,
    #[serde(alias = "totalReviewItems")]
    pub total_review_items: usize,
    #[serde(alias = "totalIssues")]
    pub total_issues: usize,
    #[serde(alias = "autoResolved")]
    pub auto_resolved: usize,
    #[serde(alias = "needHuman")]
    pub need_human: usize,
    #[serde(alias = "automationRate")]
    pub automation_rate: f64,
    #[serde(alias = "coordinateCoverageRate")]
    pub coordinate_coverage_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_public_contract_as_snake_case() {
        let spec = WorldMapSpec {
            metadata: WorldMapMetadata {
                source_type: "ai_memory".to_string(),
                novel_title: "测试小说".to_string(),
                allow_later_chapter_info: false,
                start_chapter: 1,
                end_chapter: 2,
                spec_version: "2.0".to_string(),
                analysis_date: "2026-06-16".to_string(),
                notes: None,
                created_at: 1,
                updated_at: 2,
                total_entities: 1,
                total_relations: 1,
            },
            entities: vec![WorldMapEntity {
                id: "loc-1".to_string(),
                canonical_name: "北境".to_string(),
                aliases: vec!["北方边境".to_string()],
                entity_type: EntityType::Region,
                subtype: Some("区域".to_string()),
                first_chapter: 1,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 1,
                    quote: "林舟抵达北境。".to_string(),
                    context: None,
                },
                description: Some("寒冷边境。".to_string()),
                faction_id: None,
                related_entity_ids: vec!["loc-2".to_string()],
            }],
            relations: vec![WorldMapRelation {
                id: "rel-1".to_string(),
                from_id: "loc-1".to_string(),
                to_id: "loc-2".to_string(),
                relation_type: RelationType::Contains,
                direction: None,
                bidirectional: false,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 1,
                    quote: "北境包含旧村。".to_string(),
                    context: None,
                },
                constraint_type: ConstraintType::Hard,
            }],
            routes: vec![],
            factions: vec![],
            constraints: WorldMapConstraints::default(),
            conflicts: vec![],
            coordinates: Some(WorldMapCoordinates {
                status: CoordinateStatus::Feasible,
                reason: None,
                placed: vec![PlacedEntity {
                    entity_id: "loc-1".to_string(),
                    x: 50.0,
                    y: 50.0,
                    confidence: CoordinateConfidence::Relative,
                    constraints_satisfied: vec!["rel-1".to_string()],
                }],
                unplaced: vec![],
            }),
            review_items: vec![],
            statistics: WorldMapStatistics {
                total_entities: 1,
                total_relations: 1,
                total_routes: 0,
                total_factions: 0,
                total_hard_constraints: 0,
                total_soft_constraints: 0,
                total_conflicts: 0,
                total_review_items: 0,
                total_issues: 0,
                auto_resolved: 0,
                need_human: 0,
                automation_rate: 1.0,
                coordinate_coverage_rate: 1.0,
            },
        };

        let value = serde_json::to_value(&spec).unwrap();
        assert!(value.get("review_items").is_some());
        assert!(value.get("reviewItems").is_none());
        assert!(value["metadata"].get("novel_title").is_some());
        assert!(value["entities"][0].get("canonical_name").is_some());
        assert!(value["entities"][0].get("entity_type").is_some());
        assert!(value["relations"][0].get("from_id").is_some());
        assert!(value["coordinates"]["placed"][0].get("entity_id").is_some());
        assert!(value["coordinates"]["placed"][0].get("constraints_satisfied").is_some());
        assert!(value["statistics"].get("automation_rate").is_some());
    }

    #[test]
    fn deserializes_previous_camel_case_storage_contract() {
        let spec: WorldMapSpec = serde_json::from_value(serde_json::json!({
            "metadata": {
                "sourceType": "mock",
                "novelTitle": "旧地图",
                "allowLaterChapterInfo": false,
                "startChapter": 1,
                "endChapter": 2,
                "specVersion": "2.0",
                "analysisDate": "2026-06-16",
                "createdAt": 1,
                "updatedAt": 2,
                "totalEntities": 1,
                "totalRelations": 0
            },
            "entities": [{
                "id": "E001",
                "canonicalName": "阿尔托",
                "aliases": [],
                "entityType": "settlement",
                "subtype": "city",
                "firstChapter": 1,
                "evidence": { "level": "A", "chapter": 1, "quote": "到达阿尔托", "context": null },
                "description": null,
                "factionId": null,
                "relatedEntityIds": []
            }],
            "relations": [],
            "routes": [],
            "factions": [],
            "constraints": { "hard": [], "soft": [] },
            "conflicts": [],
            "coordinates": {
                "status": "Feasible",
                "reason": null,
                "placed": [{
                    "entityId": "E001",
                    "x": 50.0,
                    "y": 50.0,
                    "confidence": "Relative",
                    "constraintsSatisfied": []
                }],
                "unplaced": []
            },
            "reviewItems": [],
            "statistics": {
                "totalEntities": 1,
                "totalRelations": 0,
                "totalRoutes": 0,
                "totalFactions": 0,
                "totalHardConstraints": 0,
                "totalSoftConstraints": 0,
                "totalConflicts": 0,
                "totalReviewItems": 0,
                "totalIssues": 0,
                "autoResolved": 0,
                "needHuman": 0,
                "automationRate": 1.0,
                "coordinateCoverageRate": 1.0
            }
        })).unwrap();

        assert_eq!(spec.metadata.novel_title, "旧地图");
        assert_eq!(spec.entities[0].canonical_name, "阿尔托");
        assert_eq!(spec.coordinates.unwrap().placed[0].entity_id, "E001");
        assert_eq!(spec.statistics.coordinate_coverage_rate, 1.0);
    }
}
