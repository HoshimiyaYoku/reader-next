use crate::crawler::{
    fetcher::{fetch, FetchResponse, RequestSpec, StrResponse},
    http_client::HttpClient,
    url_analyzer::analyze_url,
};
use crate::error::error::AppError;
use crate::model::{
    book::Book,
    book_chapter::BookChapter,
    book_source::{BookSource, ExploreKind},
    search::SearchBook,
};
use crate::parser::js::{eval_js, eval_js_with_bindings, with_js_lib};
use crate::parser::rule_engine::RuleEngine;
use crate::storage::cache::file_cache::FileCache;
use crate::util::hash::md5_hex;
use crate::util::text::{normalize_source_url, repair_encoded_url};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration, Instant};

#[derive(Clone)]
pub struct BookService {
    http: HttpClient,
    parser: RuleEngine,
    cache: FileCache,
    storage_dir: PathBuf,
    source_cookies: Arc<RwLock<HashMap<String, String>>>,
    rate_states: Arc<RwLock<HashMap<String, RateState>>>,
}

#[derive(Clone, Default)]
struct RateState {
    in_flight: bool,
    last_start: Option<Instant>,
    window_starts: Vec<Instant>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSourceAvailability {
    pub book_source_url: String,
    pub book_source_name: String,
    pub valid: bool,
    pub search_ok: bool,
    pub explore_ok: bool,
    pub keyword: String,
    pub explore_url: Option<String>,
    pub search_error: Option<String>,
    pub explore_error: Option<String>,
}

impl BookService {
    pub fn new(http: HttpClient, parser: RuleEngine, cache: FileCache, storage_dir: &str) -> Self {
        let storage_dir = PathBuf::from(storage_dir);
        Self {
            http,
            parser,
            cache,
            storage_dir,
            source_cookies: Arc::new(RwLock::new(HashMap::new())),
            rate_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn http_client(&self) -> &reqwest::Client {
        self.http.client()
    }

    fn source_cookie_key(&self, user_ns: &str, source_url: &str) -> String {
        format!("{}::{}", user_ns, cookie_domain(source_url))
    }

    async fn apply_source_cookie(
        &self,
        user_ns: &str,
        source: &BookSource,
        headers: &mut Vec<(String, String)>,
    ) {
        let key = self.source_cookie_key(user_ns, &source.book_source_url);
        if let Some(cookie) = self.source_cookies.read().await.get(&key).cloned() {
            if !headers
                .iter()
                .any(|(name, _)| name.eq_ignore_ascii_case("cookie"))
            {
                headers.push(("Cookie".to_string(), cookie));
            }
        }
    }

    pub async fn set_source_cookie(&self, user_ns: &str, source_url: &str, cookie: &str) {
        let cookie = cookie.trim();
        if cookie.is_empty() {
            return;
        }
        let key = self.source_cookie_key(user_ns, source_url);
        self.source_cookies
            .write()
            .await
            .insert(key, cookie.to_string());
    }

    pub async fn clear_source_cookie(&self, user_ns: &str, source_url: &str) {
        let key = self.source_cookie_key(user_ns, source_url);
        self.source_cookies.write().await.remove(&key);
    }

    async fn fetch_source_url(
        &self,
        user_ns: &str,
        source: &BookSource,
        url_rule: &str,
        base_url: &str,
    ) -> Result<FetchResponse, AppError> {
        let mut spec = analyze_url(url_rule, "", 1, base_url, source)?;
        self.apply_source_cookie(user_ns, source, &mut spec.headers)
            .await;
        let res = self.fetch_with_rate(source, spec).await?;
        Ok(apply_login_check_js(source, res))
    }

    async fn fetch_with_rate(
        &self,
        source: &BookSource,
        spec: RequestSpec,
    ) -> anyhow::Result<FetchResponse> {
        self.wait_for_rate(source).await;
        let result = fetch(&self.http, spec).await;
        self.finish_rate(source).await;
        result
    }

    async fn wait_for_rate(&self, source: &BookSource) {
        let Some(rate) = source.concurrent_rate.as_deref().map(str::trim) else {
            return;
        };
        if rate.is_empty() || rate == "0" {
            return;
        }
        if let Some((limit, window_ms)) = parse_window_rate(rate) {
            self.wait_for_window_rate(&source.book_source_url, limit, window_ms)
                .await;
            return;
        }
        let Ok(delay_ms) = rate.parse::<u64>() else {
            return;
        };
        self.wait_for_serial_rate(&source.book_source_url, delay_ms)
            .await;
    }

    async fn wait_for_serial_rate(&self, source_key: &str, delay_ms: u64) {
        let delay = Duration::from_millis(delay_ms);
        loop {
            let wait = {
                let mut states = self.rate_states.write().await;
                let state = states.entry(source_key.to_string()).or_default();
                let now = Instant::now();
                if state.in_flight {
                    delay
                } else if let Some(last_start) = state.last_start {
                    let elapsed = now.saturating_duration_since(last_start);
                    if elapsed < delay {
                        delay - elapsed
                    } else {
                        state.in_flight = true;
                        state.last_start = Some(now);
                        return;
                    }
                } else {
                    state.in_flight = true;
                    state.last_start = Some(now);
                    return;
                }
            };
            sleep(wait).await;
        }
    }

    async fn wait_for_window_rate(&self, source_key: &str, limit: usize, window_ms: u64) {
        if limit == 0 || window_ms == 0 {
            return;
        }
        let window = Duration::from_millis(window_ms);
        loop {
            let wait = {
                let mut states = self.rate_states.write().await;
                let state = states.entry(source_key.to_string()).or_default();
                let now = Instant::now();
                state
                    .window_starts
                    .retain(|start| now.saturating_duration_since(*start) <= window);
                if state.window_starts.len() >= limit {
                    state
                        .window_starts
                        .first()
                        .map(|start| window.saturating_sub(now.saturating_duration_since(*start)))
                        .unwrap_or(window)
                } else {
                    state.window_starts.push(now);
                    return;
                }
            };
            sleep(wait).await;
        }
    }

    async fn finish_rate(&self, source: &BookSource) {
        let mut states = self.rate_states.write().await;
        if let Some(state) = states.get_mut(&source.book_source_url) {
            state.in_flight = false;
        }
    }

    pub async fn search_book(
        &self,
        user_ns: &str,
        source: &BookSource,
        key: &str,
        page: i32,
    ) -> Result<Vec<SearchBook>, AppError> {
        let search_url = source
            .search_url
            .clone()
            .ok_or_else(|| AppError::BadRequest("missing search_url".to_string()))?;
        tracing::info!(
            "searching book from {}: key={}, page={}, url={}",
            source.book_source_name,
            key,
            page,
            search_url
        );
        let mut spec = analyze_url(&search_url, key, page, &source.book_source_url, source)
            .map_err(|e| {
                tracing::error!("analyze_url failed: {:?}", e);
                e
            })?;

        self.apply_source_cookie(user_ns, source, &mut spec.headers)
            .await;

        tracing::debug!("search_book fetched spec: {:?}", spec);
        let res = self.fetch_with_rate(source, spec).await.map_err(|e| {
            tracing::error!("fetch failed: {:?}", e);
            e
        })?;
        let res = apply_login_check_js(source, res);
        tracing::debug!("fetch success, body length: {}", res.body.len());
        let books = self.parser.search_books(source, &res.body, &res.url);
        tracing::info!("found {} books", books.len());
        Ok(books)
    }

    pub async fn explore_book(
        &self,
        user_ns: &str,
        source: &BookSource,
        rule_find_url: &str,
        page: i32,
    ) -> Result<Vec<SearchBook>, AppError> {
        if rule_find_url.trim().is_empty() {
            return Err(AppError::BadRequest("ruleFindUrl required".to_string()));
        }
        let mut spec = analyze_url(rule_find_url, "", page, &source.book_source_url, source)?;

        self.apply_source_cookie(user_ns, source, &mut spec.headers)
            .await;

        let res = apply_login_check_js(source, self.fetch_with_rate(source, spec).await?);
        Ok(self.parser.explore_books(source, &res.body, &res.url))
    }

    pub fn explore_kinds(&self, source: &BookSource) -> Result<Vec<ExploreKind>, AppError> {
        parse_explore_kinds(source)
    }

    pub async fn test_book_source_availability(
        &self,
        user_ns: &str,
        source: &BookSource,
        keyword: Option<&str>,
    ) -> BookSourceAvailability {
        let keyword = keyword
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                source
                    .rule_search
                    .as_ref()
                    .and_then(|rule| rule.check_key_word.as_deref())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or("斗破苍穹")
            .to_string();

        let (search_ok, search_error) = if source
            .search_url
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            && source.rule_search.is_some()
        {
            match self.search_book(user_ns, source, &keyword, 1).await {
                Ok(books) => (!books.is_empty(), None),
                Err(err) => (false, Some(format!("{err:?}"))),
            }
        } else {
            (false, Some("missing searchUrl or ruleSearch".to_string()))
        };

        let explore_url = self.explore_kinds(source).ok().and_then(|kinds| {
            kinds
                .into_iter()
                .filter_map(|kind| kind.url)
                .map(|url| url.trim().to_string())
                .find(|url| !url.is_empty())
        });
        let (explore_ok, explore_error) = if let Some(url) = explore_url.as_deref() {
            match self.explore_book(user_ns, source, url, 1).await {
                Ok(books) => (!books.is_empty(), None),
                Err(err) => (false, Some(format!("{err:?}"))),
            }
        } else {
            (false, Some("missing explore category url".to_string()))
        };

        BookSourceAvailability {
            book_source_url: source.book_source_url.clone(),
            book_source_name: source.book_source_name.clone(),
            valid: search_ok || explore_ok,
            search_ok,
            explore_ok,
            keyword,
            explore_url,
            search_error,
            explore_error,
        }
    }

    pub async fn login_book_source(
        &self,
        source: &BookSource,
    ) -> Result<serde_json::Value, AppError> {
        let login_url = source
            .login_url
            .clone()
            .filter(|v| !v.trim().is_empty())
            .ok_or_else(|| AppError::BadRequest("missing loginUrl".to_string()))?;

        if let Some(target_url) = resolve_login_preview_target(source)? {
            let body_html = build_login_preview_html(source, &target_url).unwrap_or_default();
            return Ok(serde_json::json!({
                "success": true,
                "status": 200,
                "url": target_url,
                "checkResult": "脚本型 loginUrl：已提取登录入口，未执行 App 专用 JS",
                "bodyPreview": "",
                "bodyHtml": body_html
            }));
        }

        let spec = analyze_url(&login_url, "", 1, &source.book_source_url, source)?;

        let res = self.fetch_with_rate(source, spec).await?;
        let check_result = if let Some(login_check_js) = source
            .login_check_js
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            Some(with_js_lib(source.js_lib.as_deref(), || {
                eval_js(login_check_js, &res.body, &res.url).unwrap_or_default()
            }))
        } else {
            None
        };

        Ok(serde_json::json!({
            "success": true,
            "status": res.status,
            "url": res.url,
            "checkResult": check_result,
            "bodyPreview": res.body.chars().take(500).collect::<String>(),
            "bodyHtml": res.body
        }))
    }

    pub async fn get_book_info(
        &self,
        user_ns: &str,
        source: &BookSource,
        book_url: &str,
    ) -> Result<Book, AppError> {
        let res = self
            .fetch_source_url(user_ns, source, book_url, &source.book_source_url)
            .await?;
        Ok(self.parser.book_info(source, &res.body, &res.url, book_url))
    }

    pub async fn get_chapter_list(
        &self,
        user_ns: &str,
        source: &BookSource,
        toc_url: &str,
    ) -> Result<Vec<BookChapter>, AppError> {
        self.get_chapter_list_with_cache(user_ns, source, toc_url, false)
            .await
    }

    pub async fn get_chapter_list_with_cache(
        &self,
        user_ns: &str,
        source: &BookSource,
        toc_url: &str,
        force_refresh: bool,
    ) -> Result<Vec<BookChapter>, AppError> {
        // Check cache first (unless force refresh)
        if !force_refresh {
            if let Ok(Some(cached)) = self.load_chapter_list_cache(user_ns, toc_url).await {
                if !cached.is_empty() {
                    return Ok(cached);
                }
            }
        }
        let (chapters, _) = self
            .get_chapter_list_with_pagination(user_ns, source, toc_url)
            .await?;
        // Save to cache
        let _ = self
            .save_chapter_list_cache(user_ns, toc_url, &chapters)
            .await;
        Ok(chapters)
    }

    async fn get_chapter_list_with_pagination(
        &self,
        user_ns: &str,
        source: &BookSource,
        toc_url: &str,
    ) -> Result<(Vec<BookChapter>, Vec<String>), AppError> {
        let mut all_chapters = Vec::new();
        let mut visited_page_urls = std::collections::HashSet::new();
        let mut seen_chapter_urls = std::collections::HashSet::new();
        let mut chapter_index = 0i32;

        // Fetch first page
        let res = self
            .fetch_source_url(user_ns, source, toc_url, &source.book_source_url)
            .await?;
        let (chapters, next_urls) = self.parser.chapter_list(source, &res.body, &res.url);

        visited_page_urls.insert(toc_url.to_string());

        // Add first page chapters with deduplication
        for ch in chapters {
            if seen_chapter_urls.contains(&ch.url) {
                continue;
            }
            seen_chapter_urls.insert(ch.url.clone());
            all_chapters.push(BookChapter {
                title: ch.title,
                url: ch.url,
                index: chapter_index,
                ..Default::default()
            });
            chapter_index += 1;
        }

        // Determine how to handle pagination
        // Filter out already visited URLs
        let pending_urls: Vec<String> = next_urls
            .into_iter()
            .filter(|u| !visited_page_urls.contains(u))
            .collect();

        if pending_urls.len() > 1 {
            // Multiple URLs from option dropdown - fetch all pages
            for url in pending_urls {
                if visited_page_urls.contains(&url) {
                    continue;
                }
                visited_page_urls.insert(url.clone());

                let res = self
                    .fetch_source_url(user_ns, source, &url, &source.book_source_url)
                    .await?;
                let (chapters, _) = self.parser.chapter_list(source, &res.body, &res.url);

                for ch in chapters {
                    if seen_chapter_urls.contains(&ch.url) {
                        continue;
                    }
                    seen_chapter_urls.insert(ch.url.clone());
                    all_chapters.push(BookChapter {
                        title: ch.title,
                        url: ch.url,
                        index: chapter_index,
                        ..Default::default()
                    });
                    chapter_index += 1;
                }
            }
        } else if pending_urls.len() == 1 {
            // Single next page link - follow sequentially
            let mut current_url = pending_urls[0].clone();
            loop {
                if visited_page_urls.contains(&current_url) {
                    break;
                }
                visited_page_urls.insert(current_url.clone());

                let res = self
                    .fetch_source_url(user_ns, source, &current_url, &source.book_source_url)
                    .await?;
                let (chapters, next_urls) = self.parser.chapter_list(source, &res.body, &res.url);

                for ch in chapters {
                    if seen_chapter_urls.contains(&ch.url) {
                        continue;
                    }
                    seen_chapter_urls.insert(ch.url.clone());
                    all_chapters.push(BookChapter {
                        title: ch.title,
                        url: ch.url,
                        index: chapter_index,
                        ..Default::default()
                    });
                    chapter_index += 1;
                }

                // Get next page
                let next = next_urls
                    .into_iter()
                    .find(|u| !visited_page_urls.contains(u));
                match next {
                    Some(url) if !url.is_empty() => current_url = url,
                    _ => break,
                }
            }
        }

        Ok((all_chapters, visited_page_urls.into_iter().collect()))
    }

    pub async fn get_content(
        &self,
        user_ns: &str,
        book_url: &str,
        source: &BookSource,
        chapter_url: &str,
    ) -> Result<String, AppError> {
        let book_key = md5_hex(book_url);
        tracing::debug!(
            "get_content called, chapter_url={}, book_key={}",
            chapter_url,
            book_key
        );
        if let Ok(Some(cached)) = self.cache.get(user_ns, &book_key, chapter_url).await {
            tracing::debug!("get_content returning cached content, len={}", cached.len());
            return Ok(cached);
        }
        tracing::debug!("get_content cache miss, fetching from network");

        let mut all_content = String::new();
        let mut visited_urls = std::collections::HashSet::new();
        let mut current_url = chapter_url.to_string();

        // Follow pagination to get all content pages
        loop {
            if visited_urls.contains(&current_url) {
                tracing::debug!("get_content detected loop, breaking");
                break;
            }
            visited_urls.insert(current_url.clone());

            tracing::debug!("get_content fetching: {}", current_url);
            let res = self
                .fetch_source_url(user_ns, source, &current_url, &source.book_source_url)
                .await?;
            tracing::debug!("get_content fetch done, body len={}", res.body.len());
            let content = self.parser.content(source, &res.body, &res.url);
            tracing::debug!("get_content parsed content len={}", content.len());

            if !content.is_empty() {
                if !all_content.is_empty() {
                    all_content.push('\n');
                }
                all_content.push_str(&content);
            }

            // Check for next page
            if let Some(next_url) = self.parser.next_content_url(source, &res.body, &res.url) {
                tracing::debug!("get_content found next_url: {}", next_url);
                if should_follow_content_page(chapter_url, &current_url, &next_url) {
                    current_url = next_url;
                } else {
                    tracing::debug!("get_content next_url appears to be next chapter, stopping");
                    break;
                }
            } else {
                tracing::debug!("get_content no more pages");
                break;
            }
        }

        tracing::debug!("get_content final content len={}", all_content.len());
        if !all_content.is_empty() {
            let _ = self
                .cache
                .put(user_ns, &book_key, chapter_url, &all_content)
                .await;
        }
        Ok(all_content)
    }

    /// Delete all chapter content cache for a book
    pub async fn delete_book_cache(&self, user_ns: &str, book_url: &str) -> Result<bool, AppError> {
        let book_key = md5_hex(book_url);
        self.cache
            .remove_book(user_ns, &book_key)
            .await
            .map_err(|e| AppError::Internal(e.into()))
    }

    /// Check if a specific chapter is cached
    pub async fn is_chapter_cached(
        &self,
        user_ns: &str,
        book_url: &str,
        chapter_url: &str,
    ) -> bool {
        let book_key = md5_hex(book_url);
        self.cache.exists(user_ns, &book_key, chapter_url).await
    }

    pub async fn chapter_list_cache_exists(&self, user_ns: &str, toc_url: &str) -> bool {
        let path = self.chapter_list_cache_path(user_ns, toc_url);
        path.exists()
    }

    pub async fn get_bookshelf(&self, user_ns: &str) -> Result<Vec<Book>, AppError> {
        self.read_bookshelf(user_ns).await
    }

    pub async fn get_shelf_book(
        &self,
        user_ns: &str,
        book_url: &str,
    ) -> Result<Option<Book>, AppError> {
        let list = self.read_bookshelf(user_ns).await?;
        Ok(list
            .into_iter()
            .filter(|b| b.book_url == book_url)
            .max_by_key(progress_rank))
    }

    /// Find book by chapter URL (chapter URL typically shares domain with book URL)
    pub async fn get_shelf_book_by_chapter(
        &self,
        user_ns: &str,
        chapter_url: &str,
    ) -> Result<Option<Book>, AppError> {
        let list = self.read_bookshelf(user_ns).await?;

        // Extract domain from chapter_url
        let chapter_domain = url::Url::parse(chapter_url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_string()));

        for book in list {
            // Check if chapter URL starts with book URL (common pattern)
            if chapter_url.starts_with(&book.book_url) {
                return Ok(Some(book));
            }

            // Check if they share the same domain
            if let (Some(ref ch_domain), Ok(book_url_parsed)) =
                (&chapter_domain, url::Url::parse(&book.book_url))
            {
                if let Some(book_domain) = book_url_parsed.host_str() {
                    if ch_domain == book_domain {
                        // Check if chapter URL path contains book URL path prefix
                        if let (Ok(ch_parsed), Ok(b_parsed)) = (
                            url::Url::parse(chapter_url),
                            url::Url::parse(&book.book_url),
                        ) {
                            let ch_path = ch_parsed.path();
                            let b_path = b_parsed.path();
                            // Check if paths share a common prefix (e.g., /biqu104/)
                            if ch_path.starts_with(b_path.trim_end_matches('/'))
                                || b_path
                                    .trim_end_matches('/')
                                    .starts_with(ch_path.trim_end_matches('/'))
                            {
                                return Ok(Some(book));
                            }
                        }
                    }
                }
            }
        }
        Ok(None)
    }

    /// Find book by name and author (for cases where book_url might differ)
    pub async fn find_shelf_book_by_name_author(
        &self,
        user_ns: &str,
        name: &str,
        author: &str,
    ) -> Result<Option<Book>, AppError> {
        let list = self.read_bookshelf(user_ns).await?;
        Ok(list
            .into_iter()
            .find(|b| b.name.trim() == name.trim() && b.author.trim() == author.trim()))
    }

    pub async fn save_book(&self, user_ns: &str, mut book: Book) -> Result<Book, AppError> {
        sanitize_book_urls(&mut book);
        if book.origin.trim().is_empty() {
            return Err(AppError::BadRequest("missing origin".to_string()));
        }
        if book.book_url.trim().is_empty() {
            return Err(AppError::BadRequest("bookUrl required".to_string()));
        }

        let mut list = self.read_bookshelf(user_ns).await?;
        let mut exist_idx: Option<usize> = None;
        for (i, b) in list.iter().enumerate() {
            if books_match_for_save(b, &book) {
                exist_idx = Some(i);
                break;
            }
        }

        if let Some(i) = exist_idx {
            let exist = list[i].clone();
            if book.dur_chapter_index.is_none() {
                book.dur_chapter_index = exist.dur_chapter_index;
            }
            if book.dur_chapter_title.is_none() {
                book.dur_chapter_title = exist.dur_chapter_title.clone();
            }
            if book.dur_chapter_time.is_none() {
                book.dur_chapter_time = exist.dur_chapter_time;
            }
            if book.dur_chapter_pos.is_none() {
                book.dur_chapter_pos = exist.dur_chapter_pos;
            }
            if book.total_chapter_num.is_none() {
                book.total_chapter_num = exist.total_chapter_num;
            }
            if book.last_check_time.is_none() {
                book.last_check_time = exist.last_check_time;
            }
            if book.group.is_none() {
                book.group = exist.group;
            }
            list[i] = book.clone();
        } else {
            list.push(book.clone());
        }

        self.write_bookshelf(user_ns, &list).await?;
        Ok(book)
    }

    pub async fn save_books(&self, user_ns: &str, books: Vec<Book>) -> Result<Vec<Book>, AppError> {
        let existing = self.read_bookshelf(user_ns).await?;
        let mut normalized: Vec<Book> = Vec::with_capacity(books.len());
        for mut book in books {
            sanitize_book_urls(&mut book);
            if book.origin.trim().is_empty() {
                return Err(AppError::BadRequest("missing origin".to_string()));
            }
            if book.book_url.trim().is_empty() {
                return Err(AppError::BadRequest("bookUrl required".to_string()));
            }
            let matching_existing = existing
                .iter()
                .filter(|item| books_match_for_save(item, &book))
                .cloned()
                .collect::<Vec<_>>();
            for existing_book in &matching_existing {
                preserve_newer_reading_progress(existing_book, &mut book);
            }
            if let Some(existing_index) = normalized
                .iter()
                .position(|item| books_match_for_save(item, &book))
            {
                let mut merged = book;
                preserve_newer_reading_progress(&normalized[existing_index], &mut merged);
                normalized[existing_index] = merged;
            } else {
                normalized.push(book);
            }
        }
        self.write_bookshelf(user_ns, &normalized).await?;
        Ok(normalized)
    }

    pub async fn delete_book(&self, user_ns: &str, book: &Book) -> Result<bool, AppError> {
        let mut list = self.read_bookshelf(user_ns).await?;
        let orig_len = list.len();
        let removed: Vec<Book> = list
            .iter()
            .filter(|b| books_match_for_delete(b, book))
            .cloned()
            .collect();
        list.retain(|b| !books_match_for_delete(b, book));
        let deleted = list.len() != orig_len;
        if deleted {
            self.write_bookshelf(user_ns, &list).await?;
            for removed_book in &removed {
                let _ = self.clear_book_related_cache(user_ns, removed_book).await;
            }
        }
        Ok(deleted)
    }

    pub async fn delete_books(&self, user_ns: &str, books: Vec<Book>) -> Result<usize, AppError> {
        let mut list = self.read_bookshelf(user_ns).await?;
        let mut deleted = 0usize;
        let mut removed_books: Vec<Book> = Vec::new();
        for book in books {
            let matched: Vec<Book> = list
                .iter()
                .filter(|b| books_match_for_delete(b, &book))
                .cloned()
                .collect();
            removed_books.extend(matched);
            let before = list.len();
            list.retain(|b| !books_match_for_delete(b, &book));
            if list.len() != before {
                deleted += 1;
            }
        }
        if deleted > 0 {
            self.write_bookshelf(user_ns, &list).await?;
            for removed_book in &removed_books {
                let _ = self.clear_book_related_cache(user_ns, removed_book).await;
            }
        }
        Ok(deleted)
    }

    pub async fn cached_chapter_count(
        &self,
        user_ns: &str,
        book_url: &str,
        chapter_urls: &[String],
    ) -> Result<usize, AppError> {
        let book_key = md5_hex(book_url);
        let mut count = 0usize;
        for url in chapter_urls {
            if self.cache.exists(user_ns, &book_key, url).await {
                count += 1;
            }
        }
        Ok(count)
    }

    pub async fn cache_chapter(
        &self,
        user_ns: &str,
        book_url: &str,
        source: &BookSource,
        chapter_url: &str,
        refresh: bool,
    ) -> Result<(), AppError> {
        let book_key = md5_hex(book_url);
        if refresh {
            let _ = self.cache.remove(user_ns, &book_key, chapter_url).await;
        }
        let _ = self
            .get_content(user_ns, book_url, source, chapter_url)
            .await?;
        Ok(())
    }

    pub async fn get_cover(&self, user_ns: &str, url: &str) -> Result<(Vec<u8>, String), AppError> {
        let ext = file_ext_from_url(url).unwrap_or_else(|| "png".to_string());
        let name = md5_hex(url);
        let path = self
            .storage_dir
            .join("cache")
            .join(user_ns)
            .join("cover")
            .join(format!("{}.{}", name, ext));
        if path.exists() {
            let data = fs::read(&path)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            let content_type = content_type_from_ext(&ext);
            return Ok((data, content_type));
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }

        // Extract referer from URL for anti-hotlinking bypass
        let referer = url::Url::parse(url).ok().and_then(|u| {
            let scheme = u.scheme();
            let host = u.host_str()?;
            Some(format!("{}://{}", scheme, host))
        });

        let mut req = self.http.client().get(url);

        // Add necessary headers to bypass anti-hotlinking
        req = req
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8");

        if let Some(ref referer) = referer {
            req = req.header("Referer", referer);
        }

        let res = req.send().await.map_err(|e| AppError::Internal(e.into()))?;
        if !res.status().is_success() {
            return Err(AppError::NotFound("cover not found".to_string()));
        }
        let content_type = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| content_type_from_ext(&ext));
        let bytes = res
            .bytes()
            .await
            .map_err(|e| AppError::Internal(e.into()))?
            .to_vec();
        let _ = fs::write(&path, &bytes).await;
        Ok((bytes, content_type))
    }

    pub async fn load_book_sources_cache(
        &self,
        user_ns: &str,
        book_url: &str,
    ) -> Result<Option<Vec<SearchBook>>, AppError> {
        let path = self.book_source_cache_path(user_ns, book_url);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        let list: Vec<SearchBook> =
            serde_json::from_str(&data).map_err(|e| AppError::BadRequest(e.to_string()))?;
        Ok(Some(list))
    }

    pub async fn save_book_sources_cache(
        &self,
        user_ns: &str,
        book_url: &str,
        list: &Vec<SearchBook>,
    ) -> Result<(), AppError> {
        let path = self.book_source_cache_path(user_ns, book_url);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        let data = serde_json::to_string(list).map_err(|e| AppError::BadRequest(e.to_string()))?;
        fs::write(&path, data)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        Ok(())
    }

    pub async fn delete_book_sources_cache(
        &self,
        user_ns: &str,
        book_url: &str,
    ) -> Result<(), AppError> {
        let path = self.book_source_cache_path(user_ns, book_url);
        if path.exists() {
            fs::remove_file(&path)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        Ok(())
    }

    fn book_source_cache_path(&self, user_ns: &str, book_url: &str) -> PathBuf {
        let name = md5_hex(book_url);
        self.storage_dir
            .join("data")
            .join(user_ns)
            .join("book_sources")
            .join(format!("{}.json", name))
    }

    fn bookshelf_path(&self, user_ns: &str) -> PathBuf {
        self.storage_dir
            .join("data")
            .join(user_ns)
            .join("bookshelf.json")
    }

    async fn read_bookshelf(&self, user_ns: &str) -> Result<Vec<Book>, AppError> {
        let path = self.bookshelf_path(user_ns);
        if !path.exists() {
            return Ok(Vec::new());
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        let mut list: Vec<Book> = match serde_json::from_str(&data) {
            Ok(list) => list,
            Err(primary_err) => {
                let recovered = recover_bookshelf_entries(&data)
                    .ok_or_else(|| AppError::BadRequest(primary_err.to_string()))?;
                tracing::warn!(
                    "recovered malformed bookshelf for user_ns={}, path={}, entries={}",
                    user_ns,
                    path.display(),
                    recovered.len()
                );
                self.write_bookshelf(user_ns, &recovered).await?;
                recovered
            }
        };
        for book in &mut list {
            sanitize_book_urls(book);
        }
        Ok(list)
    }

    async fn write_bookshelf(&self, user_ns: &str, list: &Vec<Book>) -> Result<(), AppError> {
        let path = self.bookshelf_path(user_ns);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        let data = serde_json::to_string(list).map_err(|e| AppError::BadRequest(e.to_string()))?;
        fs::write(&path, data)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        Ok(())
    }

    // Chapter list cache methods
    fn chapter_list_cache_path(&self, user_ns: &str, toc_url: &str) -> PathBuf {
        let name = md5_hex(toc_url);
        self.storage_dir
            .join("data")
            .join(user_ns)
            .join("chapters")
            .join(format!("{}.json", name))
    }

    pub async fn load_chapter_list_cache(
        &self,
        user_ns: &str,
        toc_url: &str,
    ) -> Result<Option<Vec<BookChapter>>, AppError> {
        let path = self.chapter_list_cache_path(user_ns, toc_url);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        let list: Vec<BookChapter> =
            serde_json::from_str(&data).map_err(|e| AppError::BadRequest(e.to_string()))?;
        Ok(Some(list))
    }

    pub async fn save_chapter_list_cache(
        &self,
        user_ns: &str,
        toc_url: &str,
        chapters: &Vec<BookChapter>,
    ) -> Result<(), AppError> {
        let path = self.chapter_list_cache_path(user_ns, toc_url);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        let data =
            serde_json::to_string(chapters).map_err(|e| AppError::BadRequest(e.to_string()))?;
        fs::write(&path, data)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        Ok(())
    }

    pub async fn delete_chapter_list_cache(
        &self,
        user_ns: &str,
        toc_url: &str,
    ) -> Result<(), AppError> {
        let path = self.chapter_list_cache_path(user_ns, toc_url);
        if path.exists() {
            fs::remove_file(&path)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        Ok(())
    }

    async fn clear_book_related_cache(&self, user_ns: &str, book: &Book) -> Result<(), AppError> {
        if !book.book_url.is_empty() {
            let _ = self.delete_book_cache(user_ns, &book.book_url).await;
            let _ = self
                .delete_book_sources_cache(user_ns, &book.book_url)
                .await;
            let _ = self
                .delete_chapter_list_cache(user_ns, &book.book_url)
                .await;
        }
        if let Some(toc_url) = &book.toc_url {
            if !toc_url.is_empty() {
                let _ = self.delete_chapter_list_cache(user_ns, toc_url).await;
            }
        }
        Ok(())
    }
}

fn apply_login_check_js(source: &BookSource, res: FetchResponse) -> FetchResponse {
    let Some(script) = source
        .login_check_js
        .as_deref()
        .filter(|script| !script.trim().is_empty())
    else {
        return res;
    };

    with_js_lib(source.js_lib.as_deref(), || {
        let str_response = StrResponse::from(res.clone());
        let mut bindings = HashMap::new();
        bindings.insert(
            "result".to_string(),
            serde_json::to_value(&str_response).unwrap_or_else(|_| json!({})),
        );
        match eval_js_with_bindings(script, &res.body, &res.url, &bindings) {
            Ok(output) if !output.trim().is_empty() => {
                if let Ok(next) = serde_json::from_str::<StrResponse>(&output) {
                    FetchResponse::from(next)
                } else {
                    FetchResponse {
                        body: output,
                        ..res
                    }
                }
            }
            Ok(_) => res,
            Err(err) => {
                tracing::warn!(
                    "loginCheckJs failed for {}: {:?}",
                    source.book_source_name,
                    err
                );
                res
            }
        }
    })
}

fn parse_explore_kinds(source: &BookSource) -> Result<Vec<ExploreKind>, AppError> {
    let Some(raw) = source
        .explore_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(Vec::new());
    };

    let text = with_js_lib(source.js_lib.as_deref(), || {
        if let Some(script) = raw.strip_prefix("@js:") {
            eval_js(script, "", &source.book_source_url).map_err(AppError::Internal)
        } else if let Some(script) = raw
            .strip_prefix("<js>")
            .and_then(|value| value.strip_suffix("</js>"))
        {
            eval_js(script, "", &source.book_source_url).map_err(AppError::Internal)
        } else {
            Ok(raw.to_string())
        }
    })?;

    for json_text in [&text, &normalize_relaxed_explore_json(&text)] {
        if let Ok(kinds) = serde_json::from_str::<Vec<ExploreKind>>(json_text) {
            return Ok(kinds
                .into_iter()
                .filter(|kind| !kind.title.trim().is_empty())
                .collect());
        }
    }

    let splitter = regex::Regex::new(r"(&&|\n)+").unwrap();
    Ok(splitter
        .split(&text)
        .filter_map(|item| {
            let item = item.trim();
            if item.is_empty() {
                return None;
            }
            let mut parts = item.splitn(2, "::");
            let title = parts.next().unwrap_or_default().trim();
            if title.is_empty() {
                return None;
            }
            let url = parts
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            Some(ExploreKind {
                title: title.to_string(),
                url,
                style: None,
            })
        })
        .collect())
}

fn normalize_relaxed_explore_json(text: &str) -> String {
    let mut normalized = String::with_capacity(text.len());
    let mut in_string = false;
    let mut quote = '\0';
    let mut escaped = false;

    for ch in text.chars() {
        if in_string {
            normalized.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == quote {
                in_string = false;
            }
            continue;
        }

        match ch {
            '"' | '\'' => {
                in_string = true;
                quote = ch;
                normalized.push(ch);
            }
            '<' => normalized.push('{'),
            '>' => normalized.push('}'),
            _ => normalized.push(ch),
        }
    }

    normalized
}

fn parse_window_rate(rate: &str) -> Option<(usize, u64)> {
    let (limit, window) = rate.split_once('/')?;
    let limit = limit.trim().parse().ok()?;
    let window = window.trim().parse().ok()?;
    Some((limit, window))
}

fn resolve_login_preview_target(source: &BookSource) -> Result<Option<String>, AppError> {
    let Some(login_url) = source
        .login_url
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };
    let script = login_url.strip_prefix("@js:").unwrap_or(login_url).trim();
    if !looks_like_login_script(script) {
        return Ok(None);
    }
    let search_area = extract_login_function_body(script).unwrap_or(script);
    let target_expression = extract_start_browser_argument(search_area)
        .or_else(|| extract_login_url_assignment(search_area));
    let Some(target_expression) = target_expression else {
        return Err(AppError::BadRequest(
            "脚本型 loginUrl 暂不支持自动执行：未找到登录页或登录接口入口".to_string(),
        ));
    };
    let Some(target) = eval_login_url_expression(&target_expression, &source.book_source_url)
    else {
        return Err(AppError::BadRequest(
            "脚本型 loginUrl 暂不支持自动执行：无法解析登录页或登录接口入口".to_string(),
        ));
    };
    let base = normalize_source_url(&source.book_source_url);
    url::Url::parse(&base)
        .and_then(|base| base.join(&target))
        .map(|url| Some(url.to_string()))
        .map_err(|e| AppError::BadRequest(format!("invalid login target url: {}", e)))
}

fn build_login_preview_html(source: &BookSource, target_url: &str) -> Option<String> {
    let login_ui = source.login_ui.as_deref()?.trim();
    if login_ui.is_empty() || !login_ui.contains("邮箱") || !login_ui.contains("密码") {
        return None;
    }
    let target = html_escape_attr(target_url);
    let title = html_escape_text(&source.book_source_name);
    Some(format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #171717; color: #f5f5f5; }}
    main {{ width: min(420px, calc(100vw - 40px)); padding: 28px; border: 1px solid #333; border-radius: 18px; background: #202020; box-shadow: 0 18px 50px rgba(0,0,0,.28); }}
    h1 {{ margin: 0 0 6px; font-size: 22px; }}
    p {{ margin: 0 0 20px; color: #aaa; line-height: 1.6; }}
    label {{ display: block; margin: 14px 0 6px; color: #ddd; }}
    input {{ width: 100%; box-sizing: border-box; padding: 12px 13px; border-radius: 12px; border: 1px solid #3a3a3a; background: #111; color: #fff; font: inherit; }}
    button {{ margin-top: 18px; width: 100%; padding: 12px 14px; border: 0; border-radius: 12px; background: #b87822; color: white; font: inherit; font-weight: 700; cursor: pointer; }}
    pre {{ margin-top: 18px; white-space: pre-wrap; word-break: break-word; color: #d7ffd7; background: #101010; border-radius: 12px; padding: 12px; }}
  </style>
</head>
<body>
  <main>
    <h1>{title}</h1>
    <p>此书源使用表单登录。账号密码只会提交给：<br>{target}</p>
    <form id="login-form">
      <label>邮箱</label>
      <input name="email" type="email" autocomplete="username" required>
      <label>密码</label>
      <input name="password" type="password" autocomplete="current-password" required>
      <button type="submit">登录</button>
    </form>
    <pre id="result"></pre>
  </main>
  <script>
    const form = document.getElementById('login-form');
    const result = document.getElementById('result');
    form.addEventListener('submit', async (event) => {{
      event.preventDefault();
      result.textContent = '正在登录...';
      const body = new URLSearchParams(new FormData(form));
      try {{
        const res = await fetch("{target}", {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }},
          body
        }});
        const text = await res.text();
        try {{
          const data = JSON.parse(text);
          const apiKey = data && data.data && data.data.user && data.data.user.api_key;
          result.textContent = apiKey
            ? '登录成功。api_key：\n' + apiKey + '\n\n完整响应：\n' + JSON.stringify(data, null, 2)
            : JSON.stringify(data, null, 2);
        }} catch (_e) {{
          result.textContent = text;
        }}
      }} catch (e) {{
        result.textContent = '登录请求失败：' + (e && e.message ? e.message : e);
      }}
    }});
  </script>
</body>
</html>"#
    ))
}

fn html_escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn html_escape_attr(value: &str) -> String {
    html_escape_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn looks_like_login_script(value: &str) -> bool {
    let trimmed = value.trim_start();
    trimmed.starts_with("function")
        || trimmed.starts_with("(()")
        || trimmed.starts_with("(function")
        || trimmed.contains("java.startBrowserAwait")
        || trimmed.contains("cookie.getCookie")
}

fn extract_login_function_body(script: &str) -> Option<&str> {
    let function_idx = script.find("function login")?;
    let after_function = &script[function_idx..];
    let params_start = after_function.find('(')? + function_idx;
    let params_end = find_matching_delimiter(script, params_start, '(', ')')?;
    let body_start = script[params_end + 1..]
        .char_indices()
        .find_map(|(idx, ch)| match ch {
            '{' | '<' => Some((params_end + 1 + idx, ch)),
            ch if ch.is_whitespace() => None,
            _ => None,
        })?;
    let (open_idx, open_ch) = body_start;
    let close_ch = if open_ch == '{' { '}' } else { '>' };
    let close_idx = find_matching_delimiter(script, open_idx, open_ch, close_ch)?;
    Some(&script[open_idx + open_ch.len_utf8()..close_idx])
}

fn find_matching_delimiter(
    text: &str,
    open_idx: usize,
    open_ch: char,
    close_ch: char,
) -> Option<usize> {
    let mut quote = None;
    let mut escaped = false;
    let mut depth = 0usize;
    for (idx, ch) in text[open_idx..].char_indices() {
        let absolute = open_idx + idx;
        if let Some(q) = quote {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == q {
                quote = None;
            }
            continue;
        }
        match ch {
            '\'' | '"' | '`' => quote = Some(ch),
            ch if ch == open_ch => depth += 1,
            ch if ch == close_ch => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(absolute);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_start_browser_argument(script: &str) -> Option<String> {
    let call = "startBrowserAwait";
    let start = script.find(call)? + call.len();
    let open = script[start..].find('(')? + start;
    let mut quote = None;
    let mut escaped = false;
    let mut depth = 0usize;
    let mut end = open + 1;
    for (idx, ch) in script[open + 1..].char_indices() {
        let absolute = open + 1 + idx;
        if let Some(q) = quote {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == q {
                quote = None;
            }
            continue;
        }
        match ch {
            '\'' | '"' | '`' => quote = Some(ch),
            '(' => depth += 1,
            ')' if depth == 0 => {
                end = absolute;
                break;
            }
            ')' => depth -= 1,
            ',' if depth == 0 => {
                end = absolute;
                break;
            }
            _ => {}
        }
    }
    let argument = script[open + 1..end].trim();
    (!argument.is_empty()).then(|| argument.to_string())
}

fn extract_login_url_assignment(script: &str) -> Option<String> {
    for marker in ["const url", "let url", "var url"] {
        if let Some(expression) = extract_assignment_expression(script, marker) {
            return Some(expression);
        }
    }
    None
}

fn extract_assignment_expression(script: &str, marker: &str) -> Option<String> {
    let marker_idx = script.find(marker)?;
    let after_marker = &script[marker_idx + marker.len()..];
    let equals_idx = after_marker.find('=')? + marker_idx + marker.len();
    let expression_start = equals_idx + 1;
    let mut quote = None;
    let mut escaped = false;
    for (idx, ch) in script[expression_start..].char_indices() {
        let absolute = expression_start + idx;
        if let Some(q) = quote {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == q {
                quote = None;
            }
            continue;
        }
        match ch {
            '\'' | '"' | '`' => quote = Some(ch),
            ';' | '\n' | '\r' => {
                let expression = script[expression_start..absolute].trim();
                return (!expression.is_empty()).then(|| expression.to_string());
            }
            _ => {}
        }
    }
    let expression = script[expression_start..].trim();
    (!expression.is_empty()).then(|| expression.to_string())
}

fn eval_login_url_expression(expression: &str, source_url: &str) -> Option<String> {
    let mut output = String::new();
    for part in split_js_concat(expression) {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if matches!(
            part,
            "source.bookSourceUrl"
                | "String(source.bookSourceUrl)"
                | "baseUrl"
                | "host"
                | "getServerHost()"
        ) {
            output.push_str(source_url);
            continue;
        }
        if let Some(value) = decode_js_string_literal(part) {
            output.push_str(&value);
            continue;
        }
        return None;
    }
    (!output.trim().is_empty()).then_some(output)
}

fn split_js_concat(expression: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0usize;
    let mut quote = None;
    let mut escaped = false;
    for (idx, ch) in expression.char_indices() {
        if let Some(q) = quote {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == q {
                quote = None;
            }
            continue;
        }
        match ch {
            '\'' | '"' | '`' => quote = Some(ch),
            '+' => {
                parts.push(&expression[start..idx]);
                start = idx + ch.len_utf8();
            }
            _ => {}
        }
    }
    parts.push(&expression[start..]);
    parts
}

fn decode_js_string_literal(value: &str) -> Option<String> {
    let value = value.trim();
    let quote = value.chars().next()?;
    if !matches!(quote, '\'' | '"' | '`') || !value.ends_with(quote) {
        return None;
    }
    let inner = &value[quote.len_utf8()..value.len() - quote.len_utf8()];
    let mut output = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(ch) = chars.next() {
        if ch != '\\' {
            output.push(ch);
            continue;
        }
        match chars.next() {
            Some('n') => output.push('\n'),
            Some('r') => output.push('\r'),
            Some('t') => output.push('\t'),
            Some(next) => output.push(next),
            None => output.push('\\'),
        }
    }
    Some(output)
}

fn should_follow_content_page(chapter_url: &str, current_url: &str, next_url: &str) -> bool {
    let next_url = strip_fragment(next_url);
    let current_url = strip_fragment(current_url);
    let chapter_url = strip_fragment(chapter_url);

    if next_url == current_url || next_url == chapter_url {
        return false;
    }

    match (
        url::Url::parse(chapter_url),
        url::Url::parse(current_url),
        url::Url::parse(next_url),
    ) {
        (Ok(chapter), Ok(current), Ok(next)) => {
            if chapter.scheme() != next.scheme()
                || chapter.host_str() != next.host_str()
                || chapter.port_or_known_default() != next.port_or_known_default()
            {
                return false;
            }

            let chapter_exact = content_path_exact_base(chapter.path());
            let current_exact = content_path_exact_base(current.path());
            let next_exact = content_path_exact_base(next.path());
            let next_page_base = content_path_page_base(next.path());

            next_exact == chapter_exact
                || next_exact == current_exact
                || next_page_base == chapter_exact
                || next_page_base == current_exact
        }
        _ => {
            let chapter_exact = content_path_exact_base(chapter_url);
            let current_exact = content_path_exact_base(current_url);
            let next_exact = content_path_exact_base(next_url);
            let next_page_base = content_path_page_base(next_url);

            next_exact == chapter_exact
                || next_exact == current_exact
                || next_page_base == chapter_exact
                || next_page_base == current_exact
        }
    }
}

fn strip_fragment(url: &str) -> &str {
    url.split_once('#').map(|(head, _)| head).unwrap_or(url)
}

fn content_path_exact_base(path: &str) -> String {
    content_path_base(path, false)
}

fn content_path_page_base(path: &str) -> String {
    content_path_base(path, true)
}

fn content_path_base(path: &str, strip_page_suffix: bool) -> String {
    let (dir, file) = path.rsplit_once('/').unwrap_or(("", path));
    let (stem, _ext) = file.rsplit_once('.').unwrap_or((file, ""));
    let stem = if strip_page_suffix {
        strip_page_suffix_from_stem(stem)
    } else {
        stem
    };
    if dir.is_empty() {
        stem.to_string()
    } else {
        format!("{dir}/{stem}")
    }
}

fn strip_page_suffix_from_stem(stem: &str) -> &str {
    for sep in ['-', '_'] {
        if let Some(idx) = stem.rfind(sep) {
            let suffix = &stem[idx + sep.len_utf8()..];
            if !suffix.is_empty()
                && suffix.chars().all(|ch| ch.is_ascii_digit())
                && suffix
                    .parse::<usize>()
                    .map(|page| page >= 2)
                    .unwrap_or(false)
            {
                return &stem[..idx];
            }
        }
    }
    stem
}

fn cookie_domain(source_url: &str) -> String {
    let normalized = normalize_source_url(source_url);
    let host = url::Url::parse(&normalized)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or(normalized);
    if host.parse::<std::net::IpAddr>().is_ok() {
        return host;
    }
    let host = host.strip_prefix("www.").unwrap_or(&host);
    let parts = host.split('.').collect::<Vec<_>>();
    if parts.len() <= 2 {
        return host.to_string();
    }
    let second_level = parts[parts.len() - 2];
    let last = parts[parts.len() - 1];
    if last.len() == 2
        && matches!(second_level, "com" | "net" | "org" | "gov" | "edu" | "co")
        && parts.len() >= 3
    {
        parts[parts.len() - 3..].join(".")
    } else {
        parts[parts.len() - 2..].join(".")
    }
}

fn is_local_txt_book(book: &Book) -> bool {
    book.origin.trim() == "local-txt" || book.book_url.trim().starts_with("local-txt:")
}

fn books_match_for_save(existing: &Book, incoming: &Book) -> bool {
    existing.book_url == incoming.book_url
}

fn books_match_for_delete(existing: &Book, target: &Book) -> bool {
    if !target.book_url.is_empty() && existing.book_url == target.book_url {
        return true;
    }
    if is_local_txt_book(existing) || is_local_txt_book(target) {
        return false;
    }
    !target.name.is_empty()
        && !target.author.is_empty()
        && existing.name == target.name
        && existing.author == target.author
}

fn sanitize_book_urls(book: &mut Book) {
    book.book_url = repair_encoded_url(&book.book_url);
    book.origin = normalize_source_url(&book.origin);
    if let Some(toc_url) = &book.toc_url {
        book.toc_url = Some(repair_encoded_url(toc_url));
    }
    if let Some(cover_url) = &book.cover_url {
        book.cover_url = Some(repair_encoded_url(cover_url));
    }
}

fn progress_updated_at(book: &Book) -> i64 {
    book.dur_chapter_time.unwrap_or(0)
}

fn progress_rank(book: &Book) -> i64 {
    progress_updated_at(book)
}

fn preserve_newer_reading_progress(existing: &Book, incoming: &mut Book) {
    if progress_rank(existing) <= progress_rank(incoming) {
        return;
    }
    incoming.dur_chapter_index = existing.dur_chapter_index;
    incoming.dur_chapter_pos = existing.dur_chapter_pos;
    incoming.dur_chapter_time = existing.dur_chapter_time;
    incoming.dur_chapter_title = existing.dur_chapter_title.clone();
}

fn recover_bookshelf_entries(data: &str) -> Option<Vec<Book>> {
    let mut recovered = Vec::new();
    let mut seen = HashSet::new();
    let stream = serde_json::Deserializer::from_str(data).into_iter::<serde_json::Value>();

    for item in stream {
        let value = match item {
            Ok(value) => value,
            Err(err) => {
                tracing::warn!("bookshelf recovery stream stopped: {}", err);
                break;
            }
        };
        match value {
            serde_json::Value::Array(items) => {
                for entry in items {
                    if let Ok(book) = serde_json::from_value::<Book>(entry) {
                        push_recovered_book(&mut recovered, &mut seen, book);
                    }
                }
            }
            serde_json::Value::Object(_) => {
                if let Ok(book) = serde_json::from_value::<Book>(value) {
                    push_recovered_book(&mut recovered, &mut seen, book);
                }
            }
            _ => {}
        }
    }

    if recovered.is_empty() {
        None
    } else {
        Some(recovered)
    }
}

fn push_recovered_book(recovered: &mut Vec<Book>, seen: &mut HashSet<String>, mut book: Book) {
    sanitize_book_urls(&mut book);
    let key = format!("{}::{}", book.book_url, book.origin);
    if seen.insert(key) {
        recovered.push(book);
    }
}

fn file_ext_from_url(url: &str) -> Option<String> {
    let url = url.split('?').next().unwrap_or(url);
    let url = url.split('#').next().unwrap_or(url);
    let pos = url.rfind('.')?;
    let ext = &url[pos + 1..];
    if ext.len() > 0 && ext.len() <= 8 {
        Some(ext.to_ascii_lowercase())
    } else {
        None
    }
}

fn content_type_from_ext(ext: &str) -> String {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_book_service(name: &str) -> (BookService, PathBuf) {
        let storage_dir = std::env::temp_dir().join(format!(
            "reader-next-{name}-{}-{}",
            std::process::id(),
            crate::util::time::now_ts()
        ));
        let service = BookService::new(
            HttpClient::new(5, None).unwrap(),
            RuleEngine::new().unwrap(),
            FileCache::new(storage_dir.join("cache")),
            storage_dir.to_str().unwrap(),
        );
        (service, storage_dir)
    }

    fn test_book(chapter_index: i32, chapter_pos: i32, chapter_time: i64) -> Book {
        Book {
            name: "同步书".to_string(),
            author: "作者".to_string(),
            origin: "https://source.example".to_string(),
            book_url: "https://book.example/1".to_string(),
            dur_chapter_index: Some(chapter_index),
            dur_chapter_pos: Some(chapter_pos),
            dur_chapter_time: Some(chapter_time),
            dur_chapter_title: Some(format!("第{}章", chapter_index + 1)),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn get_shelf_book_prefers_latest_duplicate_progress() {
        let (service, storage_dir) = test_book_service("newest-duplicate-progress");
        let user_ns = "duplicate-user";
        let old = test_book(0, 0, 3000);
        let fresh = test_book(8, 7300, 2000);
        service
            .write_bookshelf(user_ns, &vec![old, fresh])
            .await
            .unwrap();

        let book = service
            .get_shelf_book(user_ns, "https://book.example/1")
            .await
            .unwrap()
            .unwrap();

        let _ = tokio::fs::remove_dir_all(&storage_dir).await;
        assert_eq!(book.dur_chapter_index, Some(0));
        assert_eq!(book.dur_chapter_pos, Some(0));
    }

    #[tokio::test]
    async fn save_books_merges_duplicate_book_urls_and_keeps_newest_progress() {
        let (service, storage_dir) = test_book_service("merge-duplicate-progress");
        let user_ns = "merge-duplicate-user";
        let first = test_book(0, 0, 1000);
        let second = test_book(8, 7300, 2000);

        let saved = service
            .save_books(user_ns, vec![first, second])
            .await
            .unwrap();

        let _ = tokio::fs::remove_dir_all(&storage_dir).await;
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].dur_chapter_index, Some(8));
        assert_eq!(saved[0].dur_chapter_pos, Some(7300));
    }

    #[tokio::test]
    async fn save_books_keeps_same_title_from_different_sources() {
        let (service, storage_dir) = test_book_service("same-title-different-sources");
        let user_ns = "same-title-different-sources-user";
        let first = test_book(0, 0, 1000);
        let mut second = test_book(0, 0, 1000);
        second.origin = "https://other-source.example".to_string();
        second.book_url = "https://other-book.example/1".to_string();

        let saved = service
            .save_books(user_ns, vec![first, second])
            .await
            .unwrap();

        let _ = tokio::fs::remove_dir_all(&storage_dir).await;
        assert_eq!(saved.len(), 2);
    }

    #[tokio::test]
    async fn save_book_accepts_newer_lower_progress() {
        let (service, storage_dir) = test_book_service("save-book-lower-progress");
        let user_ns = "save-book-lower-progress-user";
        service
            .save_book(user_ns, test_book(8, 7300, 1000))
            .await
            .unwrap();

        let saved = service
            .save_book(user_ns, test_book(0, 0, 3000))
            .await
            .unwrap();

        let _ = tokio::fs::remove_dir_all(&storage_dir).await;
        assert_eq!(saved.dur_chapter_index, Some(0));
        assert_eq!(saved.dur_chapter_pos, Some(0));
    }

    #[tokio::test]
    async fn save_books_preserves_newer_existing_reading_progress() {
        let (service, storage_dir) = test_book_service("save-books-progress");
        let user_ns = "progress-user";
        service
            .save_book(user_ns, test_book(8, 7300, 2000))
            .await
            .unwrap();

        let saved = service
            .save_books(user_ns, vec![test_book(2, 1400, 1000)])
            .await
            .unwrap();

        let _ = tokio::fs::remove_dir_all(&storage_dir).await;
        assert_eq!(saved[0].dur_chapter_index, Some(8));
        assert_eq!(saved[0].dur_chapter_pos, Some(7300));
        assert_eq!(saved[0].dur_chapter_time, Some(2000));
        assert_eq!(saved[0].dur_chapter_title.as_deref(), Some("第9章"));
    }

    #[tokio::test]
    async fn window_rate_waits_when_existing_starts_reach_limit() {
        let (service, storage_dir) = test_book_service("window-rate");
        let now = Instant::now();
        service.rate_states.write().await.insert(
            "source".to_string(),
            RateState {
                window_starts: vec![now, now],
                ..Default::default()
            },
        );

        let result = tokio::time::timeout(
            Duration::from_millis(20),
            service.wait_for_window_rate("source", 2, 200),
        )
        .await;

        let _ = tokio::fs::remove_dir_all(&storage_dir).await;
        assert!(result.is_err());
    }

    #[test]
    fn login_script_start_browser_url_uses_source_base_url() {
        let source = BookSource {
            book_source_name: "Script login".to_string(),
            book_source_url: "https://ycoo.net".to_string(),
            login_url: Some(
                r#"function login() {
                    var baseUrl = String(source.bookSourceUrl);
                    java.startBrowserAwait(baseUrl + '/user', '登录');
                }"#
                .to_string(),
            ),
            ..Default::default()
        };

        let login_target = resolve_login_preview_target(&source).unwrap();

        assert_eq!(login_target.as_deref(), Some("https://ycoo.net/user"));
    }

    #[test]
    fn login_script_ignores_helper_start_browser_calls_before_login_function() {
        let source = BookSource {
            book_source_name: "Script login".to_string(),
            book_source_url: "https://dns.vossc.com".to_string(),
            login_url: Some(
                r#"function help() {
                    java.startBrowserAwait('https://example.test/help', '帮助');
                }
                function login() {
                    java.startBrowserAwait(source.bookSourceUrl + '/login', '登录');
                }"#
                .to_string(),
            ),
            ..Default::default()
        };

        let login_target = resolve_login_preview_target(&source).unwrap();

        assert_eq!(login_target.as_deref(), Some("https://dns.vossc.com/login"));
    }

    #[test]
    fn login_script_uses_login_url_assignment_when_no_browser_call_exists() {
        let source = BookSource {
            book_source_name: "Script login".to_string(),
            book_source_url: "https://v1.vossc.com".to_string(),
            login_url: Some(
                r#"function login() {
                    const host = getServerHost();
                    const url = host + '/login';
                    const body = "email=" + encodeURIComponent(email);
                    const response = java.ajax(url + "," + JSON.stringify({ method: "POST", body: body }));
                }"#
                .to_string(),
            ),
            ..Default::default()
        };

        let login_target = resolve_login_preview_target(&source).unwrap();

        assert_eq!(login_target.as_deref(), Some("https://v1.vossc.com/login"));
    }
}
