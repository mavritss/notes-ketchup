# AGENTS.md

A guide for AI assistants continuing development of Notes Ketchup.

## Project Essence

Notes Ketchup is a local Windows desktop application built with Tauri 2 for quickly capturing notes into an Obsidian vault.

The main goal is to quickly and reliably save text and attachments into a local vault, without losing anything, without requiring Obsidian to be running, and without overcomplicating the stack.

The current vault is hardcoded in Rust:

```text
D:\Obsidian\Second brain
```

## Do Not Change Without An Explicit Request

- Do not migrate the project to React, Svelte, Vue, or any other framework.
- Do not replace Tauri with Electron.
- Do not add a backend server.
- Do not add cloud sync, AI note organization, Git automation, or an Obsidian plugin unless the user directly asks for it.
- Do not change the Markdown format or vault folders without discussion.
- Do not do broad refactors for personal taste. Changes must be small and compatible with the current architecture.

## Current Stack

- Tauri 2
- Rust backend
- TypeScript frontend
- Vite
- Plain HTML/CSS without a frontend framework
- `tauri-plugin-dialog` for file selection
- `ureq` for backend image downloads by URL from browser drag-and-drop

## Important Files

```text
index.html
sketch.html
src/main.ts
src/sketch.ts
src/styles.css
src-tauri/src/main.rs
src-tauri/src/lib.rs
src-tauri/tauri.conf.json
src-tauri/capabilities/default.json
src-tauri/Cargo.toml
README.md
```

## How The Application Works

`index.html` contains one compact main window:

- a textarea for the note;
- an attachment list;
- a status line;
- a toolbar with microphone, file, sketch, and submit buttons.

`src/main.ts`:

- stores `attachmentPaths`;
- enables the submit button if there is text or at least one attachment;
- supports `Ctrl+Enter` for saving from the main window;
- opens the system file picker through `@tauri-apps/plugin-dialog`;
- accepts images from the clipboard through `Ctrl+V`;
- accepts local image files through HTML5 drag-and-drop;
- accepts images dragged from the browser or other programs through HTML5 drop; for this, the main window has `dragDropEnabled: false`;
- saves file/blob/data-url images through `save_pasted_image`;
- saves http/https image URLs through the Rust command `save_image_from_url`, so it does not run into CORS limitations;
- opens a separate sketch window, receives the saved PNG, and adds it to the current attachments;
- calls the Rust commands `save_capture`, `save_pasted_image`, `save_image_from_url`, and `get_image_preview`;
- clears the form only after a successful save.

`sketch.html` and `src/sketch.ts`:

- implement a separate resizable sketch window;
- use native HTML canvas without a drawing library;
- provide marker, water marker, eraser, brush size, stroke color, background color, undo/redo, clear, copy, save, and close controls;
- export PNG on copy/save;
- send a `sketch-saved` event to the main window after saving through `save_pasted_image`.

`src-tauri/src/lib.rs`:

- `save_capture` creates a Markdown note;
- `save_pasted_image` saves an image into a temporary folder;
- `save_image_from_url` downloads an image by URL and saves it as a temporary file;
- `get_image_preview` returns preview data for image attachments;
- `save_pasted_image` is also used for file/blob/data-url drop images and sketch PNGs;
- `copy_attachments` copies all attachments into the vault assets folder;
- `build_markdown` generates the frontmatter, title, attachments without a separate heading, and text;
- `is_image_file` decides whether a link should be an image embed or a regular wiki link.

`src-tauri/src/main.rs` contains:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

This line is needed so the release `.exe` starts without an empty system `cmd` window. Do not remove it.

## Data Format

Notes:

```text
D:\Obsidian\Second brain\1 – Инбокс\YYYY-MM-DD HH-MM-SS.md
```

Attachments:

```text
D:\Obsidian\Second brain\5 – Ресурсы\Notes Ketchup\YYYY-MM-DD\YYYY-MM-DD_HHMMSS_original-name.ext
```

Markdown:

```markdown
---
type: note
status: inbox
folder_id: inbox
created: 2026-06-25T18:42:10+05:00
updated: 2026-06-25T18:42:10+05:00
source: notes-ketchup
domains: []
topics: []
tags: []
summary: ""
related: []
---

# 2026-06-25 18-42-10

![[5 – Ресурсы/Notes Ketchup/2026-06-25/image.png]]
[[5 – Ресурсы/Notes Ketchup/2026-06-25/file.pdf]]

Note text.
```

New capture notes must remain neutral: do not infer tags, domains, topics, or the final type when saving from Notes Ketchup. These fields are filled in later by the triage process in Obsidian/Codex.

## Build On This Machine

A regular PowerShell session may not see `cargo`. Use the Visual Studio developer environment:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run build"
```

Dev mode:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run dev"
```

Ready exe:

```text
src-tauri\target\release\notes-ketchup.exe
```

Installers:

```text
src-tauri\target\release\bundle\nsis\Notes Ketchup_0.1.0_x64-setup.exe
src-tauri\target\release\bundle\msi\Notes Ketchup_0.1.0_x64_en-US.msi
```

## Checks Before Handoff

Minimum:

```powershell
npm.cmd run build:vite
```

Better:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run build"
```

Check that the release exe has no console:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && dumpbin /headers src-tauri\target\release\notes-ketchup.exe | findstr /i subsystem"
```

Expected:

```text
2 subsystem (Windows GUI)
```

## UX Rules

- The windows are compact, utilitarian, and have no landing page.
- Do not add large decorative blocks.
- Do not break always-on-top mode.
- The main window can be moved by its inner padding without changing the cursor.
- The main and sketch windows are resizable.
- Saving is allowed if there is text or an attachment.
- On error, do not clear the textarea or the attachment list.
- After success, clear the textarea and attachment list.
- Status messages must be short and clear.

## Current Features

- Text note.
- Attachments through the file button.
- Images through `Ctrl+V`.
- Image files through HTML5 drag-and-drop.
- Images from the browser or other programs through DOM drop: file/blob/data-url images are saved directly, while http/https URLs are downloaded by a Rust command.
- Note with attachment only.
- `Ctrl+Enter` save hotkey in the main window.
- Basic sketches in a separate window: marker/water marker/eraser, size selection, stroke color, background color, undo/redo, clear, copy image, close without saving, save PNG into attachments.
- Release exe without a separate `cmd`.

## Sketches

The sketch mode is implemented as a separate Vite page, `sketch.html`, with code in `src/sketch.ts`.

Current architecture:

- the main window creates a `WebviewWindow` with label `sketch-*`;
- capabilities must include `core:webview:allow-create-webview-window`, `core:window:allow-close`, and `core:window:allow-start-dragging`;
- HTML canvas is used;
- closing the window saves nothing;
- current tools: marker, water marker, eraser, size, stroke color, background color, undo/redo, clear, copy, save, close;
- on copy/save, export PNG;
- the PNG is saved through `save_pasted_image`, and then the sketch window sends a `sketch-saved` event to `main`.

Next steps:

- editable sketch names;
- save the JSON source next to the PNG for editing;
- open existing sketches.

Do not add a separate drawing library until it is clear that the native canvas implementation is not enough.
