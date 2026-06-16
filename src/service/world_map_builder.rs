
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

        let automation_rate = if total_issues > 0 {
            auto_resolved as f64 / total_issues as f64
        } else {
            1.0
        };

        // 3. 生成约束
        let constraints = self.build_constraints(&relations);

        // 4. 生成审查清单（需要人工的冲突）
        let review_items = self.build_review_items(&resolved_conflicts);

        // 5. 元数据
        let metadata = WorldMapMetadata {
            novel_title: novel_title.to_string(),
            start_chapter,
            end_chapter,
            spec_version: "2.0".to_string(),
            created_at: now_ts() * 1000,
            updated_at: now_ts() * 1000,
            total_entities: entities.len(),
            total_relations: relations.len(),
        };

        // 6. 统计数据
        let statistics = WorldMapStatistics {
            total_issues,
            auto_resolved,
            need_human: total_issues - auto_resolved,
            automation_rate,
        };

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
            statistics,
        };

        // 8. 尝试生成坐标
        if let Ok(coordinates) = self.optimizer.generate_coordinates(&spec) {
            spec.coordinates = Some(coordinates);
        }

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
                entities: conflict.entities.clone(),
                issue: format!("冲突：{} vs {}", conflict.info_a, conflict.info_b),
                ai_suggestion: resolution.reason.clone(),
                confidence: resolution.confidence,
            })
            .collect()
    }
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
