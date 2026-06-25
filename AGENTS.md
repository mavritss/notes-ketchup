# AGENTS.md

Подсказка для ИИ-ассистентов, которые продолжают разработку Notes Ketchup.

## Суть проекта

Notes Ketchup - локальное Windows desktop-приложение на Tauri 2 для быстрых заметок в Obsidian vault.

Главная цель: быстро и надежно записать текст/вложения в локальный vault, ничего не потерять, не требовать запущенный Obsidian, не усложнять стек.

Текущий vault жестко задан в Rust:

```text
D:\Obsidian\notes-ketchup
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
- принимает картинки через Tauri drag-and-drop;
- вызывает Rust-команды `save_capture` и `save_pasted_image`;
- очищает форму только после успешного сохранения.

`src-tauri/src/lib.rs`:

- `save_capture` создает Markdown-заметку;
- `save_pasted_image` сохраняет вставленную из буфера картинку во временную папку;
- `copy_attachments` копирует все вложения в assets-папку vault;
- `build_markdown` формирует frontmatter, заголовок, текст и секцию вложений;
- `is_image_file` решает, будет ли ссылка image embed или обычной wiki-ссылкой.

`src-tauri/src/main.rs` содержит:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

Эта строка нужна, чтобы release `.exe` запускался без пустого системного `cmd`-окна. Не удалять.

## Формат данных

Заметки:

```text
D:\Obsidian\notes-ketchup\Inbox\YYYY-MM-DD HH-MM-SS.md
```

Вложения:

```text
D:\Obsidian\notes-ketchup\99 Assets\Notes Ketchup\YYYY-MM-DD\YYYY-MM-DD_HHMMSS_original-name.ext
```

Markdown:

```markdown
---
created: 2026-06-25T18:42:10+05:00
source: notes-ketchup
status: inbox
---

# 2026-06-25 18-42-10

Текст заметки.

## Вложения

![[99 Assets/Notes Ketchup/2026-06-25/image.png]]
- [[99 Assets/Notes Ketchup/2026-06-25/file.pdf]]
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
- Картинки через drag-and-drop.
- Заметка только с вложением.
- Release exe без отдельного `cmd`.

## План скетчей

Реализовывать внутри текущего plain TypeScript frontend.

Рекомендуемая архитектура:

- открыть отдельное Tauri-окно или режим `sketch`;
- использовать HTML canvas;
- хранить strokes в памяти как массив команд;
- инструменты: pen, eraser, color, size, undo, redo, clear, save, cancel;
- при сохранении экспортировать PNG;
- отправлять PNG в тот же pipeline вложений, что и вставленные изображения;
- позже сохранять JSON-исходник рядом с PNG для редактирования.

Не добавлять отдельную библиотеку рисования, пока не станет ясно, что native canvas-реализации недостаточно.
