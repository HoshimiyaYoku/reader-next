use std::collections::HashMap;

use crate::model::world_map::*;

/// 坐标优化器 - MVP 版本（启发式布局）
pub struct WorldMapOptimizer;

impl WorldMapOptimizer {
    pub fn new() -> Self {
        Self
    }

    /// 生成坐标（MVP: 启发式布局，不做复杂优化）
    pub fn generate_coordinates(
        &self,
        spec: &WorldMapSpec,
    ) -> Result<WorldMapCoordinates, String> {
        // 检查是否有实体
        if spec.entities.is_empty() {
            return Ok(WorldMapCoordinates {
                status: CoordinateStatus::Blocked,
                reason: Some("没有任何地理实体".to_string()),
                placed: vec![],
                unplaced: vec![],
            });
        }

        // 检查是否有足够的关系
        if spec.relations.is_empty() {
            return Ok(WorldMapCoordinates {
                status: CoordinateStatus::Partial,
                reason: Some("缺少空间关系，只能放置部分实体".to_string()),
                placed: self.place_without_relations(&spec.entities),
                unplaced: vec![],
            });
        }

        // 构建关系图
        let relation_map = self.build_relation_map(&spec.relations);

        // 找出锚点（最多被引用的实体）
        let anchor_id = self.find_anchor(&spec.entities, &relation_map);

        // 从锚点开始布局
        let mut placed = HashMap::new();
        let mut unplaced = Vec::new();

        // 放置锚点在中心
        placed.insert(
            anchor_id.clone(),
            (50.0, 50.0, CoordinateConfidence::Relative),
        );

        // 遍历所有实体
        for entity in &spec.entities {
            if entity.id == anchor_id {
                continue; // 锚点已放置
            }

            // 查找与已放置实体的关系
            if let Some(pos) = self.place_relative_to_anchor(
                &entity.id,
                &anchor_id,
                &relation_map,
                &placed,
            ) {
                placed.insert(entity.id.clone(), pos);
            } else {
                // 无法放置
                unplaced.push(UnplacedEntity {
                    entity_id: entity.id.clone(),
                    reason: "无空间关系，无法定位".to_string(),
                    confidence: 0.0,
                });
            }
        }

        // 转换为最终格式
        let placed_entities: Vec<PlacedEntity> = placed
            .iter()
            .map(|(id, (x, y, confidence))| PlacedEntity {
                entity_id: id.clone(),
                x: *x,
                y: *y,
                confidence: confidence.clone(),
                constraints_satisfied: vec![], // MVP 暂不跟踪
            })
            .collect();

        let status = if unplaced.is_empty() {
            CoordinateStatus::Feasible
        } else {
            CoordinateStatus::Partial
        };

        Ok(WorldMapCoordinates {
            status,
            reason: None,
            placed: placed_entities,
            unplaced,
        })
    }

    /// 简单验证（MVP: 只检查基本冲突）
    pub fn validate_coordinates(
        &self,
        coords: &WorldMapCoordinates,
        constraints: &WorldMapConstraints,
    ) -> Vec<String> {
        let mut errors = Vec::new();

        // 检查硬约束
        for constraint in &constraints.hard {
            if constraint.constraint_type == "direction" && constraint.entities.len() == 2 {
                let from_id = &constraint.entities[0];
                let to_id = &constraint.entities[1];

                let from_pos = coords.placed.iter().find(|p| &p.entity_id == from_id);
                let to_pos = coords.placed.iter().find(|p| &p.entity_id == to_id);

                if let (Some(from), Some(to)) = (from_pos, to_pos) {
                    // 简单检查方位（如果描述包含方向信息）
                    if constraint.description.contains("东") && to.x <= from.x {
                        errors.push(format!(
                            "违反约束 {}: {} 应该在 {} 东边",
                            constraint.id, to_id, from_id
                        ));
                    }
                    if constraint.description.contains("西") && to.x >= from.x {
                        errors.push(format!(
                            "违反约束 {}: {} 应该在 {} 西边",
                            constraint.id, to_id, from_id
                        ));
                    }
                    if constraint.description.contains("北") && to.y <= from.y {
                        errors.push(format!(
                            "违反约束 {}: {} 应该在 {} 北边",
                            constraint.id, to_id, from_id
                        ));
                    }
                    if constraint.description.contains("南") && to.y >= from.y {
                        errors.push(format!(
                            "违反约束 {}: {} 应该在 {} 南边",
                            constraint.id, to_id, from_id
                        ));
                    }
                }
            }
        }

        errors
    }

    // ========== 内部辅助方法 ==========

    /// 构建关系映射
    fn build_relation_map(
        &self,
        relations: &[WorldMapRelation],
    ) -> HashMap<String, Vec<(String, RelationType, Option<Direction>)>> {
        let mut map: HashMap<String, Vec<(String, RelationType, Option<Direction>)>> =
            HashMap::new();

        for rel in relations {
            map.entry(rel.from_id.clone())
                .or_insert_with(Vec::new)
                .push((
                    rel.to_id.clone(),
                    rel.relation_type.clone(),
                    rel.direction.clone(),
                ));

            // 如果是双向关系，反向也加入
            if rel.bidirectional {
                map.entry(rel.to_id.clone())
                    .or_insert_with(Vec::new)
                    .push((
                        rel.from_id.clone(),
                        rel.relation_type.clone(),
                        self.reverse_direction(rel.direction.as_ref()),
                    ));
            }
        }

        map
    }

    /// 找出锚点（最多被引用的实体）
    fn find_anchor(
        &self,
        entities: &[WorldMapEntity],
        relation_map: &HashMap<String, Vec<(String, RelationType, Option<Direction>)>>,
    ) -> String {
        let mut ref_count: HashMap<String, usize> = HashMap::new();

        for (_from, tos) in relation_map {
            for (to, _, _) in tos {
                *ref_count.entry(to.clone()).or_insert(0) += 1;
            }
        }

        // 返回引用最多的，如果没有就返回第一个
        ref_count
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(id, _)| id)
            .unwrap_or_else(|| entities[0].id.clone())
    }

    /// 相对于锚点放置
    fn place_relative_to_anchor(
        &self,
        entity_id: &str,
        anchor_id: &str,
        relation_map: &HashMap<String, Vec<(String, RelationType, Option<Direction>)>>,
        placed: &HashMap<String, (f64, f64, CoordinateConfidence)>,
    ) -> Option<(f64, f64, CoordinateConfidence)> {
        // 查找与锚点的关系
        if let Some(relations) = relation_map.get(anchor_id) {
            for (to_id, rel_type, direction) in relations {
                if to_id == entity_id {
                    let (anchor_x, anchor_y, _) = placed.get(anchor_id)?;

                    // 根据关系类型和方向计算位置
                    let (dx, dy) = match (rel_type, direction) {
                        (RelationType::Direction, Some(dir)) => self.direction_offset(dir),
                        (RelationType::Nearby, _) => (5.0, 0.0), // 默认放在右侧
                        _ => (10.0, 0.0),
                    };

                    return Some((
                        anchor_x + dx,
                        anchor_y + dy,
                        CoordinateConfidence::Relative,
                    ));
                }
            }
        }

        // 反向查找（entity -> anchor）
        if let Some(relations) = relation_map.get(entity_id) {
            for (to_id, rel_type, direction) in relations {
                if to_id == anchor_id {
                    let (anchor_x, anchor_y, _) = placed.get(anchor_id)?;

                    // 反向偏移
                    let (dx, dy) = match (rel_type, direction) {
                        (RelationType::Direction, Some(dir)) => {
                            let (x, y) = self.direction_offset(dir);
                            (-x, -y) // 反向
                        }
                        (RelationType::Nearby, _) => (-5.0, 0.0),
                        _ => (-10.0, 0.0),
                    };

                    return Some((
                        anchor_x + dx,
                        anchor_y + dy,
                        CoordinateConfidence::Relative,
                    ));
                }
            }
        }

        None
    }

    /// 方向偏移
    fn direction_offset(&self, direction: &Direction) -> (f64, f64) {
        match direction {
            Direction::North => (0.0, 15.0),
            Direction::South => (0.0, -15.0),
            Direction::East => (15.0, 0.0),
            Direction::West => (-15.0, 0.0),
            Direction::Northeast => (10.0, 10.0),
            Direction::Northwest => (-10.0, 10.0),
            Direction::Southeast => (10.0, -10.0),
            Direction::Southwest => (-10.0, -10.0),
        }
    }

    /// 反向方向
    fn reverse_direction(&self, direction: Option<&Direction>) -> Option<Direction> {
        direction.map(|d| match d {
            Direction::North => Direction::South,
            Direction::South => Direction::North,
            Direction::East => Direction::West,
            Direction::West => Direction::East,
            Direction::Northeast => Direction::Southwest,
            Direction::Northwest => Direction::Southeast,
            Direction::Southeast => Direction::Northwest,
            Direction::Southwest => Direction::Northeast,
        })
    }

    /// 没有关系时的默认布局（网格）
    fn place_without_relations(&self, entities: &[WorldMapEntity]) -> Vec<PlacedEntity> {
        let grid_size = (entities.len() as f64).sqrt().ceil() as usize;
        let spacing = 80.0 / grid_size as f64;

        entities
            .iter()
            .enumerate()
            .map(|(i, entity)| {
                let row = i / grid_size;
                let col = i % grid_size;
                PlacedEntity {
                    entity_id: entity.id.clone(),
                    x: 10.0 + col as f64 * spacing,
                    y: 10.0 + row as f64 * spacing,
                    confidence: CoordinateConfidence::Tentative,
                    constraints_satisfied: vec![],
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_coordinates_empty() {
        let optimizer = WorldMapOptimizer::new();
        let spec = WorldMapSpec {
            metadata: WorldMapMetadata::default(),
            entities: vec![],
            relations: vec![],
            routes: vec![],
            factions: vec![],
            constraints: WorldMapConstraints::default(),
            conflicts: vec![],
            coordinates: None,
            review_items: vec![],
            statistics: WorldMapStatistics::default(),
        };

        let coords = optimizer.generate_coordinates(&spec).unwrap();
        assert!(matches!(coords.status, CoordinateStatus::Blocked));
    }

    #[test]
    fn test_generate_coordinates_with_relations() {
        let optimizer = WorldMapOptimizer::new();

        let entities = vec![
            WorldMapEntity {
                id: "E001".to_string(),
                canonical_name: "中心城".to_string(),
                aliases: vec![],
                entity_type: EntityType::Settlement,
                subtype: None,
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
            },
            WorldMapEntity {
                id: "E002".to_string(),
                canonical_name: "东城".to_string(),
                aliases: vec![],
                entity_type: EntityType::Settlement,
                subtype: None,
                first_chapter: 2,
                evidence: Evidence {
                    level: EvidenceLevel::A,
                    chapter: 2,
                    quote: "...".to_string(),
                    context: None,
                },
                description: None,
                faction_id: None,
                related_entity_ids: vec![],
            },
        ];

        let relations = vec![WorldMapRelation {
            id: "R001".to_string(),
            from_id: "E001".to_string(),
            to_id: "E002".to_string(),
            relation_type: RelationType::Direction,
            direction: Some(Direction::East),
            bidirectional: false,
            evidence: Evidence {
                level: EvidenceLevel::A,
                chapter: 2,
                quote: "...".to_string(),
                context: None,
            },
            constraint_type: ConstraintType::Hard,
        }];

        let spec = WorldMapSpec {
            metadata: WorldMapMetadata::default(),
            entities,
            relations,
            routes: vec![],
            factions: vec![],
            constraints: WorldMapConstraints::default(),
            conflicts: vec![],
            coordinates: None,
            review_items: vec![],
            statistics: WorldMapStatistics::default(),
        };

        let coords = optimizer.generate_coordinates(&spec).unwrap();
        
        assert!(matches!(coords.status, CoordinateStatus::Feasible));
        assert_eq!(coords.placed.len(), 2);
        
        // 验证东城在中心城东边
        let center = coords.placed.iter().find(|p| p.entity_id == "E001").unwrap();
        let east = coords.placed.iter().find(|p| p.entity_id == "E002").unwrap();
        assert!(east.x > center.x);
    }
}
