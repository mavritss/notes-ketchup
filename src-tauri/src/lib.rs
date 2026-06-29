use base64::{engine::general_purpose, Engine as _};
use chrono::{Datelike, Local};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::Manager;

const VAULT_PATH: &str = r"D:\Obsidian\Second brain";
const INBOX_FOLDER: &str = "1 – Инбокс";
const ASSETS_FOLDER: &str = r"5 – Ресурсы\Notes Ketchup";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCaptureRequest {
    text: String,
    attachments: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavePastedImageRequest {
    bytes: Vec<u8>,
    mime_type: Option<String>,
    file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveImageFromUrlRequest {
    url: String,
    file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImagePreviewRequest {
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveCaptureResponse {
    note_path: String,
    attachment_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavePastedImageResponse {
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImagePreviewResponse {
    data_url: String,
}

#[tauri::command]
fn save_capture(request: SaveCaptureRequest) -> Result<SaveCaptureResponse, String> {
    save_capture_to_vault(request, &PathBuf::from(VAULT_PATH))
}

#[tauri::command]
fn save_pasted_image(request: SavePastedImageRequest) -> Result<SavePastedImageResponse, String> {
    save_temp_image(
        request.bytes,
        request.mime_type.as_deref(),
        request.file_name.as_deref(),
        "pasted",
    )
}

#[tauri::command]
fn save_image_from_url(
    request: SaveImageFromUrlRequest,
) -> Result<SavePastedImageResponse, String> {
    let url = request.url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Можно перетаскивать только http/https изображения.".to_string());
    }

    let response = ureq::get(url)
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NotesKetchup/0.1",
        )
        .call()
        .map_err(|error| format!("Не удалось загрузить изображение: {}", error))?;

    let mime_type = response
        .header("content-type")
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(str::to_string);

    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(30 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Не удалось прочитать изображение: {}", error))?;

    save_temp_image(
        bytes,
        mime_type.as_deref(),
        request.file_name.as_deref(),
        "dropped",
    )
}

#[tauri::command]
fn get_image_preview(request: ImagePreviewRequest) -> Result<ImagePreviewResponse, String> {
    let path = PathBuf::from(request.path);
    if !path.exists() || !path.is_file() {
        return Err("Файл превью не найден.".to_string());
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .and_then(extension_from_supported_image_extension)
        .ok_or_else(|| "Превью доступно только для изображений.".to_string())?;

    let bytes = fs::read(&path)
        .map_err(|error| format!("Не удалось прочитать превью {}: {}", path.display(), error))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Изображение слишком большое для превью.".to_string());
    }

    let mime_type = match extension {
        "jpg" => "image/jpeg",
        "svg" => "image/svg+xml",
        other => match other {
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "application/octet-stream",
        },
    };

    Ok(ImagePreviewResponse {
        data_url: format!(
            "data:{};base64,{}",
            mime_type,
            general_purpose::STANDARD.encode(bytes)
        ),
    })
}

fn save_temp_image(
    bytes: Vec<u8>,
    mime_type: Option<&str>,
    file_name: Option<&str>,
    prefix: &str,
) -> Result<SavePastedImageResponse, String> {
    if bytes.is_empty() {
        return Err("Изображение пустое.".to_string());
    }

    let extension = detect_image_extension(&bytes, mime_type, file_name)
        .ok_or_else(|| "Можно сохранять только изображения.".to_string())?;

    let target_folder = std::env::temp_dir()
        .join("notes-ketchup")
        .join("pasted-images");
    fs::create_dir_all(&target_folder).map_err(|error| {
        format!(
            "Не удалось создать временную папку для изображений {}: {}",
            target_folder.display(),
            error
        )
    })?;

    let timestamp = Local::now().format("%Y-%m-%d_%H%M%S%.3f").to_string();
    let target_name = match file_name {
        Some(file_name) => format!("{}_{}", timestamp, sanitize_file_name(file_name)),
        None => format!("{}-{}.{}", prefix, timestamp, extension),
    };
    let target = unique_path(&target_folder, &target_name);
    fs::write(&target, bytes).map_err(|error| {
        format!(
            "Не удалось сохранить изображение {}: {}",
            target.display(),
            error
        )
    })?;

    Ok(SavePastedImageResponse {
        path: target.display().to_string(),
    })
}

fn save_capture_to_vault(
    request: SaveCaptureRequest,
    vault_path: &Path,
) -> Result<SaveCaptureResponse, String> {
    let text = request.text.trim();
    if text.is_empty() && request.attachments.is_empty() {
        return Err("Напишите заметку или прикрепите файл.".to_string());
    }

    if !vault_path.exists() {
        return Err(format!("Vault не найден: {}", vault_path.display()));
    }

    let now = Local::now();
    let date_folder = format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day());
    let timestamp_for_file = now.format("%Y-%m-%d %H-%M-%S").to_string();
    let timestamp_compact = now.format("%Y-%m-%d_%H%M%S").to_string();

    let inbox_path = vault_path.join(INBOX_FOLDER);
    let assets_day_path = vault_path.join(ASSETS_FOLDER).join(&date_folder);
    fs::create_dir_all(&inbox_path).map_err(|error| {
        format!(
            "Не удалось создать папку Inbox {}: {}",
            inbox_path.display(),
            error
        )
    })?;
    fs::create_dir_all(&assets_day_path).map_err(|error| {
        format!(
            "Не удалось создать папку вложений {}: {}",
            assets_day_path.display(),
            error
        )
    })?;

    let copied_attachments = copy_attachments(
        &request.attachments,
        &assets_day_path,
        &date_folder,
        &timestamp_compact,
    )?;

    let note_path = unique_path(&inbox_path, &format!("{}.md", timestamp_for_file));
    let markdown = build_markdown(
        &timestamp_for_file,
        now.to_rfc3339().as_str(),
        text,
        &copied_attachments,
    );
    fs::write(&note_path, markdown).map_err(|error| {
        format!(
            "Не удалось сохранить заметку {}: {}",
            note_path.display(),
            error
        )
    })?;

    Ok(SaveCaptureResponse {
        note_path: note_path.display().to_string(),
        attachment_count: copied_attachments.len(),
    })
}

#[derive(Debug)]
struct CopiedAttachment {
    relative_path: String,
    is_image: bool,
}

fn copy_attachments(
    attachment_paths: &[String],
    assets_day_path: &Path,
    date_folder: &str,
    timestamp: &str,
) -> Result<Vec<CopiedAttachment>, String> {
    let mut copied = Vec::new();

    for attachment_path in attachment_paths {
        let source = PathBuf::from(attachment_path);
        if !source.exists() {
            return Err(format!("Файл не найден: {}", source.display()));
        }
        if !source.is_file() {
            return Err(format!(
                "Можно прикреплять только файлы: {}",
                source.display()
            ));
        }

        let original_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("Не удалось прочитать имя файла: {}", source.display()))?;
        let safe_name = sanitize_file_name(original_name);
        let target_name = format!("{}_{}", timestamp, safe_name);
        let target = unique_path(assets_day_path, &target_name);

        fs::copy(&source, &target).map_err(|error| {
            format!(
                "Не удалось скопировать {} в {}: {}",
                source.display(),
                target.display(),
                error
            )
        })?;

        let stored_file_name = target
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("Не удалось прочитать имя файла: {}", target.display()))?;

        copied.push(CopiedAttachment {
            relative_path: format!(
                "5 – Ресурсы/Notes Ketchup/{}/{}",
                date_folder, stored_file_name
            ),
            is_image: is_image_file(&target),
        });
    }

    Ok(copied)
}

fn build_markdown(
    title: &str,
    created: &str,
    text: &str,
    attachments: &[CopiedAttachment],
) -> String {
    let mut markdown = String::new();
    markdown.push_str("---\n");
    markdown.push_str(&format!("created: {}\n", created));
    markdown.push_str("source: notes-ketchup\n");
    markdown.push_str("status: inbox\n");
    markdown.push_str("---\n\n");
    markdown.push_str(&format!("# {}\n\n", title));

    if !attachments.is_empty() {
        for attachment in attachments {
            if attachment.is_image {
                markdown.push_str(&format!("![[{}]]\n", attachment.relative_path));
            } else {
                markdown.push_str(&format!("[[{}]]\n", attachment.relative_path));
            }
        }
        markdown.push('\n');
    }

    if !text.is_empty() {
        markdown.push_str(text);
        markdown.push_str("\n\n");
    }

    markdown
}

fn unique_path(folder: &Path, desired_file_name: &str) -> PathBuf {
    let desired = Path::new(desired_file_name);
    let stem = desired
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("capture");
    let extension = desired.extension().and_then(|value| value.to_str());

    let mut candidate = folder.join(desired_file_name);
    let mut counter = 2;

    while candidate.exists() {
        let next_name = match extension {
            Some(extension) => format!("{}-{}.{}", stem, counter, extension),
            None => format!("{}-{}", stem, counter),
        };
        candidate = folder.join(next_name);
        counter += 1;
    }

    candidate
}

fn sanitize_file_name(file_name: &str) -> String {
    let sanitized: String = file_name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect();

    let trimmed = sanitized.trim_matches(['.', ' ']).trim();
    if trimmed.is_empty() {
        "attachment".to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_image_file(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };

    extension_from_supported_image_extension(extension).is_some()
}

fn detect_image_extension(
    bytes: &[u8],
    mime_type: Option<&str>,
    file_name: Option<&str>,
) -> Option<&'static str> {
    if let Some(extension) = mime_type.and_then(extension_from_mime_type) {
        return Some(extension);
    }

    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }

    if let Some(file_name) = file_name {
        if let Some(extension) = Path::new(file_name)
            .extension()
            .and_then(|value| value.to_str())
        {
            return extension_from_supported_image_extension(extension);
        }
    }

    let trimmed_start = String::from_utf8_lossy(bytes);
    if trimmed_start.trim_start().starts_with("<svg") {
        return Some("svg");
    }

    None
}

fn extension_from_mime_type(mime_type: &str) -> Option<&'static str> {
    match mime_type.to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/bmp" => Some("bmp"),
        "image/svg+xml" => Some("svg"),
        _ => None,
    }
}

fn extension_from_supported_image_extension(extension: &str) -> Option<&'static str> {
    match extension.to_ascii_lowercase().as_str() {
        "png" => Some("png"),
        "jpg" | "jpeg" => Some("jpg"),
        "gif" => Some("gif"),
        "webp" => Some("webp"),
        "bmp" => Some("bmp"),
        "svg" => Some("svg"),
        _ => None,
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_capture,
            save_pasted_image,
            save_image_from_url,
            get_image_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running Notes Ketchup");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn saves_markdown_and_attachment_inside_vault() {
        let test_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_millis();
        let root = std::env::temp_dir().join(format!("notes-ketchup-test-{}", test_id));
        let source_file = root.join("source image.png");
        fs::create_dir_all(&root).expect("test root should be created");
        fs::write(&source_file, b"fake-image").expect("source file should be created");

        let response = save_capture_to_vault(
            SaveCaptureRequest {
                text: "Тестовая заметка".to_string(),
                attachments: vec![source_file.display().to_string()],
            },
            &root,
        )
        .expect("capture should be saved");

        let note = fs::read_to_string(&response.note_path).expect("note should be readable");
        assert!(note.contains("Тестовая заметка"));
        assert!(note.contains("source: notes-ketchup"));
        assert!(note.contains("![[5 – Ресурсы/Notes Ketchup/"));
        assert!(!note.contains("## Вложения"));
        let attachment_position = note
            .find("![[5 – Ресурсы/Notes Ketchup/")
            .expect("attachment should be embedded");
        let text_position = note
            .find("Тестовая заметка")
            .expect("text should be present");
        assert!(attachment_position < text_position);
        assert_eq!(response.attachment_count, 1);

        fs::remove_dir_all(&root).expect("test root should be removed");
    }
}
