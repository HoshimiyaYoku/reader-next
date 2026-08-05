use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server_host: String,
    pub server_port: u16,
    pub database_url: String,
    pub storage_dir: String,
    pub web_root: String,
    pub assets_dir: String,
    pub log_level: String,
    pub request_timeout_secs: u64,
    pub cache_max_bytes: u64,
    pub cache_max_age_days: u64,
    pub secure: bool,
    pub secure_key: String,
    pub invite_code: String,
    pub user_limit: u32,
    pub user_book_limit: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_host: "0.0.0.0".to_string(),
            server_port: 18080,
            database_url: "sqlite:storage/reader.db?mode=rwc".to_string(),
            storage_dir: "storage".to_string(),
            web_root: "frontend/dist".to_string(),
            assets_dir: "storage/assets".to_string(),
            log_level: "info".to_string(),
            request_timeout_secs: 15,
            cache_max_bytes: crate::storage::cache::file_cache::DEFAULT_CACHE_MAX_BYTES,
            cache_max_age_days: 30,
            secure: false,
            secure_key: "".to_string(),
            invite_code: "".to_string(),
            user_limit: 50,
            user_book_limit: 2000,
        }
    }
}

pub fn load() -> anyhow::Result<AppConfig> {
    dotenvy::dotenv().ok();
    let defaults = AppConfig::default();
    let cfg = config::Config::builder()
        .set_default("server_host", defaults.server_host)?
        .set_default("server_port", defaults.server_port as i64)?
        .set_default("database_url", defaults.database_url)?
        .set_default("storage_dir", defaults.storage_dir)?
        .set_default("web_root", defaults.web_root)?
        .set_default("assets_dir", defaults.assets_dir)?
        .set_default("log_level", defaults.log_level)?
        .set_default("request_timeout_secs", defaults.request_timeout_secs as i64)?
        .set_default("cache_max_bytes", defaults.cache_max_bytes as i64)?
        .set_default("cache_max_age_days", defaults.cache_max_age_days as i64)?
        .set_default("secure", defaults.secure)?
        .set_default("secure_key", defaults.secure_key)?
        .set_default("invite_code", defaults.invite_code)?
        .set_default("user_limit", defaults.user_limit as i64)?
        .set_default("user_book_limit", defaults.user_book_limit as i64)?
        .add_source(config::Environment::default().try_parsing(true))
        .build()?;
    Ok(cfg.try_deserialize()?)
}
