use crate::error::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReaderBackgroundFit {
    Cover,
    Contain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReaderBackgroundPosition {
    Top,
    Center,
    Bottom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderBackgroundSettings {
    pub enabled: bool,
    pub fit: ReaderBackgroundFit,
    pub position: ReaderBackgroundPosition,
    pub overlay: f32,
}

impl Default for ReaderBackgroundSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            fit: ReaderBackgroundFit::Cover,
            position: ReaderBackgroundPosition::Center,
            overlay: 0.45,
        }
    }
}

impl ReaderBackgroundSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if !self.overlay.is_finite() || !(0.0..=0.9).contains(&self.overlay) {
            return Err(AppError::BadRequest(
                "背景遮罩强度必须在 0 到 0.9 之间".to_string(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderBackgroundMetadata {
    pub content_type: String,
    pub byte_size: u64,
    pub updated_at: i64,
    pub etag: String,
    #[serde(flatten)]
    pub settings: ReaderBackgroundSettings,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_reject_invalid_overlay() {
        for overlay in [-0.01, 0.91, f32::NAN, f32::INFINITY] {
            let settings = ReaderBackgroundSettings {
                overlay,
                ..ReaderBackgroundSettings::default()
            };
            assert!(settings.validate().is_err());
        }
    }
}
