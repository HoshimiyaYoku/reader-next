use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::api::{auth::AuthContext, AppState};
use crate::error::error::{ApiResponse, AppError};
use crate::model::world_map::*;
use crate::service::world_map_builder::WorldMapBuilderService;

// ==================== Request/Response 结构体 ====================

#[derive(Debug, Deserialize)]
pub struct WorldMapRequest {
    pub book_url: String,
}

#[derive(Debug, Deserialize)]
pub struct BuildWorldMapRequest {
    pub book_url: String,
    pub novel_title: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveWorldMapRequest {
    pub book_url: String,
    pub spec: WorldMapSpec,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorldMapRequest {
    pub book_url: String,
    pub end_chapter: i32,
}

#[derive(Debug, Serialize)]
pub struct UpdateWorldMapResponse {
    pub spec: WorldMapSpec,
    pub added_entities: usize,
    pub added_relations: usize,
}

#[derive(Debug, Deserialize)]
pub struct GenerateCoordinatesRequest {
    pub book_url: String,
}

#[derive(Debug, Deserialize)]
pub struct ResolveReviewRequest {
    pub book_url: String,
    pub item_id: String,
    pub resolution: String,
    pub comment: Option<String>,
}

// ==================== API Handlers ====================

/// 获取地图规格书
pub async fn get_world_map_spec(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(req): Query<WorldMapRequest>,
) -> Result<Json<ApiResponse<WorldMapSpec>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);

    let spec = service
        .load(&user_ns, &req.book_url)
        .await?
        .ok_or_else(|| AppError::NotFound("世界地图规格书不存在".to_string()))?;

    Ok(Json(ApiResponse::ok(spec)))
}

/// 构建地图规格书（从已有 AI资料 locations）
pub async fn build_world_map(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<BuildWorldMapRequest>,
) -> Result<Json<ApiResponse<WorldMapSpec>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);
    let memory = state
        .ai_book_service
        .get_value(&user_ns, &req.book_url)
        .await?
        .ok_or_else(|| AppError::BadRequest("暂无 AI资料，请先更新 AI资料".to_string()))?;
    let novel_title = if req.novel_title.trim().is_empty() {
        memory
            .get("bookName")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("未命名小说")
            .to_string()
    } else {
        req.novel_title
    };

    let spec = service
        .build_from_ai_memory_value(&user_ns, &req.book_url, &novel_title, &memory)
        .await?;

    Ok(Json(ApiResponse::ok(spec)))
}

/// 保存地图规格书
pub async fn save_world_map_spec(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<SaveWorldMapRequest>,
) -> Result<Json<ApiResponse<WorldMapSpec>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);
    service.save(&user_ns, &req.book_url, &req.spec).await?;

    Ok(Json(ApiResponse::ok(req.spec)))
}

/// 增量更新（新章节）
pub async fn update_world_map(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<UpdateWorldMapRequest>,
) -> Result<Json<ApiResponse<UpdateWorldMapResponse>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);

    let memory = state
        .ai_book_service
        .get_value(&user_ns, &req.book_url)
        .await?
        .ok_or_else(|| AppError::BadRequest("暂无 AI资料，请先更新 AI资料".to_string()))?;
    let novel_title = memory
        .get("bookName")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("未命名小说");
    let (updated, added_entities, added_relations) = service
        .update_from_ai_memory_value(
            &user_ns,
            &req.book_url,
            novel_title,
            req.end_chapter,
            &memory,
        )
        .await?;

    let response = UpdateWorldMapResponse {
        added_entities,
        added_relations,
        spec: updated,
    };

    Ok(Json(ApiResponse::ok(response)))
}

/// 生成坐标
pub async fn generate_coordinates(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<GenerateCoordinatesRequest>,
) -> Result<Json<ApiResponse<WorldMapCoordinates>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);

    let coords = service
        .generate_coordinates(&user_ns, &req.book_url)
        .await?;

    Ok(Json(ApiResponse::ok(coords)))
}

/// 获取审查清单
pub async fn get_review_items(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(req): Query<WorldMapRequest>,
) -> Result<Json<ApiResponse<Vec<WorldMapReviewItem>>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);

    let items = service.get_review_items(&user_ns, &req.book_url).await?;

    Ok(Json(ApiResponse::ok(items)))
}

/// 人工修正审查项
pub async fn resolve_review_item(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<ResolveReviewRequest>,
) -> Result<Json<ApiResponse<WorldMapSpec>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;

    let service = WorldMapBuilderService::new(&state.config.storage_dir);
    let _comment = req.comment;
    let spec = service
        .resolve_review_item(&user_ns, &req.book_url, &req.item_id, &req.resolution)
        .await?;

    Ok(Json(ApiResponse::ok(spec)))
}

async fn resolve_user_ns(state: &AppState, auth: &AuthContext) -> Result<String, AppError> {
    state
        .user_service
        .resolve_user_ns_with_override(auth.access_token(), auth.secure_key(), auth.user_ns())
        .await
        .map_err(|_| AppError::BadRequest("NEED_LOGIN".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_request_keeps_book_url_outside_spec_metadata() {
        let request: SaveWorldMapRequest = serde_json::from_value(serde_json::json!({
            "book_url": "https://example.test/book/real",
            "spec": {
                "metadata": {
                    "source_type": "ai_memory",
                    "novel_title": "山海旧事",
                    "allow_later_chapter_info": false,
                    "start_chapter": 0,
                    "end_chapter": 8,
                    "spec_version": "2.0",
                    "analysis_date": "2026-06-16"
                },
                "entities": [],
                "relations": [],
                "routes": [],
                "factions": [],
                "constraints": { "hard": [], "soft": [] },
                "conflicts": [],
                "review_items": [],
                "statistics": {
                    "total_entities": 0,
                    "total_relations": 0,
                    "total_routes": 0,
                    "total_factions": 0,
                    "total_hard_constraints": 0,
                    "total_soft_constraints": 0,
                    "total_conflicts": 0,
                    "total_review_items": 0,
                    "total_issues": 0,
                    "auto_resolved": 0,
                    "need_human": 0,
                    "automation_rate": 1.0,
                    "coordinate_coverage_rate": 0.0
                }
            }
        })).unwrap();

        assert_eq!(request.book_url, "https://example.test/book/real");
        assert_eq!(request.spec.metadata.novel_title, "山海旧事");
    }
}
