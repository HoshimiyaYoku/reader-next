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
