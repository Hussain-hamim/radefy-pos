use radefy_core::Service;
use serde_json::{json, Value};
fn main() {
    let root = std::env::current_dir().unwrap().join(".radefy-demo");
    let mut service = Service::new(root, true).expect("Create demo store directory");
    let server = tiny_http::Server::http("127.0.0.1:1431").expect("Demo server port 1431");
    println!("Radefy demo SQLite service: http://127.0.0.1:1431 (demo only)");
    for mut request in server.incoming_requests() {
        if request.method() != &tiny_http::Method::Post || request.url() != "/api/command" {
            let _ = request
                .respond(tiny_http::Response::from_string("Not found").with_status_code(404));
            continue;
        }
        let origin = request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Origin"))
            .map(|h| h.value.as_str())
            .unwrap_or("");
        if !origin.is_empty()
            && !origin.starts_with("http://localhost:")
            && !origin.starts_with("http://127.0.0.1:")
            && !origin.starts_with("http://terminal.local:")
        {
            let _ = request
                .respond(tiny_http::Response::from_string("Forbidden").with_status_code(403));
            continue;
        }
        let content_type = request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Content-Type"))
            .map(|h| h.value.as_str())
            .unwrap_or("");
        if !content_type.starts_with("application/json") {
            let _ = request
                .respond(tiny_http::Response::from_string("JSON required").with_status_code(415));
            continue;
        }
        let mut body = String::new();
        use std::io::Read;
        let result = match request
            .as_reader()
            .take(6_000_001)
            .read_to_string(&mut body)
        {
            Ok(_) if body.len() <= 6_000_000 => match serde_json::from_str::<Value>(&body) {
                Ok(v) => service.dispatch(v["action"].as_str().unwrap_or(""), v["payload"].clone()),
                Err(e) => Err(radefy_core::Error {
                    code: "JSON".into(),
                    message: e.to_string(),
                }),
            },
            _ => Err(radefy_core::Error {
                code: "SIZE".into(),
                message: "Request is too large.".into(),
            }),
        };
        let response = match result {
            Ok(data) => json!({"ok":true,"data":data}),
            Err(error) => json!({"ok":false,"error":error}),
        };
        let _ = request.respond(
            tiny_http::Response::from_string(response.to_string()).with_header(
                tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap(),
            ),
        );
    }
}
