use crate::model::book_source::{BookSource, BookSourceRuntime};
use crate::util::hash::md5_hex;
use crate::util::text::{apply_regex_replace, strip_whitespace};
use aes::Aes128;
use base64::Engine;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use chrono::{Local, TimeZone};
use once_cell::sync::Lazy;
use reqwest::blocking::Client;
use reqwest::Method;
use rquickjs::function::{Func, Opt};
use rquickjs::{Context, Object, Runtime, Value};
use serde_json::Value as JsonValue;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use uuid::Uuid;

static JS_KV: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static JS_LIB_CACHE: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static JS_HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .expect("failed to build JS HTTP client")
});
static JS_DEVICE_ID: Lazy<String> = Lazy::new(|| {
    let mut map = JS_KV.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(existing) = map.get("__device_id") {
        return existing.clone();
    }
    let generated = Uuid::new_v4().to_string();
    map.insert("__device_id".to_string(), generated.clone());
    generated
});
type Aes128CbcDecryptor = cbc::Decryptor<Aes128>;
thread_local! {
    static ACTIVE_JS_LIB: RefCell<Option<String>> = const { RefCell::new(None) };
    static ACTIVE_SOURCE: RefCell<Option<JsSourceContext>> = const { RefCell::new(None) };
}

#[derive(Clone)]
struct JsSourceContext {
    book_source_url: String,
    login_url: String,
    runtime: BookSourceRuntime,
}

pub fn with_js_lib<T>(js_lib: Option<&str>, f: impl FnOnce() -> T) -> T {
    ACTIVE_JS_LIB.with(|cell| {
        let previous = cell.replace(js_lib.map(|value| value.to_string()));
        let result = f();
        cell.replace(previous);
        result
    })
}

pub fn with_js_source<T>(source: &BookSource, f: impl FnOnce() -> T) -> T {
    let context = JsSourceContext {
        book_source_url: source.book_source_url.clone(),
        login_url: source.login_url.clone().unwrap_or_default(),
        runtime: source.runtime.clone(),
    };
    ACTIVE_SOURCE.with(|cell| {
        let previous = cell.replace(Some(context));
        let result = with_js_lib(source.js_lib.as_deref(), f);
        cell.replace(previous);
        result
    })
}

pub fn eval_js(script: &str, input: &str, base_url: &str) -> anyhow::Result<String> {
    eval_js_inner(script, Some(input), Some(base_url), None, None, None)
}

pub fn eval_js_with_bindings(
    script: &str,
    input: &str,
    base_url: &str,
    bindings: &HashMap<String, JsonValue>,
) -> anyhow::Result<String> {
    eval_js_inner(
        script,
        Some(input),
        Some(base_url),
        None,
        None,
        Some(bindings),
    )
}

pub fn eval_js_search_with_source(
    script: &str,
    key: &str,
    page: i32,
    source_key: &str,
) -> anyhow::Result<String> {
    eval_js_inner_with_source(
        script,
        None,
        None,
        Some(key),
        Some(page),
        Some(source_key),
        None,
    )
}

pub fn eval_js_url(
    script: &str,
    result: &str,
    key: &str,
    page: i32,
    source_key: &str,
    base_url: &str,
) -> anyhow::Result<String> {
    eval_js_inner_with_source(
        script,
        Some(result),
        Some(base_url),
        Some(key),
        Some(page),
        Some(source_key),
        None,
    )
}

fn eval_js_inner(
    script: &str,
    input: Option<&str>,
    base_url: Option<&str>,
    key: Option<&str>,
    page: Option<i32>,
    bindings: Option<&HashMap<String, JsonValue>>,
) -> anyhow::Result<String> {
    eval_js_inner_with_source(script, input, base_url, key, page, None, bindings)
}

fn eval_js_inner_with_source(
    script: &str,
    input: Option<&str>,
    base_url: Option<&str>,
    key: Option<&str>,
    page: Option<i32>,
    source_key: Option<&str>,
    bindings: Option<&HashMap<String, JsonValue>>,
) -> anyhow::Result<String> {
    let active_source = ACTIVE_SOURCE.with(|cell| cell.borrow().clone());
    let rt = Runtime::new()?;
    let ctx = Context::full(&rt)?;
    ctx.with(|ctx| {
        let globals = ctx.globals();
        let input_value = input.unwrap_or("");
        let base_url_value = base_url.unwrap_or("");
        let shared_js = active_js_lib_script()?;

        globals.set("input", input_value)?;
        globals.set("result", input_value)?;
        globals.set("src", input_value)?;
        globals.set("base_url", base_url_value)?;
        globals.set("baseUrl", base_url_value)?;
        if let Some(key) = key {
            globals.set("key", key)?;
        }
        if let Some(page) = page {
            globals.set("page", page)?;
        }

        // Default url variable for Legado compatibility
        globals.set("url", base_url_value)?;
        globals.set("yunurl", "")?;

        // Legado source state is scoped to the current user/source by BookSourceService.
        let runtime = active_source
            .as_ref()
            .map(|source| source.runtime.clone())
            .unwrap_or_default();
        let runtime_state = runtime.shared();
        let source_url = active_source
            .as_ref()
            .map(|source| source.book_source_url.clone())
            .unwrap_or_else(|| source_key.unwrap_or("").to_string());
        let login_url = active_source
            .as_ref()
            .map(|source| source.login_url.clone())
            .unwrap_or_default();
        let source_key_val = source_key
            .filter(|value| !value.is_empty())
            .unwrap_or(&source_url)
            .to_string();
        let source_obj = Object::new(ctx.clone())?;
        let sk_clone = source_key_val.clone();
        source_obj.set("key", source_key_val)?;
        source_obj.set("bookSourceUrl", source_url)?;
        source_obj.set("loginUrl", login_url)?;
        source_obj.set("getKey", Func::new(move || sk_clone.clone()))?;
        let state = runtime_state.clone();
        source_obj.set(
            "__getLoginInfoJson",
            Func::new(move || {
                serde_json::to_string(
                    &state
                        .lock()
                        .unwrap_or_else(|err| err.into_inner())
                        .login_info,
                )
                .unwrap_or_else(|_| "{}".to_string())
            }),
        )?;
        let state = runtime_state.clone();
        source_obj.set(
            "getLoginHeader",
            Func::new(move || {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .login_header
                    .clone()
            }),
        )?;
        let state = runtime_state.clone();
        source_obj.set(
            "putLoginHeader",
            Func::new(move |value: String| {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .login_header = value;
                true
            }),
        )?;
        let state = runtime_state.clone();
        source_obj.set(
            "getVariable",
            Func::new(move || {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .variable
                    .clone()
            }),
        )?;
        let state = runtime_state.clone();
        source_obj.set(
            "setVariable",
            Func::new(move |value: String| {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .variable = value;
                true
            }),
        )?;
        globals.set("source", source_obj)?;

        let cookie_obj = Object::new(ctx.clone())?;
        let state = runtime_state.clone();
        cookie_obj.set(
            "getCookie",
            Func::new(move |domain: String| {
                let state = state.lock().unwrap_or_else(|err| err.into_inner());
                stored_cookie_for_domain(&state.cookies, &domain)
            }),
        )?;
        let state = runtime_state.clone();
        cookie_obj.set(
            "getKey",
            Func::new(move |domain: String, key: String| {
                let state = state.lock().unwrap_or_else(|err| err.into_inner());
                let cookie = stored_cookie_for_domain(&state.cookies, &domain);
                cookie_value(&cookie, &key)
            }),
        )?;
        let state = runtime_state.clone();
        cookie_obj.set(
            "removeCookie",
            Func::new(move |domain: String| {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .cookies
                    .retain(|stored_domain, _| {
                        !cookie_domain_matches(stored_domain, &domain)
                            && !cookie_domain_matches(&domain, stored_domain)
                    });
                String::new()
            }),
        )?;
        globals.set("cookie", cookie_obj)?;

        let cache_obj = Object::new(ctx.clone())?;
        let state = runtime_state.clone();
        cache_obj.set(
            "get",
            Func::new(move |key: String| -> Option<String> {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .java_kv
                    .get(&key)
                    .cloned()
            }),
        )?;
        let state = runtime_state.clone();
        cache_obj.set(
            "put",
            Func::new(move |key: String, val: String| -> bool {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .java_kv
                    .insert(key, val);
                true
            }),
        )?;
        globals.set("cache", cache_obj)?;

        let java_obj = Object::new(ctx.clone())?;
        java_obj.set(
            "ajax",
            Func::new(|spec: String| -> String { java_ajax(&spec).unwrap_or_default() }),
        )?;
        let notice_runtime = runtime.clone();
        java_obj.set(
            "toast",
            Func::new(move |message: String| {
                notice_runtime.push_notice(message);
            }),
        )?;
        let notice_runtime = runtime.clone();
        java_obj.set(
            "longToast",
            Func::new(move |message: String| {
                notice_runtime.push_notice(message);
            }),
        )?;
        let notice_runtime = runtime.clone();
        java_obj.set(
            "log",
            Func::new(move |message: String| {
                tracing::debug!("book source js: {}", message);
                notice_runtime.push_notice(message);
            }),
        )?;
        java_obj.set(
            "getWebViewUA",
            Func::new(|| -> String {
                "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36".to_string()
            }),
        )?;
        let browser_runtime = runtime.clone();
        java_obj.set(
            "startBrowserAwait",
            Func::new(
                move |url: String, _title: Opt<String>, _modal: Opt<bool>| -> String {
                    browser_runtime.push_browser_url(url);
                    String::new()
                },
            ),
        )?;
        let browser_runtime = runtime.clone();
        java_obj.set(
            "startBrowser",
            Func::new(move |url: String, _title: Opt<String>| {
                browser_runtime.push_browser_url(url);
            }),
        )?;
        java_obj.set(
            "md5Encode",
            Func::new(|input: String| -> String { md5_hex(&input) }),
        )?;
        java_obj.set(
            "timeFormat",
            Func::new(|timestamp: i64| -> String { java_time_format(timestamp) }),
        )?;
        java_obj.set(
            "androidId",
            Func::new(|| -> String { JS_DEVICE_ID.clone() }),
        )?;
        java_obj.set("deviceID", Func::new(|| -> String { JS_DEVICE_ID.clone() }))?;
        let state = runtime_state.clone();
        java_obj.set(
            "get",
            Func::new(move |key: String| -> Option<String> {
                if is_http_url(&key) {
                    return java_request_simple("GET", &key, None).ok();
                }
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .java_kv
                    .get(&key)
                    .cloned()
            }),
        )?;
        java_obj.set(
            "post",
            Func::new(|url: String, body: String| -> String {
                java_request_simple("POST", &url, Some(body)).unwrap_or_default()
            }),
        )?;
        let state = runtime_state.clone();
        java_obj.set(
            "put",
            Func::new(move |key: String, value: String| -> String {
                if is_http_url(&key) {
                    return java_request_simple("PUT", &key, Some(value)).unwrap_or_default();
                }
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .java_kv
                    .insert(key, value);
                String::new()
            }),
        )?;
        java_obj.set(
            "base64Encode",
            Func::new(|input: String| -> String {
                base64::engine::general_purpose::STANDARD.encode(input)
            }),
        )?;
        java_obj.set(
            "base64Decode",
            Func::new(|input: String| -> String {
                base64::engine::general_purpose::STANDARD
                    .decode(input)
                    .ok()
                    .and_then(|bytes| String::from_utf8(bytes).ok())
                    .unwrap_or_default()
            }),
        )?;
        java_obj.set(
            "hexDecodeToString",
            Func::new(|input: String| -> String {
                hex::decode(input.trim())
                    .ok()
                    .and_then(|bytes| String::from_utf8(bytes).ok())
                    .unwrap_or_default()
            }),
        )?;
        java_obj.set(
            "aesBase64DecodeToString",
            Func::new(
                |input: String, key: String, algorithm: String, iv: String| -> String {
                    java_aes_base64_decode_to_string(&input, &key, &algorithm, &iv)
                },
            ),
        )?;
        java_obj.set(
            "encodeURIComponent",
            Func::new(|input: String| -> String { urlencoding::encode(&input).into_owned() }),
        )?;
        java_obj.set(
            "decodeURIComponent",
            Func::new(|input: String| -> String {
                urlencoding::decode(&input)
                    .map(|s| s.into_owned())
                    .unwrap_or_default()
            }),
        )?;
        java_obj.set(
            "encodeURI",
            Func::new(|input: String| -> String { urlencoding::encode(&input).into_owned() }),
        )?;
        java_obj.set(
            "decodeURI",
            Func::new(|input: String| -> String {
                urlencoding::decode(&input)
                    .map(|s| s.into_owned())
                    .unwrap_or_default()
            }),
        )?;
        java_obj.set(
            "now",
            Func::new(|| -> i64 { chrono::Utc::now().timestamp_millis() }),
        )?;
        java_obj.set(
            "uuid",
            Func::new(|| -> String { Uuid::new_v4().to_string() }),
        )?;
        globals.set("java", java_obj)?;

        let state = runtime_state.clone();
        globals.set(
            "kv_get",
            Func::new(move |key: String| -> Option<String> {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .java_kv
                    .get(&key)
                    .cloned()
            }),
        )?;
        let state = runtime_state.clone();
        globals.set(
            "kv_put",
            Func::new(move |key: String, val: String| -> bool {
                state
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .java_kv
                    .insert(key, val);
                true
            }),
        )?;
        globals.set(
            "regex_replace",
            Func::new(
                |input: String, pattern: String, replace: String| -> String {
                    apply_regex_replace(&input, &pattern, &replace)
                },
            ),
        )?;
        globals.set(
            "strip_ws",
            Func::new(|input: String| -> String { strip_whitespace(&input) }),
        )?;

        globals.set("book", Object::new(ctx.clone())?)?;
        globals.set("chapter", Object::new(ctx.clone())?)?;
        globals.set("title", "")?;
        globals.set("nextChapterUrl", "")?;
        globals.set("rssArticle", Object::new(ctx.clone())?)?;

        if let Some(bindings) = bindings {
            for (key, value) in bindings {
                let js_value = ctx.json_parse(value.to_string())?;
                globals.set(key.as_str(), js_value)?;
            }
        }

        eval_script(
            ctx.clone(),
            r#"
source.getLoginInfoMap = function () {
  const value = JSON.parse(source.__getLoginInfoJson() || "{}");
  Object.defineProperty(value, "get", {
    enumerable: false,
    value: function (key) { return this[key]; }
  });
  return value;
};
source.getLoginInfo = function () {
  return source.__getLoginInfoJson() || "{}";
};
"#,
        )
        .map_err(|err| anyhow::anyhow!("Legado source bootstrap failed: {err}"))?;

        if !shared_js.trim().is_empty() {
            eval_script(ctx.clone(), &shared_js)
                .map_err(|err| anyhow::anyhow!("jsLib failed: {err}"))?;
            if let Some(binding_script) = js_function_binding_script(&shared_js) {
                eval_script(ctx.clone(), &binding_script)
                    .map_err(|err| anyhow::anyhow!("jsLib binding failed: {err}"))?;
            }
        }

        let v = eval_script(ctx.clone(), script)
            .map_err(|err| anyhow::anyhow!("source script failed: {err}"))?;

        let result = if v.is_null() || v.is_undefined() {
            String::new()
        } else if let Some(s) = v.clone().into_string() {
            let s: rquickjs::String<'_> = s;
            s.to_string()
                .map(|value| value.to_string())
                .unwrap_or_default()
        } else {
            match ctx.json_stringify(v) {
                Ok(Some(json)) => json.to_string().unwrap_or_default(),
                _ => String::new(),
            }
        };
        Ok(result)
    })
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

fn cookie_value(cookie: &str, key: &str) -> String {
    cookie
        .split(';')
        .find_map(|part| {
            let (name, value) = part.trim().split_once('=')?;
            name.trim()
                .eq_ignore_ascii_case(key)
                .then(|| value.trim().to_string())
        })
        .unwrap_or_default()
}

fn java_aes_base64_decode_to_string(input: &str, key: &str, algorithm: &str, iv: &str) -> String {
    let algorithm = algorithm.to_ascii_uppercase();
    if algorithm != "AES/CBC/PKCS5PADDING" && algorithm != "AES/CBC/PKCS7PADDING" {
        return String::new();
    }

    let Ok(mut encrypted) = base64::engine::general_purpose::STANDARD.decode(input.trim()) else {
        return String::new();
    };

    let Ok(cipher) = Aes128CbcDecryptor::new_from_slices(key.as_bytes(), iv.as_bytes()) else {
        return String::new();
    };

    cipher
        .decrypt_padded_mut::<Pkcs7>(&mut encrypted)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes.to_vec()).ok())
        .unwrap_or_default()
}

fn eval_script<'js>(ctx: rquickjs::Ctx<'js>, script: &str) -> anyhow::Result<Value<'js>> {
    match ctx.eval(script) {
        Ok(v) => Ok(v),
        Err(e) => {
            if let Some(exception) = ctx.catch().into_exception() {
                return Err(anyhow::anyhow!("JS Exception: {:?}", exception));
            }
            Err(e.into())
        }
    }
}

fn js_function_binding_script(script: &str) -> Option<String> {
    let function_re = regex::Regex::new(r"\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(").ok()?;
    let names = function_re
        .captures_iter(script)
        .filter_map(|captures| captures.get(1).map(|name| name.as_str().to_string()))
        .collect::<HashSet<_>>();
    if names.is_empty() {
        return None;
    }
    let names = serde_json::to_string(&names).ok()?;
    Some(format!(
        r#"
({names}).forEach(function (name) {{
  const fn = globalThis[name];
  if (typeof fn === "function") {{
    globalThis[name] = fn.bind(globalThis);
  }}
}});
"#
    ))
}

fn active_js_lib_script() -> anyhow::Result<String> {
    let js_lib = ACTIVE_JS_LIB.with(|cell| cell.borrow().clone());
    let Some(js_lib) = js_lib.filter(|value| !value.trim().is_empty()) else {
        return Ok(String::new());
    };
    let cache_key = md5_hex(&js_lib);
    if let Some(cached) = JS_LIB_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&cache_key)
        .cloned()
    {
        return Ok(cached);
    }

    let compiled = compile_js_lib(&js_lib)?;
    JS_LIB_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(cache_key, compiled.clone());
    Ok(compiled)
}

fn compile_js_lib(js_lib: &str) -> anyhow::Result<String> {
    let trimmed = js_lib.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if trimmed.starts_with('{') {
        if let Ok(value) = serde_json::from_str::<JsonValue>(trimmed) {
            if let Some(map) = value.as_object() {
                let mut scripts = Vec::new();
                for entry in map.values() {
                    if let Some(raw) = entry.as_str() {
                        scripts.push(resolve_js_lib_entry(raw)?);
                    }
                }
                return Ok(scripts.join("\n"));
            }
        }
    }
    Ok(trimmed.to_string())
}

fn resolve_js_lib_entry(entry: &str) -> anyhow::Result<String> {
    let value = entry.trim();
    if value.starts_with("http://") || value.starts_with("https://") {
        let response = JS_HTTP_CLIENT.get(value).send()?;
        return Ok(response.text().unwrap_or_default());
    }
    Ok(value.to_string())
}

fn java_time_format(timestamp: i64) -> String {
    let secs = if timestamp > 1_000_000_000_000 {
        timestamp / 1000
    } else {
        timestamp
    };
    match Local.timestamp_opt(secs, 0).single() {
        Some(dt) => dt.format("%Y-%m-%d %H:%M").to_string(),
        None => String::new(),
    }
}

fn java_ajax(spec: &str) -> anyhow::Result<String> {
    let (url, options) = split_ajax_spec(spec);
    if url.trim().is_empty() {
        return Ok(String::new());
    }

    let options_json = options
        .and_then(|raw| serde_json::from_str::<JsonValue>(raw).ok())
        .unwrap_or(JsonValue::Null);

    let method = options_json
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET")
        .to_uppercase();
    let method = Method::from_bytes(method.as_bytes()).unwrap_or(Method::GET);
    let has_request_body = method != Method::GET && method != Method::HEAD;

    let mut req =
        apply_active_source_cookies(JS_HTTP_CLIENT.request(method, url.trim()), url.trim());

    let mut has_content_type = false;
    if let Some(headers) = options_json.get("headers").and_then(|v| v.as_object()) {
        for (key, value) in headers {
            if key.eq_ignore_ascii_case("content-type") {
                has_content_type = true;
            }
            if let Some(value) = value.as_str() {
                req = req.header(key, value);
            } else if !value.is_null() {
                req = req.header(key, value.to_string());
            }
        }
    }

    if let Some(body) = options_json.get("body") {
        if let Some(body) = body.as_str() {
            if has_request_body && !has_content_type {
                let content_type =
                    if matches!(body.trim_start().chars().next(), Some('{') | Some('[')) {
                        "application/json;charset=UTF-8"
                    } else {
                        "application/x-www-form-urlencoded;charset=UTF-8"
                    };
                req = req.header(reqwest::header::CONTENT_TYPE, content_type);
            }
            req = req.body(body.to_string());
        } else if !body.is_null() {
            if has_request_body && !has_content_type {
                req = req.header(
                    reqwest::header::CONTENT_TYPE,
                    "application/json;charset=UTF-8",
                );
            }
            req = req.body(body.to_string());
        }
    }

    if let Some(timeout_ms) = options_json.get("timeout").and_then(JsonValue::as_u64) {
        req = req.timeout(std::time::Duration::from_millis(timeout_ms.max(1)));
    }

    let response = req.send()?;
    store_active_source_cookies(url.trim(), response.headers());
    Ok(response.text().unwrap_or_default())
}

fn java_request_simple(method: &str, url: &str, body: Option<String>) -> anyhow::Result<String> {
    let method = Method::from_bytes(method.as_bytes()).unwrap_or(Method::GET);
    let mut req =
        apply_active_source_cookies(JS_HTTP_CLIENT.request(method, url.trim()), url.trim());
    if let Some(body) = body {
        req = req.body(body);
    }
    let response = req.send()?;
    store_active_source_cookies(url.trim(), response.headers());
    Ok(response.text().unwrap_or_default())
}

fn apply_active_source_cookies(
    request: reqwest::blocking::RequestBuilder,
    url: &str,
) -> reqwest::blocking::RequestBuilder {
    let Some(host) = url::Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
    else {
        return request;
    };
    let cookie = ACTIVE_SOURCE.with(|cell| {
        let source = cell.borrow();
        let runtime = source.as_ref()?.runtime.snapshot();
        let values = runtime
            .cookies
            .iter()
            .filter(|(domain, _)| cookie_domain_matches(&host, domain))
            .map(|(_, value)| value.trim())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        (!values.is_empty()).then(|| values.join("; "))
    });
    match cookie {
        Some(cookie) => request.header(reqwest::header::COOKIE, cookie),
        None => request,
    }
}

fn store_active_source_cookies(url: &str, headers: &reqwest::header::HeaderMap) {
    let Some(host) = url::Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
    else {
        return;
    };
    let set_cookies = headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if set_cookies.is_empty() {
        return;
    }
    ACTIVE_SOURCE.with(|cell| {
        let source = cell.borrow();
        let Some(runtime) = source.as_ref().map(|source| source.runtime.shared()) else {
            return;
        };
        let mut state = runtime.lock().unwrap_or_else(|err| err.into_inner());
        let mut values = parse_cookie_pairs(
            state
                .cookies
                .get(&host)
                .map(String::as_str)
                .unwrap_or_default(),
        );
        for cookie in set_cookies {
            let Some(pair) = cookie.split(';').next() else {
                continue;
            };
            let Some((name, value)) = pair.split_once('=') else {
                continue;
            };
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            if value.trim().is_empty() {
                values.remove(name);
            } else {
                values.insert(name.to_string(), value.trim().to_string());
            }
        }
        if values.is_empty() {
            state.cookies.remove(&host);
        } else {
            state.cookies.insert(
                host,
                values
                    .into_iter()
                    .map(|(name, value)| format!("{name}={value}"))
                    .collect::<Vec<_>>()
                    .join("; "),
            );
        }
    });
}

fn cookie_domain_matches(host: &str, domain: &str) -> bool {
    let domain = domain
        .trim()
        .trim_start_matches('.')
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or_default();
    !domain.is_empty()
        && (host.eq_ignore_ascii_case(domain) || host.ends_with(&format!(".{domain}")))
}

fn stored_cookie_for_domain(cookies: &HashMap<String, String>, domain: &str) -> String {
    cookies
        .iter()
        .filter(|(stored_domain, _)| {
            cookie_domain_matches(stored_domain, domain)
                || cookie_domain_matches(domain, stored_domain)
        })
        .map(|(_, value)| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

fn parse_cookie_pairs(value: &str) -> HashMap<String, String> {
    value
        .split(';')
        .filter_map(|pair| pair.trim().split_once('='))
        .filter(|(name, _)| !name.trim().is_empty())
        .map(|(name, value)| (name.trim().to_string(), value.trim().to_string()))
        .collect()
}

fn split_ajax_spec(spec: &str) -> (&str, Option<&str>) {
    let mut depth = 0i32;
    let mut in_string = false;
    let mut quote = '\0';
    let mut escaped = false;

    for (idx, ch) in spec.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }

        match ch {
            '\\' if in_string => {
                escaped = true;
            }
            '"' | '\'' if in_string && ch == quote => {
                in_string = false;
                quote = '\0';
            }
            '"' | '\'' if !in_string => {
                in_string = true;
                quote = ch;
            }
            '{' | '[' if !in_string => depth += 1,
            '}' | ']' if !in_string => depth -= 1,
            ',' if !in_string && depth == 0 => {
                let left = &spec[..idx];
                let right = &spec[idx + ch.len_utf8()..];
                return (left, Some(right.trim()));
            }
            _ => {}
        }
    }

    (spec, None)
}
