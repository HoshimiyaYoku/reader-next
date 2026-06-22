use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiBookCatchupTaskStatus {
    Idle,
    Running,
    Pausing,
    Paused,
    Completed,
    Failed,
}

impl AiBookCatchupTaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Running => "running",
            Self::Pausing => "pausing",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AiBookCatchupStartRequest {
    #[serde(rename = "bookUrl", alias = "url")]
    pub book_url: Option<String>,
    pub target_chapter_index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AiBookCatchupStatusRequest {
    #[serde(rename = "bookUrl", alias = "url")]
    pub book_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AiBookCatchupPauseRequest {
    #[serde(rename = "bookUrl", alias = "url")]
    pub book_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AiBookCatchupTaskView {
    #[serde(skip_serializing)]
    pub user_ns: String,
    pub book_url: String,
    pub status: String,
    pub start_chapter_index: Option<i32>,
    pub target_chapter_index: Option<i32>,
    pub total_chapters: i32,
    pub completed_chapters: i32,
    pub current_chapter_index: Option<i32>,
    pub current_chapter_title: Option<String>,
    pub processed_chapter_index: Option<i32>,
    pub processed_chapter_title: Option<String>,
    pub error: Option<String>,
    pub updated_at: i64,
}
