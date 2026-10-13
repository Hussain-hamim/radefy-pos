use crate::{Error, Result, Service};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::Manager;
type State = Arc<Mutex<Service>>;
#[tauri::command]
async fn command(state: tauri::State<'_, State>, action: String, payload: Value) -> Result<Value> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut s = service.lock().map_err(|_| Error {
            code: "STATE".into(),
            message: "Application state is unavailable. Please restart.".into(),
        })?;
        s.dispatch(&action, payload)
    })
    .await
    .map_err(|_| Error {
        code: "WORKER".into(),
        message: "Database worker stopped unexpectedly.".into(),
    })?
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let service = Arc::new(Mutex::new(Service::new(root, false)?));
            app.manage(service.clone());
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                if let Ok(s) = service.lock() {
                    let failure = s
                        .automatic_backup()
                        .err()
                        .map(|e| e.to_string())
                        .unwrap_or_default();
                    if let Ok(c) = s.c() {
                        let _ = crate::db::put_setting(c, "automatic_backup_error", &failure);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![command])
        .run(tauri::generate_context!())
        .expect("Unable to start Radefy POS");
}
