use reader_next::model::book_source::BookSource;
use reader_next::parser::js::{eval_js, with_js_source};

#[test]
fn java_aes_base64_decode_to_string_decrypts_legado_paths() {
    let encrypted = "UhQTfQq/qXGCKPd5D+cjxB7Y0AzwiFMYBmcN5nIm2PboUavKiWEIVaAPIhDXbkox";
    let result = eval_js(
        r#"java.aesBase64DecodeToString(result, "f041c49714d39908", "AES/CBC/PKCS5Padding", "0123456789abcdef")"#,
        encrypted,
        "http://api.jmlldsc.com",
    )
    .unwrap();

    assert_eq!(result, "http://api.lemiyigou.com/655/655791/70398.json");
}

#[test]
fn js_lib_functions_receive_legado_global_this() {
    let source = BookSource {
        book_source_url: "https://source.example".to_string(),
        js_lib: Some(
            r#"
function getSecretKey() {
  const { source } = this;
  return source.getLoginHeader();
}
"#
            .to_string(),
        ),
        ..Default::default()
    };
    source.runtime.set_login_header("saved-api-key".to_string());

    let result = with_js_source(&source, || {
        eval_js("getSecretKey()", "", &source.book_source_url)
    })
    .unwrap();

    assert_eq!(result, "saved-api-key");
}

#[test]
fn legado_cookie_and_browser_await_apis_persist_source_state() {
    let source = BookSource {
        book_source_url: "https://source.example".to_string(),
        ..Default::default()
    };

    let result = with_js_source(&source, || {
        eval_js(
            r#"
cookie.setCookie("https://v1.example.test", "qttoken=saved-token");
const page = java.startBrowserAwait(
  "data:text/html;base64,PGh0bWw+PGJvZHk+U2V0dGluZ3M8L2JvZHk+PC9odG1sPg==",
  "设置"
);
JSON.stringify({
  token: java.getCookie("v1.example.test", "qttoken"),
  body: page.body()
})
"#,
            "",
            &source.book_source_url,
        )
    })
    .unwrap();
    let value: serde_json::Value = serde_json::from_str(&result).unwrap();

    assert_eq!(value["token"], "saved-token");
    assert_eq!(value["body"], "<html><body>Settings</body></html>");
    assert_eq!(
        source
            .runtime
            .snapshot()
            .cookies
            .get("v1.example.test")
            .map(String::as_str),
        Some("qttoken=saved-token")
    );
}

#[test]
fn legado_book_variable_api_is_available_to_detail_scripts() {
    let source = BookSource {
        book_source_url: "https://source.example".to_string(),
        ..Default::default()
    };

    let result = with_js_source(&source, || {
        eval_js(
            r#"
book.setVariable("custom", "voice-7");
JSON.stringify({
  custom: book.getVariable("custom"),
  chapterIndex: book.durChapterIndex,
  replaceRule: book.setUseReplaceRule(false)
})
"#,
            "",
            &source.book_source_url,
        )
    })
    .unwrap();
    let value: serde_json::Value = serde_json::from_str(&result).unwrap();

    assert_eq!(value["custom"], "voice-7");
    assert_eq!(value["chapterIndex"], 0);
    assert_eq!(value["replaceRule"], true);
}
