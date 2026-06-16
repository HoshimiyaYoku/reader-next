use serde_json::Value;

use crate::error::error::AppError;
use crate::model::world_map::*;
use crate::service::world_map_inference::{WorldMapInferenceEngine, InferenceContext};
use crate::service::world_map_storage::WorldMapStorage;
use crate::service::world_map_optimizer::WorldMapOptimizer;
use crate::util::time::now_ts;

/// 地图构建服务 - 集成所有核心模块
pub struct WorldMapBuilderService {
    storage: WorldMapStorage,
    inference: WorldMapInferenceEngine,
    optimizer: WorldMapOptimizer,
}

impl WorldMapBuilderService {
    pub fn new(storage_dir: &str) -> Self {
        Self {
            storage: WorldMapStorage::new(storage_dir),
            inference: WorldMapInferenceEngine::new(),
            optimizer: WorldMapOptimizer::new(),
        }
    }

    /// 从 mock 数据构建（MVP: 暂时用 mock 数据，Phase 5 接入 AI）
    pub async fn build_from_mock(
        &self,
        user_ns: &str,
        book_key: &str,
        novel_title: &str,
    ) -> Result<WorldMapSpec, AppError> {
        // Mock 数据（实际应该调用 AI 提取）
        let entities = vec![
            WorldMapEntity {
                id: "E001".to_string(),
                canonical_name: "阿尔托".to_string(),
                aliases: vec![],
                entity_type: EntityType::Settlement,
                subtype: Some("city".to_string()),
                first_chapter: 3,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 3,
                    quote: "主角到达了阿尔托城".to_string(),
                    context: None,
                },
                description: Some("边境重镇".to_string()),
                faction_id: Some("F001".to_string()),
                related_entity_ids: vec!["E002".to_string()],
            },
            WorldMapEntity {
                id: "E002".to_string(),
                canonical_name: "黑暗山脉".to_string(),
                aliases: vec![],
                entity_type: EntityType::Terrain,
                subtype: Some("mountain_range".to_string()),
                first_chapter: 3,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 3,
                    quote: "黑暗山脉横亘在北方".to_string(),
                    context: None,
                },
                description: Some("危险的山脉".to_string()),
                faction_id: None,
                related_entity_ids: vec!["E001".to_string()],
            },
            WorldMapEntity {
                id: "E003".to_string(),
                canonical_name: "叙拉古".to_string(),
                aliases: vec![],
                entity_type: EntityType::Settlement,
                subtype: Some("city".to_string()),
                first_chapter: 8,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 8,
                    quote: "叙拉古位于阿尔托的东北方".to_string(),
                    context: None,
                },
                description: Some("帝国第二大城".to_string()),
                faction_id: Some("F001".to_string()),
                related_entity_ids: vec!["E001".to_string()],
            },
        ];

        let relations = vec![
            WorldMapRelation {
                id: "R001".to_string(),
                from_id: "E001".to_string(),
                to_id: "E002".to_string(),
                relation_type: RelationType::Nearby,
                direction: None,
                bidirectional: false,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 5,
                    quote: "阿尔托靠近黑暗山脉".to_string(),
                    context: None,
                },
                constraint_type: ConstraintType::Hard,
            },
            WorldMapRelation {
                id: "R002".to_string(),
                from_id: "E001".to_string(),
                to_id: "E003".to_string(),
                relation_type: RelationType::Direction,
                direction: Some(Direction::Northeast),
                bidirectional: false,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 8,
                    quote: "叙拉古位于阿尔托的东北方".to_string(),
                    context: None,
                },
                constraint_type: ConstraintType::Hard,
            },
        ];

        // 构建完整 spec
        let spec = self.build_spec(novel_title, 1, 10, entities, relations).await?;

        // 保存
        self.storage.save(user_ns, book_key, &spec).await?;

        Ok(spec)
    }

    /// 加载地图规格书
    pub async fn load(
        &self,
        user_ns: &str,
        book_key: &str,
    ) -> Result<Option<WorldMapSpec>, AppError> {
        self.storage.load(user_ns, book_key).await
    }

    /// 保存地图规格书
    pub async fn save(
        &self,
        user_ns: &str,
        book_key: &str,
        spec: &WorldMapSpec,
    ) -> Result<(), AppError> {
        self.storage.save(user_ns, book_key, spec).await
    }

    /// 从已有 AI 资料记忆构建地图规格书。
    /// 这是当前可落地的真实数据路径：使用 AI资料里已经抽取的 locations，
    /// 而不是固定 mock 城市。
    pub async fn build_from_ai_memory_value(
        &self,
        user_ns: &str,
        book_key: &str,
        novel_title: &str,
        memory: &Value,
    ) -> Result<WorldMapSpec, AppError> {
        let (entities, relations, max_chapter) = self.extract_locations_from_memory(memory)?;
        if entities.is_empty() {
            return Err(AppError::BadRequest(
                "暂无可构建地图的地点资料，请先更新 AI资料".to_string(),
            ));
        }

        let processed_chapter = memory
            .get("processedChapterIndex")
            .and_then(Value::as_i64)
            .map(|v| v as i32)
            .or_else(|| {
                memory
                    .get("processed_chapter_index")
                    .and_then(Value::as_i64)
                    .map(|v| v as i32)
            })
            .unwrap_or(max_chapter);
        let end_chapter = processed_chapter.max(max_chapter);
        let spec = self
            .build_spec(novel_title, 0, end_chapter, entities, relations)
            .await?;

        self.storage.save(user_ns, book_key, &spec).await?;
        Ok(spec)
    }

    /// 用新的 AI 资料重建并合并成当前地图。
    pub async fn update_from_ai_memory_value(
        &self,
        user_ns: &str,
        book_key: &str,
        novel_title: &str,
        end_chapter: i32,
        memory: &Value,
    ) -> Result<(WorldMapSpec, usize, usize), AppError> {
        let existing = self
            .storage
            .load(user_ns, book_key)
            .await?
            .ok_or_else(|| AppError::NotFound("世界地图规格书不存在".to_string()))?;
        let old_entity_count = existing.entities.len();
        let old_relation_count = existing.relations.len();

        let mut updated = self
            .build_from_ai_memory_value(user_ns, book_key, novel_title, memory)
            .await?;
        updated.metadata.created_at = existing.metadata.created_at;
        updated.metadata.end_chapter = updated.metadata.end_chapter.max(end_chapter);
        updated.metadata.updated_at = now_ts() * 1000;
        updated.statistics = self.build_statistics(
            updated.entities.len(),
            updated.relations.len(),
            updated.routes.len(),
            updated.factions.len(),
            &updated.constraints,
            updated.conflicts.len(),
            updated.review_items.len(),
            updated
                .statistics
                .total_issues,
            updated.statistics.auto_resolved,
            updated.coordinates.as_ref(),
        );
        self.storage.save(user_ns, book_key, &updated).await?;

        Ok((
            updated.clone(),
            updated.entities.len().saturating_sub(old_entity_count),
            updated.relations.len().saturating_sub(old_relation_count),
        ))
    }

    /// 标记审查项已处理。当前审查项没有独立状态字段，最小可用行为是从待审清单移除并持久化。
    pub async fn resolve_review_item(
        &self,
        user_ns: &str,
        book_key: &str,
        item_id: &str,
        resolution: &str,
    ) -> Result<WorldMapSpec, AppError> {
        let mut spec = self
            .storage
            .load(user_ns, book_key)
            .await?
            .ok_or_else(|| AppError::NotFound("世界地图规格书不存在".to_string()))?;

        let resolved_entities = spec
            .review_items
            .iter()
            .find(|item| item.id == item_id)
            .map(|item| item.involved_entities.clone());
        let before = spec.review_items.len();
        spec.review_items.retain(|item| item.id != item_id);
        if spec.review_items.len() == before {
            return Err(AppError::NotFound("审查项不存在".to_string()));
        }

        if resolution == "accept" {
            let resolved_entities = resolved_entities.unwrap_or_default();
            for conflict in &mut spec.conflicts {
                if !resolved_entities.is_empty()
                    && conflict
                        .entities
                        .iter()
                        .all(|entity| resolved_entities.contains(entity))
                {
                    conflict.status = ConflictStatus::Resolved;
                }
            }
        }

        spec.metadata.updated_at = now_ts() * 1000;
        spec.statistics = self.build_statistics(
            spec.entities.len(),
            spec.relations.len(),
            spec.routes.len(),
            spec.factions.len(),
            &spec.constraints,
            spec.conflicts.len(),
            spec.review_items.len(),
            spec.statistics.total_issues,
            spec.statistics.auto_resolved,
            spec.coordinates.as_ref(),
        );

        self.storage.save(user_ns, book_key, &spec).await?;
        Ok(spec)
    }

    /// 删除地图规格书
    pub async fn delete(&self, user_ns: &str, book_key: &str) -> Result<bool, AppError> {
        self.storage.delete(user_ns, book_key).await
    }

    /// 生成坐标
    pub async fn generate_coordinates(
        &self,
        user_ns: &str,
        book_key: &str,
    ) -> Result<WorldMapCoordinates, AppError> {
        // 加载现有 spec
        let mut spec = self
            .storage
            .load(user_ns, book_key)
            .await?
            .ok_or_else(|| AppError::BadRequest("地图规格书不存在".to_string()))?;

        // 生成坐标
        let coordinates = self
            .optimizer
            .generate_coordinates(&spec)
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        // 更新 spec
        spec.coordinates = Some(coordinates.clone());
        spec.metadata.updated_at = now_ts() * 1000;
        spec.statistics.coordinate_coverage_rate = coordinate_coverage_rate(&spec);

        // 保存
        self.storage.save(user_ns, book_key, &spec).await?;

        Ok(coordinates)
    }

    /// 获取审查清单
    pub async fn get_review_items(
        &self,
        user_ns: &str,
        book_key: &str,
    ) -> Result<Vec<WorldMapReviewItem>, AppError> {
        let spec = self
            .storage
            .load(user_ns, book_key)
            .await?
            .ok_or_else(|| AppError::BadRequest("地图规格书不存在".to_string()))?;

        Ok(spec.review_items)
    }

    // ========== 内部构建方法 ==========

    /// 构建完整 spec（集成所有模块）
    async fn build_spec(
        &self,
        novel_title: &str,
        start_chapter: i32,
        end_chapter: i32,
        entities: Vec<WorldMapEntity>,
        relations: Vec<WorldMapRelation>,
    ) -> Result<WorldMapSpec, AppError> {
        // 1. 检测冲突
        let conflicts = self.detect_conflicts(&relations);

        // 2. 自动解决冲突
        let context = InferenceContext::new(entities.clone(), relations.clone());
        let resolved_conflicts = self
            .inference
            .resolve_all_conflicts(&conflicts, &context);

        // 统计自动化率
        let total_issues = conflicts.len();
        let auto_resolved = resolved_conflicts
            .iter()
            .filter(|(_, res)| !res.need_human)
            .count();

        // 3. 生成约束
        let constraints = self.build_constraints(&relations);

        // 4. 生成审查清单（需要人工的冲突）
        let review_items = self.build_review_items(&resolved_conflicts);

        // 5. 元数据
        let metadata = WorldMapMetadata {
            source_type: "ai_memory".to_string(),
            novel_title: novel_title.to_string(),
            allow_later_chapter_info: false,
            start_chapter,
            end_chapter,
            spec_version: "2.0".to_string(),
            analysis_date: chrono::Local::now().format("%Y-%m-%d").to_string(),
            notes: None,
            created_at: now_ts() * 1000,
            updated_at: now_ts() * 1000,
            total_entities: entities.len(),
            total_relations: relations.len(),
        };

        // 6. 统计数据
        // 7. 构建完整 spec
        let mut spec = WorldMapSpec {
            metadata,
            entities,
            relations,
            routes: vec![],
            factions: vec![],
            constraints,
            conflicts: resolved_conflicts.into_iter().map(|(c, _)| c).collect(),
            coordinates: None,
            review_items,
            statistics: WorldMapStatistics::default(),
        };

        // 8. 尝试生成坐标
        if let Ok(coordinates) = self.optimizer.generate_coordinates(&spec) {
            spec.coordinates = Some(coordinates);
        }

        spec.statistics = self.build_statistics(
            spec.entities.len(),
            spec.relations.len(),
            spec.routes.len(),
            spec.factions.len(),
            &spec.constraints,
            spec.conflicts.len(),
            spec.review_items.len(),
            total_issues,
            auto_resolved,
            spec.coordinates.as_ref(),
        );

        Ok(spec)
    }

    /// 检测冲突（简单版：检查同一对实体是否有多个不同的关系）
    fn detect_conflicts(&self, relations: &[WorldMapRelation]) -> Vec<WorldMapConflict> {
        let mut conflicts = Vec::new();

        // MVP: 简化版，只检测明显的方向冲突
        for i in 0..relations.len() {
            for j in (i + 1)..relations.len() {
                let rel_a = &relations[i];
                let rel_b = &relations[j];

                // 同一对实体，但方向不同
                if rel_a.from_id == rel_b.from_id
                    && rel_a.to_id == rel_b.to_id
                    && rel_a.direction != rel_b.direction
                    && rel_a.direction.is_some()
                    && rel_b.direction.is_some()
                {
                    conflicts.push(WorldMapConflict {
                        id: format!("C{:03}", conflicts.len() + 1),
                        entities: vec![rel_a.from_id.clone(), rel_a.to_id.clone()],
                        info_a: format!("{:?}", rel_a.direction),
                        info_b: format!("{:?}", rel_b.direction),
                        evidence_a: rel_a.evidence.clone(),
                        evidence_b: rel_b.evidence.clone(),
                        resolution_hint: ResolutionHint::Unresolvable,
                        reason: String::new(),
                        status: ConflictStatus::Unresolved,
                    });
                }
            }
        }

        conflicts
    }

    /// 生成约束
    fn build_constraints(&self, relations: &[WorldMapRelation]) -> WorldMapConstraints {
        let mut hard = Vec::new();
        let mut soft = Vec::new();

        for (i, rel) in relations.iter().enumerate() {
            let constraint = Constraint {
                id: format!("CONS{:03}", i + 1),
                constraint_type: match rel.relation_type {
                    RelationType::Direction => "direction".to_string(),
                    RelationType::Nearby => "adjacency".to_string(),
                    _ => "other".to_string(),
                },
                entities: vec![rel.from_id.clone(), rel.to_id.clone()],
                description: format!(
                    "{} 与 {} 的 {:?} 关系",
                    rel.from_id, rel.to_id, rel.relation_type
                ),
                evidence: rel.evidence.clone(),
                priority: if matches!(rel.constraint_type, ConstraintType::Hard) {
                    1
                } else {
                    2
                },
            };

            match rel.constraint_type {
                ConstraintType::Hard => hard.push(constraint),
                ConstraintType::Soft => soft.push(constraint),
            }
        }

        WorldMapConstraints { hard, soft }
    }

    /// 生成审查清单
    fn build_review_items(
        &self,
        resolved_conflicts: &[(WorldMapConflict, crate::service::world_map_inference::ConflictResolution)],
    ) -> Vec<WorldMapReviewItem> {
        resolved_conflicts
            .iter()
            .filter(|(_, res)| res.need_human)
            .enumerate()
            .map(|(i, (conflict, resolution))| WorldMapReviewItem {
                id: format!("RI{:03}", i + 1),
                item_type: ReviewItemType::Conflict,
                severity: Severity::High,
                involved_entities: conflict.entities.clone(),
                issue: format!("冲突：{} vs {}", conflict.info_a, conflict.info_b),
                ai_suggestion: resolution.reason.clone(),
                confidence: resolution.confidence,
                evidence: conflict.evidence_a.clone(),
                estimated_review_time_minutes: 3,
                needs_human_judgment: true,
            })
            .collect()
    }

    fn extract_locations_from_memory(
        &self,
        memory: &Value,
    ) -> Result<(Vec<WorldMapEntity>, Vec<WorldMapRelation>, i32), AppError> {
        let locations = memory
            .get("locations")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::BadRequest("AI资料中没有 locations".to_string()))?;
        let mut entities = Vec::new();
        let mut parent_links: Vec<(String, String, Evidence)> = Vec::new();
        let mut max_chapter = 0;
        let name_to_id = locations
            .iter()
            .enumerate()
            .filter_map(|(idx, location)| {
                let name = read_string(location, "name")?;
                let id = read_string(location, "id").unwrap_or_else(|| stable_location_id(idx, &name));
                Some((normalize_location_name(&name), id))
            })
            .collect::<std::collections::HashMap<_, _>>();

        for (idx, location) in locations.iter().enumerate() {
            let name = read_string(location, "name").unwrap_or_default();
            if name.trim().is_empty() {
                continue;
            }
            let id = read_string(location, "id").unwrap_or_else(|| stable_location_id(idx, &name));
            let aliases = location
                .get("aliases")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let kind = read_string(location, "kind").unwrap_or_else(|| "未知地点".to_string());
            let scale = read_string(location, "scale").unwrap_or_default();
            let first_chapter = read_i32(location, &["firstSeenChapterIndex", "first_seen_chapter_index"])
                .or_else(|| parse_chapter_number(read_string(location, "firstSeenChapter").as_deref()))
                .unwrap_or(0);
            max_chapter = max_chapter.max(first_chapter);
            let evidence = evidence_from_location(location, first_chapter, &name);
            let parent_id = read_string(location, "parentId")
                .or_else(|| read_string(location, "parent_id"))
                .or_else(|| {
                    read_string(location, "parentName")
                        .or_else(|| read_string(location, "parent_name"))
                        .and_then(|parent_name| name_to_id.get(&normalize_location_name(&parent_name)).cloned())
                });
            let description = read_string(location, "description");
            let mut related_entity_ids = Vec::new();
            if let Some(parent_id) = parent_id.as_ref().filter(|parent| !parent.trim().is_empty()) {
                related_entity_ids.push(parent_id.clone());
                parent_links.push((parent_id.clone(), id.clone(), evidence.clone()));
            }

            entities.push(WorldMapEntity {
                id,
                canonical_name: name,
                aliases,
                entity_type: infer_entity_type(&kind, &scale),
                subtype: Some(kind),
                first_chapter,
                evidence,
                description,
                faction_id: None,
                related_entity_ids,
            });
        }

        let entity_ids = entities
            .iter()
            .map(|entity| entity.id.clone())
            .collect::<std::collections::HashSet<_>>();
        let relations = parent_links
            .into_iter()
            .filter(|(parent, child, _)| entity_ids.contains(parent) && entity_ids.contains(child))
            .enumerate()
            .map(|(idx, (parent, child, evidence))| WorldMapRelation {
                id: format!("R{:03}", idx + 1),
                from_id: parent,
                to_id: child,
                relation_type: RelationType::Contains,
                direction: None,
                bidirectional: false,
                evidence,
                constraint_type: ConstraintType::Hard,
            })
            .collect();

        Ok((entities, relations, max_chapter))
    }

    fn build_statistics(
        &self,
        total_entities: usize,
        total_relations: usize,
        total_routes: usize,
        total_factions: usize,
        constraints: &WorldMapConstraints,
        total_conflicts: usize,
        total_review_items: usize,
        total_issues: usize,
        auto_resolved: usize,
        coordinates: Option<&WorldMapCoordinates>,
    ) -> WorldMapStatistics {
        let automation_rate = if total_issues > 0 {
            auto_resolved as f64 / total_issues as f64
        } else {
            1.0
        };
        let placed = coordinates.map(|coords| coords.placed.len()).unwrap_or(0);
        let coordinate_coverage_rate = if total_entities > 0 {
            placed as f64 / total_entities as f64
        } else {
            0.0
        };

        WorldMapStatistics {
            total_entities,
            total_relations,
            total_routes,
            total_factions,
            total_hard_constraints: constraints.hard.len(),
            total_soft_constraints: constraints.soft.len(),
            total_conflicts,
            total_review_items,
            total_issues,
            auto_resolved,
            need_human: total_issues.saturating_sub(auto_resolved),
            automation_rate,
            coordinate_coverage_rate,
        }
    }
}

fn read_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn read_i32(value: &Value, keys: &[&str]) -> Option<i32> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_i64))
        .map(|value| value as i32)
}

fn parse_chapter_number(raw: Option<&str>) -> Option<i32> {
    let raw = raw?;
    let digits: String = raw.chars().filter(|ch| ch.is_ascii_digit()).collect();
    digits.parse::<i32>().ok()
}

fn evidence_from_location(location: &Value, first_chapter: i32, name: &str) -> Evidence {
    let first_evidence = location
        .get("evidence")
        .and_then(Value::as_array)
        .and_then(|items| items.first());
    let chapter = first_evidence
        .and_then(|item| read_i32(item, &["chapterIndex", "chapter_index"]))
        .unwrap_or(first_chapter);
    let quote = first_evidence
        .and_then(|item| read_string(item, "quote").or_else(|| read_string(item, "note")))
        .or_else(|| read_string(location, "description"))
        .unwrap_or_else(|| format!("AI资料记录地点：{}", name));
    let context = first_evidence.and_then(|item| read_string(item, "chapterTitle"));

    Evidence {
        level: EvidenceLevel::A,
        chapter,
        quote,
        context,
    }
}

fn infer_entity_type(kind: &str, scale: &str) -> EntityType {
    let key = format!("{} {}", kind, scale).to_lowercase();
    if key.contains("river")
        || key.contains("lake")
        || key.contains("sea")
        || key.contains("水")
        || key.contains("河")
        || key.contains("湖")
        || key.contains("海")
    {
        return EntityType::Water;
    }
    if key.contains("mountain")
        || key.contains("plain")
        || key.contains("desert")
        || key.contains("forest")
        || key.contains("山")
        || key.contains("平原")
        || key.contains("沙漠")
        || key.contains("森林")
    {
        return EntityType::Terrain;
    }
    if key.contains("gate")
        || key.contains("road")
        || key.contains("port")
        || key.contains("station")
        || key.contains("关")
        || key.contains("港")
        || key.contains("渡")
        || key.contains("路")
        || key.contains("传送")
    {
        return EntityType::Transit;
    }
    if key.contains("realm")
        || key.contains("ruin")
        || key.contains("秘境")
        || key.contains("禁区")
        || key.contains("遗迹")
    {
        return EntityType::Fantasy;
    }
    if matches!(scale, "world" | "continent" | "country" | "region")
        || key.contains("国")
        || key.contains("境")
        || key.contains("区域")
        || key.contains("大陆")
    {
        return EntityType::Region;
    }
    EntityType::Settlement
}

fn stable_location_id(index: usize, name: &str) -> String {
    let slug: String = name
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    if slug.is_empty() {
        format!("loc-{}", index + 1)
    } else {
        format!("loc-{}", slug.to_lowercase())
    }
}

fn normalize_location_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn coordinate_coverage_rate(spec: &WorldMapSpec) -> f64 {
    if spec.entities.is_empty() {
        return 0.0;
    }
    spec.coordinates
        .as_ref()
        .map(|coords| coords.placed.len() as f64 / spec.entities.len() as f64)
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_build_from_mock() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_test");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());

        let spec = service
            .build_from_mock("test_user", "test_book", "测试小说")
            .await
            .unwrap();

        assert_eq!(spec.metadata.novel_title, "测试小说");
        assert_eq!(spec.entities.len(), 3);
        assert_eq!(spec.relations.len(), 2);
        assert!(spec.coordinates.is_some());

        // 验证坐标生成成功
        let coords = spec.coordinates.as_ref().unwrap();
        
        for p in &coords.placed {
        }
        for u in &coords.unplaced {
        }
        
        assert_eq!(coords.placed.len(), 3);

        // 清理
        let _ = service.storage.delete("test_user", "test_book").await;
    }

    #[tokio::test]
    async fn build_from_ai_memory_locations_uses_real_book_memory() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_ai_memory");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());
        let memory = serde_json::json!({
            "schemaVersion": 2,
            "bookUrl": "https://example.test/book/real",
            "bookName": "山海旧事",
            "processedChapterIndex": 8,
            "locations": [
                {
                    "id": "loc-north",
                    "name": "北境",
                    "aliases": ["北方边境"],
                    "kind": "区域",
                    "scale": "region",
                    "description": "寒冷边境。",
                    "firstSeenChapterIndex": 3,
                    "evidence": [{
                        "chapterIndex": 3,
                        "chapterTitle": "第三章",
                        "quote": "林舟抵达北境。"
                    }]
                },
                {
                    "id": "loc-old-village",
                    "name": "旧村",
                    "kind": "村庄",
                    "scale": "site",
                    "parentId": "loc-north",
                    "description": "北境边缘的废弃村落。",
                    "firstSeenChapterIndex": 4,
                    "evidence": [{
                        "chapterIndex": 4,
                        "chapterTitle": "第四章",
                        "note": "旧村位于北境边缘。"
                    }]
                }
            ]
        });

        let spec = service
            .build_from_ai_memory_value(
                "test_user",
                "https://example.test/book/real",
                "山海旧事",
                &memory,
            )
            .await
            .unwrap();

        assert_eq!(spec.metadata.novel_title, "山海旧事");
        assert_eq!(spec.metadata.end_chapter, 8);
        assert_eq!(spec.entities.len(), 2);
        assert_eq!(spec.entities[0].canonical_name, "北境");
        assert_eq!(spec.entities[0].entity_type, EntityType::Region);
        assert_eq!(spec.entities[1].related_entity_ids, vec!["loc-north"]);
        assert_eq!(spec.relations.len(), 1);
        assert_eq!(spec.relations[0].from_id, "loc-north");
        assert_eq!(spec.relations[0].to_id, "loc-old-village");
        assert_eq!(spec.relations[0].relation_type, RelationType::Contains);
        assert!(spec.coordinates.is_some());

        let loaded = service
            .load("test_user", "https://example.test/book/real")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(loaded.entities.len(), 2);

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn build_from_ai_memory_resolves_legacy_parent_name() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_parent_name");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());
        let memory = serde_json::json!({
            "bookUrl": "https://example.test/book/v1",
            "bookName": "山海旧事",
            "locations": [
                {
                    "name": "山海大陆",
                    "kind": "大陆",
                    "description": "故事发生的大陆。"
                },
                {
                    "name": "北境",
                    "parentName": "山海大陆",
                    "kind": "区域",
                    "description": "寒冷边境。"
                }
            ]
        });

        let spec = service
            .build_from_ai_memory_value("test_user", "https://example.test/book/v1", "山海旧事", &memory)
            .await
            .unwrap();

        assert_eq!(spec.entities.len(), 2);
        assert_eq!(spec.relations.len(), 1);
        assert_eq!(spec.relations[0].relation_type, RelationType::Contains);
        assert_eq!(spec.relations[0].from_id, spec.entities[0].id);
        assert_eq!(spec.relations[0].to_id, spec.entities[1].id);

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn resolving_review_item_persists_removed_item_and_updates_statistics() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_resolve");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());
        let mut spec = service
            .build_from_mock("test_user", "review-book", "测试小说")
            .await
            .unwrap();
        spec.review_items = vec![WorldMapReviewItem {
            id: "RI-test".to_string(),
            item_type: ReviewItemType::Conflict,
            severity: Severity::High,
            involved_entities: vec!["E001".to_string(), "E002".to_string()],
            issue: "冲突".to_string(),
            ai_suggestion: "保留原文".to_string(),
            confidence: 0.4,
            evidence: Evidence {
                level: EvidenceLevel::Conflict,
                chapter: 1,
                quote: "冲突证据".to_string(),
                context: None,
            },
            estimated_review_time_minutes: 3,
            needs_human_judgment: true,
        }];
        service.save("test_user", "review-book", &spec).await.unwrap();

        let resolved = service
            .resolve_review_item("test_user", "review-book", "RI-test", "skip")
            .await
            .unwrap();

        assert!(resolved.review_items.is_empty());
        assert_eq!(resolved.statistics.total_review_items, 0);
        let loaded = service.load("test_user", "review-book").await.unwrap().unwrap();
        assert!(loaded.review_items.is_empty());

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn accepting_review_item_marks_matching_conflict_resolved() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_accept_review");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());
        let mut spec = service
            .build_from_mock("test_user", "accept-review-book", "测试小说")
            .await
            .unwrap();
        let evidence = Evidence {
            level: EvidenceLevel::Conflict,
            chapter: 1,
            quote: "冲突证据".to_string(),
            context: None,
        };
        spec.conflicts = vec![WorldMapConflict {
            id: "C-test".to_string(),
            entities: vec!["E001".to_string(), "E002".to_string()],
            info_a: "A".to_string(),
            info_b: "B".to_string(),
            evidence_a: evidence.clone(),
            evidence_b: evidence.clone(),
            resolution_hint: ResolutionHint::Unresolvable,
            reason: "需要人工确认".to_string(),
            status: ConflictStatus::Unresolved,
        }];
        spec.review_items = vec![WorldMapReviewItem {
            id: "RI-test".to_string(),
            item_type: ReviewItemType::Conflict,
            severity: Severity::High,
            involved_entities: vec!["E001".to_string(), "E002".to_string()],
            issue: "冲突".to_string(),
            ai_suggestion: "采纳".to_string(),
            confidence: 0.4,
            evidence,
            estimated_review_time_minutes: 3,
            needs_human_judgment: true,
        }];
        service.save("test_user", "accept-review-book", &spec).await.unwrap();

        let resolved = service
            .resolve_review_item("test_user", "accept-review-book", "RI-test", "accept")
            .await
            .unwrap();

        assert!(resolved.review_items.is_empty());
        assert_eq!(resolved.conflicts[0].status, ConflictStatus::Resolved);

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn test_load_and_save() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_test2");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());

        // 构建
        // 构建
        service
            .build_from_mock("test_user", "test_book2", "测试小说2")
            .await
            .unwrap();

        // 加载
        let loaded = service
            .load("test_user", "test_book2")
            .await
            .unwrap()
            .unwrap();

        assert_eq!(loaded.metadata.novel_title, "测试小说2");
        assert_eq!(loaded.entities.len(), 3);

        // 清理
        let _ = service.storage.delete("test_user", "test_book2").await;
    }

    #[tokio::test]
    async fn test_generate_coordinates() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_builder_test3");
        let service = WorldMapBuilderService::new(temp_dir.to_str().unwrap());

        // 构建
        service
            .build_from_mock("test_user", "test_book3", "测试小说3")
            .await
            .unwrap();

        // 重新生成坐标
        let coords = service
            .generate_coordinates("test_user", "test_book3")
            .await
            .unwrap();

        for p in &coords.placed {
        }
        for u in &coords.unplaced {
        }

        assert!(matches!(coords.status, CoordinateStatus::Feasible));
        assert_eq!(coords.placed.len(), 3);

        // 清理
        let _ = service.storage.delete("test_user", "test_book3").await;
    }
}
