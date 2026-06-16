use std::collections::HashMap;

use crate::model::world_map::*;

/// 推理引擎 - 自动解决冲突和推理位置
pub struct WorldMapInferenceEngine;

impl WorldMapInferenceEngine {
    pub fn new() -> Self {
        Self
    }

    /// 自动解决冲突（MVP: 只实现前3条规则）
    pub fn resolve_conflict(
        &self,
        conflict: &WorldMapConflict,
        _context: &InferenceContext,
    ) -> ConflictResolution {
        // 规则1: 后文优先（chapter_B > chapter_A + 50）
        if conflict.evidence_b.chapter > conflict.evidence_a.chapter + 50 {
            return ConflictResolution {
                resolution_hint: ResolutionHint::PreferB,
                reason: format!(
                    "后文优先：第{}章距离第{}章超过50章，可能是作者修正了设定",
                    conflict.evidence_b.chapter,
                    conflict.evidence_a.chapter
                ),
                confidence: 0.75,
                need_human: false,
            };
        }

        // 规则2: 详细描述优先（len(quote_B) > 2 * len(quote_A)）
        let len_a = conflict.evidence_a.quote.len();
        let len_b = conflict.evidence_b.quote.len();
        
        if len_b > len_a * 2 {
            return ConflictResolution {
                resolution_hint: ResolutionHint::PreferB,
                reason: format!(
                    "详细优先：B的描述长度({})是A({})的2倍以上，更详细的描述更可信",
                    len_b, len_a
                ),
                confidence: 0.70,
                need_human: false,
            };
        }

        if len_a > len_b * 2 {
            return ConflictResolution {
                resolution_hint: ResolutionHint::PreferA,
                reason: format!(
                    "详细优先：A的描述长度({})是B({})的2倍以上，更详细的描述更可信",
                    len_a, len_b
                ),
                confidence: 0.70,
                need_human: false,
            };
        }

        // 规则3: 精确方位优先
        let precision_a = self.direction_precision(&conflict.info_a);
        let precision_b = self.direction_precision(&conflict.info_b);

        if precision_b > precision_a {
            return ConflictResolution {
                resolution_hint: ResolutionHint::PreferB,
                reason: format!(
                    "精确方位优先：B的方位描述更精确（{}级 vs {}级）",
                    precision_b, precision_a
                ),
                confidence: 0.75,
                need_human: false,
            };
        }

        if precision_a > precision_b {
            return ConflictResolution {
                resolution_hint: ResolutionHint::PreferA,
                reason: format!(
                    "精确方位优先：A的方位描述更精确（{}级 vs {}级）",
                    precision_a, precision_b
                ),
                confidence: 0.75,
                need_human: false,
            };
        }

        // 无法自动解决
        ConflictResolution {
            resolution_hint: ResolutionHint::Unresolvable,
            reason: "无法自动判断，需要人工确认".to_string(),
            confidence: 0.40,
            need_human: true,
        }
    }

    /// 批量解决冲突
    pub fn resolve_all_conflicts(
        &self,
        conflicts: &[WorldMapConflict],
        context: &InferenceContext,
    ) -> Vec<(WorldMapConflict, ConflictResolution)> {
        conflicts
            .iter()
            .map(|conflict| {
                let resolution = self.resolve_conflict(conflict, context);
                (conflict.clone(), resolution)
            })
            .collect()
    }

    /// 位置推理（MVP: 简化版，只实现名称暗示）
    pub fn infer_position(
        &self,
        entity: &WorldMapEntity,
        _context: &InferenceContext,
    ) -> PositionInference {
        let mut reasoning = Vec::new();
        let mut total_confidence = 0.0;
        let mut count = 0;

        // 策略1: 名称暗示
        if let Some(direction) = self.infer_from_name(&entity.canonical_name) {
            reasoning.push(ReasoningStep {
                strategy: "name_hint".to_string(),
                confidence: 0.50,
                description: format!("名称\"{}\"包含方位词，暗示在{}方", entity.canonical_name, direction_zh(&direction)),
            });
            total_confidence += 0.50;
            count += 1;

            return PositionInference {
                entity_id: entity.id.clone(),
                inferred_direction: Some(direction),
                confidence: total_confidence / count as f64,
                reasoning,
            };
        }

        // 无法推理
        PositionInference {
            entity_id: entity.id.clone(),
            inferred_direction: None,
            confidence: 0.0,
            reasoning: vec![
                ReasoningStep {
                    strategy: "no_clue".to_string(),
                    confidence: 0.0,
                    description: "无法从现有信息推理位置".to_string(),
                }
            ],
        }
    }

    /// 计算置信度（基于证据等级）
    pub fn compute_confidence(&self, evidence: &Evidence) -> f64 {
        match evidence.level {
            EvidenceLevel::A => 0.95,
            EvidenceLevel::B => 0.75,
            EvidenceLevel::C => 0.60,
            EvidenceLevel::Unknown => 0.20,
            EvidenceLevel::Conflict => 0.10,
        }
    }

    // ========== 内部辅助方法 ==========

    /// 判断方位描述的精确度
    fn direction_precision(&self, text: &str) -> u8 {
        // 3级: 复合方向（东北、西南等）
        if text.contains("东北") || text.contains("西北") || text.contains("东南") || text.contains("西南") {
            return 3;
        }

        // 2级: 单一方向（东、南、西、北）
        if text.contains("东") || text.contains("南") || text.contains("西") || text.contains("北") {
            return 2;
        }

        // 1级: 模糊方位（远方、附近等）
        if text.contains("远方") || text.contains("附近") || text.contains("附近") {
            return 1;
        }

        // 0级: 无方位信息
        0
    }

    /// 从名称推断方位
    fn infer_from_name(&self, name: &str) -> Option<Direction> {
        if name.contains("东") {
            return Some(Direction::East);
        }
        if name.contains("南") {
            return Some(Direction::South);
        }
        if name.contains("西") {
            return Some(Direction::West);
        }
        if name.contains("北") {
            return Some(Direction::North);
        }
        None
    }
}

/// 推理上下文
pub struct InferenceContext {
    pub entities: HashMap<String, WorldMapEntity>,
    pub relations: Vec<WorldMapRelation>,
}

impl InferenceContext {
    pub fn new(entities: Vec<WorldMapEntity>, relations: Vec<WorldMapRelation>) -> Self {
        let entity_map = entities
            .into_iter()
            .map(|e| (e.id.clone(), e))
            .collect();

        Self {
            entities: entity_map,
            relations,
        }
    }
}

/// 冲突解决结果
#[derive(Debug, Clone)]
pub struct ConflictResolution {
    pub resolution_hint: ResolutionHint,
    pub reason: String,
    pub confidence: f64,
    pub need_human: bool,
}

/// 位置推理结果
#[derive(Debug, Clone)]
pub struct PositionInference {
    pub entity_id: String,
    pub inferred_direction: Option<Direction>,
    pub confidence: f64,
    pub reasoning: Vec<ReasoningStep>,
}

/// 推理步骤
#[derive(Debug, Clone)]
pub struct ReasoningStep {
    pub strategy: String,
    pub confidence: f64,
    pub description: String,
}

// ========== 辅助函数 ==========

fn direction_zh(direction: &Direction) -> &'static str {
    match direction {
        Direction::North => "北",
        Direction::South => "南",
        Direction::East => "东",
        Direction::West => "西",
        Direction::Northeast => "东北",
        Direction::Northwest => "西北",
        Direction::Southeast => "东南",
        Direction::Southwest => "西南",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_conflict_later_chapter() {
        let engine = WorldMapInferenceEngine::new();
        let context = InferenceContext::new(vec![], vec![]);

        let conflict = WorldMapConflict {
            id: "C001".to_string(),
            entities: vec!["E001".to_string(), "E002".to_string()],
            info_a: "第10章：X在Y南方".to_string(),
            info_b: "第70章：X在Y北方".to_string(),
            evidence_a: Evidence {
                level: EvidenceLevel::A,
                chapter: 10,
                quote: "...".to_string(),
                context: None,
            },
            evidence_b: Evidence {
                level: EvidenceLevel::A,
                chapter: 70,
                quote: "...".to_string(),
                context: None,
            },
            resolution_hint: ResolutionHint::Unresolvable,
            reason: String::new(),
            status: ConflictStatus::Unresolved,
        };

        let resolution = engine.resolve_conflict(&conflict, &context);
        
        assert!(matches!(resolution.resolution_hint, ResolutionHint::PreferB));
        assert_eq!(resolution.confidence, 0.75);
        assert!(!resolution.need_human);
    }

    #[test]
    fn test_resolve_conflict_more_detailed() {
        let engine = WorldMapInferenceEngine::new();
        let context = InferenceContext::new(vec![], vec![]);

        let conflict = WorldMapConflict {
            id: "C002".to_string(),
            entities: vec!["E001".to_string(), "E002".to_string()],
            info_a: "短".to_string(),
            info_b: "这是一个非常详细的描述，包含了很多具体的细节信息".to_string(),
            evidence_a: Evidence {
                level: EvidenceLevel::A,
                chapter: 10,
                quote: "短".to_string(),
                context: None,
            },
            evidence_b: Evidence {
                level: EvidenceLevel::A,
                chapter: 15,
                quote: "这是一个非常详细的描述，包含了很多具体的细节信息".to_string(),
                context: None,
            },
            resolution_hint: ResolutionHint::Unresolvable,
            reason: String::new(),
            status: ConflictStatus::Unresolved,
        };

        let resolution = engine.resolve_conflict(&conflict, &context);
        
        assert!(matches!(resolution.resolution_hint, ResolutionHint::PreferB));
        assert_eq!(resolution.confidence, 0.70);
        assert!(!resolution.need_human);
    }

    #[test]
    fn test_infer_position_from_name() {
        let engine = WorldMapInferenceEngine::new();
        let context = InferenceContext::new(vec![], vec![]);

        let entity = WorldMapEntity {
            id: "E001".to_string(),
            canonical_name: "东境城".to_string(),
            aliases: vec![],
            entity_type: EntityType::Settlement,
            subtype: Some("city".to_string()),
            first_chapter: 1,
            evidence: Evidence {
                level: EvidenceLevel::A,
                chapter: 1,
                quote: "...".to_string(),
                context: None,
            },
            description: None,
            faction_id: None,
            related_entity_ids: vec![],
        };

        let inference = engine.infer_position(&entity, &context);
        
        assert!(inference.inferred_direction.is_some());
        assert!(matches!(inference.inferred_direction.unwrap(), Direction::East));
        assert_eq!(inference.confidence, 0.50);
    }

    #[test]
    fn test_compute_confidence() {
        let engine = WorldMapInferenceEngine::new();

        let evidence_a = Evidence {
            level: EvidenceLevel::A,
            chapter: 1,
            quote: "...".to_string(),
            context: None,
        };

        let evidence_b = Evidence {
            level: EvidenceLevel::B,
            chapter: 1,
            quote: "...".to_string(),
            context: None,
        };

        assert_eq!(engine.compute_confidence(&evidence_a), 0.95);
        assert_eq!(engine.compute_confidence(&evidence_b), 0.75);
    }
}
