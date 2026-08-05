use axum::{
    body::Body,
    extract::{Multipart, State},
    http::{header, HeaderValue, Response},
    Json,
};
use serde_json::{json, Value};

use crate::api::{auth::AuthContext, AppState};
use crate::error::error::{ApiResponse, AppError};
use crate::model::reader_background::{
    ReaderBackgroundFit, ReaderBackgroundMetadata, ReaderBackgroundPosition,
    ReaderBackgroundSettings,
};
use crate::service::reader_background_service::MAX_READER_BACKGROUND_BYTES;

const MAX_SETTING_FIELD_BYTES: usize = 64;

pub async fn get_reader_background(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<Option<ReaderBackgroundMetadata>>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    let metadata = state
        .reader_background_service
        .get_metadata(&user_ns)
        .await?;
    Ok(Json(ApiResponse::ok(metadata)))
}

pub async fn get_reader_background_image(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response<Body>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    let image = state.reader_background_service.get_image(&user_ns).await?;
    let mut response = Response::new(Body::from(image.bytes));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&image.metadata.content_type)
            .map_err(|error| AppError::Internal(error.into()))?,
    );
    headers.insert(
        header::ETAG,
        HeaderValue::from_str(&format!("\"{}\"", image.metadata.etag))
            .map_err(|error| AppError::Internal(error.into()))?,
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

pub async fn upload_reader_background(
    State(state): State<AppState>,
    auth: AuthContext,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<ReaderBackgroundMetadata>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    let service = state.reader_background_service.clone();
    let mut setting_fields = Vec::new();
    let mut file = None;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::BadRequest(error.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            if file.is_some() {
                return Err(AppError::BadRequest("每次只能上传一张背景图片".to_string()));
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = field
                .chunk()
                .await
                .map_err(|error| AppError::BadRequest(error.to_string()))?
            {
                if bytes.len().saturating_add(chunk.len()) > MAX_READER_BACKGROUND_BYTES {
                    return Err(AppError::BadRequest("背景图片不能超过 15MB".to_string()));
                }
                bytes.extend_from_slice(&chunk);
            }
            file = Some(bytes);
            continue;
        }

        if matches!(
            name.as_str(),
            "enabled" | "readerEnabled" | "fit" | "position" | "overlay"
        ) {
            let bytes = field
                .bytes()
                .await
                .map_err(|error| AppError::BadRequest(error.to_string()))?;
            if bytes.len() > MAX_SETTING_FIELD_BYTES {
                return Err(AppError::BadRequest("背景设置值过长".to_string()));
            }
            let value = std::str::from_utf8(&bytes)
                .map_err(|_| AppError::BadRequest("背景设置编码无效".to_string()))?;
            setting_fields.push((name, value.to_string()));
        }
    }

    let file = file.ok_or_else(|| AppError::BadRequest("请选择背景图片".to_string()))?;
    let metadata = service
        .save_with_settings(&user_ns, &file, move |settings| {
            for (name, value) in setting_fields {
                apply_setting(settings, &name, &value)?;
            }
            Ok(())
        })
        .await?;
    Ok(Json(ApiResponse::ok(metadata)))
}

pub async fn update_reader_background_settings(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(settings): Json<ReaderBackgroundSettings>,
) -> Result<Json<ApiResponse<ReaderBackgroundMetadata>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    let metadata = state
        .reader_background_service
        .update_settings(&user_ns, settings)
        .await?;
    Ok(Json(ApiResponse::ok(metadata)))
}

pub async fn delete_reader_background(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    let deleted = state.reader_background_service.delete(&user_ns).await?;
    Ok(Json(ApiResponse::ok(json!({ "deleted": deleted }))))
}

async fn resolve_user_ns(state: &AppState, auth: &AuthContext) -> Result<String, AppError> {
    state
        .user_service
        .resolve_user_ns_with_override(auth.access_token(), auth.secure_key(), auth.user_ns())
        .await
        .map_err(|_| AppError::BadRequest("NEED_LOGIN".to_string()))
}

fn apply_setting(
    settings: &mut ReaderBackgroundSettings,
    name: &str,
    value: &str,
) -> Result<(), AppError> {
    match name {
        "enabled" => {
            settings.enabled = match value.trim() {
                "true" => true,
                "false" => false,
                _ => {
                    return Err(AppError::BadRequest(
                        "背景启用状态必须是 true 或 false".to_string(),
                    ))
                }
            }
        }
        "readerEnabled" => {
            settings.reader_enabled = match value.trim() {
                "true" => true,
                "false" => false,
                _ => {
                    return Err(AppError::BadRequest(
                        "正文背景启用状态必须是 true 或 false".to_string(),
                    ))
                }
            }
        }
        "fit" => {
            settings.fit = match value.trim() {
                "cover" => ReaderBackgroundFit::Cover,
                "contain" => ReaderBackgroundFit::Contain,
                _ => return Err(AppError::BadRequest("背景缩放方式无效".to_string())),
            }
        }
        "position" => {
            settings.position = match value.trim() {
                "top" => ReaderBackgroundPosition::Top,
                "center" => ReaderBackgroundPosition::Center,
                "bottom" => ReaderBackgroundPosition::Bottom,
                _ => return Err(AppError::BadRequest("背景位置无效".to_string())),
            }
        }
        "overlay" => {
            settings.overlay = value
                .trim()
                .parse::<f32>()
                .map_err(|_| AppError::BadRequest("背景遮罩强度无效".to_string()))?;
        }
        _ => {}
    }
    settings.validate()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multipart_settings_are_strictly_validated() {
        let mut settings = ReaderBackgroundSettings::default();
        apply_setting(&mut settings, "fit", "contain").unwrap();
        apply_setting(&mut settings, "position", "bottom").unwrap();
        apply_setting(&mut settings, "overlay", "0.8").unwrap();
        apply_setting(&mut settings, "enabled", "false").unwrap();
        apply_setting(&mut settings, "readerEnabled", "true").unwrap();
        assert_eq!(settings.fit, ReaderBackgroundFit::Contain);
        assert_eq!(settings.position, ReaderBackgroundPosition::Bottom);
        assert_eq!(settings.overlay, 0.8);
        assert!(!settings.enabled);
        assert!(settings.reader_enabled);

        assert!(apply_setting(&mut settings, "overlay", "NaN").is_err());
        assert!(apply_setting(&mut settings, "position", "left").is_err());
        assert!(apply_setting(&mut settings, "enabled", "1").is_err());
    }
}
