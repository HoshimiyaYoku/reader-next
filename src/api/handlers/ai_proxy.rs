use axum::{
    extract::State,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::Map;
use serde_json::Value;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;
use tokio::net::lookup_host;
use url::Url;

use crate::api::{auth::AuthContext, AppState};
use crate::error::error::{ApiResponse, AppError};
use crate::model::ai_model::{AiModelKind, ResolvedAiModelEndpoint};
use crate::model::ai_proxy::{
    ai_proxy_timeout, build_ai_proxy_url, format_ai_proxy_upstream_error,
    validate_ai_proxy_image_url, AiProxyImageRequest, AiProxyRequest,
};

const MAX_PROXY_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PROXY_SPEECH_AUDIO_BYTES: u64 = 20 * 1024 * 1024;
const MAX_AZURE_TTS_TEXT_CHARS: usize = 10_000;
const AZURE_TTS_USER_AGENT: &str = concat!("reader-next/", env!("CARGO_PKG_VERSION"));
const AZURE_TTS_OUTPUT_FORMATS: &[&str] = &[
    "audio-16khz-32kbitrate-mono-mp3",
    "audio-16khz-64kbitrate-mono-mp3",
    "audio-16khz-128kbitrate-mono-mp3",
    "audio-24khz-48kbitrate-mono-mp3",
    "audio-24khz-96kbitrate-mono-mp3",
    "audio-24khz-160kbitrate-mono-mp3",
    "audio-48khz-96kbitrate-mono-mp3",
    "audio-48khz-192kbitrate-mono-mp3",
    "ogg-16khz-16bit-mono-opus",
    "ogg-24khz-16bit-mono-opus",
    "ogg-48khz-16bit-mono-opus",
    "raw-8khz-8bit-mono-alaw",
    "raw-8khz-8bit-mono-mulaw",
    "raw-8khz-16bit-mono-pcm",
    "raw-16khz-16bit-mono-pcm",
    "raw-16khz-16bit-mono-truesilk",
    "raw-24khz-16bit-mono-pcm",
    "raw-24khz-16bit-mono-truesilk",
    "raw-48khz-16bit-mono-pcm",
    "riff-8khz-8bit-mono-alaw",
    "riff-8khz-8bit-mono-mulaw",
    "riff-8khz-16bit-mono-pcm",
    "riff-16khz-16kbps-mono-siren",
    "riff-16khz-16bit-mono-pcm",
    "riff-24khz-16bit-mono-pcm",
    "riff-48khz-16bit-mono-pcm",
    "webm-16khz-16bit-mono-opus",
    "webm-24khz-16bit-mono-opus",
    "webm-48khz-16bit-mono-opus",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureTtsRequest {
    region: String,
    subscription_key: String,
    text: String,
    voice: String,
    output_format: String,
    rate: Option<f32>,
    pitch: Option<f32>,
}

struct ValidatedAzureTtsRequest<'a> {
    region: &'a str,
    subscription_key: &'a str,
    text: &'a str,
    voice: &'a str,
    output_format: &'a str,
    rate: f32,
    pitch: f32,
}

pub async fn ai_proxy(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<AiProxyRequest>,
) -> Result<Response, AppError> {
    require_proxy_user(&state, &auth).await?;
    let is_custom_speech_target =
        !req.use_server_config && req.full_url && req.kind == Some(AiModelKind::Speech);
    let (endpoint, kind, path, mut body) = resolve_ai_proxy_target(&state, &auth, req).await?;
    let target_hint = if endpoint.use_full_url {
        endpoint.base_url.as_str()
    } else {
        path.as_str()
    };
    if let Some(kind) = kind {
        if kind != AiModelKind::Text || !is_native_gemini_generate_content_path(target_hint) {
            apply_server_model_body_defaults(&endpoint, kind, &mut body);
        }
    }
    adapt_ai_proxy_body(target_hint, kind, &mut body);
    let target = build_ai_proxy_url(&endpoint.base_url, &path, endpoint.use_full_url)
        .map_err(AppError::BadRequest)?;
    let use_gemini_api_key_header = should_use_gemini_api_key_header(&target, &path, kind);
    let client = if is_custom_speech_target {
        public_https_speech_proxy_client(&target).await?
    } else {
        ai_proxy_client()?
    };
    let accept = if kind == Some(AiModelKind::Speech) {
        "audio/*,application/octet-stream;q=0.9,*/*;q=0.8"
    } else {
        "application/json"
    };
    let mut builder = client
        .post(target)
        .header(reqwest::header::ACCEPT, accept)
        .json(&body);

    if let Some(api_key) = Some(endpoint.api_key.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        if use_gemini_api_key_header {
            builder = builder.header("x-goog-api-key", api_key);
        } else {
            builder = builder.bearer_auth(api_key);
        }
    }

    let upstream = builder.send().await.map_err(map_ai_proxy_http_error)?;
    if kind == Some(AiModelKind::Speech) {
        response_from_upstream_limited(
            upstream,
            MAX_PROXY_SPEECH_AUDIO_BYTES,
            "语音音频超过代理大小限制",
        )
        .await
    } else {
        response_from_upstream(upstream).await
    }
}

async fn resolve_ai_proxy_target(
    state: &AppState,
    auth: &AuthContext,
    req: AiProxyRequest,
) -> Result<(ResolvedAiModelEndpoint, Option<AiModelKind>, String, Value), AppError> {
    if req.use_server_config {
        let can_use = state
            .user_service
            .can_use_ai_model(auth.access_token(), auth.secure_key())
            .await?;
        if !can_use {
            return Err(AppError::BadRequest(
                "当前账号没有使用后端模型配置的权限".to_string(),
            ));
        }
        let kind = req.kind.unwrap_or_else(|| infer_ai_model_kind(&req.path));
        let config = state.ai_model_service.get().await?;
        let endpoint = config.resolve(kind);
        if !endpoint.enabled
            || endpoint.base_url.trim().is_empty()
            || endpoint.model.trim().is_empty()
        {
            return Err(AppError::BadRequest(
                "后端模型配置未启用或不完整".to_string(),
            ));
        }
        let path = resolve_server_ai_model_path(&endpoint, kind, &req.path);
        return Ok((endpoint, Some(kind), path, req.body));
    }

    let path = req.path.trim().to_string();
    if !req.full_url && path.is_empty() {
        return Err(AppError::BadRequest("模型代理路径不能为空".to_string()));
    }

    Ok((
        ResolvedAiModelEndpoint {
            enabled: true,
            base_url: req.base_url,
            api_key: req.api_key.unwrap_or_default(),
            model: String::new(),
            path: String::new(),
            use_full_url: req.full_url,
            image_size: None,
            voice: None,
            response_format: None,
        },
        req.kind,
        path,
        req.body,
    ))
}

fn infer_ai_model_kind(path: &str) -> AiModelKind {
    match path {
        "/v1/images/generations" => AiModelKind::Image,
        "/v1/audio/speech" => AiModelKind::Speech,
        _ => AiModelKind::Text,
    }
}

fn default_ai_model_path(kind: AiModelKind) -> &'static str {
    match kind {
        AiModelKind::Text => "/v1/chat/completions",
        AiModelKind::Image => "/v1/images/generations",
        AiModelKind::Speech => "/v1/audio/speech",
    }
}

fn resolve_server_ai_model_path(
    endpoint: &ResolvedAiModelEndpoint,
    kind: AiModelKind,
    requested_path: &str,
) -> String {
    let configured_path = endpoint.path.trim();
    if !configured_path.is_empty() {
        return configured_path.to_string();
    }

    let requested_path = requested_path.trim();
    if !requested_path.is_empty() {
        return requested_path.to_string();
    }

    if endpoint.use_full_url {
        return String::new();
    }

    default_ai_model_path(kind).to_string()
}

fn apply_server_model_body_defaults(
    endpoint: &ResolvedAiModelEndpoint,
    kind: AiModelKind,
    body: &mut Value,
) {
    if endpoint.model.is_empty() {
        return;
    }
    let Some(obj) = body.as_object_mut() else {
        return;
    };
    obj.insert("model".to_string(), Value::String(endpoint.model.clone()));
    if kind == AiModelKind::Image {
        if let Some(size) = endpoint
            .image_size
            .as_ref()
            .filter(|v| !v.trim().is_empty())
        {
            obj.insert("size".to_string(), Value::String(size.clone()));
        }
    }
    if kind == AiModelKind::Speech {
        if let Some(voice) = endpoint.voice.as_ref().filter(|v| !v.trim().is_empty()) {
            obj.insert("voice".to_string(), Value::String(voice.clone()));
        }
        if let Some(format) = endpoint
            .response_format
            .as_ref()
            .filter(|v| !v.trim().is_empty())
        {
            obj.insert("response_format".to_string(), Value::String(format.clone()));
        }
    }
}

fn adapt_ai_proxy_body(path: &str, kind: Option<AiModelKind>, body: &mut Value) {
    if kind != Some(AiModelKind::Text) {
        return;
    }
    if is_responses_path(path) {
        openai_chat_body_to_responses_body(body);
        return;
    }
    if is_anthropic_messages_path(path) {
        openai_chat_body_to_anthropic_messages_body(body);
        return;
    }
    if !is_native_gemini_generate_content_path(path) {
        return;
    }
    let Some(obj) = body.as_object() else {
        return;
    };
    if !obj.get("messages").is_some_and(Value::is_array) {
        return;
    }
    *body = openai_chat_body_to_gemini_generate_content(obj);
}

fn openai_chat_body_to_responses_body(body: &mut Value) {
    let Some(obj) = body.as_object_mut() else {
        return;
    };
    let Some(messages) = obj.remove("messages") else {
        return;
    };
    obj.insert("input".to_string(), messages);
}

fn openai_chat_body_to_anthropic_messages_body(body: &mut Value) {
    let Some(obj) = body.as_object_mut() else {
        return;
    };
    let Some(messages) = obj.get("messages").and_then(Value::as_array) else {
        return;
    };
    let mut system_texts = Vec::new();
    let mut next_messages = Vec::new();
    for message in messages {
        let Some(message) = message.as_object() else {
            continue;
        };
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let text = message_content_to_text(message.get("content"));
        if role == "system" {
            if !text.is_empty() {
                system_texts.push(text);
            }
            continue;
        }
        if role == "user" || role == "assistant" {
            next_messages.push(serde_json::json!({ "role": role, "content": text }));
        }
    }
    if !system_texts.is_empty() {
        obj.insert("system".to_string(), Value::String(system_texts.join("\n")));
    }
    obj.insert("messages".to_string(), Value::Array(next_messages));
    obj.entry("max_tokens".to_string())
        .or_insert_with(|| serde_json::json!(4096));
}

fn openai_chat_body_to_gemini_generate_content(body: &Map<String, Value>) -> Value {
    let mut system_texts = Vec::new();
    let mut contents = Vec::new();
    if let Some(messages) = body.get("messages").and_then(Value::as_array) {
        for message in messages {
            let Some(message) = message.as_object() else {
                continue;
            };
            let role = message
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let text = message_content_to_text(message.get("content"));
            match role {
                "system" => {
                    if !text.is_empty() {
                        system_texts.push(text);
                    }
                }
                "assistant" => {
                    let mut parts = Vec::new();
                    if !text.is_empty() {
                        parts.push(serde_json::json!({ "text": text }));
                    }
                    if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
                        for tool_call in tool_calls {
                            if let Some(function_call) = openai_tool_call_to_gemini(tool_call) {
                                parts.push(serde_json::json!({ "functionCall": function_call }));
                            }
                        }
                    }
                    if !parts.is_empty() {
                        contents.push(serde_json::json!({ "role": "model", "parts": parts }));
                    }
                }
                "tool" => {
                    contents.push(serde_json::json!({
                        "role": "user",
                        "parts": [{
                            "functionResponse": compact_json_object(serde_json::json!({
                                "id": message.get("tool_call_id").and_then(Value::as_str).unwrap_or_default(),
                                "name": message.get("name").and_then(Value::as_str).unwrap_or_default(),
                                "response": tool_content_to_gemini_response(message.get("content")),
                            }))
                        }]
                    }));
                }
                _ => {
                    if !text.is_empty() {
                        contents.push(
                            serde_json::json!({ "role": "user", "parts": [{ "text": text }] }),
                        );
                    }
                }
            }
        }
    }

    let mut result = Map::new();
    result.insert("contents".to_string(), Value::Array(contents));
    if !system_texts.is_empty() {
        result.insert(
            "systemInstruction".to_string(),
            serde_json::json!({ "parts": [{ "text": system_texts.join("\n") }] }),
        );
    }
    let declarations = openai_tools_to_gemini_declarations(body.get("tools"));
    if !declarations.is_empty() {
        result.insert(
            "tools".to_string(),
            serde_json::json!([{ "functionDeclarations": declarations }]),
        );
        if let Some(function_calling_config) =
            gemini_function_calling_config(body.get("tools"), body.get("tool_choice"))
        {
            result.insert(
                "toolConfig".to_string(),
                serde_json::json!({ "functionCallingConfig": function_calling_config }),
            );
        }
    }
    let generation_config = gemini_generation_config(body);
    if !generation_config.is_empty() {
        result.insert(
            "generationConfig".to_string(),
            Value::Object(generation_config),
        );
    }
    Value::Object(result)
}

fn message_content_to_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        Some(Value::Null) | None => String::new(),
        Some(value) => value.to_string(),
    }
}

fn openai_tool_call_to_gemini(tool_call: &Value) -> Option<Value> {
    let function = tool_call.get("function")?.as_object()?;
    let name = function.get("name")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    Some(compact_json_object(serde_json::json!({
        "id": tool_call.get("id").and_then(Value::as_str).unwrap_or_default(),
        "name": name,
        "args": parse_tool_arguments_value(function.get("arguments")),
    })))
}

fn compact_json_object(value: Value) -> Value {
    let Value::Object(mut object) = value else {
        return value;
    };
    object.retain(|_, value| !matches!(value, Value::String(text) if text.is_empty()));
    Value::Object(object)
}

fn parse_tool_arguments_value(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Object(_)) => value.cloned().unwrap_or_else(|| serde_json::json!({})),
        Some(Value::String(raw)) if !raw.trim().is_empty() => {
            serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({}))
        }
        _ => serde_json::json!({}),
    }
}

fn tool_content_to_gemini_response(content: Option<&Value>) -> Value {
    let text = message_content_to_text(content);
    if text.trim().is_empty() {
        return serde_json::json!({});
    }
    serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({ "result": text }))
}

fn openai_tools_to_gemini_declarations(tools: Option<&Value>) -> Vec<Value> {
    tools
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .filter_map(|tool| {
                    let function = tool.get("function")?.as_object()?;
                    let name = function.get("name")?.as_str()?.trim();
                    if name.is_empty() {
                        return None;
                    }
                    let mut declaration = Map::new();
                    declaration.insert("name".to_string(), Value::String(name.to_string()));
                    if let Some(description) = function.get("description").and_then(Value::as_str) {
                        declaration.insert(
                            "description".to_string(),
                            Value::String(description.to_string()),
                        );
                    }
                    if let Some(parameters) = function.get("parameters") {
                        declaration.insert(
                            "parameters".to_string(),
                            strip_gemini_unsupported_schema_keys(parameters),
                        );
                    }
                    Some(Value::Object(declaration))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn gemini_function_calling_config(
    tools: Option<&Value>,
    tool_choice: Option<&Value>,
) -> Option<Value> {
    let tools = tools?.as_array()?;
    if tools.is_empty() {
        return None;
    }
    match tool_choice.and_then(Value::as_str).map(str::trim) {
        Some("auto") | Some("required") => {}
        _ => return None,
    }
    let allowed_function_names: Vec<Value> = tools
        .iter()
        .filter_map(|tool| {
            let function = tool.get("function")?.as_object()?;
            let name = function.get("name")?.as_str()?.trim();
            if name.is_empty() {
                None
            } else {
                Some(Value::String(name.to_string()))
            }
        })
        .collect();
    if allowed_function_names.is_empty() {
        return None;
    }
    Some(serde_json::json!({
        "mode": "ANY",
        "allowedFunctionNames": allowed_function_names,
    }))
}

fn strip_gemini_unsupported_schema_keys(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(strip_gemini_unsupported_schema_keys)
                .collect(),
        ),
        Value::Object(obj) => Value::Object(
            obj.iter()
                .filter(|(key, _)| key.as_str() != "additionalProperties")
                .map(|(key, value)| (key.clone(), strip_gemini_unsupported_schema_keys(value)))
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn gemini_generation_config(body: &Map<String, Value>) -> Map<String, Value> {
    let mut config = Map::new();
    if let Some(value) = body.get("temperature").filter(|v| v.is_number()) {
        config.insert("temperature".to_string(), value.clone());
    }
    if let Some(value) = body.get("top_p").filter(|v| v.is_number()) {
        config.insert("topP".to_string(), value.clone());
    }
    if let Some(value) = body.get("max_tokens").filter(|v| v.is_number()) {
        config.insert("maxOutputTokens".to_string(), value.clone());
    }
    if let Some(value) = body
        .get("responseMimeType")
        .or_else(|| body.get("response_mime_type"))
        .filter(|v| v.is_string())
    {
        config.insert("responseMimeType".to_string(), value.clone());
    }
    if let Some(value) = body
        .get("responseSchema")
        .or_else(|| body.get("response_schema"))
    {
        config.insert(
            "responseSchema".to_string(),
            strip_gemini_unsupported_schema_keys(value),
        );
    }
    config
}

fn is_native_gemini_generate_content_path(path: &str) -> bool {
    path.split('?').next().is_some_and(|path| {
        path.ends_with(":generateContent") || path.ends_with(":streamGenerateContent")
    })
}

fn is_responses_path(path: &str) -> bool {
    path.split('?')
        .next()
        .is_some_and(|path| path.ends_with("/responses"))
}

fn is_anthropic_messages_path(path: &str) -> bool {
    path.split('?')
        .next()
        .is_some_and(|path| path.ends_with("/v1/messages"))
}

fn should_use_gemini_api_key_header(target: &Url, path: &str, kind: Option<AiModelKind>) -> bool {
    kind == Some(AiModelKind::Text)
        && (is_native_gemini_generate_content_path(path)
            || is_native_gemini_generate_content_path(target.as_str()))
        && target.host_str() == Some("generativelanguage.googleapis.com")
}

pub async fn ai_proxy_image(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<AiProxyImageRequest>,
) -> Result<Response, AppError> {
    require_proxy_user(&state, &auth).await?;
    let target = validate_ai_proxy_image_url(&req.url).map_err(AppError::BadRequest)?;
    let client = ai_proxy_client()?;
    let upstream = client
        .get(target)
        .header(reqwest::header::ACCEPT, "image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(map_ai_proxy_http_error)?;

    if let Some(length) = upstream.content_length() {
        if length > MAX_PROXY_IMAGE_BYTES {
            return Err(AppError::BadRequest("图片超过代理大小限制".to_string()));
        }
    }

    let status = upstream.status();
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| HeaderValue::from_str(v).ok());
    let body = upstream.bytes().await?;
    if body.len() as u64 > MAX_PROXY_IMAGE_BYTES {
        return Err(AppError::BadRequest("图片超过代理大小限制".to_string()));
    }
    if !status.is_success() {
        return Ok(build_upstream_error_response(status, &body));
    }
    Ok(build_response(status, content_type, body))
}

pub async fn azure_tts(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<AzureTtsRequest>,
) -> Result<Response, AppError> {
    require_proxy_user(&state, &auth).await?;
    let req = validate_azure_tts_request(&req).map_err(AppError::BadRequest)?;
    let target = azure_tts_endpoint(req.region).map_err(AppError::BadRequest)?;
    let ssml = build_azure_tts_ssml(req.text, req.voice, req.rate, req.pitch);
    let client = ai_proxy_client()?;
    let upstream = build_azure_tts_request(&client, target, &req, ssml)
        .send()
        .await
        .map_err(map_ai_proxy_http_error)?;

    response_from_upstream_limited(
        upstream,
        MAX_PROXY_SPEECH_AUDIO_BYTES,
        "Azure Speech 音频超过代理大小限制",
    )
    .await
}

fn build_azure_tts_request(
    client: &reqwest::Client,
    target: Url,
    req: &ValidatedAzureTtsRequest<'_>,
    ssml: String,
) -> reqwest::RequestBuilder {
    client
        .post(target)
        .header("Ocp-Apim-Subscription-Key", req.subscription_key)
        .header(reqwest::header::CONTENT_TYPE, "application/ssml+xml")
        .header("X-Microsoft-OutputFormat", req.output_format)
        .header(reqwest::header::USER_AGENT, AZURE_TTS_USER_AGENT)
        .body(ssml)
}

fn validate_azure_tts_request(
    req: &AzureTtsRequest,
) -> Result<ValidatedAzureTtsRequest<'_>, String> {
    let region = validate_azure_region(&req.region)?;

    let subscription_key = req.subscription_key.trim();
    if subscription_key.is_empty() {
        return Err("Azure Speech 订阅密钥不能为空".to_string());
    }
    if subscription_key.len() > 512
        || !subscription_key
            .bytes()
            .all(|value| value.is_ascii_graphic())
    {
        return Err("Azure Speech 订阅密钥格式无效".to_string());
    }

    let text = req.text.trim();
    if text.is_empty() {
        return Err("朗读文本不能为空".to_string());
    }
    if text.chars().count() > MAX_AZURE_TTS_TEXT_CHARS {
        return Err(format!(
            "单次朗读文本不能超过 {MAX_AZURE_TTS_TEXT_CHARS} 个字符"
        ));
    }
    if !text.chars().all(is_valid_xml_char) {
        return Err("朗读文本包含无效控制字符".to_string());
    }

    let voice = req.voice.trim();
    if voice.is_empty() {
        return Err("Azure Speech 音色不能为空".to_string());
    }
    if voice.chars().count() > 128 || !voice.chars().all(is_valid_xml_char) {
        return Err("Azure Speech 音色格式无效".to_string());
    }

    let output_format = req.output_format.trim();
    if !AZURE_TTS_OUTPUT_FORMATS.contains(&output_format) {
        return Err("不支持的 Azure Speech 音频格式".to_string());
    }

    let rate = req.rate.unwrap_or(1.0);
    if !rate.is_finite() || !(0.5..=2.0).contains(&rate) {
        return Err("Azure Speech 语速必须在 0.5 到 2.0 之间".to_string());
    }
    let pitch = req.pitch.unwrap_or(1.0);
    if !pitch.is_finite() || !(0.5..=1.5).contains(&pitch) {
        return Err("Azure Speech 语调必须在 0.5 到 1.5 之间".to_string());
    }

    Ok(ValidatedAzureTtsRequest {
        region,
        subscription_key,
        text,
        voice,
        output_format,
        rate,
        pitch,
    })
}

fn validate_azure_region(region: &str) -> Result<&str, String> {
    let region = region.trim();
    if region.is_empty() {
        return Err("Azure Speech 区域不能为空".to_string());
    }
    if region.len() > 64
        || !region
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-')
        || region.starts_with('-')
        || region.ends_with('-')
    {
        return Err("Azure Speech 区域格式无效".to_string());
    }
    Ok(region)
}

fn azure_tts_endpoint(region: &str) -> Result<Url, String> {
    let region = validate_azure_region(region)?;
    Url::parse(&format!(
        "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    ))
    .map_err(|_| "Azure Speech 区域格式无效".to_string())
}

fn build_azure_tts_ssml(text: &str, voice: &str, rate: f32, pitch: f32) -> String {
    let locale = azure_voice_locale(voice);
    let rate = azure_prosody_percentage(rate);
    let pitch = azure_prosody_percentage(pitch);
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"{}\">\
<voice name=\"{}\"><prosody rate=\"{}\" pitch=\"{}\">{}</prosody></voice></speak>",
        escape_xml(locale),
        escape_xml(voice),
        escape_xml(&rate),
        escape_xml(&pitch),
        escape_xml(text),
    )
}

fn azure_voice_locale(voice: &str) -> &str {
    let Some((language, rest)) = voice.split_once('-') else {
        return "zh-CN";
    };
    let Some((region, _)) = rest.split_once('-') else {
        return "zh-CN";
    };
    if (language.len() == 2 || language.len() == 3)
        && language.bytes().all(|value| value.is_ascii_alphabetic())
        && (region.len() == 2 || region.len() == 3)
        && region.bytes().all(|value| value.is_ascii_alphanumeric())
    {
        &voice[..language.len() + 1 + region.len()]
    } else {
        "zh-CN"
    }
}

fn azure_prosody_percentage(value: f32) -> String {
    let percentage = ((value - 1.0) * 100.0).round() as i32;
    if percentage >= 0 {
        format!("+{percentage}%")
    } else {
        format!("{percentage}%")
    }
}

fn escape_xml(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn is_valid_xml_char(value: char) -> bool {
    matches!(value, '\u{9}' | '\u{A}' | '\u{D}')
        || ('\u{20}'..='\u{D7FF}').contains(&value)
        || ('\u{E000}'..='\u{FFFD}').contains(&value)
        || ('\u{10000}'..='\u{10FFFF}').contains(&value)
}

async fn require_proxy_user(state: &AppState, auth: &AuthContext) -> Result<(), AppError> {
    state
        .user_service
        .resolve_user_ns_with_override(auth.access_token(), auth.secure_key(), auth.user_ns())
        .await
        .map(|_| ())
        .map_err(|_| AppError::BadRequest("NEED_LOGIN".to_string()))
}

async fn response_from_upstream(upstream: reqwest::Response) -> Result<Response, AppError> {
    let status = upstream.status();
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| HeaderValue::from_str(v).ok());
    let body = upstream.bytes().await?;
    if !status.is_success() {
        return Ok(build_upstream_error_response(status, &body));
    }
    Ok(build_response(status, content_type, body))
}

async fn response_from_upstream_limited(
    mut upstream: reqwest::Response,
    max_bytes: u64,
    limit_message: &str,
) -> Result<Response, AppError> {
    if upstream
        .content_length()
        .is_some_and(|length| length > max_bytes)
    {
        return Err(AppError::BadRequest(limit_message.to_string()));
    }

    let status = upstream.status();
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| HeaderValue::from_str(value).ok());
    let mut body = Vec::new();
    while let Some(chunk) = upstream.chunk().await? {
        append_limited_response_chunk(&mut body, &chunk, max_bytes)
            .map_err(|_| AppError::BadRequest(limit_message.to_string()))?;
    }
    let body = bytes::Bytes::from(body);
    if !status.is_success() {
        return Ok(build_upstream_error_response(status, &body));
    }
    Ok(build_response(status, content_type, body))
}

fn append_limited_response_chunk(
    body: &mut Vec<u8>,
    chunk: &[u8],
    max_bytes: u64,
) -> Result<(), ()> {
    if (body.len() as u64).saturating_add(chunk.len() as u64) > max_bytes {
        return Err(());
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn build_response(
    status: reqwest::StatusCode,
    content_type: Option<HeaderValue>,
    body: bytes::Bytes,
) -> Response {
    let status = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut response = (status, body).into_response();
    if let Some(content_type) = content_type {
        response
            .headers_mut()
            .insert(header::CONTENT_TYPE, content_type);
    }
    response
}

fn build_upstream_error_response(status: reqwest::StatusCode, body: &bytes::Bytes) -> Response {
    let body_text = std::str::from_utf8(body).unwrap_or("");
    let message = format_ai_proxy_upstream_error(status.as_u16(), body_text);
    let status = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut response = Json(ApiResponse::<Value>::err(message)).into_response();
    *response.status_mut() = status;
    response
}

fn ai_proxy_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(ai_proxy_timeout())
        .build()
        .map_err(AppError::Http)
}

async fn public_https_speech_proxy_client(target: &Url) -> Result<reqwest::Client, AppError> {
    validate_public_https_speech_target(target).map_err(AppError::BadRequest)?;
    let host = target
        .host_str()
        .ok_or_else(|| AppError::BadRequest("HTTPS TTS 地址缺少主机名".to_string()))?;
    let port = target.port_or_known_default().unwrap_or(443);
    let resolved_address = if let Ok(ip) = host.parse::<IpAddr>() {
        SocketAddr::new(ip, port)
    } else {
        let addresses = tokio::time::timeout(Duration::from_secs(10), lookup_host((host, port)))
            .await
            .map_err(|_| AppError::BadRequest("HTTPS TTS 地址解析超时".to_string()))?
            .map_err(|_| AppError::BadRequest("HTTPS TTS 地址无法解析".to_string()))?;
        addresses
            .filter(|address| is_public_proxy_ip(address.ip()))
            .min_by_key(|address| if address.is_ipv4() { 0 } else { 1 })
            .ok_or_else(|| {
                AppError::BadRequest("HTTPS TTS 地址不能指向本机或私有网络".to_string())
            })?
    };

    if !is_public_proxy_ip(resolved_address.ip()) {
        return Err(AppError::BadRequest(
            "HTTPS TTS 地址不能指向本机或私有网络".to_string(),
        ));
    }

    let mut builder = reqwest::Client::builder()
        .timeout(ai_proxy_timeout())
        .redirect(reqwest::redirect::Policy::none());
    if host.parse::<IpAddr>().is_err() {
        // Pin the already-validated address to avoid DNS rebinding between
        // validation and connection while preserving the hostname for TLS/SNI.
        builder = builder.resolve(host, resolved_address);
    }
    builder.build().map_err(AppError::Http)
}

fn validate_public_https_speech_target(target: &Url) -> Result<(), String> {
    if target.scheme() != "https" {
        return Err("公共 TTS 代理仅支持 HTTPS 地址".to_string());
    }
    if !target.username().is_empty() || target.password().is_some() {
        return Err("HTTPS TTS 地址不能包含用户名或密码".to_string());
    }
    if !target
        .path()
        .trim_end_matches('/')
        .to_ascii_lowercase()
        .ends_with("/audio/speech")
    {
        return Err("HTTPS TTS 地址必须以 /audio/speech 结尾".to_string());
    }
    let host = target
        .host_str()
        .ok_or_else(|| "HTTPS TTS 地址缺少主机名".to_string())?;
    let normalized_host = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized_host == "localhost"
        || normalized_host.ends_with(".localhost")
        || normalized_host.ends_with(".local")
        || normalized_host.ends_with(".internal")
    {
        return Err("HTTPS TTS 地址不能指向本机或私有网络".to_string());
    }
    if let Ok(ip) = normalized_host.parse::<IpAddr>() {
        if !is_public_proxy_ip(ip) {
            return Err("HTTPS TTS 地址不能指向本机或私有网络".to_string());
        }
    }
    Ok(())
}

fn is_public_proxy_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [first, second, third, _] = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !ip.is_broadcast()
                && first != 0
                && first < 224
                && !(first == 100 && (64..=127).contains(&second))
                && !(first == 192 && second == 0)
                && !(first == 198 && (18..=19).contains(&second))
                && !(first == 198 && second == 51 && third == 100)
                && !(first == 203 && second == 0 && third == 113)
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_public_proxy_ip(IpAddr::V4(mapped));
            }
            let segments = ip.segments();
            !ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && !ip.is_unique_local()
                && !ip.is_unicast_link_local()
                && !segments[..6].iter().all(|segment| *segment == 0)
                && (segments[0] & 0xffc0) != 0xfec0
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        }
    }
}

fn map_ai_proxy_http_error(error: reqwest::Error) -> AppError {
    if error.is_timeout() {
        return AppError::BadRequest("模型服务请求超时，请检查模型地址或稍后重试".to_string());
    }
    AppError::Http(error)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoint(path: &str, use_full_url: bool) -> ResolvedAiModelEndpoint {
        ResolvedAiModelEndpoint {
            enabled: true,
            base_url: "https://api.example.test".to_string(),
            api_key: String::new(),
            model: "model".to_string(),
            path: path.to_string(),
            use_full_url,
            image_size: None,
            voice: None,
            response_format: None,
        }
    }

    #[test]
    fn server_ai_proxy_path_prefers_configured_or_requested_path() {
        assert_eq!(
            resolve_server_ai_model_path(
                &endpoint("/v1/messages", false),
                AiModelKind::Text,
                "/v1/chat/completions",
            ),
            "/v1/messages",
        );
        assert_eq!(
            resolve_server_ai_model_path(&endpoint("", false), AiModelKind::Text, "/v1/responses"),
            "/v1/responses",
        );
        assert_eq!(
            resolve_server_ai_model_path(&endpoint("", false), AiModelKind::Text, ""),
            "/v1/chat/completions",
        );
        assert_eq!(
            resolve_server_ai_model_path(&endpoint("", true), AiModelKind::Text, ""),
            "",
        );
    }

    #[test]
    fn direct_backend_proxy_uses_gemini_api_key_header_for_google_native_path() {
        let target = Url::parse(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
        )
        .unwrap();

        assert!(should_use_gemini_api_key_header(
            &target,
            "/v1beta/models/gemini-2.5-pro:generateContent",
            Some(AiModelKind::Text),
        ));
        let openai_target =
            Url::parse("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")
                .unwrap();
        assert!(!should_use_gemini_api_key_header(
            &openai_target,
            "/v1beta/openai/chat/completions",
            Some(AiModelKind::Text),
        ));
        assert!(!should_use_gemini_api_key_header(
            &target,
            "/v1beta/models/gemini-2.5-pro:generateContent",
            None,
        ));
    }

    #[test]
    fn native_gemini_text_path_converts_chat_body_to_generate_content() {
        let mut body = serde_json::json!({
            "model": "browser-model",
            "messages": [
                {"role": "system", "content": "你是资料维护 agent"},
                {"role": "user", "content": "更新第八章"},
                {
                    "role": "assistant",
                    "tool_calls": [{
                        "id": "call-1",
                        "type": "function",
                        "function": {"name": "get_current_memory", "arguments": "{}"}
                    }]
                },
                {"role": "tool", "tool_call_id": "call-1", "name": "get_current_memory", "content": "{\"ok\":true}"}
            ],
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_current_memory",
                    "description": "读取当前资料",
                    "parameters": {"type": "object", "properties": {}, "additionalProperties": false}
                }
            }],
            "tool_choice": "auto",
            "temperature": 0.2,
            "max_tokens": 4096,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "object",
                "properties": {
                    "chapterDigest": {"type": "object"}
                }
            }
        });

        adapt_ai_proxy_body(
            "/v1beta/models/gemini-2.5-pro:generateContent",
            Some(AiModelKind::Text),
            &mut body,
        );

        assert!(body.get("model").is_none());
        assert!(body.get("messages").is_none());
        assert_eq!(
            body.pointer("/systemInstruction/parts/0/text"),
            Some(&Value::String("你是资料维护 agent".to_string()))
        );
        assert_eq!(
            body.pointer("/contents/0/role"),
            Some(&Value::String("user".to_string()))
        );
        assert_eq!(
            body.pointer("/contents/0/parts/0/text"),
            Some(&Value::String("更新第八章".to_string()))
        );
        assert_eq!(
            body.pointer("/contents/1/role"),
            Some(&Value::String("model".to_string()))
        );
        assert_eq!(
            body.pointer("/contents/1/parts/0/functionCall/name"),
            Some(&Value::String("get_current_memory".to_string()))
        );
        assert_eq!(
            body.pointer("/contents/2/parts/0/functionResponse/id"),
            Some(&Value::String("call-1".to_string()))
        );
        assert_eq!(
            body.pointer("/tools/0/functionDeclarations/0/name"),
            Some(&Value::String("get_current_memory".to_string()))
        );
        assert_eq!(
            body.pointer("/toolConfig/functionCallingConfig/mode"),
            Some(&Value::String("ANY".to_string()))
        );
        assert_eq!(
            body.pointer("/toolConfig/functionCallingConfig/allowedFunctionNames/0"),
            Some(&Value::String("get_current_memory".to_string()))
        );
        assert!(body
            .pointer("/tools/0/functionDeclarations/0/parameters/additionalProperties")
            .is_none());
        assert_eq!(
            body.pointer("/generationConfig/temperature"),
            Some(&serde_json::json!(0.2))
        );
        assert_eq!(
            body.pointer("/generationConfig/maxOutputTokens"),
            Some(&serde_json::json!(4096))
        );
        assert_eq!(
            body.pointer("/generationConfig/responseMimeType"),
            Some(&Value::String("application/json".to_string()))
        );
        assert_eq!(
            body.pointer("/generationConfig/responseSchema/properties/chapterDigest/type"),
            Some(&Value::String("object".to_string()))
        );
    }

    #[test]
    fn responses_text_path_converts_chat_body_to_responses_input() {
        let mut body = serde_json::json!({
            "model": "browser-model",
            "messages": [
                {"role": "system", "content": "系统"},
                {"role": "user", "content": "正文"}
            ],
            "temperature": 0.2
        });

        adapt_ai_proxy_body("/v1/responses", Some(AiModelKind::Text), &mut body);

        assert!(body.get("messages").is_none());
        assert_eq!(
            body.pointer("/input/0/role"),
            Some(&Value::String("system".to_string()))
        );
        assert_eq!(
            body.pointer("/input/1/role"),
            Some(&Value::String("user".to_string()))
        );
    }

    #[test]
    fn anthropic_text_path_converts_chat_body_to_messages_shape() {
        let mut body = serde_json::json!({
            "model": "browser-model",
            "messages": [
                {"role": "system", "content": "系统"},
                {"role": "user", "content": "正文"}
            ],
            "temperature": 0.2,
            "max_tokens": 4096
        });

        adapt_ai_proxy_body("/v1/messages", Some(AiModelKind::Text), &mut body);

        assert_eq!(body.get("system"), Some(&Value::String("系统".to_string())));
        assert_eq!(
            body.pointer("/messages/0/role"),
            Some(&Value::String("user".to_string()))
        );
        assert_eq!(body.get("max_tokens"), Some(&serde_json::json!(4096)));
    }

    fn azure_request() -> AzureTtsRequest {
        AzureTtsRequest {
            region: "japaneast".to_string(),
            subscription_key: "secret-key".to_string(),
            text: "你好，世界".to_string(),
            voice: "zh-CN-XiaoxiaoNeural".to_string(),
            output_format: "audio-24khz-48kbitrate-mono-mp3".to_string(),
            rate: Some(1.0),
            pitch: Some(1.0),
        }
    }

    #[test]
    fn azure_tts_endpoint_uses_validated_region_host() {
        assert_eq!(
            azure_tts_endpoint("japaneast").unwrap().as_str(),
            "https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1"
        );
        for region in [
            "",
            "-japaneast",
            "japaneast-",
            "japan.east",
            "japaneast/path",
            "japaneast?host=evil",
            "日本东部",
        ] {
            assert!(azure_tts_endpoint(region).is_err(), "{region}");
        }
    }

    #[test]
    fn azure_tts_ssml_escapes_text_and_voice_attributes() {
        let ssml = build_azure_tts_ssml(
            "A&B <C> \"quoted\" 'apostrophe'",
            "zh-CN-Xiao\"<&'Neural",
            1.25,
            0.8,
        );

        assert!(ssml.contains("xml:lang=\"zh-CN\""));
        assert!(ssml.contains("name=\"zh-CN-Xiao&quot;&lt;&amp;&apos;Neural\""));
        assert!(ssml.contains("rate=\"+25%\" pitch=\"-20%\""));
        assert!(ssml.contains("A&amp;B &lt;C&gt; &quot;quoted&quot; &apos;apostrophe&apos;"));
        assert!(!ssml.contains("<C>"));
    }

    #[test]
    fn azure_tts_validation_requires_credentials_text_voice_and_safe_format() {
        let mut req = azure_request();
        assert!(validate_azure_tts_request(&req).is_ok());

        req.subscription_key.clear();
        assert!(validate_azure_tts_request(&req).is_err());
        req = azure_request();
        req.text = " \n ".to_string();
        assert!(validate_azure_tts_request(&req).is_err());
        req = azure_request();
        req.voice.clear();
        assert!(validate_azure_tts_request(&req).is_err());
        req = azure_request();
        req.output_format = "text/html\r\nX-Evil: true".to_string();
        assert!(validate_azure_tts_request(&req).is_err());
    }

    #[test]
    fn azure_tts_request_uses_camel_case_json_fields() {
        let req: AzureTtsRequest = serde_json::from_value(serde_json::json!({
            "region": "japaneast",
            "subscriptionKey": "secret-key",
            "text": "你好",
            "voice": "zh-CN-XiaoxiaoNeural",
            "outputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "rate": 1.2,
            "pitch": 0.9
        }))
        .unwrap();

        let req = validate_azure_tts_request(&req).unwrap();
        assert_eq!(req.subscription_key, "secret-key");
        assert_eq!(req.output_format, "audio-24khz-48kbitrate-mono-mp3");
        assert_eq!(req.rate, 1.2);
        assert_eq!(req.pitch, 0.9);
    }

    #[test]
    fn azure_tts_request_includes_required_headers_and_ssml_body() {
        let raw = azure_request();
        let req = validate_azure_tts_request(&raw).unwrap();
        let target = azure_tts_endpoint(req.region).unwrap();
        let ssml = build_azure_tts_ssml(req.text, req.voice, req.rate, req.pitch);
        let request = build_azure_tts_request(&reqwest::Client::new(), target, &req, ssml)
            .build()
            .unwrap();

        assert_eq!(request.headers()["Ocp-Apim-Subscription-Key"], "secret-key");
        assert_eq!(
            request.headers()[reqwest::header::CONTENT_TYPE],
            "application/ssml+xml"
        );
        assert_eq!(
            request.headers()["X-Microsoft-OutputFormat"],
            "audio-24khz-48kbitrate-mono-mp3"
        );
        assert_eq!(
            request.headers()[reqwest::header::USER_AGENT],
            AZURE_TTS_USER_AGENT
        );
        let body = request.body().and_then(reqwest::Body::as_bytes).unwrap();
        assert!(std::str::from_utf8(body).unwrap().contains("<speak"));
    }

    #[test]
    fn azure_tts_validation_limits_text_and_prosody_values() {
        let mut req = azure_request();
        req.text = "字".repeat(MAX_AZURE_TTS_TEXT_CHARS + 1);
        assert!(validate_azure_tts_request(&req).is_err());

        req = azure_request();
        req.text = "有效\u{0}无效".to_string();
        assert!(validate_azure_tts_request(&req).is_err());

        req = azure_request();
        req.rate = Some(2.1);
        assert!(validate_azure_tts_request(&req).is_err());

        req = azure_request();
        req.pitch = Some(1.51);
        assert!(validate_azure_tts_request(&req).is_err());
    }

    #[test]
    fn custom_speech_proxy_rejects_non_https_private_and_non_speech_targets() {
        assert!(validate_public_https_speech_target(
            &Url::parse("https://tts.example.com/v1/audio/speech").unwrap()
        )
        .is_ok());
        for target in [
            "http://tts.example.com/v1/audio/speech",
            "https://localhost/v1/audio/speech",
            "https://127.0.0.1/v1/audio/speech",
            "https://192.168.1.20/v1/audio/speech",
            "https://tts.internal/v1/audio/speech",
            "https://tts.example.com/v1/chat/completions",
        ] {
            assert!(
                validate_public_https_speech_target(&Url::parse(target).unwrap()).is_err(),
                "{target}"
            );
        }
    }

    #[test]
    fn speech_proxy_ip_filter_blocks_private_and_metadata_networks() {
        for address in [
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.168.1.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!is_public_proxy_ip(address.parse().unwrap()), "{address}");
        }
        assert!(is_public_proxy_ip("8.8.8.8".parse().unwrap()));
        assert!(is_public_proxy_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn limited_response_body_checks_accumulated_chunk_size() {
        let mut body = Vec::new();
        assert!(append_limited_response_chunk(&mut body, &[1, 2], 4).is_ok());
        assert!(append_limited_response_chunk(&mut body, &[3, 4], 4).is_ok());
        assert!(append_limited_response_chunk(&mut body, &[5], 4).is_err());
        assert_eq!(body, vec![1, 2, 3, 4]);
    }
}
