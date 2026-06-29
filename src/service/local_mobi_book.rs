use crate::error::error::AppError;
use crate::model::{book::Book, book_chapter::BookChapter};
use crate::service::local_txt_book::{parse_txt_chapters, ParsedTxtChapter};
use crate::util::hash::md5_hex;
use mobi::headers::Encryption;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

pub const LOCAL_MOBI_ORIGIN: &str = "local-mobi";
pub const LOCAL_MOBI_ORIGIN_NAME: &str = "本地 MOBI";
pub const MAX_MOBI_UPLOAD_BYTES: usize = 100 * 1024 * 1024;
const LOCAL_BOOK_DIR: &str = "local_books";
const LOCAL_MOBI_HASH_LEN: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMobiChapter {
    title: String,
    url: String,
    index: i32,
    start: usize,
    end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMobiIndex {
    book_url: String,
    name: String,
    file_name: String,
    byte_len: usize,
    char_len: usize,
    author: String,
    chapters: Vec<StoredMobiChapter>,
}

pub fn is_local_mobi_origin(value: &str) -> bool {
    value.trim() == LOCAL_MOBI_ORIGIN
}

pub fn is_local_mobi_url(value: &str) -> bool {
    value.trim().starts_with("local-mobi:")
}

fn mobi_file_name(file_name: &str) -> String {
    let name = Path::new(file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("book.mobi")
        .trim()
        .to_string();
    if name.is_empty() {
        "book.mobi".to_string()
    } else {
        name
    }
}

fn mobi_book_name(file_name: &str) -> String {
    let safe = mobi_file_name(file_name);
    Path::new(&safe)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("本地MOBI")
        .to_string()
}

pub fn validate_mobi_upload(file_name: &str, byte_len: usize) -> Result<(), AppError> {
    let safe = mobi_file_name(file_name);
    if !safe.to_lowercase().ends_with(".mobi") {
        return Err(AppError::BadRequest("仅支持上传 .mobi 文件".to_string()));
    }
    if byte_len == 0 {
        return Err(AppError::BadRequest("MOBI 文件不能为空".to_string()));
    }
    if byte_len > MAX_MOBI_UPLOAD_BYTES {
        return Err(AppError::BadRequest("MOBI 文件不能超过 100MB".to_string()));
    }
    Ok(())
}

fn mobi_text_to_chapters(book_url: &str, text: &str) -> Vec<ParsedTxtChapter> {
    parse_txt_chapters(book_url, text)
}

#[derive(Clone)]
pub struct LocalMobiBookService {
    storage_dir: PathBuf,
}

impl LocalMobiBookService {
    pub fn new(storage_dir: impl AsRef<Path>) -> Self {
        Self {
            storage_dir: storage_dir.as_ref().to_path_buf(),
        }
    }

    pub async fn import_mobi_book(
        &self,
        user_ns: &str,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<Book, AppError> {
        validate_mobi_upload(file_name, bytes.len())?;
        let safe_file_name = mobi_file_name(file_name);
        let parsed = parse_mobi(bytes, &safe_file_name)?;

        let hash = md5_hex(&format!(
            "{}:{}:{}",
            user_ns,
            safe_file_name,
            md5_hex(&parsed.text)
        ));
        let book_url = format!("{}:{}", LOCAL_MOBI_ORIGIN, hash);
        let chapters = mobi_text_to_chapters(&book_url, &parsed.text);

        let book_dir = self.book_dir(user_ns, &book_url)?;
        fs::create_dir_all(&book_dir)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        fs::write(book_dir.join("book.mobi"), bytes)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        fs::write(book_dir.join("book.txt"), parsed.text.as_bytes())
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        let index = StoredMobiIndex {
            book_url: book_url.clone(),
            name: parsed.title,
            file_name: safe_file_name,
            byte_len: bytes.len(),
            char_len: parsed.text.chars().count(),
            author: parsed.author,
            chapters: chapters
                .iter()
                .map(|chapter| StoredMobiChapter {
                    title: chapter.title.clone(),
                    url: chapter.url.clone(),
                    index: chapter.index,
                    start: chapter.start,
                    end: chapter.end,
                })
                .collect(),
        };
        let data =
            serde_json::to_string_pretty(&index).map_err(|e| AppError::Internal(e.into()))?;
        fs::write(book_dir.join("chapters.json"), data)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        Ok(Book {
            name: index.name,
            author: if index.author.is_empty() {
                "本地导入".to_string()
            } else {
                index.author
            },
            book_url: book_url.clone(),
            origin: LOCAL_MOBI_ORIGIN.to_string(),
            origin_name: Some(LOCAL_MOBI_ORIGIN_NAME.to_string()),
            toc_url: Some(book_url),
            can_update: Some(false),
            dur_chapter_index: Some(0),
            dur_chapter_pos: Some(0),
            total_chapter_num: Some(index.chapters.len() as i32),
            latest_chapter_title: index.chapters.last().map(|chapter| chapter.title.clone()),
            kind: Some("本地MOBI".to_string()),
            word_count: Some(format!("{}字", index.char_len)),
            ..Book::default()
        })
    }

    pub async fn get_book_info(&self, user_ns: &str, book_url: &str) -> Result<Book, AppError> {
        let index = self.read_index(user_ns, book_url).await?;
        Ok(Book {
            name: index.name,
            author: if index.author.is_empty() {
                "本地导入".to_string()
            } else {
                index.author
            },
            book_url: index.book_url.clone(),
            origin: LOCAL_MOBI_ORIGIN.to_string(),
            origin_name: Some(LOCAL_MOBI_ORIGIN_NAME.to_string()),
            toc_url: Some(index.book_url.clone()),
            can_update: Some(false),
            total_chapter_num: Some(index.chapters.len() as i32),
            latest_chapter_title: index.chapters.last().map(|chapter| chapter.title.clone()),
            kind: Some("本地MOBI".to_string()),
            word_count: Some(format!("{}字", index.char_len)),
            ..Book::default()
        })
    }

    pub async fn get_chapter_list(
        &self,
        user_ns: &str,
        book_url: &str,
    ) -> Result<Vec<BookChapter>, AppError> {
        let index = self.read_index(user_ns, book_url).await?;
        Ok(index
            .chapters
            .into_iter()
            .map(|chapter| BookChapter {
                title: chapter.title,
                url: chapter.url,
                index: chapter.index,
                ..BookChapter::default()
            })
            .collect())
    }

    pub async fn get_content(&self, user_ns: &str, chapter_url: &str) -> Result<String, AppError> {
        let (book_url, requested_index) = parse_mobi_chapter_url(chapter_url)?;
        let index = self.read_index(user_ns, &book_url).await?;
        let chapter = index
            .chapters
            .iter()
            .find(|chapter| chapter.index == requested_index)
            .ok_or_else(|| AppError::BadRequest("章节不存在".to_string()))?;
        let text = fs::read_to_string(self.book_dir(user_ns, &book_url)?.join("book.txt"))
            .await
            .map_err(map_local_mobi_read_error)?;
        if chapter.start > chapter.end || chapter.end > text.len() {
            return Err(AppError::BadRequest("章节索引无效".to_string()));
        }
        Ok(text[chapter.start..chapter.end].to_string())
    }

    pub async fn delete_book_files(&self, user_ns: &str, book_url: &str) -> Result<bool, AppError> {
        let book_dir = self.book_dir(user_ns, book_url)?;
        match fs::remove_dir_all(book_dir).await {
            Ok(()) => Ok(true),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(err) => Err(AppError::Internal(err.into())),
        }
    }

    fn local_root(&self, user_ns: &str) -> PathBuf {
        self.storage_dir
            .join("data")
            .join(user_ns)
            .join(LOCAL_BOOK_DIR)
    }

    fn book_dir(&self, user_ns: &str, book_url: &str) -> Result<PathBuf, AppError> {
        let hash = local_mobi_hash_from_url(book_url)?;
        Ok(self.local_root(user_ns).join(hash))
    }

    async fn read_index(&self, user_ns: &str, book_url: &str) -> Result<StoredMobiIndex, AppError> {
        let path = self.book_dir(user_ns, book_url)?.join("chapters.json");
        let data = fs::read_to_string(path)
            .await
            .map_err(map_local_mobi_read_error)?;
        serde_json::from_str(&data).map_err(|e| AppError::BadRequest(e.to_string()))
    }
}

struct ParsedMobiBook {
    title: String,
    author: String,
    text: String,
}

fn parse_mobi(bytes: &[u8], file_name: &str) -> Result<ParsedMobiBook, AppError> {
    let raw = bytes.to_vec();
    let mobi =
        mobi::Mobi::new(&raw).map_err(|e| AppError::BadRequest(format!("MOBI 解析失败: {}", e)))?;
    if mobi.encryption() != Encryption::No {
        return Err(AppError::BadRequest(
            "暂不支持 DRM/加密 MOBI 文件".to_string(),
        ));
    }
    let text = mobi
        .content_as_string()
        .map_err(|e| AppError::BadRequest(format!("MOBI 正文提取失败: {}", e)))?;
    if text.trim().is_empty() {
        return Err(AppError::BadRequest("MOBI 文件内容不能为空".to_string()));
    }
    let title = mobi.title().trim().to_string();
    Ok(ParsedMobiBook {
        title: if title.is_empty() {
            mobi_book_name(file_name)
        } else {
            title
        },
        author: mobi.author().unwrap_or_default().trim().to_string(),
        text,
    })
}

fn parse_mobi_chapter_url(chapter_url: &str) -> Result<(String, i32), AppError> {
    let (book_url, raw_index) = chapter_url
        .rsplit_once('#')
        .ok_or_else(|| AppError::BadRequest("章节地址无效".to_string()))?;
    if !is_local_mobi_url(book_url) {
        return Err(AppError::BadRequest("章节地址无效".to_string()));
    }
    let index = raw_index
        .parse::<i32>()
        .map_err(|_| AppError::BadRequest("章节序号无效".to_string()))?;
    Ok((book_url.to_string(), index))
}

fn local_mobi_hash_from_url(book_url: &str) -> Result<&str, AppError> {
    let hash = book_url
        .strip_prefix("local-mobi:")
        .filter(|value| {
            value.len() == LOCAL_MOBI_HASH_LEN && value.chars().all(|ch| ch.is_ascii_hexdigit())
        })
        .ok_or_else(|| AppError::BadRequest("本地 MOBI 地址无效".to_string()))?;
    Ok(hash)
}

fn map_local_mobi_read_error(err: std::io::Error) -> AppError {
    if err.kind() == std::io::ErrorKind::NotFound {
        AppError::BadRequest("本地 MOBI 不存在".to_string())
    } else {
        AppError::Internal(err.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::local_txt_book::build_chapter_url;

    #[test]
    fn validate_mobi_accepts_mobi_extension() {
        assert!(validate_mobi_upload("book.mobi", 100).is_ok());
    }

    #[test]
    fn validate_mobi_rejects_txt_extension() {
        assert!(validate_mobi_upload("book.txt", 100).is_err());
    }

    #[test]
    fn validate_mobi_rejects_empty_file() {
        assert!(validate_mobi_upload("book.mobi", 0).is_err());
    }

    #[test]
    fn validate_mobi_rejects_oversized() {
        assert!(validate_mobi_upload("book.mobi", MAX_MOBI_UPLOAD_BYTES + 1).is_err());
    }

    #[test]
    fn is_local_mobi_origin_url_works() {
        assert!(is_local_mobi_origin("local-mobi"));
        assert!(is_local_mobi_url("local-mobi:abc#0"));
        assert!(!is_local_mobi_origin("local-txt"));
        assert!(!is_local_mobi_url("local-txt:abc#0"));
    }

    #[test]
    fn parse_mobi_chapter_url_rejects_wrong_origin() {
        assert!(parse_mobi_chapter_url("local-txt:abc#0").is_err());
    }

    #[test]
    fn mobi_plain_text_to_chapters_reuses_txt_parser() {
        let chapters = mobi_text_to_chapters(
            "local-mobi:0123456789abcdef0123456789abcdef",
            "第一章 开始\n正文",
        );
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "第一章 开始");
        assert_eq!(chapters[0].content, "正文");
        assert_eq!(
            chapters[0].url,
            build_chapter_url("local-mobi:0123456789abcdef0123456789abcdef", 0)
        );
    }
}
