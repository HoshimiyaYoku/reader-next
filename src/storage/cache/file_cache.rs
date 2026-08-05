use crate::util::hash::md5_hex;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::fs;

pub const DEFAULT_CACHE_MAX_BYTES: u64 = 1024 * 1024 * 1024;
pub const DEFAULT_CACHE_MAX_AGE: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const CLEANUP_INTERVAL: Duration = Duration::from_secs(5 * 60);
const MAX_CLEANUP_WRITE_THRESHOLD_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct FileCacheCleanupResult {
    pub scanned_files: usize,
    pub deleted_files: usize,
    pub deleted_bytes: u64,
    pub remaining_bytes: u64,
}

#[derive(Debug)]
struct CachedFile {
    path: PathBuf,
    size: u64,
    modified: SystemTime,
}

#[derive(Clone)]
pub struct FileCache {
    root: PathBuf,
    max_bytes: u64,
    max_age: Duration,
    last_cleanup_epoch_secs: Arc<AtomicU64>,
    pending_write_bytes: Arc<AtomicU64>,
    cleanup_running: Arc<AtomicBool>,
}

impl FileCache {
    pub fn new(root: impl AsRef<Path>) -> Self {
        Self::with_limits(root, DEFAULT_CACHE_MAX_BYTES, DEFAULT_CACHE_MAX_AGE)
    }

    pub fn with_limits(root: impl AsRef<Path>, max_bytes: u64, max_age: Duration) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
            max_bytes,
            max_age,
            last_cleanup_epoch_secs: Arc::new(AtomicU64::new(0)),
            pending_write_bytes: Arc::new(AtomicU64::new(0)),
            cleanup_running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Get cached content for a specific book.
    pub async fn get(
        &self,
        user_ns: &str,
        book_key: &str,
        chapter_key: &str,
    ) -> anyhow::Result<Option<String>> {
        let path = self.chapter_path(user_ns, book_key, chapter_key);
        let metadata = match fs::metadata(&path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        if self.is_expired(&metadata) {
            let _ = fs::remove_file(&path).await;
            self.schedule_cleanup(0);
            return Ok(None);
        }

        let data = match fs::read_to_string(&path).await {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        Self::touch(&path);
        self.schedule_cleanup(0);
        Ok(Some(data))
    }

    /// Put cached content for a specific book.
    pub async fn put(
        &self,
        user_ns: &str,
        book_key: &str,
        chapter_key: &str,
        value: &str,
    ) -> anyhow::Result<()> {
        let path = self.chapter_path(user_ns, book_key, chapter_key);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        if fs::write(&path, value).await.is_err() {
            // A full cache is the most common write failure. Reclaim space and retry once.
            let _ = self.cleanup().await;
            fs::write(&path, value).await?;
        }
        self.schedule_cleanup(value.len() as u64);
        Ok(())
    }

    /// Remove a single chapter cache.
    pub async fn remove(
        &self,
        user_ns: &str,
        book_key: &str,
        chapter_key: &str,
    ) -> anyhow::Result<()> {
        let path = self.chapter_path(user_ns, book_key, chapter_key);
        match fs::remove_file(path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    /// Check if a non-expired chapter cache exists.
    pub async fn exists(&self, user_ns: &str, book_key: &str, chapter_key: &str) -> bool {
        let path = self.chapter_path(user_ns, book_key, chapter_key);
        let Ok(metadata) = fs::metadata(&path).await else {
            return false;
        };
        if self.is_expired(&metadata) {
            let _ = fs::remove_file(path).await;
            self.schedule_cleanup(0);
            return false;
        }
        self.schedule_cleanup(0);
        true
    }

    /// Remove all cache for a book (delete the book's cache directory).
    pub async fn remove_book(&self, user_ns: &str, book_key: &str) -> anyhow::Result<bool> {
        let path = self.book_path(user_ns, book_key);
        match fs::remove_dir_all(&path).await {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.into()),
        }
    }

    /// Remove expired files, then oldest files until the total cache is within its quota.
    pub async fn cleanup(&self) -> anyhow::Result<FileCacheCleanupResult> {
        let (mut files, mut directories) = self.scan_files().await?;
        files.sort_by_key(|file| file.modified);
        directories.sort_by_key(|path| std::cmp::Reverse(path.components().count()));

        let now = SystemTime::now();
        let mut result = FileCacheCleanupResult {
            scanned_files: files.len(),
            remaining_bytes: files.iter().map(|file| file.size).sum(),
            ..FileCacheCleanupResult::default()
        };
        let mut deleted = vec![false; files.len()];

        for (index, file) in files.iter().enumerate() {
            let age = now.duration_since(file.modified).unwrap_or(Duration::ZERO);
            if age > self.max_age && Self::remove_if_unchanged(file).await {
                Self::record_deletion(&mut result, file.size);
                deleted[index] = true;
            }
        }
        for (index, file) in files.iter().enumerate() {
            if result.remaining_bytes <= self.max_bytes {
                break;
            }
            if !deleted[index] && Self::remove_if_unchanged(file).await {
                Self::record_deletion(&mut result, file.size);
            }
        }

        for directory in directories {
            if directory != self.root {
                let _ = fs::remove_dir(directory).await;
            }
        }
        Ok(result)
    }

    fn record_deletion(result: &mut FileCacheCleanupResult, size: u64) {
        result.deleted_files += 1;
        result.deleted_bytes = result.deleted_bytes.saturating_add(size);
        result.remaining_bytes = result.remaining_bytes.saturating_sub(size);
    }

    async fn remove_if_unchanged(file: &CachedFile) -> bool {
        let Ok(metadata) = fs::metadata(&file.path).await else {
            return false;
        };
        let current_modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        if metadata.len() != file.size || current_modified > file.modified {
            return false;
        }
        fs::remove_file(&file.path).await.is_ok()
    }

    async fn scan_files(&self) -> anyhow::Result<(Vec<CachedFile>, Vec<PathBuf>)> {
        let mut files = Vec::new();
        let mut directories = vec![self.root.clone()];
        let mut pending = vec![self.root.clone()];

        while let Some(directory) = pending.pop() {
            let mut entries = match fs::read_dir(&directory).await {
                Ok(entries) => entries,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.into()),
            };
            while let Some(entry) = entries.next_entry().await? {
                let file_type = entry.file_type().await?;
                if file_type.is_dir() {
                    directories.push(entry.path());
                    pending.push(entry.path());
                } else if file_type.is_file() {
                    let metadata = entry.metadata().await?;
                    files.push(CachedFile {
                        path: entry.path(),
                        size: metadata.len(),
                        modified: metadata.modified().unwrap_or(UNIX_EPOCH),
                    });
                }
            }
        }
        Ok((files, directories))
    }

    fn is_expired(&self, metadata: &std::fs::Metadata) -> bool {
        metadata
            .modified()
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .is_some_and(|age| age > self.max_age)
    }

    fn touch(path: &Path) {
        if let Ok(file) = std::fs::OpenOptions::new().write(true).open(path) {
            let _ = file.set_modified(SystemTime::now());
        }
    }

    fn schedule_cleanup(&self, written_bytes: u64) {
        self.pending_write_bytes
            .fetch_add(written_bytes, Ordering::Relaxed);
        let now = epoch_secs();
        let last_cleanup = self.last_cleanup_epoch_secs.load(Ordering::Relaxed);
        let write_threshold = (self.max_bytes / 20)
            .max(1)
            .min(MAX_CLEANUP_WRITE_THRESHOLD_BYTES);
        let interval_elapsed =
            last_cleanup == 0 || now.saturating_sub(last_cleanup) >= CLEANUP_INTERVAL.as_secs();
        if !interval_elapsed && self.pending_write_bytes.load(Ordering::Relaxed) < write_threshold {
            return;
        }
        if self
            .cleanup_running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .is_err()
        {
            return;
        }

        let cache = self.clone();
        tokio::spawn(async move {
            let pending_before_cleanup = cache.pending_write_bytes.swap(0, Ordering::AcqRel);
            match cache.cleanup().await {
                Ok(_) => cache
                    .last_cleanup_epoch_secs
                    .store(epoch_secs(), Ordering::Release),
                Err(error) => {
                    cache
                        .pending_write_bytes
                        .fetch_add(pending_before_cleanup, Ordering::Relaxed);
                    tracing::warn!(error = %error, "file cache cleanup failed");
                }
            }
            cache.cleanup_running.store(false, Ordering::Release);
        });
    }

    /// Get the directory path for a book's cache.
    fn book_path(&self, user_ns: &str, book_key: &str) -> PathBuf {
        self.root.join(user_ns).join(book_key)
    }

    /// Get the file path for a specific chapter.
    fn chapter_path(&self, user_ns: &str, book_key: &str, chapter_key: &str) -> PathBuf {
        let name = md5_hex(chapter_key);
        self.book_path(user_ns, book_key)
            .join(name)
            .with_extension("txt")
    }
}

fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_cache(name: &str, max_bytes: u64, max_age: Duration) -> FileCache {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        FileCache::with_limits(
            std::env::temp_dir().join(format!(
                "reader-next-file-cache-{name}-{}-{suffix}",
                std::process::id()
            )),
            max_bytes,
            max_age,
        )
    }

    async fn write_at(cache: &FileCache, chapter: &str, value: &str, modified: SystemTime) {
        let path = cache.chapter_path("user", "book", chapter);
        fs::create_dir_all(path.parent().unwrap()).await.unwrap();
        fs::write(&path, value).await.unwrap();
        std::fs::OpenOptions::new()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(modified)
            .unwrap();
    }

    #[tokio::test]
    async fn cleanup_removes_expired_files() {
        let cache = temp_cache("expired", 1024, Duration::from_secs(60));
        write_at(
            &cache,
            "old",
            "expired",
            SystemTime::now() - Duration::from_secs(120),
        )
        .await;
        write_at(&cache, "fresh", "keep", SystemTime::now()).await;

        let result = cache.cleanup().await.unwrap();

        assert_eq!(result.deleted_files, 1);
        assert!(!cache.exists("user", "book", "old").await);
        assert!(cache.exists("user", "book", "fresh").await);
        let _ = fs::remove_dir_all(&cache.root).await;
    }

    #[tokio::test]
    async fn cleanup_evicts_oldest_files_until_under_quota() {
        let cache = temp_cache("quota", 8, Duration::from_secs(3600));
        let now = SystemTime::now();
        write_at(&cache, "oldest", "123456", now - Duration::from_secs(30)).await;
        write_at(&cache, "newest", "abcdef", now - Duration::from_secs(10)).await;

        let result = cache.cleanup().await.unwrap();

        assert_eq!(result.deleted_files, 1);
        assert!(result.remaining_bytes <= 8);
        assert!(!cache.exists("user", "book", "oldest").await);
        assert!(cache.exists("user", "book", "newest").await);
        let _ = fs::remove_dir_all(&cache.root).await;
    }

    #[tokio::test]
    async fn reading_refreshes_lru_timestamp() {
        let cache = temp_cache("touch", 1024, Duration::from_secs(3600));
        let old = SystemTime::now() - Duration::from_secs(30);
        write_at(&cache, "chapter", "content", old).await;
        let path = cache.chapter_path("user", "book", "chapter");

        assert_eq!(
            cache.get("user", "book", "chapter").await.unwrap(),
            Some("content".to_string())
        );
        let touched = fs::metadata(path).await.unwrap().modified().unwrap();
        assert!(touched > old);
        let _ = fs::remove_dir_all(&cache.root).await;
    }

    #[tokio::test]
    async fn expired_get_is_a_cache_miss_and_removes_the_file() {
        let cache = temp_cache("expired-get", 1024, Duration::from_secs(1));
        write_at(
            &cache,
            "chapter",
            "content",
            SystemTime::now() - Duration::from_secs(2),
        )
        .await;

        assert_eq!(cache.get("user", "book", "chapter").await.unwrap(), None);
        assert!(!cache.chapter_path("user", "book", "chapter").exists());
        let _ = fs::remove_dir_all(&cache.root).await;
    }
}
