# AGENTS.md

Подсказка для ИИ-ассистентов, которые продолжают разработку Notes Ketchup.

## Суть проекта

Notes Ketchup - локальное Windows desktop-приложение на Tauri 2 для быстрых заметок в Obsidian vault.

Главная цель: быстро и надежно записать текст/вложения в локальный vault, ничего не потерять, не требовать запущенный Obsidian, не усложнять стек.

Текущий vault жестко задан в Rust:

```text
D:\Obsidian\Second brain
```

## Не менять без явного запроса

- Не переводить проект на React, Svelte, Vue или другой framework.
- Не заменять Tauri на Electron.
- Не добавлять backend-сервер.
- Не добавлять облачную синхронизацию, AI-организацию заметок, Git-автоматизацию или Obsidian-плагин без прямого запроса пользователя.
- Не менять формат Markdown и папки vault без обсуждения.
- Не делать широкие рефакторы ради вкуса. Изменения должны быть маленькими и совместимыми с текущей архитектурой.

## Текущий стек

- Tauri 2
- Rust backend
- TypeScript frontend
- Vite
- Plain HTML/CSS без frontend-framework
- `tauri-plugin-dialog` для выбора файлов
- `ureq` для backend-загрузки изображений по URL из browser drag-and-drop

## Важные файлы

```text
index.html
src/main.ts
src/styles.css
src-tauri/src/main.rs
src-tauri/src/lib.rs
src-tauri/tauri.conf.json
src-tauri/capabilities/default.json
src-tauri/Cargo.toml
README.md
```

## Как работает приложение

`index.html` содержит одно компактное окно:

- textarea для заметки;
- список вложений;
- строку статуса;
- toolbar с кнопками микрофона, файла, скетча и отправки.

`src/main.ts`:

- хранит `attachmentPaths`;
- включает кнопку отправки, если есть текст или хотя бы одно вложение;
- открывает системный выбор файлов через `@tauri-apps/plugin-dialog`;
- принимает картинки из буфера через `Ctrl+V`;
- принимает локальные картинки через Tauri drag-and-drop;
- принимает изображения, перетащенные из браузера/других программ, через HTML5 drop; для этого у main window `dragDropEnabled: false`;
- сохраняет file/blob/data-url на frontend через `save_pasted_image`;
- сохраняет http/https image URL через Rust-команду `save_image_from_url`, чтобы не упираться в CORS;
- открывает отдельное sketch-окно, сохраняет PNG и добавляет его в текущие вложения;
- вызывает Rust-команды `save_capture` и `save_pasted_image`;
- очищает форму только после успешного сохранения.

`src-tauri/src/lib.rs`:

- `save_capture` создает Markdown-заметку;
- `save_pasted_image` сохраняет вставленную из буфера картинку во временную папку;
- `save_image_from_url` скачивает картинку по URL и сохраняет временный файл;
- `save_pasted_image` также используется для file/blob/data-url drop-изображений и sketch PNG;
- `copy_attachments` копирует все вложения в assets-папку vault;
- `build_markdown` формирует frontmatter, заголовок, вложения без отдельного заголовка и текст;
- `is_image_file` решает, будет ли ссылка image embed или обычной wiki-ссылкой.

`src-tauri/src/main.rs` содержит:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

Эта строка нужна, чтобы release `.exe` запускался без пустого системного `cmd`-окна. Не удалять.

## Формат данных

Заметки:

```text
D:\Obsidian\Second brain\1 – Инбокс\YYYY-MM-DD HH-MM-SS.md
```

Вложения:

```text
D:\Obsidian\Second brain\5 – Ресурсы\Notes Ketchup\YYYY-MM-DD\YYYY-MM-DD_HHMMSS_original-name.ext
```

Markdown:

```markdown
---
created: 2026-06-25T18:42:10+05:00
source: notes-ketchup
status: inbox
---

# 2026-06-25 18-42-10

![[5 – Ресурсы/Notes Ketchup/2026-06-25/image.png]]
[[5 – Ресурсы/Notes Ketchup/2026-06-25/file.pdf]]

Текст заметки.
```

## Сборка на этой машине

Обычная PowerShell-сессия может не видеть `cargo`. Используйте Visual Studio developer environment:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run build"
```

Dev-режим:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run dev"
```

Готовый exe:

```text
src-tauri\target\release\notes-ketchup.exe
```

Установщики:

```text
src-tauri\target\release\bundle\nsis\Notes Ketchup_0.1.0_x64-setup.exe
src-tauri\target\release\bundle\msi\Notes Ketchup_0.1.0_x64_en-US.msi
```

## Проверки перед сдачей

Минимум:

```powershell
npm.cmd run build:vite
```

Лучше:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run build"
```

Проверка, что release exe без консоли:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && dumpbin /headers src-tauri\target\release\notes-ketchup.exe | findstr /i subsystem"
```

Ожидаемо:

```text
2 subsystem (Windows GUI)
```

## UX-правила

- Окно компактное, утилитарное, без landing page.
- Не добавлять большие декоративные блоки.
- Не ломать режим always-on-top.
- Сохранять можно, если есть текст или вложение.
- При ошибке не очищать textarea и список вложений.
- После успеха очищать textarea и список вложений.
- Статусы должны быть короткими и понятными.

## Текущие возможности

- Текстовая заметка.
- Вложения через кнопку файла.
- Картинки через `Ctrl+V`.
- Картинки-файлы через HTML5 drag-and-drop.
- Картинки из браузера/других программ через DOM drop: file/blob/data-url сохраняются напрямую, http/https URL скачиваются Rust-командой.
- Заметка только с вложением.
- Базовые скетчи в отдельном окне: редактируемое название, черный цвет, выбор толщины, очистка, закрытие без сохранения, сохранение PNG во вложения.
- Release exe без отдельного `cmd`.

## Скетчи

Базовый sketch-режим уже реализован как отдельная Vite-страница `sketch.html` с кодом в `src/sketch.ts`.

Текущая архитектура:

- главное окно создает `WebviewWindow` с label `sketch-*`;
- capabilities должны включать `core:webview:allow-create-webview-window`, `core:window:allow-close`, `core:window:allow-set-title`;
- используется HTML canvas;
- название скетча редактируется в input и синхронизируется с title окна;
- закрытие окна ничего не сохраняет;
- инструменты сейчас: black pen, size, clear, save, close;
- при сохранении экспортировать PNG;
- PNG сохраняется через `save_pasted_image`, а затем sketch-окно отправляет событие `sketch-saved` в `main`.

Следующие шаги:

- eraser;
- undo/redo;
- colors;
- сохранять JSON-исходник рядом с PNG для редактирования;
- открывать существующие скетчи.

Не добавлять отдельную библиотеку рисования, пока не станет ясно, что native canvas-реализации недостаточно.
