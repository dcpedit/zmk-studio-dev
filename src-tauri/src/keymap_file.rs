use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

// Keymap import/export goes through native dialogs: the webview can't reliably
// trigger a browser-style download.

#[tauri::command]
pub async fn save_keymap_file(
    app: tauri::AppHandle,
    default_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("ZMK keymap", &["keymap"])
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

#[derive(Serialize)]
pub struct OpenedFile {
    name: String,
    contents: String,
}

#[tauri::command]
pub async fn open_keymap_file(app: tauri::AppHandle) -> Result<Option<OpenedFile>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("ZMK keymap", &["keymap", "dtsi", "overlay"])
        .add_filter("All files", &["*"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = path.into_path().map_err(|e| e.to_string())?;
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(Some(OpenedFile { name, contents }))
}
