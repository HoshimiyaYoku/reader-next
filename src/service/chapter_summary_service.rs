use std::sync::Arc;

use md5::{Digest, Md5};

use crate::error::error::AppError;
use crate::model::chapter_summary::{ChapterSummaryConfig, ChapterSummaryRecord};
use crate::service::json_document_service::JsonDocumentService;

const APP_NAMESPACE: &str = "__app__";
const CONFIG_NAME: &str = "chapter-summary-config.json";
const SUMMARY_PREFIX: &str = "chapter-summary";

#[derive(Clone)]
pub struct ChapterSummaryService {
    docs: Arc<JsonDocumentService>,
}

impl ChapterSummaryService {
    pub fn new(docs: Arc<JsonDocumentService>) -> Self {
        Self { docs }
    }

    pub async fn get_config(&self) -> Result<ChapterSummaryConfig, AppError> {
        if let Some(value) = self.docs.get_value(APP_NAMESPACE, CONFIG_NAME).await? {
            return serde_json::from_value::<ChapterSummaryConfig>(value)
                .map(|config| config.sanitized())
                .map_err(|e| AppError::BadRequest(e.to_string()));
        }
        Ok(ChapterSummaryConfig::default().sanitized())
    }

    pub async fn save_config(&self, config: ChapterSummaryConfig) -> Result<ChapterSummaryConfig, AppError> {
        let config = config.sanitized();
        self.docs.set_value(APP_NAMESPACE, CONFIG_NAME, &config).await?;
        Ok(config)
    }

    pub async fn get_summary(
        &self,
        user_ns: &str,
        book_url: &str,
        chapter_url: &str,
    ) -> Result<Option<ChapterSummaryRecord>, AppError> {
        let name = summary_name(book_url, chapter_url);
        let Some(value) = self.docs.get_value(user_ns, &name).await? else {
            return Ok(None);
        };
        serde_json::from_value::<ChapterSummaryRecord>(value)
            .map(Some)
            .map_err(|e| AppError::BadRequest(e.to_string()))
    }

    pub async fn save_summary(
        &self,
        user_ns: &str,
        record: ChapterSummaryRecord,
    ) -> Result<ChapterSummaryRecord, AppError> {
        let name = summary_name(&record.book_url, &record.chapter_url);
        self.docs.set_value(user_ns, &name, &record).await?;
        Ok(record)
    }
}

fn summary_name(book_url: &str, chapter_url: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(book_url.as_bytes());
    hasher.update(b"\n");
    hasher.update(chapter_url.as_bytes());
    format!("{}-{:x}.json", SUMMARY_PREFIX, hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;
    use crate::service::json_document_service::JsonDocumentService;
    use crate::model::chapter_summary::ChapterSummaryRecord;
    use uuid::Uuid;
    use std::sync::Arc;
    use tokio::fs;

    async fn create_service() -> (ChapterSummaryService, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("reader-chapter-summary-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let database_url = format!("sqlite:{}?mode=rwc", dir.join("reader.db").display());
        let pool = db::init_pool(&database_url).await.unwrap();
        let docs = Arc::new(JsonDocumentService::new(pool, dir.to_str().unwrap()));
        (ChapterSummaryService::new(docs), dir)
    }

    #[tokio::test]
    async fn chapter_summary_config_defaults_are_safe() {
        let (service, dir) = create_service().await;
        let config = service.get_config().await.unwrap();

        assert!(config.enabled);
        assert!(config.auto_enabled_default);
        assert_eq!(config.detail_level, "normal");
        assert_eq!(config.max_words, 300);
        assert_eq!(config.temperature, 0.3);
        assert_eq!(config.min_content_chars, 300);
        assert!(config.prompt.contains("只总结用户提供的本章正文"));

        let _ = fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn chapter_summary_cache_is_scoped_by_user_book_and_chapter() {
        let (service, dir) = create_service().await;
        let record = ChapterSummaryRecord {
            book_url: "book-a".to_string(),
            chapter_url: "chapter-1".to_string(),
            chapter_index: Some(1),
            chapter_title: Some("第一章".to_string()),
            summary: "主角醒来并发现异样。".to_string(),
            key_points: vec!["主角醒来".to_string()],
            questions: vec!["异样来源未知".to_string()],
            prompt_version: "default-v1".to_string(),
            model: "test-model".to_string(),
            created_at: 10,
            updated_at: 20,
        };

        service.save_summary("u1", record.clone()).await.unwrap();

        assert!(service.get_summary("u1", "book-a", "chapter-1").await.unwrap().is_some());
        assert!(service.get_summary("u2", "book-a", "chapter-1").await.unwrap().is_none());
        assert!(service.get_summary("u1", "book-a", "chapter-2").await.unwrap().is_none());

        let _ = fs::remove_dir_all(dir).await;
    }
}
