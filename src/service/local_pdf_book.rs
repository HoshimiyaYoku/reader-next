use crate::error::error::AppError;
use crate::model::{book::Book, book_chapter::BookChapter};
use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

pub const LOCAL_PDF_ORIGIN: &str = "local-pdf";
pub const LOCAL_PDF_ORIGIN_NAME: &str = "本地 PDF";
pub const MAX_PDF_UPLOAD_BYTES: usize = 100 * 1024 * 1024;
const LOCAL_PDF_HASH_LEN: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPdfChapter {
    title: String,
    url: String,
    index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPdfIndex {
    book_url: String,
    name: String,
    file_name: String,
    byte_len: usize,
    author: String,
    page_count: usize,
    chapters: Vec<StoredPdfChapter>,
}

pub fn is_local_pdf_origin(value: &str) -> bool {
    value.trim() == LOCAL_PDF_ORIGIN
}

pub fn is_local_pdf_url(value: &str) -> bool {
    value.trim().starts_with("local-pdf:")
}

fn pdf_chapter_url(book_url: &str, index: usize) -> String {
    format!("{}#{}", book_url.trim_end_matches('#'), index)
}

fn pdf_file_name(file_name: &str) -> String {
    let name = Path::new(file_name)
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("book.pdf")
        .trim()
        .to_string();
    if name.is_empty() {
        "book.pdf".to_string()
    } else {
        name
    }
}

fn pdf_book_name(file_name: &str) -> String {
    let safe = pdf_file_name(file_name);
    Path::new(&safe)
        .file_stem()
        .and_then(|v| v.to_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("本地PDF")
        .to_string()
}

pub fn validate_pdf_upload(file_name: &str, byte_len: usize) -> Result<(), AppError> {
    let safe = pdf_file_name(file_name);
    if !safe.to_lowercase().ends_with(".pdf") {
        return Err(AppError::BadRequest("仅支持上传 .pdf 文件".to_string()));
    }
    if byte_len == 0 {
        return Err(AppError::BadRequest("PDF 文件不能为空".to_string()));
    }
    if byte_len > MAX_PDF_UPLOAD_BYTES {
        return Err(AppError::BadRequest("PDF 文件不能超过 100MB".to_string()));
    }
    Ok(())
}

#[derive(Clone)]
pub struct LocalPdfBookService {
    storage_dir: PathBuf,
}

impl LocalPdfBookService {
    pub fn new(storage_dir: impl AsRef<Path>) -> Self {
        Self {
            storage_dir: storage_dir.as_ref().to_path_buf(),
        }
    }

    pub async fn import_pdf_book(
        &self,
        user_ns: &str,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<Book, AppError> {
        validate_pdf_upload(file_name, bytes.len())?;
        let safe_file_name = pdf_file_name(file_name);

        let (title, author, pages) = extract_pdf_text(bytes)?;

        let hash = crate::util::hash::md5_hex(&format!(
            "{}:{}:{}",
            user_ns,
            safe_file_name,
            crate::util::hash::md5_hex(&title)
        ));
        let book_url = format!("{}:{}", LOCAL_PDF_ORIGIN, hash);

        let book_dir = self.book_dir(user_ns, &book_url)?;
        fs::create_dir_all(&book_dir)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        fs::write(book_dir.join("book.pdf"), bytes)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        let chapters: Vec<StoredPdfChapter> = pages
            .iter()
            .enumerate()
            .map(|(i, page)| StoredPdfChapter {
                title: if page.len() < 30 && !page.is_empty() {
                    page.clone()
                } else {
                    format!("第 {} 页", i + 1)
                },
                url: pdf_chapter_url(&book_url, i),
                index: i as i32,
            })
            .collect();

        let index = StoredPdfIndex {
            book_url: book_url.clone(),
            name: if title.is_empty() {
                pdf_book_name(&safe_file_name)
            } else {
                title.clone()
            },
            file_name: safe_file_name,
            byte_len: bytes.len(),
            author: if author.is_empty() {
                "本地导入".to_string()
            } else {
                author.clone()
            },
            page_count: pages.len(),
            chapters: chapters.clone(),
        };

        let data =
            serde_json::to_string_pretty(&index).map_err(|e| AppError::Internal(e.into()))?;
        fs::write(book_dir.join("chapters.json"), data)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        let total_chars: usize = pages.iter().map(|p| p.len()).sum();

        Ok(Book {
            name: index.name,
            author: index.author,
            book_url: book_url.clone(),
            origin: LOCAL_PDF_ORIGIN.to_string(),
            origin_name: Some(LOCAL_PDF_ORIGIN_NAME.to_string()),
            toc_url: Some(book_url),
            can_update: Some(false),
            dur_chapter_index: Some(0),
            dur_chapter_pos: Some(0),
            total_chapter_num: Some(chapters.len() as i32),
            latest_chapter_title: chapters.last().map(|ch| ch.title.clone()),
            kind: Some("本地PDF".to_string()),
            word_count: Some(format!("{}字", total_chars)),
            ..Book::default()
        })
    }

    pub async fn get_book_info(&self, user_ns: &str, book_url: &str) -> Result<Book, AppError> {
        let index = self.read_index(user_ns, book_url).await?;
        Ok(Book {
            name: index.name,
            author: index.author,
            book_url: index.book_url.clone(),
            origin: LOCAL_PDF_ORIGIN.to_string(),
            origin_name: Some(LOCAL_PDF_ORIGIN_NAME.to_string()),
            toc_url: Some(index.book_url.clone()),
            can_update: Some(false),
            total_chapter_num: Some(index.chapters.len() as i32),
            latest_chapter_title: index.chapters.last().map(|ch| ch.title.clone()),
            kind: Some("本地PDF".to_string()),
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
            .map(|ch| BookChapter {
                title: ch.title,
                url: ch.url,
                index: ch.index,
                ..BookChapter::default()
            })
            .collect())
    }

    pub async fn get_content(&self, user_ns: &str, chapter_url: &str) -> Result<String, AppError> {
        let (book_url, requested_index) = parse_pdf_chapter_url(chapter_url)?;
        let _index = self.read_index(user_ns, &book_url).await?;

        let pdf_path = self.book_dir(user_ns, &book_url)?.join("book.pdf");
        let bytes = fs::read(&pdf_path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

        let (_, _, pages) = extract_pdf_text(&bytes)?;
        let page_idx = requested_index as usize;
        if page_idx < pages.len() {
            Ok(pages[page_idx].clone())
        } else {
            Err(AppError::BadRequest("页码无效".to_string()))
        }
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
            .join("local_books")
    }

    fn book_dir(&self, user_ns: &str, book_url: &str) -> Result<PathBuf, AppError> {
        let hash = pdf_hash_from_url(book_url)?;
        Ok(self.local_root(user_ns).join(hash))
    }

    async fn read_index(&self, user_ns: &str, book_url: &str) -> Result<StoredPdfIndex, AppError> {
        let path = self.book_dir(user_ns, book_url)?.join("chapters.json");
        let data = fs::read_to_string(path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        serde_json::from_str(&data).map_err(|e| AppError::BadRequest(e.to_string()))
    }
}

fn extract_pdf_text(bytes: &[u8]) -> Result<(String, String, Vec<String>), AppError> {
    let doc = Document::load_mem(bytes)
        .map_err(|e| AppError::BadRequest(format!("PDF 解析失败: {}", e)))?;

    let mut title = String::new();
    let mut author = String::new();

    // Iterate all objects to find Info dictionary with title/author
    let objects: Vec<_> = doc.objects.keys().cloned().collect();
    for obj_id in &objects {
        if let Ok(obj) = doc.get_object(*obj_id) {
            if let lopdf::Object::Dictionary(dict) = obj {
                if let Ok(title_obj) = dict.get(b"Title") {
                    if let lopdf::Object::String(s, _) = title_obj {
                        if let Ok(t) = String::from_utf8(s.clone()) {
                            if title.is_empty() {
                                title = t;
                            }
                        }
                    }
                }
                if let Ok(author_obj) = dict.get(b"Author") {
                    if let lopdf::Object::String(s, _) = author_obj {
                        if let Ok(a) = String::from_utf8(s.clone()) {
                            if author.is_empty() {
                                author = a;
                            }
                        }
                    }
                }
            }
        }
    }

    let pages = doc
        .get_pages()
        .keys()
        .map(|page_num| {
            doc.extract_text(&[*page_num])
                .map(|text| text.trim().to_string())
                .map_err(|e| AppError::BadRequest(format!("PDF 文本提取失败: {}", e)))
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok((title, author, pages))
}

fn pdf_hash_from_url(book_url: &str) -> Result<&str, AppError> {
    book_url
        .strip_prefix("local-pdf:")
        .filter(|v| v.len() == LOCAL_PDF_HASH_LEN && v.chars().all(|ch| ch.is_ascii_hexdigit()))
        .ok_or_else(|| AppError::BadRequest("本地 PDF 地址无效".to_string()))
}

fn parse_pdf_chapter_url(chapter_url: &str) -> Result<(String, i32), AppError> {
    let (book_url, raw_index) = chapter_url
        .rsplit_once('#')
        .ok_or_else(|| AppError::BadRequest("章节地址无效".to_string()))?;
    if !is_local_pdf_url(book_url) {
        return Err(AppError::BadRequest("章节地址无效".to_string()));
    }
    let index = raw_index
        .parse::<i32>()
        .map_err(|_| AppError::BadRequest("章节序号无效".to_string()))?;
    Ok((book_url.to_string(), index))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_pdf_accepts_pdf_extension() {
        assert!(validate_pdf_upload("book.pdf", 100).is_ok());
    }

    #[test]
    fn validate_pdf_rejects_epub_extension() {
        assert!(validate_pdf_upload("book.epub", 100).is_err());
    }

    #[test]
    fn validate_pdf_rejects_empty_file() {
        assert!(validate_pdf_upload("book.pdf", 0).is_err());
    }

    #[test]
    fn is_local_pdf_origin_url_works() {
        assert!(is_local_pdf_origin("local-pdf"));
        assert!(is_local_pdf_url("local-pdf:abc#0"));
        assert!(!is_local_pdf_origin("local-txt"));
    }

    #[test]
    fn extract_pdf_text_parses_fixture() {
        let bytes = std::fs::read("tests/fixtures/test.pdf").expect("test.pdf fixture");
        let (_title, _author, pages) = extract_pdf_text(&bytes).expect("parse failed");
        assert_eq!(pages.len(), 1);
        assert!(
            pages[0].contains("Hello PDF World"),
            "page text was: {:?}",
            pages[0]
        );
    }
}
