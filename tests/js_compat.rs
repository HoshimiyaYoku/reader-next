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
