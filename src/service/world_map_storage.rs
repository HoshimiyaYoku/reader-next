use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tokio::fs;

use crate::error::error::AppError;
use crate::model::world_map::*;
use crate::util::hash::md5_hex;

/// World Map Storage - JSONL 格式存储
#[derive(Clone)]
pub struct WorldMapStorage {
    storage_dir: PathBuf,
}

impl WorldMapStorage {
    pub fn new(storage_dir: &str) -> Self {
        Self {
            storage_dir: PathBuf::from(storage_dir),
        }
    }

    /// 加载完整地图规格书
    pub async fn load(
        &self,
        user_ns: &str,
        book_key: &str,
    ) -> Result<Option<WorldMapSpec>, AppError> {
        let spec_dir = self
            .existing_spec_dir(user_ns, book_key)
            .unwrap_or_else(|| self.spec_dir(user_ns, book_key));
        
        // 检查目录是否存在
        if !spec_dir.exists() {
            return Ok(None);
        }

        // 加载 metadata
        let metadata_path = spec_dir.join("metadata.json");
        if !metadata_path.exists() {
            return Ok(None);
        }
        
        let metadata = self.load_json::<WorldMapMetadata>(&metadata_path).await?;

        // 加载各个 JSONL 文件
        let entities = self.load_jsonl::<WorldMapEntity>(&spec_dir.join("entities.jsonl")).await?;
        let relations = self.load_jsonl::<WorldMapRelation>(&spec_dir.join("relations.jsonl")).await?;
        let routes = self.load_jsonl::<WorldMapRoute>(&spec_dir.join("routes.jsonl")).await?;
        let factions = self.load_jsonl::<WorldMapFaction>(&spec_dir.join("factions.jsonl")).await?;
        let conflicts = self.load_jsonl::<WorldMapConflict>(&spec_dir.join("conflicts.jsonl")).await?;
        
        // 加载约束
        let hard_constraints = self.load_jsonl::<Constraint>(&spec_dir.join("constraints/hard.jsonl")).await?;
        let soft_constraints = self.load_jsonl::<Constraint>(&spec_dir.join("constraints/soft.jsonl")).await?;
        
        let constraints = WorldMapConstraints {
            hard: hard_constraints,
            soft: soft_constraints,
        };

        // 加载坐标（可选）
        let coordinates_path = spec_dir.join("coordinates.json");
        let coordinates = if coordinates_path.exists() {
            Some(self.load_json::<WorldMapCoordinates>(&coordinates_path).await?)
        } else {
            None
        };

        // 加载审查清单
        let review_items_path = spec_dir.join("review_items.json");
        let review_items = if review_items_path.exists() {
            self.load_json::<Vec<WorldMapReviewItem>>(&review_items_path).await?
        } else {
            vec![]
        };

        // 加载统计数据
        let statistics_path = spec_dir.join("statistics.json");
        let statistics = if statistics_path.exists() {
            self.load_json::<WorldMapStatistics>(&statistics_path).await?
        } else {
            WorldMapStatistics::default()
        };

        Ok(Some(WorldMapSpec {
            metadata,
            entities,
            relations,
            routes,
            factions,
            constraints,
            conflicts,
            coordinates,
            review_items,
            statistics,
        }))
    }

    /// 保存完整地图规格书
    pub async fn save(
        &self,
        user_ns: &str,
        book_key: &str,
        spec: &WorldMapSpec,
    ) -> Result<(), AppError> {
        let spec_dir = self.spec_dir(user_ns, book_key);
        
        // 创建目录
        fs::create_dir_all(&spec_dir)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        fs::create_dir_all(spec_dir.join("constraints"))
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        // 保存 metadata
        self.save_json(&spec_dir.join("metadata.json"), &spec.metadata).await?;

        // 保存各个 JSONL 文件
        self.save_jsonl(&spec_dir.join("entities.jsonl"), &spec.entities).await?;
        self.save_jsonl(&spec_dir.join("relations.jsonl"), &spec.relations).await?;
        self.save_jsonl(&spec_dir.join("routes.jsonl"), &spec.routes).await?;
        self.save_jsonl(&spec_dir.join("factions.jsonl"), &spec.factions).await?;
        self.save_jsonl(&spec_dir.join("conflicts.jsonl"), &spec.conflicts).await?;
        
        // 保存约束
        self.save_jsonl(&spec_dir.join("constraints/hard.jsonl"), &spec.constraints.hard).await?;
        self.save_jsonl(&spec_dir.join("constraints/soft.jsonl"), &spec.constraints.soft).await?;

        // 保存坐标（如果有），清空时删除旧文件，避免 stale coordinates
        let coordinates_path = spec_dir.join("coordinates.json");
        if let Some(coords) = &spec.coordinates {
            self.save_json(&coordinates_path, coords).await?;
        } else if coordinates_path.exists() {
            fs::remove_file(&coordinates_path)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }

        // 保存审查清单
        self.save_json(&spec_dir.join("review_items.json"), &spec.review_items).await?;

        // 保存统计数据
        self.save_json(&spec_dir.join("statistics.json"), &spec.statistics).await?;

        Ok(())
    }

    /// 增量保存（追加到 JSONL）
    pub async fn save_incremental(
        &self,
        user_ns: &str,
        book_key: &str,
        delta: &WorldMapDelta,
    ) -> Result<(), AppError> {
        let spec_dir = self.spec_dir(user_ns, book_key);
        
        // 确保目录存在
        fs::create_dir_all(&spec_dir)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        fs::create_dir_all(spec_dir.join("constraints"))
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        // 追加新实体
        if !delta.new_entities.is_empty() {
            self.append_jsonl(&spec_dir.join("entities.jsonl"), &delta.new_entities).await?;
        }

        // 追加新关系
        if !delta.new_relations.is_empty() {
            self.append_jsonl(&spec_dir.join("relations.jsonl"), &delta.new_relations).await?;
        }

        // 追加新冲突
        if !delta.new_conflicts.is_empty() {
            self.append_jsonl(&spec_dir.join("conflicts.jsonl"), &delta.new_conflicts).await?;
        }

        // 更新 metadata
        if let Some(metadata) = &delta.updated_metadata {
            self.save_json(&spec_dir.join("metadata.json"), metadata).await?;
        }

        Ok(())
    }

    /// 删除地图规格书
    pub async fn delete(&self, user_ns: &str, book_key: &str) -> Result<bool, AppError> {
        let spec_dir = self
            .existing_spec_dir(user_ns, book_key)
            .unwrap_or_else(|| self.spec_dir(user_ns, book_key));
        
        if !spec_dir.exists() {
            return Ok(false);
        }

        fs::remove_dir_all(&spec_dir)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        Ok(true)
    }

    // ========== 内部工具方法 ==========

    /// 获取规格书目录路径
    fn spec_dir(&self, user_ns: &str, book_key: &str) -> PathBuf {
        self.storage_dir
            .join("data")
            .join(user_ns)
            .join("world-maps")
            .join(Self::safe_book_dir(book_key))
    }

    /// 旧版本直接 join book_key；只作为读取迁移 fallback，不再写入。
    fn legacy_spec_dir(&self, user_ns: &str, book_key: &str) -> PathBuf {
        self.storage_dir
            .join("data")
            .join(user_ns)
            .join("world-maps")
            .join(book_key)
    }

    fn existing_spec_dir(&self, user_ns: &str, book_key: &str) -> Option<PathBuf> {
        let safe = self.spec_dir(user_ns, book_key);
        if safe.exists() {
            return Some(safe);
        }

        let legacy = self.legacy_spec_dir(user_ns, book_key);
        if legacy.exists() {
            return Some(legacy);
        }

        None
    }

    fn safe_book_dir(book_key: &str) -> String {
        format!("book-{}", md5_hex(book_key))
    }

    /// 加载 JSON 文件
    async fn load_json<T: for<'de> Deserialize<'de>>(
        &self,
        path: &PathBuf,
    ) -> Result<T, AppError> {
        let content = fs::read_to_string(path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        serde_json::from_str(&content)
            .map_err(|e| AppError::BadRequest(format!("Failed to parse JSON: {}", e)))
    }

    /// 保存 JSON 文件
    async fn save_json<T: Serialize>(
        &self,
        path: &PathBuf,
        data: &T,
    ) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(data)
            .map_err(|e| AppError::BadRequest(format!("Failed to serialize JSON: {}", e)))?;
        
        fs::write(path, content)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        Ok(())
    }

    /// 加载 JSONL 文件
    async fn load_jsonl<T: for<'de> Deserialize<'de>>(
        &self,
        path: &PathBuf,
    ) -> Result<Vec<T>, AppError> {
        if !path.exists() {
            return Ok(vec![]);
        }

        let content = fs::read_to_string(path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        let mut items = Vec::new();
        for (line_num, line) in content.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            
            let item: T = serde_json::from_str(line)
                .map_err(|e| AppError::BadRequest(
                    format!("Failed to parse JSONL line {}: {}", line_num + 1, e)
                ))?;
            
            items.push(item);
        }
        
        Ok(items)
    }

    /// 保存 JSONL 文件（覆盖）
    async fn save_jsonl<T: Serialize>(
        &self,
        path: &PathBuf,
        items: &[T],
    ) -> Result<(), AppError> {
        let mut lines = Vec::new();
        
        for item in items {
            let line = serde_json::to_string(item)
                .map_err(|e| AppError::BadRequest(format!("Failed to serialize item: {}", e)))?;
            lines.push(line);
        }
        
        let mut content = lines.join("\n");
        if !content.is_empty() {
            content.push('\n');
        }
        fs::write(path, content)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        Ok(())
    }

    /// 追加到 JSONL 文件
    async fn append_jsonl<T: Serialize>(
        &self,
        path: &PathBuf,
        items: &[T],
    ) -> Result<(), AppError> {
        use tokio::io::AsyncWriteExt;

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        for item in items {
            let line = serde_json::to_string(item)
                .map_err(|e| AppError::BadRequest(format!("Failed to serialize item: {}", e)))?;
            
            file.write_all((line + "\n").as_bytes())
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        
        Ok(())
    }
}

/// 增量更新 Delta
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorldMapDelta {
    pub new_entities: Vec<WorldMapEntity>,
    pub new_relations: Vec<WorldMapRelation>,
    pub new_conflicts: Vec<WorldMapConflict>,
    pub updated_metadata: Option<WorldMapMetadata>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_save_and_load() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_test");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let storage = WorldMapStorage::new(temp_dir.to_str().unwrap());

        let spec = WorldMapSpec {
            metadata: WorldMapMetadata {
                source_type: "ai_memory".to_string(),
                novel_title: "测试小说".to_string(),
                allow_later_chapter_info: false,
                start_chapter: 1,
                end_chapter: 10,
                spec_version: "2.0".to_string(),
                analysis_date: "2026-06-16".to_string(),
                notes: None,
                created_at: 1700000000,
                updated_at: 1700000000,
                total_entities: 2,
                total_relations: 1,
            },
            entities: vec![
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
                    description: None,
                    faction_id: None,
                    related_entity_ids: vec![],
                },
            ],
            relations: vec![
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
            ],
            routes: vec![],
            factions: vec![],
            constraints: WorldMapConstraints::default(),
            conflicts: vec![],
            coordinates: None,
            review_items: vec![],
            statistics: WorldMapStatistics::default(),
        };

        // 保存
        storage.save("test_user", "test_book", &spec).await.unwrap();

        // 加载
        let loaded = storage.load("test_user", "test_book").await.unwrap();
        assert!(loaded.is_some());
        
        let loaded_spec = loaded.unwrap();
        assert_eq!(loaded_spec.metadata.novel_title, "测试小说");
        assert_eq!(loaded_spec.entities.len(), 1);
        assert_eq!(loaded_spec.relations.len(), 1);

        // 清理
        let _ = storage.delete("test_user", "test_book").await;
    }

    #[tokio::test]
    async fn test_incremental_save() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_test_incremental");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let storage = WorldMapStorage::new(temp_dir.to_str().unwrap());

        // 先保存基础版本
        let spec = WorldMapSpec {
            metadata: WorldMapMetadata {
                source_type: "ai_memory".to_string(),
                novel_title: "测试小说".to_string(),
                allow_later_chapter_info: false,
                start_chapter: 1,
                end_chapter: 10,
                spec_version: "2.0".to_string(),
                analysis_date: "2026-06-16".to_string(),
                notes: None,
                created_at: 1700000000,
                updated_at: 1700000000,
                total_entities: 1,
                total_relations: 0,
            },
            entities: vec![
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
                    description: None,
                    faction_id: None,
                    related_entity_ids: vec![],
                },
            ],
            relations: vec![],
            routes: vec![],
            factions: vec![],
            constraints: WorldMapConstraints::default(),
            conflicts: vec![],
            coordinates: None,
            review_items: vec![],
            statistics: WorldMapStatistics::default(),
        };

        storage.save("test_user", "test_book_inc", &spec).await.unwrap();

        // 增量追加
        let delta = WorldMapDelta {
            new_entities: vec![
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
                    description: None,
                    faction_id: None,
                    related_entity_ids: vec![],
                },
            ],
            new_relations: vec![],
            new_conflicts: vec![],
            updated_metadata: Some(WorldMapMetadata {
                source_type: "ai_memory".to_string(),
                novel_title: "测试小说".to_string(),
                allow_later_chapter_info: false,
                start_chapter: 1,
                end_chapter: 20,
                spec_version: "2.0".to_string(),
                analysis_date: "2026-06-16".to_string(),
                notes: None,
                created_at: 1700000000,
                updated_at: 1700001000,
                total_entities: 2,
                total_relations: 0,
            }),
        };

        storage.save_incremental("test_user", "test_book_inc", &delta).await.unwrap();

        // 加载验证
        let loaded = storage.load("test_user", "test_book_inc").await.unwrap().unwrap();
        assert_eq!(loaded.entities.len(), 2);
        assert_eq!(loaded.metadata.end_chapter, 20);

        // 清理
        let _ = storage.delete("test_user", "test_book_inc").await;
    }

    #[tokio::test]
    async fn save_overwrites_empty_jsonl_and_removes_cleared_coordinates() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_test_clear_stale");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let storage = WorldMapStorage::new(temp_dir.to_str().unwrap());
        let mut spec = test_spec("测试小说");
        spec.coordinates = Some(WorldMapCoordinates {
            status: CoordinateStatus::Feasible,
            reason: None,
            placed: vec![PlacedEntity {
                entity_id: "E001".to_string(),
                x: 50.0,
                y: 50.0,
                confidence: CoordinateConfidence::Relative,
                constraints_satisfied: vec![],
            }],
            unplaced: vec![],
        });

        storage.save("test_user", "https://example.test/book/1", &spec).await.unwrap();

        spec.entities.clear();
        spec.relations.clear();
        spec.coordinates = None;
        storage.save("test_user", "https://example.test/book/1", &spec).await.unwrap();

        let loaded = storage
            .load("test_user", "https://example.test/book/1")
            .await
            .unwrap()
            .unwrap();
        assert!(loaded.entities.is_empty());
        assert!(loaded.relations.is_empty());
        assert!(loaded.coordinates.is_none());

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn book_key_is_hashed_before_joining_storage_path() {
        let temp_dir = std::env::temp_dir().join("reader_world_map_test_path_safe");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let storage = WorldMapStorage::new(temp_dir.to_str().unwrap());
        let spec = test_spec("测试小说");
        let book_url = "https://example.test/books/../evil?id=1";

        storage.save("test_user", book_url, &spec).await.unwrap();

        let world_maps_dir = temp_dir.join("data").join("test_user").join("world-maps");
        let entries: Vec<_> = std::fs::read_dir(&world_maps_dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect();

        assert_eq!(entries.len(), 1);
        assert!(entries[0].starts_with("book-"));
        assert!(!entries[0].contains('/'));
        assert!(!world_maps_dir.join("https:").exists());

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    fn test_spec(title: &str) -> WorldMapSpec {
        WorldMapSpec {
            metadata: WorldMapMetadata {
                source_type: "ai_memory".to_string(),
                novel_title: title.to_string(),
                allow_later_chapter_info: false,
                start_chapter: 1,
                end_chapter: 10,
                spec_version: "2.0".to_string(),
                analysis_date: "2026-06-16".to_string(),
                notes: None,
                created_at: 1700000000,
                updated_at: 1700000000,
                total_entities: 1,
                total_relations: 1,
            },
            entities: vec![WorldMapEntity {
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
                description: None,
                faction_id: None,
                related_entity_ids: vec![],
            }],
            relations: vec![WorldMapRelation {
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
            }],
            routes: vec![],
            factions: vec![],
            constraints: WorldMapConstraints::default(),
            conflicts: vec![],
            coordinates: None,
            review_items: vec![],
            statistics: WorldMapStatistics::default(),
        }
    }
}
