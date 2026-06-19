# Chapter Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-chapter AI summaries in Reader: backend-configured prompt/model, backend cache, inline elegant reading-card UI, settings toggle, and desktop sidebar auto-toggle.

**Architecture:** Add a small backend `ChapterSummaryService` backed by existing `JsonDocumentService` and existing server text model config. Add focused REST handlers under `/reader3/chapterSummary*`. Frontend keeps summary state local to `ReaderView.vue`, persists the user auto toggle in existing `readConfig`, and adds one sidebar shortcut that flips the same setting.

**Tech Stack:** Rust + axum + serde/sqlx-backed JSON documents; Vue 3 + Pinia + axios; existing Reader theme/chrome variables; cargo tests and Vitest/build checks.

---

## File Structure

- Create `src/model/chapter_summary.rs` — request/response/config/record structs plus defaults.
- Create `src/service/chapter_summary_service.rs` — config persistence, summary cache persistence, model call, JSON parsing.
- Create `src/api/handlers/chapter_summary.rs` — auth/admin resolution and REST endpoints.
- Modify `src/model/mod.rs` — export `chapter_summary`.
- Modify `src/service/mod.rs` — export `chapter_summary_service`.
- Modify `src/api/mod.rs` — add `chapter_summary_service` to `AppState`.
- Modify `src/app/bootstrap.rs` — instantiate `ChapterSummaryService`.
- Modify `src/api/handlers/mod.rs` — export handlers.
- Modify `src/api/router.rs` — add routes.
- Create `frontend/src/api/chapterSummary.ts` — frontend API wrapper.
- Modify `frontend/src/types/index.ts` — frontend summary/config types.
- Modify `frontend/src/stores/reader.ts` — add `enableChapterSummaryAuto` to `ReadConfig`.
- Modify `frontend/src/components/reader/ReadSettings.vue` — add `AI 本章梗概` settings section.
- Modify `frontend/src/components/reader/ReaderSidebar.vue` — add `摘要` auto-toggle button.
- Modify `frontend/src/views/ReaderView.vue` — inline summary card, auto generation state, stale-request guard.

Keep this feature out of existing AI资料 files unless importing existing model config types is unavoidable.

---

### Task 1: Backend model and service shell

**Files:**
- Create: `/Users/maple/Documents/reader/src/model/chapter_summary.rs`
- Modify: `/Users/maple/Documents/reader/src/model/mod.rs`
- Create: `/Users/maple/Documents/reader/src/service/chapter_summary_service.rs`
- Modify: `/Users/maple/Documents/reader/src/service/mod.rs`

- [ ] **Step 1: Add failing backend tests for config defaults and cache key behavior**

Create `src/service/chapter_summary_service.rs` with the tests first and minimal imports. The implementation will not compile yet because the model/service structs do not exist.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;
    use crate::service::json_document_service::JsonDocumentService;
    use crate::model::chapter_summary::{ChapterSummaryConfig, ChapterSummaryRecord};
    use crate::util::time::now_ts;
    use std::sync::Arc;
    use tokio::fs;

    async fn create_service() -> (ChapterSummaryService, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("reader-chapter-summary-test-{}", now_ts()));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --lib chapter_summary
```

Expected: compile failure mentioning missing `model::chapter_summary` and `ChapterSummaryService`.

- [ ] **Step 3: Add model structs**

Create `/Users/maple/Documents/reader/src/model/chapter_summary.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct ChapterSummaryConfig {
    pub enabled: bool,
    pub auto_enabled_default: bool,
    pub prompt: String,
    pub detail_level: String,
    pub max_words: usize,
    pub temperature: f32,
    pub min_content_chars: usize,
}

impl Default for ChapterSummaryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_enabled_default: true,
            prompt: default_chapter_summary_prompt(),
            detail_level: "normal".to_string(),
            max_words: 300,
            temperature: 0.3,
            min_content_chars: 300,
        }
    }
}

impl ChapterSummaryConfig {
    pub fn sanitized(mut self) -> Self {
        self.detail_level = match self.detail_level.as_str() {
            "short" | "normal" | "detailed" => self.detail_level,
            _ => "normal".to_string(),
        };
        self.max_words = self.max_words.clamp(80, 600);
        self.temperature = self.temperature.clamp(0.0, 1.5);
        self.min_content_chars = self.min_content_chars.clamp(0, 5_000);
        if self.prompt.trim().is_empty() {
            self.prompt = default_chapter_summary_prompt();
        } else {
            self.prompt = self.prompt.trim().to_string();
        }
        self
    }

    pub fn without_admin_fields(mut self) -> Self {
        self.prompt.clear();
        self.temperature = 0.0;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChapterSummaryRecord {
    pub book_url: String,
    pub chapter_url: String,
    pub chapter_index: Option<i32>,
    pub chapter_title: Option<String>,
    pub summary: String,
    pub key_points: Vec<String>,
    pub questions: Vec<String>,
    pub prompt_version: String,
    pub model: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GenerateChapterSummaryRequest {
    pub book_url: String,
    pub chapter_url: String,
    pub chapter_index: Option<i32>,
    pub chapter_title: Option<String>,
    pub content: String,
    pub force: bool,
}

impl Default for GenerateChapterSummaryRequest {
    fn default() -> Self {
        Self {
            book_url: String::new(),
            chapter_url: String::new(),
            chapter_index: None,
            chapter_title: None,
            content: String::new(),
            force: false,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetChapterSummaryQuery {
    pub book_url: String,
    pub chapter_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChapterSummaryConfigRequest {
    pub config: ChapterSummaryConfig,
}

pub fn default_chapter_summary_prompt() -> String {
    "你是小说阅读助手。只总结用户提供的本章正文，不预测未读内容。使用简体中文，输出 JSON：{\"summary\":\"梗概\",\"keyPoints\":[\"关键人物或线索\"],\"questions\":[\"伏笔疑点\"]}。".to_string()
}
```

Modify `/Users/maple/Documents/reader/src/model/mod.rs`:

```rust
pub mod ai_book;
pub mod ai_model;
pub mod ai_proxy;
pub mod book;
pub mod book_chapter;
pub mod book_group;
pub mod book_source;
pub mod bookmark;
pub mod chapter_summary;
pub mod replace_rule;
pub mod rss;
pub mod rule;
pub mod search;
pub mod user;
```

- [ ] **Step 4: Implement minimal service cache/config methods**

Replace the top of `/Users/maple/Documents/reader/src/service/chapter_summary_service.rs` above the test module with:

```rust
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
```

Modify `/Users/maple/Documents/reader/src/service/mod.rs`:

```rust
pub mod ai_book_service;
pub mod ai_model_service;
pub mod book_group_service;
pub mod book_service;
pub mod book_source_service;
pub mod chapter_summary_service;
pub mod json_document_service;
pub mod local_txt_book;
pub mod search_relevance;
pub mod update_service;
pub mod user_service;
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cargo test --lib chapter_summary
```

Expected: both `chapter_summary_*` tests pass.

- [ ] **Step 6: Commit**

```bash
git add /Users/maple/Documents/reader/src/model/mod.rs /Users/maple/Documents/reader/src/model/chapter_summary.rs /Users/maple/Documents/reader/src/service/mod.rs /Users/maple/Documents/reader/src/service/chapter_summary_service.rs
git commit -m "feat: add chapter summary storage"
```

---

### Task 2: Backend generation and routes

**Files:**
- Modify: `/Users/maple/Documents/reader/src/service/chapter_summary_service.rs`
- Create: `/Users/maple/Documents/reader/src/api/handlers/chapter_summary.rs`
- Modify: `/Users/maple/Documents/reader/src/api/handlers/mod.rs`
- Modify: `/Users/maple/Documents/reader/src/api/mod.rs`
- Modify: `/Users/maple/Documents/reader/src/app/bootstrap.rs`
- Modify: `/Users/maple/Documents/reader/src/api/router.rs`

- [ ] **Step 1: Add tests for generate validation and cached force=false**

Append these tests inside `mod tests` in `/Users/maple/Documents/reader/src/service/chapter_summary_service.rs`:

```rust
    #[tokio::test]
    async fn generate_rejects_short_content() {
        let (service, dir) = create_service().await;
        let config = ChapterSummaryConfig { min_content_chars: 10, ..Default::default() };
        let err = service.validate_generation_input(&config, "太短").unwrap_err();

        assert!(err.to_string().contains("正文内容不足"));
        let _ = fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn get_or_cached_summary_uses_cache_when_not_forced() {
        let (service, dir) = create_service().await;
        let record = ChapterSummaryRecord {
            book_url: "book-a".to_string(),
            chapter_url: "chapter-1".to_string(),
            chapter_index: Some(1),
            chapter_title: Some("第一章".to_string()),
            summary: "缓存摘要".to_string(),
            key_points: vec![],
            questions: vec![],
            prompt_version: "default-v1".to_string(),
            model: "cached-model".to_string(),
            created_at: 1,
            updated_at: 1,
        };
        service.save_summary("u1", record).await.unwrap();

        let cached = service
            .get_cached_if_allowed("u1", "book-a", "chapter-1", false)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cached.summary, "缓存摘要");

        let forced = service
            .get_cached_if_allowed("u1", "book-a", "chapter-1", true)
            .await
            .unwrap();
        assert!(forced.is_none());

        let _ = fs::remove_dir_all(dir).await;
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --lib chapter_summary
```

Expected: compile failure for missing `validate_generation_input` and `get_cached_if_allowed`.

- [ ] **Step 3: Add validation/cache helpers and model-call generation method**

Add these imports to `/Users/maple/Documents/reader/src/service/chapter_summary_service.rs`:

```rust
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use crate::model::ai_model::{AiModelConfig, AiModelKind};
use crate::model::ai_proxy::build_ai_proxy_url;
use crate::model::chapter_summary::GenerateChapterSummaryRequest;
use crate::util::time::now_ts;
```

Add these methods inside `impl ChapterSummaryService`:

```rust
    pub fn validate_generation_input(
        &self,
        config: &ChapterSummaryConfig,
        content: &str,
    ) -> Result<(), AppError> {
        if !config.enabled {
            return Err(AppError::BadRequest("本章摘要功能未启用".to_string()));
        }
        if content.trim().is_empty() {
            return Err(AppError::BadRequest("正文内容为空".to_string()));
        }
        if content.chars().count() < config.min_content_chars {
            return Err(AppError::BadRequest("正文内容不足，未达到生成摘要的最短长度".to_string()));
        }
        Ok(())
    }

    pub async fn get_cached_if_allowed(
        &self,
        user_ns: &str,
        book_url: &str,
        chapter_url: &str,
        force: bool,
    ) -> Result<Option<ChapterSummaryRecord>, AppError> {
        if force {
            return Ok(None);
        }
        self.get_summary(user_ns, book_url, chapter_url).await
    }

    pub async fn generate_summary(
        &self,
        user_ns: &str,
        req: GenerateChapterSummaryRequest,
        ai_config: AiModelConfig,
        client: &Client,
    ) -> Result<ChapterSummaryRecord, AppError> {
        let config = self.get_config().await?;
        self.validate_generation_input(&config, &req.content)?;

        if let Some(cached) = self
            .get_cached_if_allowed(user_ns, &req.book_url, &req.chapter_url, req.force)
            .await?
        {
            return Ok(cached);
        }

        let endpoint = ai_config.resolve(AiModelKind::Text);
        if !endpoint.enabled || endpoint.base_url.trim().is_empty() || endpoint.model.trim().is_empty() {
            return Err(AppError::BadRequest("后端文本模型未启用或配置不完整".to_string()));
        }

        let path = if endpoint.path.trim().is_empty() { "/v1/chat/completions" } else { endpoint.path.trim() };
        let target = build_ai_proxy_url(&endpoint.base_url, path, endpoint.use_full_url).map_err(AppError::BadRequest)?;
        let body = json!({
            "model": endpoint.model,
            "temperature": config.temperature,
            "messages": [
                { "role": "system", "content": config.prompt },
                { "role": "user", "content": build_chapter_summary_user_prompt(&config, &req) }
            ]
        });

        let mut builder = client.post(target).header(reqwest::header::ACCEPT, "application/json").json(&body);
        if !endpoint.api_key.trim().is_empty() {
            builder = builder.bearer_auth(endpoint.api_key.trim());
        }
        let response = builder.send().await.map_err(|e| AppError::Internal(e.into()))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!("摘要模型请求失败: {} {}", status, text.chars().take(200).collect::<String>())));
        }

        let value: Value = response.json().await.map_err(|e| AppError::Internal(e.into()))?;
        let content = extract_chat_content(&value)?;
        let parsed = parse_summary_payload(&content)?;
        let now = now_ts();
        let old = self.get_summary(user_ns, &req.book_url, &req.chapter_url).await?;
        let created_at = old.as_ref().map(|v| v.created_at).unwrap_or(now);
        let record = ChapterSummaryRecord {
            book_url: req.book_url,
            chapter_url: req.chapter_url,
            chapter_index: req.chapter_index,
            chapter_title: req.chapter_title,
            summary: parsed.summary,
            key_points: parsed.key_points,
            questions: parsed.questions,
            prompt_version: "default-v1".to_string(),
            model: endpoint.model,
            created_at,
            updated_at: now,
        };
        self.save_summary(user_ns, record).await
    }
```

Add helper functions below `summary_name`:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelSummaryPayload {
    summary: String,
    #[serde(default)]
    key_points: Vec<String>,
    #[serde(default)]
    questions: Vec<String>,
}

fn build_chapter_summary_user_prompt(config: &ChapterSummaryConfig, req: &GenerateChapterSummaryRequest) -> String {
    format!(
        "书籍URL：{}\n章节：{}\n详细程度：{}\n最多{}字\n\n正文：\n{}",
        req.book_url,
        req.chapter_title.as_deref().unwrap_or("未命名章节"),
        config.detail_level,
        config.max_words,
        trim_content_for_summary(&req.content)
    )
}

fn trim_content_for_summary(content: &str) -> String {
    const MAX_CHARS: usize = 12_000;
    let count = content.chars().count();
    if count <= MAX_CHARS {
        return content.to_string();
    }
    let head: String = content.chars().take(8_000).collect();
    let tail: String = content.chars().skip(count.saturating_sub(4_000)).collect();
    format!("{}\n\n……中间内容已省略……\n\n{}", head, tail)
}

fn extract_chat_content(value: &Value) -> Result<String, AppError> {
    value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::BadRequest("摘要模型返回内容为空".to_string()))
}

fn parse_summary_payload(content: &str) -> Result<ModelSummaryPayload, AppError> {
    let trimmed = content.trim();
    let json_text = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };
    serde_json::from_str::<ModelSummaryPayload>(json_text)
        .map_err(|_| AppError::BadRequest("摘要模型返回 JSON 格式不正确".to_string()))
}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
cargo test --lib chapter_summary
```

Expected: all chapter summary tests pass.

- [ ] **Step 5: Wire service into AppState**

Modify `/Users/maple/Documents/reader/src/api/mod.rs` imports and `AppState`:

```rust
use crate::service::{
    ai_book_service::AiBookService, ai_model_service::AiModelService,
    book_group_service::BookGroupService, book_service::BookService,
    book_source_service::BookSourceService, chapter_summary_service::ChapterSummaryService,
    json_document_service::JsonDocumentService, local_txt_book::LocalTxtBookService,
    update_service::UpdateService, user_service::UserService,
};
```

Add field:

```rust
pub chapter_summary_service: Arc<ChapterSummaryService>,
```

Modify `/Users/maple/Documents/reader/src/app/bootstrap.rs` imports:

```rust
use crate::service::{
    ai_book_service::AiBookService, ai_model_service::AiModelService,
    book_group_service::BookGroupService, book_service::BookService,
    book_source_service::BookSourceService, chapter_summary_service::ChapterSummaryService,
    json_document_service::JsonDocumentService, local_txt_book::LocalTxtBookService,
    update_service::UpdateService, user_service::UserService,
};
```

Instantiate after `ai_model_service`:

```rust
let chapter_summary_service = Arc::new(ChapterSummaryService::new(json_document_service.clone()));
```

Add to `AppState`:

```rust
chapter_summary_service,
```

- [ ] **Step 6: Add REST handlers**

Create `/Users/maple/Documents/reader/src/api/handlers/chapter_summary.rs`:

```rust
use axum::{extract::{Query, State}, Json};
use reqwest::Client;
use serde_json::Value;

use crate::api::{auth::AuthContext, AppState};
use crate::error::error::{ApiResponse, AppError};
use crate::model::chapter_summary::{
    GenerateChapterSummaryRequest, GetChapterSummaryQuery, SaveChapterSummaryConfigRequest,
};

pub async fn get_chapter_summary(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<GetChapterSummaryQuery>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    let summary = state
        .chapter_summary_service
        .get_summary(&user_ns, &query.book_url, &query.chapter_url)
        .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "summary": summary }))))
}

pub async fn generate_chapter_summary(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<GenerateChapterSummaryRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let user_ns = resolve_user_ns(&state, &auth).await?;
    if req.book_url.trim().is_empty() || req.chapter_url.trim().is_empty() {
        return Err(AppError::BadRequest("bookUrl and chapterUrl required".to_string()));
    }
    let can_use = state
        .user_service
        .can_use_ai_model(auth.access_token(), auth.secure_key())
        .await?;
    if !can_use {
        return Err(AppError::BadRequest("当前账号没有使用后端模型配置的权限".to_string()));
    }
    let ai_config = state.ai_model_service.get().await?;
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(state.config.request_timeout_secs.max(15)))
        .build()
        .map_err(|e| AppError::Internal(e.into()))?;
    let summary = state
        .chapter_summary_service
        .generate_summary(&user_ns, req, ai_config, &client)
        .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "summary": summary }))))
}

pub async fn get_chapter_summary_config(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let is_admin = is_chapter_summary_admin(&state, &auth).await?;
    let can_use_server_model = state
        .user_service
        .can_use_ai_model(auth.access_token(), auth.secure_key())
        .await?;
    let config = state.chapter_summary_service.get_config().await?;
    let visible = if is_admin { config } else { config.without_admin_fields() };
    Ok(Json(ApiResponse::ok(serde_json::json!({
        "config": visible,
        "canUseServerModel": can_use_server_model,
        "isAdmin": is_admin,
    }))))
}

pub async fn save_chapter_summary_config(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<SaveChapterSummaryConfigRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    if !is_chapter_summary_admin(&state, &auth).await? {
        return Ok(Json(ApiResponse::err_with_data(
            "请输入管理密码",
            Value::String("NEED_SECURE_KEY".to_string()),
        )));
    }
    let config = state.chapter_summary_service.save_config(req.config).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({
        "config": config,
        "canUseServerModel": true,
        "isAdmin": true,
    }))))
}

async fn resolve_user_ns(state: &AppState, auth: &AuthContext) -> Result<String, AppError> {
    state
        .user_service
        .resolve_user_namespace(auth.access_token(), auth.secure_key())
        .await
}

async fn is_chapter_summary_admin(state: &AppState, auth: &AuthContext) -> Result<bool, AppError> {
    if !state.user_service.secure_enabled() {
        return Ok(true);
    }
    state
        .user_service
        .is_admin(auth.access_token(), auth.secure_key())
        .await
}
```

- [ ] **Step 7: Export handlers and add routes**

Modify `/Users/maple/Documents/reader/src/api/handlers/mod.rs`:

```rust
mod ai_book;
mod ai_model;
mod ai_proxy;
mod book;
mod book_group;
mod book_source;
mod bookmark;
mod chapter_summary;
mod replace_rule;
mod rss;
mod update;
mod user;
mod webdav;

pub use chapter_summary::*;
```

Keep the existing `pub use` lines for other modules unchanged.

Modify `/Users/maple/Documents/reader/src/api/router.rs` after `/reader3/saveAiModelConfig` routes:

```rust
        .route(
            "/reader3/chapterSummary",
            get(handlers::get_chapter_summary),
        )
        .route(
            "/reader3/chapterSummary/generate",
            post(handlers::generate_chapter_summary),
        )
        .route(
            "/reader3/chapterSummary/config",
            get(handlers::get_chapter_summary_config).post(handlers::save_chapter_summary_config),
        )
```

- [ ] **Step 8: Run backend checks**

Run:

```bash
cargo test --lib chapter_summary
cargo test --lib ai_model_service::tests::ai_model_config_round_trips_and_sanitizes
cargo check
```

Expected: tests pass and `cargo check` finishes without errors.

- [ ] **Step 9: Commit**

```bash
git add /Users/maple/Documents/reader/src/service/chapter_summary_service.rs /Users/maple/Documents/reader/src/api/handlers/chapter_summary.rs /Users/maple/Documents/reader/src/api/handlers/mod.rs /Users/maple/Documents/reader/src/api/mod.rs /Users/maple/Documents/reader/src/app/bootstrap.rs /Users/maple/Documents/reader/src/api/router.rs
git commit -m "feat: expose chapter summary API"
```

---

### Task 3: Frontend API, types, and settings state

**Files:**
- Modify: `/Users/maple/Documents/reader/frontend/src/types/index.ts`
- Create: `/Users/maple/Documents/reader/frontend/src/api/chapterSummary.ts`
- Modify: `/Users/maple/Documents/reader/frontend/src/stores/reader.ts`

- [ ] **Step 1: Add frontend API test**

Create `/Users/maple/Documents/reader/frontend/src/api/chapterSummary.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('./http', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}))

const api = await import('./chapterSummary')

describe('chapterSummary api', () => {
  it('reads cached summary with book and chapter urls', async () => {
    getMock.mockResolvedValueOnce({ data: { summary: null } })

    await expect(api.getChapterSummary('book a', 'chapter 1')).resolves.toEqual({ summary: null })

    expect(getMock).toHaveBeenCalledWith('/chapterSummary', {
      params: { bookUrl: 'book a', chapterUrl: 'chapter 1' },
    })
  })

  it('generates summary through backend endpoint', async () => {
    getMock.mockReset()
    postMock.mockResolvedValueOnce({ data: { summary: { summary: 'ok' } } })

    await api.generateChapterSummary({
      bookUrl: 'book',
      chapterUrl: 'chapter',
      chapterIndex: 1,
      chapterTitle: '第一章',
      content: '正文内容',
      force: true,
    })

    expect(postMock).toHaveBeenCalledWith('/chapterSummary/generate', {
      bookUrl: 'book',
      chapterUrl: 'chapter',
      chapterIndex: 1,
      chapterTitle: '第一章',
      content: '正文内容',
      force: true,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm test -- src/api/chapterSummary.test.ts
```

Expected: fail because `frontend/src/api/chapterSummary.ts` does not exist.

- [ ] **Step 3: Add frontend types**

Append near existing AI model types in `/Users/maple/Documents/reader/frontend/src/types/index.ts`:

```ts
export interface ChapterSummaryConfig {
  enabled: boolean
  autoEnabledDefault: boolean
  prompt: string
  detailLevel: 'short' | 'normal' | 'detailed'
  maxWords: number
  temperature: number
  minContentChars: number
}

export interface ChapterSummaryConfigResponse {
  config: ChapterSummaryConfig
  canUseServerModel: boolean
  isAdmin: boolean
}

export interface ChapterSummaryRecord {
  bookUrl: string
  chapterUrl: string
  chapterIndex?: number
  chapterTitle?: string
  summary: string
  keyPoints: string[]
  questions: string[]
  promptVersion: string
  model: string
  createdAt: number
  updatedAt: number
}

export interface ChapterSummaryResponse {
  summary: ChapterSummaryRecord | null
}

export interface GenerateChapterSummaryRequest {
  bookUrl: string
  chapterUrl: string
  chapterIndex?: number
  chapterTitle?: string
  content: string
  force?: boolean
}
```

- [ ] **Step 4: Add frontend API wrapper**

Create `/Users/maple/Documents/reader/frontend/src/api/chapterSummary.ts`:

```ts
import http from './http'
import type {
  ChapterSummaryConfig,
  ChapterSummaryConfigResponse,
  ChapterSummaryResponse,
  GenerateChapterSummaryRequest,
} from '../types'

export function getChapterSummary(bookUrl: string, chapterUrl: string) {
  return http
    .get<ChapterSummaryResponse>('/chapterSummary', { params: { bookUrl, chapterUrl } })
    .then((r) => r.data)
}

export function generateChapterSummary(payload: GenerateChapterSummaryRequest) {
  return http
    .post<ChapterSummaryResponse>('/chapterSummary/generate', payload)
    .then((r) => r.data)
}

export function getChapterSummaryConfig() {
  return http
    .get<ChapterSummaryConfigResponse>('/chapterSummary/config')
    .then((r) => r.data)
}

export function saveChapterSummaryConfig(config: ChapterSummaryConfig) {
  return http
    .post<ChapterSummaryConfigResponse>('/chapterSummary/config', { config })
    .then((r) => r.data)
}
```

- [ ] **Step 5: Add reader config field**

Modify `ReadConfig` in `/Users/maple/Documents/reader/frontend/src/stores/reader.ts`:

```ts
  enablePreload: boolean
  enableChapterSummaryAuto: boolean
```

Modify `defaultConfig`:

```ts
  enablePreload: false,
  enableChapterSummaryAuto: true,
```

No migration code is needed because `loadConfig()` merges saved config with defaults.

- [ ] **Step 6: Run frontend API test**

Run:

```bash
cd frontend && npm test -- src/api/chapterSummary.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add /Users/maple/Documents/reader/frontend/src/types/index.ts /Users/maple/Documents/reader/frontend/src/api/chapterSummary.ts /Users/maple/Documents/reader/frontend/src/api/chapterSummary.test.ts /Users/maple/Documents/reader/frontend/src/stores/reader.ts
git commit -m "feat: add chapter summary frontend API"
```

---

### Task 4: ReadSettings and desktop sidebar auto toggle

**Files:**
- Modify: `/Users/maple/Documents/reader/frontend/src/components/reader/ReadSettings.vue`
- Modify: `/Users/maple/Documents/reader/frontend/src/components/reader/ReaderSidebar.vue`
- Modify: `/Users/maple/Documents/reader/frontend/src/views/ReaderView.vue`

- [ ] **Step 1: Add settings UI for user toggle and admin config entry**

In `/Users/maple/Documents/reader/frontend/src/components/reader/ReadSettings.vue`, insert this block after the existing `预加载` row and before `字体大小`:

```vue
      <div class="setting-row setting-row-top">
        <label>AI 本章梗概</label>
        <div class="setting-stack">
          <div class="btn-group">
            <button class="opt-btn" :class="{ active: config.enableChapterSummaryAuto }" @click="store.updateConfig('enableChapterSummaryAuto', true)">自动</button>
            <button class="opt-btn" :class="{ active: !config.enableChapterSummaryAuto }" @click="store.updateConfig('enableChapterSummaryAuto', false)">手动</button>
          </div>
          <p class="setting-hint">进入章节后延迟生成；已有缓存不会重复消耗模型。</p>
          <details v-if="chapterSummaryConfig?.isAdmin" class="advanced-config">
            <summary>高级配置</summary>
            <div class="advanced-grid">
              <label>
                功能启用
                <select v-model="chapterSummaryDraft.enabledText">
                  <option value="true">启用</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                默认自动
                <select v-model="chapterSummaryDraft.autoEnabledDefaultText">
                  <option value="true">自动</option>
                  <option value="false">手动</option>
                </select>
              </label>
              <label>
                详细程度
                <select v-model="chapterSummaryDraft.detailLevel">
                  <option value="short">简短</option>
                  <option value="normal">正常</option>
                  <option value="detailed">详细</option>
                </select>
              </label>
              <label>
                最大字数
                <input v-model.number="chapterSummaryDraft.maxWords" type="number" min="80" max="600" />
              </label>
              <label>
                Temperature
                <input v-model.number="chapterSummaryDraft.temperature" type="number" min="0" max="1.5" step="0.1" />
              </label>
              <label>
                最短正文
                <input v-model.number="chapterSummaryDraft.minContentChars" type="number" min="0" max="5000" />
              </label>
            </div>
            <label class="prompt-field">
              Prompt
              <textarea v-model="chapterSummaryDraft.prompt" rows="4"></textarea>
            </label>
            <button class="opt-btn wide" :disabled="savingChapterSummaryConfig" @click="saveChapterSummarySettings">
              {{ savingChapterSummaryConfig ? '保存中...' : '保存摘要配置' }}
            </button>
          </details>
        </div>
      </div>
```

- [ ] **Step 2: Add settings script state**

Modify imports in `ReadSettings.vue`:

```ts
import { computed, onMounted, reactive, ref } from 'vue'
import { getChapterSummaryConfig, saveChapterSummaryConfig } from '../../api/chapterSummary'
import type { ChapterSummaryConfigResponse } from '../../types'
```

Add after `canUseServerModel`:

```ts
const chapterSummaryConfig = ref<ChapterSummaryConfigResponse | null>(null)
const savingChapterSummaryConfig = ref(false)
const chapterSummaryDraft = reactive({
  enabledText: 'true',
  autoEnabledDefaultText: 'true',
  detailLevel: 'normal' as 'short' | 'normal' | 'detailed',
  maxWords: 300,
  temperature: 0.3,
  minContentChars: 300,
  prompt: '',
})

function applyChapterSummaryDraft(response: ChapterSummaryConfigResponse) {
  chapterSummaryConfig.value = response
  chapterSummaryDraft.enabledText = response.config.enabled ? 'true' : 'false'
  chapterSummaryDraft.autoEnabledDefaultText = response.config.autoEnabledDefault ? 'true' : 'false'
  chapterSummaryDraft.detailLevel = response.config.detailLevel
  chapterSummaryDraft.maxWords = response.config.maxWords
  chapterSummaryDraft.temperature = response.config.temperature
  chapterSummaryDraft.minContentChars = response.config.minContentChars
  chapterSummaryDraft.prompt = response.config.prompt
}

async function loadChapterSummarySettings() {
  try {
    applyChapterSummaryDraft(await getChapterSummaryConfig())
  } catch {
    chapterSummaryConfig.value = null
  }
}

async function saveChapterSummarySettings() {
  if (!chapterSummaryConfig.value?.isAdmin) return
  savingChapterSummaryConfig.value = true
  try {
    const saved = await saveChapterSummaryConfig({
      enabled: chapterSummaryDraft.enabledText === 'true',
      autoEnabledDefault: chapterSummaryDraft.autoEnabledDefaultText === 'true',
      detailLevel: chapterSummaryDraft.detailLevel,
      maxWords: Number(chapterSummaryDraft.maxWords) || 300,
      temperature: Number(chapterSummaryDraft.temperature) || 0.3,
      minContentChars: Number(chapterSummaryDraft.minContentChars) || 300,
      prompt: chapterSummaryDraft.prompt,
    })
    applyChapterSummaryDraft(saved)
    appStore.showToast('摘要配置已保存', 'success')
  } catch (error) {
    appStore.showToast((error as Error).message || '摘要配置保存失败', 'error')
  } finally {
    savingChapterSummaryConfig.value = false
  }
}
```

Modify `onMounted` in `ReadSettings.vue` to load config:

```ts
onMounted(async () => {
  store.fetchVoices()
  await Promise.all([
    aiBookStore.loadServerModelConfig({ force: true }),
    loadChapterSummarySettings(),
  ])
  serverModelLoaded.value = true
  if (store.speechConfig.openaiSource === 'server' && !canUseServerModel.value) {
    store.setOpenAISpeechSource('browser')
  }
})
```

Add styles near existing setting styles:

```css
.setting-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}

.setting-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.55;
  text-align: right;
  line-height: 1.5;
}

.advanced-config {
  width: 100%;
  border: 1px solid currentColor;
  border-color: rgba(128, 128, 128, 0.18);
  border-radius: 12px;
  padding: 10px 12px;
}

.advanced-config summary {
  cursor: pointer;
  color: var(--color-primary, #c97f3a);
  font-size: 13px;
  font-weight: 600;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.advanced-grid label,
.prompt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  opacity: 0.85;
}

.advanced-grid input,
.advanced-grid select,
.prompt-field textarea {
  width: 100%;
  border: 1px solid rgba(128, 128, 128, 0.22);
  border-radius: 8px;
  padding: 7px 9px;
  background: transparent;
  color: inherit;
}

.prompt-field {
  margin-top: 10px;
}
```

- [ ] **Step 3: Add sidebar toggle props/events**

Modify `/Users/maple/Documents/reader/frontend/src/components/reader/ReaderSidebar.vue` template after the `设置` item:

```vue
      <div
        class="sidebar-item"
        :class="{ active: chapterSummaryAuto }"
        :title="chapterSummaryAuto ? '关闭自动摘要' : '开启自动摘要'"
        @click="$emit('toggleChapterSummaryAuto')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M4 12h10M4 19h16" /><path d="m17 9 3 3-3 3" /></svg>
        <span>摘要</span>
      </div>
```

Add props and event type in script:

```ts
withDefaults(defineProps<{
  chapterSummaryAuto?: boolean
}>(), {
  chapterSummaryAuto: false,
})

defineEmits<{
  goHome: []
  scrollTop: []
  scrollBottom: []
  toggleChapterSummaryAuto: []
}>()
```

Remove the old standalone `defineEmits` block so there is only one `defineEmits` call.

- [ ] **Step 4: Wire sidebar event in ReaderView**

Modify the `ReaderSidebar` usage in `/Users/maple/Documents/reader/frontend/src/views/ReaderView.vue`:

```vue
    <ReaderSidebar
      v-if="!isMobile"
      :chapter-summary-auto="config.enableChapterSummaryAuto"
      @goHome="goHome"
      @scrollTop="scrollToTop"
      @scrollBottom="scrollToBottom"
      @toggleChapterSummaryAuto="toggleChapterSummaryAuto"
    />
```

Add a function near other UI handlers:

```ts
function toggleChapterSummaryAuto() {
  const next = !config.value.enableChapterSummaryAuto
  store.updateConfig('enableChapterSummaryAuto', next)
  appStore.showToast(next ? '已开启自动摘要' : '已关闭自动摘要', 'success')
}
```

- [ ] **Step 5: Run frontend focused checks**

Run:

```bash
cd frontend && npm test -- src/api/chapterSummary.test.ts
cd frontend && npm run build
```

Expected: test passes and build finishes without TypeScript/Vite errors.

- [ ] **Step 6: Commit**

```bash
git add /Users/maple/Documents/reader/frontend/src/components/reader/ReadSettings.vue /Users/maple/Documents/reader/frontend/src/components/reader/ReaderSidebar.vue /Users/maple/Documents/reader/frontend/src/views/ReaderView.vue
git commit -m "feat: add chapter summary controls"
```

---

### Task 5: ReaderView inline summary card and auto generation

**Files:**
- Modify: `/Users/maple/Documents/reader/frontend/src/views/ReaderView.vue`

- [ ] **Step 1: Add ReaderView summary state test by extracting stale guard helper**

Create `/Users/maple/Documents/reader/frontend/src/utils/chapterSummaryState.ts`:

```ts
export function buildChapterSummaryIdentity(bookUrl?: string, chapterUrl?: string, chapterIndex?: number) {
  return `${bookUrl || ''}\n${chapterUrl || ''}\n${typeof chapterIndex === 'number' ? chapterIndex : ''}`
}

export function isCurrentChapterSummaryIdentity(current: string, candidate: string) {
  return current === candidate && candidate.trim().length > 0
}
```

Create `/Users/maple/Documents/reader/frontend/src/utils/chapterSummaryState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildChapterSummaryIdentity, isCurrentChapterSummaryIdentity } from './chapterSummaryState'

describe('chapterSummaryState', () => {
  it('builds a stable identity from book chapter and index', () => {
    expect(buildChapterSummaryIdentity('book', 'chapter', 3)).toBe('book\nchapter\n3')
  })

  it('rejects stale chapter identities', () => {
    const current = buildChapterSummaryIdentity('book', 'chapter-2', 2)
    const stale = buildChapterSummaryIdentity('book', 'chapter-1', 1)
    expect(isCurrentChapterSummaryIdentity(current, stale)).toBe(false)
    expect(isCurrentChapterSummaryIdentity(current, current)).toBe(true)
  })
})
```

Run:

```bash
cd frontend && npm test -- src/utils/chapterSummaryState.test.ts
```

Expected: pass.

- [ ] **Step 2: Add imports and state in ReaderView**

In `/Users/maple/Documents/reader/frontend/src/views/ReaderView.vue`, add imports:

```ts
import { getChapterSummary, generateChapterSummary } from '../api/chapterSummary'
import type { ChapterSummaryRecord } from '../types'
import { buildChapterSummaryIdentity, isCurrentChapterSummaryIdentity } from '../utils/chapterSummaryState'
```

Add state near existing refs:

```ts
const chapterSummary = ref<ChapterSummaryRecord | null>(null)
const chapterSummaryStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const chapterSummaryError = ref('')
const chapterSummaryExpanded = ref(false)
let chapterSummaryTimer: number | null = null
let chapterSummaryRequestId = 0
```

Add computed helpers:

```ts
const currentChapterSummaryIdentity = computed(() => buildChapterSummaryIdentity(
  store.book?.bookUrl,
  store.currentChapter?.url,
  store.currentIndex,
))

const chapterSummaryPreview = computed(() => {
  const text = chapterSummary.value?.summary.trim() || ''
  return text.length > 64 ? `${text.slice(0, 64)}…` : text
})
```

- [ ] **Step 3: Add summary functions**

Add functions near navigation helpers:

```ts
function clearChapterSummaryTimer() {
  if (chapterSummaryTimer) {
    window.clearTimeout(chapterSummaryTimer)
    chapterSummaryTimer = null
  }
}

function resetChapterSummaryState() {
  clearChapterSummaryTimer()
  chapterSummary.value = null
  chapterSummaryStatus.value = 'idle'
  chapterSummaryError.value = ''
  chapterSummaryExpanded.value = false
}

async function loadChapterSummaryForCurrentChapter() {
  const bookUrl = store.book?.bookUrl
  const chapterUrl = store.currentChapter?.url
  if (!bookUrl || !chapterUrl) {
    resetChapterSummaryState()
    return
  }

  const identity = currentChapterSummaryIdentity.value
  const requestId = ++chapterSummaryRequestId
  chapterSummaryError.value = ''
  try {
    const res = await getChapterSummary(bookUrl, chapterUrl)
    if (requestId !== chapterSummaryRequestId || !isCurrentChapterSummaryIdentity(currentChapterSummaryIdentity.value, identity)) return
    chapterSummary.value = res.summary
    chapterSummaryStatus.value = res.summary ? 'ready' : 'idle'
    if (!res.summary) scheduleAutoChapterSummary(identity)
  } catch (error) {
    if (requestId !== chapterSummaryRequestId) return
    chapterSummaryStatus.value = 'error'
    chapterSummaryError.value = (error as Error).message || '摘要加载失败'
  }
}

function scheduleAutoChapterSummary(identity: string) {
  clearChapterSummaryTimer()
  if (!config.value.enableChapterSummaryAuto) return
  if (!store.displayContent || store.displayContent.trim().length < 300) return
  chapterSummaryTimer = window.setTimeout(() => {
    if (!isCurrentChapterSummaryIdentity(currentChapterSummaryIdentity.value, identity)) return
    void generateChapterSummaryForCurrentChapter(false)
  }, 1500)
}

async function generateChapterSummaryForCurrentChapter(force: boolean) {
  const bookUrl = store.book?.bookUrl
  const chapter = store.currentChapter
  if (!bookUrl || !chapter?.url || !store.displayContent.trim()) return

  const identity = currentChapterSummaryIdentity.value
  const requestId = ++chapterSummaryRequestId
  clearChapterSummaryTimer()
  chapterSummaryStatus.value = 'loading'
  chapterSummaryError.value = ''
  try {
    const res = await generateChapterSummary({
      bookUrl,
      chapterUrl: chapter.url,
      chapterIndex: store.currentIndex,
      chapterTitle: chapter.title,
      content: store.displayContent,
      force,
    })
    if (requestId !== chapterSummaryRequestId || !isCurrentChapterSummaryIdentity(currentChapterSummaryIdentity.value, identity)) return
    chapterSummary.value = res.summary
    chapterSummaryStatus.value = res.summary ? 'ready' : 'idle'
    chapterSummaryExpanded.value = Boolean(res.summary)
  } catch (error) {
    if (requestId !== chapterSummaryRequestId) return
    chapterSummaryStatus.value = chapterSummary.value ? 'ready' : 'error'
    chapterSummaryError.value = (error as Error).message || '摘要生成失败'
  }
}

function copyChapterSummary() {
  if (!chapterSummary.value) return
  const text = [
    chapterSummary.value.summary,
    chapterSummary.value.keyPoints.length ? `关键人物/线索：${chapterSummary.value.keyPoints.join('；')}` : '',
    chapterSummary.value.questions.length ? `伏笔疑点：${chapterSummary.value.questions.join('；')}` : '',
  ].filter(Boolean).join('\n')
  void navigator.clipboard?.writeText(text)
  appStore.showToast('摘要已复制', 'success')
}
```

- [ ] **Step 4: Add summary card template**

In non-continuous normal article template, place this block after the chapter title and before `.chapter-text`. Use the exact spot where the current template renders `store.currentChapter?.title`.

```vue
          <section class="chapter-summary-card" :class="{ expanded: chapterSummaryExpanded }">
            <button class="chapter-summary-header" @click="chapterSummaryExpanded = !chapterSummaryExpanded">
              <span class="summary-kicker">AI 本章梗概</span>
              <span v-if="chapterSummaryStatus === 'loading'" class="summary-muted">生成中…</span>
              <span v-else-if="chapterSummary" class="summary-muted">{{ chapterSummaryExpanded ? '收起' : chapterSummaryPreview }}</span>
              <span v-else-if="chapterSummaryError" class="summary-muted">{{ chapterSummaryError }}</span>
              <span v-else class="summary-muted">可手动生成</span>
            </button>

            <div v-if="chapterSummaryExpanded" class="chapter-summary-body">
              <p v-if="chapterSummary?.summary" class="summary-main">{{ chapterSummary.summary }}</p>
              <div v-if="chapterSummary?.keyPoints.length" class="summary-list">
                <strong>关键人物/线索</strong>
                <ul>
                  <li v-for="item in chapterSummary.keyPoints" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div v-if="chapterSummary?.questions.length" class="summary-list">
                <strong>伏笔疑点</strong>
                <ul>
                  <li v-for="item in chapterSummary.questions" :key="item">{{ item }}</li>
                </ul>
              </div>
              <p v-if="chapterSummaryStatus === 'error' && chapterSummaryError" class="summary-error">{{ chapterSummaryError }}</p>
              <div class="summary-actions">
                <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryForCurrentChapter(Boolean(chapterSummary))">
                  {{ chapterSummary ? '重新生成' : '生成摘要' }}
                </button>
                <button v-if="chapterSummary" class="summary-action" @click.stop="copyChapterSummary">复制</button>
              </div>
            </div>

            <div v-else-if="!chapterSummary" class="summary-actions compact">
              <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryForCurrentChapter(false)">
                {{ chapterSummaryStatus === 'loading' ? '生成中…' : '生成摘要' }}
              </button>
            </div>
          </section>
```

In horizontal paging mode, do not inject the card into every generated page. Show the same card above the horizontal pages container if the template has a title area outside `v-for`; if not, skip card for horizontal mode in this task and rely on manual mode later. The build will reveal the exact template shape.

- [ ] **Step 5: Add elegant card styles**

Add near ReaderView chapter styles:

```css
.chapter-summary-card {
  margin: 8px 0 24px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.035);
}

.chapter-summary-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.summary-kicker {
  flex: 0 0 auto;
  color: var(--color-primary, #c97f3a);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.summary-muted {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.62;
  font-size: 13px;
}

.chapter-summary-body {
  margin-top: 12px;
  font-size: 0.92em;
  line-height: 1.7;
}

.summary-main {
  margin: 0 0 12px;
}

.summary-list {
  margin-top: 10px;
}

.summary-list strong {
  color: var(--color-primary, #c97f3a);
  font-size: 13px;
}

.summary-list ul {
  margin: 6px 0 0 1.2em;
  padding: 0;
}

.summary-error {
  margin: 10px 0 0;
  color: #d25f4f;
  font-size: 13px;
}

.summary-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.summary-actions.compact {
  margin-top: 10px;
}

.summary-action {
  border: 1px solid color-mix(in srgb, var(--color-primary, #c97f3a) 45%, transparent);
  border-radius: 999px;
  padding: 5px 12px;
  color: var(--color-primary, #c97f3a);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}

.summary-action:disabled {
  cursor: default;
  opacity: 0.5;
}
```

- [ ] **Step 6: Watch chapter changes and clean timers**

Add watcher near existing watchers:

```ts
watch(
  () => [store.book?.bookUrl, store.currentChapter?.url, store.currentIndex, store.displayContent] as const,
  () => {
    resetChapterSummaryState()
    void loadChapterSummaryForCurrentChapter()
  },
  { immediate: true },
)
```

Modify `onBeforeRouteLeave`:

```ts
onBeforeRouteLeave(() => {
  clearChapterSummaryTimer()
  persistReadingProgressKeepalive()
  return true
})
```

Modify `onBeforeUnmount` if present; if not present, add:

```ts
onBeforeUnmount(() => {
  clearChapterSummaryTimer()
})
```

If `onBeforeUnmount` is already imported, reuse it. If not, add it to the Vue import list.

- [ ] **Step 7: Run focused frontend checks**

Run:

```bash
cd frontend && npm test -- src/utils/chapterSummaryState.test.ts src/api/chapterSummary.test.ts
cd frontend && npm run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 8: Commit**

```bash
git add /Users/maple/Documents/reader/frontend/src/views/ReaderView.vue /Users/maple/Documents/reader/frontend/src/utils/chapterSummaryState.ts /Users/maple/Documents/reader/frontend/src/utils/chapterSummaryState.test.ts
git commit -m "feat: show inline chapter summaries"
```

---

### Task 6: Full verification and local smoke

**Files:**
- No new files expected. Fix only files touched by previous tasks if verification fails.

- [ ] **Step 1: Run full backend checks**

Run:

```bash
cargo test
cargo check
```

Expected: all tests pass and check succeeds.

- [ ] **Step 2: Run full frontend checks**

Run:

```bash
cd frontend && npm test
cd frontend && npm run build
```

Expected: Vitest and build pass.

- [ ] **Step 3: Start backend on safe port**

Run:

```bash
lsof -i :18080 || true
SERVER_PORT=18080 cargo run
```

Expected: if port is free, backend listens on `0.0.0.0:18080`. If occupied, stop this step and rerun with the next free port, for example `SERVER_PORT=18081 cargo run`.

- [ ] **Step 4: Smoke test API config endpoint**

In another shell, run:

```bash
curl -s http://127.0.0.1:18080/reader3/chapterSummary/config | python3 -m json.tool
```

Expected: JSON response includes `config.enabled`, `config.autoEnabledDefault`, `canUseServerModel`, and `isAdmin`.

- [ ] **Step 5: Smoke test frontend UI**

Run:

```bash
cd frontend && npm run dev
```

Open the dev URL and verify:

1. Reading settings contains `AI 本章梗概`.
2. Switching `自动/手动` persists after reload.
3. Desktop sidebar has `摘要` button.
4. Clicking sidebar `摘要` toggles the same setting and shows toast.
5. Reading page shows the inline summary card under the chapter title.
6. Manual `生成摘要` either generates a summary or shows a clear backend/model configuration error.

- [ ] **Step 6: Re-read changed files**

Run:

```bash
git diff --check
git diff --stat HEAD~5..HEAD
```

Expected: no whitespace errors; changed files match the feature scope.

- [ ] **Step 7: Final commit for verification fixes**

If verification required fixes, commit them:

```bash
git add /Users/maple/Documents/reader
git commit -m "fix: harden chapter summary flow"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: backend prompt/config, cache, inline card, settings panel, desktop sidebar toggle, auto delay, manual generate, copy, stale-request guard, and admin config are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or unresolved file names are present.
- Type consistency: backend uses `ChapterSummaryConfig`, `ChapterSummaryRecord`, `GenerateChapterSummaryRequest`; frontend mirrors these names and API response shapes.
- Scope check: cross-chapter lists, AI资料 integration, RAG, and mobile-only shortcut remain out of scope.
