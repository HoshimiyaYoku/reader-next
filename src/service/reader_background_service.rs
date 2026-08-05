use crate::error::error::AppError;
use crate::model::reader_background::{ReaderBackgroundMetadata, ReaderBackgroundSettings};
use crate::util::hash::md5_hex;
use chrono::Utc;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tokio::fs;
use tokio::sync::Mutex;
use uuid::Uuid;

pub const MAX_READER_BACKGROUND_BYTES: usize = 15 * 1024 * 1024;
const METADATA_FILE: &str = "metadata.json";

#[derive(Debug, Clone)]
pub struct ReaderBackgroundImage {
    pub bytes: Vec<u8>,
    pub metadata: ReaderBackgroundMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredReaderBackgroundMetadata {
    #[serde(flatten)]
    metadata: ReaderBackgroundMetadata,
    storage_file: String,
}

#[derive(Debug, Clone)]
pub struct ReaderBackgroundService {
    root: PathBuf,
    mutation_lock: Arc<Mutex<()>>,
}

impl ReaderBackgroundService {
    pub fn new(storage_dir: impl AsRef<Path>) -> Self {
        Self {
            root: storage_dir.as_ref().join("reader-backgrounds"),
            mutation_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn get_metadata(
        &self,
        user_ns: &str,
    ) -> Result<Option<ReaderBackgroundMetadata>, AppError> {
        let _guard = self.mutation_lock.lock().await;
        Ok(self
            .read_stored_metadata(user_ns)
            .await?
            .map(|stored| stored.metadata))
    }

    pub async fn get_image(&self, user_ns: &str) -> Result<ReaderBackgroundImage, AppError> {
        let _guard = self.mutation_lock.lock().await;
        let stored = self
            .read_stored_metadata(user_ns)
            .await?
            .ok_or_else(|| AppError::NotFound("没有同步的阅读背景".to_string()))?;
        let path = self.safe_storage_path(user_ns, &stored.storage_file)?;
        let bytes = fs::read(path).await.map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => {
                AppError::NotFound("同步的阅读背景文件不存在".to_string())
            }
            _ => AppError::Internal(error.into()),
        })?;
        Ok(ReaderBackgroundImage {
            bytes,
            metadata: stored.metadata,
        })
    }

    pub async fn save(
        &self,
        user_ns: &str,
        bytes: &[u8],
        settings: ReaderBackgroundSettings,
    ) -> Result<ReaderBackgroundMetadata, AppError> {
        self.save_with_settings(user_ns, bytes, move |current| {
            *current = settings;
            Ok(())
        })
        .await
    }

    /// Saves an image while merging upload fields into the latest stored settings.
    ///
    /// The callback runs while the shared mutation lock is held, so an upload cannot
    /// restore stale metadata when it races a settings update or deletion.
    pub async fn save_with_settings<F>(
        &self,
        user_ns: &str,
        bytes: &[u8],
        configure: F,
    ) -> Result<ReaderBackgroundMetadata, AppError>
    where
        F: FnOnce(&mut ReaderBackgroundSettings) -> Result<(), AppError>,
    {
        let _guard = self.mutation_lock.lock().await;
        let previous = self.read_stored_metadata(user_ns).await?;
        let mut settings = previous
            .as_ref()
            .map(|stored| stored.metadata.settings.clone())
            .unwrap_or_default();
        configure(&mut settings)?;
        self.save_locked(user_ns, bytes, settings, previous).await
    }

    async fn save_locked(
        &self,
        user_ns: &str,
        bytes: &[u8],
        settings: ReaderBackgroundSettings,
        previous: Option<StoredReaderBackgroundMetadata>,
    ) -> Result<ReaderBackgroundMetadata, AppError> {
        settings.validate()?;
        let content_type = detect_image_content_type(bytes)?;
        let etag = md5_bytes(bytes);
        let updated_at = next_updated_at(previous.as_ref().map(|item| item.metadata.updated_at));
        let extension = content_type
            .strip_prefix("image/")
            .unwrap_or("bin")
            .replace("jpeg", "jpg");
        let storage_file = format!("background-{etag}.{extension}");
        let metadata = ReaderBackgroundMetadata {
            content_type: content_type.to_string(),
            byte_size: bytes.len() as u64,
            updated_at,
            etag,
            settings,
        };
        let stored = StoredReaderBackgroundMetadata {
            metadata: metadata.clone(),
            storage_file: storage_file.clone(),
        };

        let dir = self.user_dir(user_ns);
        fs::create_dir_all(&dir)
            .await
            .map_err(|error| AppError::Internal(error.into()))?;
        fs::write(dir.join(&storage_file), bytes)
            .await
            .map_err(|error| AppError::Internal(error.into()))?;
        self.write_metadata_atomically(user_ns, &stored).await?;

        if let Some(previous) = previous {
            if previous.storage_file != storage_file {
                if let Ok(path) = self.safe_storage_path(user_ns, &previous.storage_file) {
                    let _ = fs::remove_file(path).await;
                }
            }
        }
        Ok(metadata)
    }

    pub async fn update_settings(
        &self,
        user_ns: &str,
        settings: ReaderBackgroundSettings,
    ) -> Result<ReaderBackgroundMetadata, AppError> {
        settings.validate()?;
        let _guard = self.mutation_lock.lock().await;
        let mut stored = self
            .read_stored_metadata(user_ns)
            .await?
            .ok_or_else(|| AppError::NotFound("没有同步的阅读背景".to_string()))?;
        stored.metadata.settings = settings;
        stored.metadata.updated_at = next_updated_at(Some(stored.metadata.updated_at));
        self.write_metadata_atomically(user_ns, &stored).await?;
        Ok(stored.metadata)
    }

    pub async fn delete(&self, user_ns: &str) -> Result<bool, AppError> {
        let _guard = self.mutation_lock.lock().await;
        let dir = self.user_dir(user_ns);
        match fs::remove_dir_all(dir).await {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(AppError::Internal(error.into())),
        }
    }

    async fn read_stored_metadata(
        &self,
        user_ns: &str,
    ) -> Result<Option<StoredReaderBackgroundMetadata>, AppError> {
        let path = self.user_dir(user_ns).join(METADATA_FILE);
        let data = match fs::read(path).await {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(AppError::Internal(error.into())),
        };
        let stored = serde_json::from_slice::<StoredReaderBackgroundMetadata>(&data)
            .map_err(|error| AppError::Internal(error.into()))?;
        self.safe_storage_path(user_ns, &stored.storage_file)?;
        Ok(Some(stored))
    }

    async fn write_metadata_atomically(
        &self,
        user_ns: &str,
        stored: &StoredReaderBackgroundMetadata,
    ) -> Result<(), AppError> {
        let dir = self.user_dir(user_ns);
        fs::create_dir_all(&dir)
            .await
            .map_err(|error| AppError::Internal(error.into()))?;
        let temp_path = dir.join(format!(".{METADATA_FILE}-{}.tmp", Uuid::new_v4()));
        let data = serde_json::to_vec(stored).map_err(|error| AppError::Internal(error.into()))?;
        fs::write(&temp_path, data)
            .await
            .map_err(|error| AppError::Internal(error.into()))?;
        if let Err(error) = fs::rename(&temp_path, dir.join(METADATA_FILE)).await {
            let _ = fs::remove_file(temp_path).await;
            return Err(AppError::Internal(error.into()));
        }
        Ok(())
    }

    fn user_dir(&self, user_ns: &str) -> PathBuf {
        self.root.join(md5_hex(user_ns))
    }

    fn safe_storage_path(&self, user_ns: &str, storage_file: &str) -> Result<PathBuf, AppError> {
        let mut components = Path::new(storage_file).components();
        let is_single_normal_component =
            matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
        if !is_single_normal_component {
            return Err(AppError::Internal(anyhow::anyhow!(
                "invalid reader background storage path"
            )));
        }
        Ok(self.user_dir(user_ns).join(storage_file))
    }
}

fn detect_image_content_type(bytes: &[u8]) -> Result<&'static str, AppError> {
    if bytes.is_empty() {
        return Err(AppError::BadRequest("背景图片文件为空".to_string()));
    }
    if bytes.len() > MAX_READER_BACKGROUND_BYTES {
        return Err(AppError::BadRequest("背景图片不能超过 15MB".to_string()));
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok("image/jpeg");
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok("image/png");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Ok("image/webp");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        let brand_bytes = &bytes[8..bytes.len().min(48)];
        if brand_bytes
            .chunks_exact(4)
            .any(|brand| brand == b"avif" || brand == b"avis")
        {
            return Ok("image/avif");
        }
    }
    Err(AppError::BadRequest(
        "仅支持有效的 JPG、PNG、WebP 或 AVIF 图片".to_string(),
    ))
}

fn md5_bytes(bytes: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn next_updated_at(previous: Option<i64>) -> i64 {
    let now = Utc::now().timestamp_millis();
    previous.map_or(now, |value| now.max(value.saturating_add(1)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::reader_background::{ReaderBackgroundFit, ReaderBackgroundPosition};
    use crate::util::crypto::random_string;
    use std::time::Duration;

    fn png_bytes(payload: &[u8]) -> Vec<u8> {
        [b"\x89PNG\r\n\x1a\n".as_slice(), payload].concat()
    }

    #[test]
    fn image_validation_uses_file_signature() {
        assert_eq!(
            detect_image_content_type(&png_bytes(b"data")).unwrap(),
            "image/png"
        );
        assert_eq!(
            detect_image_content_type(b"RIFFxxxxWEBPdata").unwrap(),
            "image/webp"
        );
        assert!(detect_image_content_type(b"<svg></svg>").is_err());
        assert!(detect_image_content_type(&[]).is_err());
    }

    #[tokio::test]
    async fn backgrounds_round_trip_and_are_isolated_by_user() {
        let root =
            std::env::temp_dir().join(format!("reader-background-service-{}", random_string(10)));
        let service = ReaderBackgroundService::new(&root);
        let alice_bytes = png_bytes(b"alice");
        let bob_bytes = [b"\xff\xd8\xff".as_slice(), b"bob"].concat();
        let settings = ReaderBackgroundSettings {
            enabled: true,
            reader_enabled: false,
            fit: ReaderBackgroundFit::Contain,
            position: ReaderBackgroundPosition::Top,
            overlay: 0.3,
        };

        let alice_metadata = service
            .save("alice", &alice_bytes, settings.clone())
            .await
            .unwrap();
        service
            .save("bob", &bob_bytes, ReaderBackgroundSettings::default())
            .await
            .unwrap();

        assert_eq!(alice_metadata.settings, settings);
        assert_eq!(service.get_image("alice").await.unwrap().bytes, alice_bytes);
        assert_eq!(service.get_image("bob").await.unwrap().bytes, bob_bytes);
        assert!(service.delete("alice").await.unwrap());
        assert!(service.get_metadata("alice").await.unwrap().is_none());
        assert!(service.get_metadata("bob").await.unwrap().is_some());

        let _ = fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn settings_update_keeps_image() {
        let root =
            std::env::temp_dir().join(format!("reader-background-settings-{}", random_string(10)));
        let service = ReaderBackgroundService::new(&root);
        let bytes = png_bytes(b"same-image");
        let original = service
            .save("reader", &bytes, ReaderBackgroundSettings::default())
            .await
            .unwrap();
        let settings = ReaderBackgroundSettings {
            enabled: false,
            reader_enabled: true,
            fit: ReaderBackgroundFit::Contain,
            position: ReaderBackgroundPosition::Bottom,
            overlay: 0.7,
        };
        let updated = service
            .update_settings("reader", settings.clone())
            .await
            .unwrap();

        assert_eq!(updated.settings, settings);
        assert!(updated.updated_at > original.updated_at);
        assert_eq!(service.get_image("reader").await.unwrap().bytes, bytes);

        let _ = fs::remove_dir_all(root).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn concurrent_upload_settings_and_delete_are_serialized() {
        let root = std::env::temp_dir().join(format!(
            "reader-background-concurrent-{}",
            random_string(10)
        ));
        let service = Arc::new(ReaderBackgroundService::new(&root));
        let original_bytes = png_bytes(b"original-image");
        service
            .save(
                "reader",
                &original_bytes,
                ReaderBackgroundSettings::default(),
            )
            .await
            .unwrap();

        let replacement_bytes = png_bytes(b"replacement-image");
        let expected_bytes = replacement_bytes.clone();
        let (upload_entered_tx, upload_entered_rx) = tokio::sync::oneshot::channel();
        let upload_service = service.clone();
        let upload = tokio::spawn(async move {
            upload_service
                .save_with_settings("reader", &replacement_bytes, move |settings| {
                    let _ = upload_entered_tx.send(());
                    std::thread::sleep(Duration::from_millis(100));
                    settings.fit = ReaderBackgroundFit::Contain;
                    Ok(())
                })
                .await
        });

        upload_entered_rx.await.unwrap();
        let final_settings = ReaderBackgroundSettings {
            enabled: false,
            reader_enabled: false,
            fit: ReaderBackgroundFit::Cover,
            position: ReaderBackgroundPosition::Bottom,
            overlay: 0.7,
        };
        let update_service = service.clone();
        let expected_settings = final_settings.clone();
        let update = tokio::spawn(async move {
            update_service
                .update_settings("reader", final_settings)
                .await
        });

        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(
            !update.is_finished(),
            "settings update must wait for the in-flight upload mutation"
        );

        upload.await.unwrap().unwrap();
        update.await.unwrap().unwrap();
        let stored = service.get_image("reader").await.unwrap();
        assert_eq!(stored.bytes, expected_bytes);
        assert_eq!(stored.metadata.settings, expected_settings);

        let final_upload_bytes = png_bytes(b"upload-before-delete");
        let (final_upload_entered_tx, final_upload_entered_rx) = tokio::sync::oneshot::channel();
        let final_upload_service = service.clone();
        let final_upload = tokio::spawn(async move {
            final_upload_service
                .save_with_settings("reader", &final_upload_bytes, move |_| {
                    let _ = final_upload_entered_tx.send(());
                    std::thread::sleep(Duration::from_millis(100));
                    Ok(())
                })
                .await
        });

        final_upload_entered_rx.await.unwrap();
        let delete_service = service.clone();
        let delete = tokio::spawn(async move { delete_service.delete("reader").await });
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(
            !delete.is_finished(),
            "delete must wait for the in-flight upload mutation"
        );

        final_upload.await.unwrap().unwrap();
        assert!(delete.await.unwrap().unwrap());
        assert!(service.get_metadata("reader").await.unwrap().is_none());

        let _ = fs::remove_dir_all(root).await;
    }
}
