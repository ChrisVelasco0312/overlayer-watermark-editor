use tauri::Manager;

/// Diagnóstico temporal (dev): imprime métricas de layout del webview en el
/// log de `tauri:dev`. Eliminar cuando se cierre el issue de escala.
#[tauri::command]
fn log_layout(msg: String) {
    println!("[layout] {msg}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![log_layout])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Overlayer");
}
