# Notes Ketchup

Notes Ketchup is a small local Windows desktop application for quick notes in an Obsidian vault.

The application stays on top of other windows, accepts text and attachments, and then creates a regular Markdown file in a local vault. Obsidian can be closed: Notes Ketchup works directly with the file system.

## What The Application Does

- shows a compact frameless main window;
- keeps the main and sketch windows on top of other windows;
- lets the main window be moved by its inner padding and resized manually;
- lets you write a text note;
- lets you attach files through the system file picker;
- lets you add images through `Ctrl+V`;
- lets you add images through HTML5 drag-and-drop, both as files and as data/links from the browser and other programs;
- lets you save a note with an attachment only, without text;
- copies attachments into the assets folder inside the vault;
- creates a Markdown note with frontmatter and Obsidian links;
- opens a separate resizable sketch window with marker, water marker, eraser, undo/redo, clear, copy, background color, and add-to-note actions;
- in the release build, starts as a Windows GUI application without a separate `cmd` window.

## Current Vault

The path is currently fixed in Rust code:

```text
D:\Obsidian\Second brain
```

Notes are created here:

```text
D:\Obsidian\Second brain\1 – Инбокс
```

Attachments are copied here:

```text
D:\Obsidian\Second brain\5 – Ресурсы\Notes Ketchup\YYYY-MM-DD
```

## Note Format

The note name is built from the local date and time:

```text
2026-06-25 18-42-10.md
```

Markdown example:

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

![[5 – Ресурсы/Notes Ketchup/2026-06-25/2026-06-25_184210_photo.png]]
[[5 – Ресурсы/Notes Ketchup/2026-06-25/2026-06-25_184210_document.pdf]]

Note text.
```

Images are inserted through `![[...]]`; all other files are inserted through regular Obsidian wiki links.

## Architecture

The project is built with Tauri 2 without React/Svelte/Vue.

```text
notes-ketchup/
  index.html
  sketch.html
  src/
    main.ts        # main window logic, paste, drag-and-drop, sketch window creation, IPC calls
    sketch.ts      # separate sketch window, canvas drawing, PNG copy/save
    styles.css     # main window and sketch window appearance
  icons/           # button icons and sketch tool images
  src-tauri/
    src/main.rs    # entrypoint; release Windows GUI subsystem
    src/lib.rs     # Tauri commands, note writing, attachment copying
    tauri.conf.json
    capabilities/default.json
    Cargo.toml
```

Frontend:

- `index.html` contains the static main window markup.
- `sketch.html` contains the static sketch window markup.
- `src/main.ts` manages main-window form state and calls Rust commands through Tauri IPC.
- `src/sketch.ts` manages canvas drawing, sketch history, copying, and saving.
- `src/styles.css` handles the compact appearance of both windows, toolbar controls, statuses, drag-and-drop highlighting, and sketch controls.

Backend:

- `save_capture` creates a Markdown note and copies attachments into the vault.
- `save_pasted_image` accepts image bytes from the clipboard, dropped files/data URLs, and sketch PNGs, then saves a temporary file for the shared attachment flow.
- `save_image_from_url` downloads an image by URL from browser drag-and-drop without WebView CORS limitations.
- `get_image_preview` returns a data URL for image attachment previews.
- `unique_path` protects against overwriting files.
- `sanitize_file_name` cleans attachment file names.
- `is_image_file` determines whether an attachment should be inserted as an Obsidian image embed.
- `build_markdown` writes a neutral inbox frontmatter draft (`type: note`, `folder_id: inbox`, empty `tags/topics/domains/related`, empty `summary`) for later triage.

## Controls

- `Ctrl+Enter` - save the note from the main window.
- Arrow button - save the note.
- File button - choose attachments through the system dialog.
- `Ctrl+V` - paste an image from the clipboard.
- Drag-and-drop an image into the main window - add the image as an attachment.
- Sketch button - open a separate sketch window.
- In the sketch window: draw with marker/water marker/eraser, adjust size and colors, undo/redo, clear, copy PNG, close without saving, or add PNG to the current note.

The microphone button is still a placeholder.

## Build

On this workstation, Rust is installed in the user folder:

```text
C:\Users\tema mavrits\.cargo\bin
```

For reliable Tauri builds on Windows, commands must be run through the Visual Studio developer environment:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run build"
```

For dev mode:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run dev"
```

A regular PowerShell session may not see `cargo`, even if Rust is installed. This does not mean Rust is missing: use the command above.

## Build Artifacts

Ready exe:

```text
src-tauri\target\release\notes-ketchup.exe
```

NSIS installer:

```text
src-tauri\target\release\bundle\nsis\Notes Ketchup_0.1.0_x64-setup.exe
```

MSI installer:

```text
src-tauri\target\release\bundle\msi\Notes Ketchup_0.1.0_x64_en-US.msi
```

The release exe must have the `Windows GUI` subsystem, not `Windows CUI`. This is checked as follows:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && dumpbin /headers src-tauri\target\release\notes-ketchup.exe | findstr /i subsystem"
```

Expected line:

```text
2 subsystem (Windows GUI)
```

## Check After Changes

1. Build the application with the command from the "Build" section.
2. Run `src-tauri\target\release\notes-ketchup.exe`.
3. Make sure an empty `cmd` window does not appear.
4. Enter text and save a note.
5. Attach a file through the file button and save.
6. Paste an image through `Ctrl+V` and save a note without text.
7. Drag an image file into the window and save a note without text.
8. Drag an image from the browser or another program. If the source provides a file/blob/data-url or a direct image link, it will be added as an attachment.
9. Create a sketch with the sketch button, draw something, save it, and make sure a PNG appears in the attachment list.
10. Check that the `.md` file appeared in `D:\Obsidian\Second brain\1 – Инбокс`.
11. Check that attachments appeared in `5 – Ресурсы\Notes Ketchup\YYYY-MM-DD`.
12. Open the note in Obsidian and make sure image embeds are displayed.

## Sketches

The sketch mode is implemented in a separate Tauri window backed by `sketch.html` and `src/sketch.ts`.

Current behavior:

1. The sketch button opens a separate resizable sketch window.
2. The canvas keeps its content while the sketch window is resized.
3. Drawing supports marker, water marker, and eraser tools.
4. Stroke width, stroke color, and background color can be selected.
5. Undo/redo, clear, copy image, close without saving, and add sketch actions are available.
6. On add, the canvas is exported to PNG and added as a regular image attachment to the current note.

Possible next improvements:

1. Editable sketch names.
2. Saving the JSON source next to the PNG for future editing.
3. Opening an existing sketch and autosaving a draft.

Do not add React/Svelte just for sketches. The current HTML/CSS/TypeScript architecture is enough.
