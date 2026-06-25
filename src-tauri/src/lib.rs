use chrono::{Datelike, Local};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

const VAULT_PATH: &str = r"D:\Obsidian\notes-ketchup";
const INBOX_FOLDER: &str = "Inbox";
const ASSETS_FOLDER: &str = r"99 Assets\Notes Ketchup";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCaptureRequest {
    text: String,
    attachments: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveCaptureResponse {
    note_path: String,
    attachment_count: usize,
}

#[tauri::command]
fn save_capture(request: SaveCaptureRequest) -> Result<SaveCaptureResponse, String> {
    save_capture_to_vault(request, &PathBuf::from(VAULT_PATH))
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
    let markdown = build_markdown(&timestamp_for_file, now.to_rfc3339().as_str(), text, &copied_attachments);
    fs::write(&note_path, markdown)
        .map_err(|error| format!("Не удалось сохранить заметку {}: {}", note_path.display(), error))?;

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
            return Err(format!("Можно прикреплять только файлы: {}", source.display()));
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
                "99 Assets/Notes Ketchup/{}/{}",
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

    if !text.is_empty() {
        markdown.push_str(text);
        markdown.push_str("\n\n");
    }

    if !attachments.is_empty() {
        markdown.push_str("## Вложения\n\n");
        for attachment in attachments {
            if attachment.is_image {
                markdown.push_str(&format!("![[{}]]\n", attachment.relative_path));
            } else {
                markdown.push_str(&format!("- [[{}]]\n", attachment.relative_path));
            }
        }
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

    matches!(
        extension.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg"
    )
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
        .invoke_handler(tauri::generate_handler![save_capture])
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
        assert!(note.contains("![[99 Assets/Notes Ketchup/"));
        assert_eq!(response.attachment_count, 1);

        fs::remove_dir_all(&root).expect("test root should be removed");
    }
}
