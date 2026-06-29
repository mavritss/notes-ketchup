# Notes Ketchup

Notes Ketchup - небольшое Windows desktop-приложение для быстрых заметок в Obsidian vault.

Приложение живет поверх других окон, принимает текст и вложения, а затем создает обычный Markdown-файл в локальном vault. Obsidian может быть закрыт: Notes Ketchup работает напрямую с файловой системой.

## Что делает приложение

- показывает компактное окно без стандартной рамки;
- держит окно поверх остальных окон;
- позволяет написать текстовую заметку;
- позволяет прикрепить файлы через системный выбор файла;
- позволяет добавить изображения через `Ctrl+V`;
- позволяет добавить изображения через drag-and-drop как файлов, так и данных/ссылок из браузера и других программ;
- позволяет открыть отдельное окно скетча, переименовать его, нарисовать черным цветом, выбрать толщину и прикрепить PNG;
- позволяет сохранить заметку только с вложением, без текста;
- копирует вложения в папку assets внутри vault;
- создает Markdown-заметку с frontmatter и Obsidian-ссылками;
- в release-сборке запускается как Windows GUI-приложение без отдельного `cmd`-окна.

## Текущий vault

Путь сейчас зафиксирован в Rust-коде:

```text
D:\Obsidian\Second brain
```

Заметки создаются здесь:

```text
D:\Obsidian\Second brain\1 – Инбокс
```

Вложения копируются сюда:

```text
D:\Obsidian\Second brain\5 – Ресурсы\Notes Ketchup\YYYY-MM-DD
```

## Формат заметки

Имя заметки строится по локальной дате и времени:

```text
2026-06-25 18-42-10.md
```

Пример Markdown:

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

Текст заметки.

![[5 – Ресурсы/Notes Ketchup/2026-06-25/2026-06-25_184210_photo.png]]
[[5 – Ресурсы/Notes Ketchup/2026-06-25/2026-06-25_184210_document.pdf]]
```

Изображения вставляются через `![[...]]`, остальные файлы - через обычные Obsidian wiki-ссылки.

## Архитектура

Проект сделан на Tauri 2 без React/Svelte/Vue.

```text
notes-ketchup/
  index.html
  src/
    main.ts        # логика главного окна, вставка, drag-and-drop, создание sketch-окон, IPC-вызовы
    sketch.ts      # отдельное окно скетча, canvas, сохранение PNG
    styles.css     # внешний вид компактного окна
  icons/           # SVG-иконки кнопок
  src-tauri/
    src/main.rs    # entrypoint; release Windows GUI subsystem
    src/lib.rs     # Tauri commands, запись заметок, копирование вложений
    tauri.conf.json
    capabilities/default.json
    Cargo.toml
```

Frontend:

- `index.html` содержит статическую разметку окна.
- `src/main.ts` управляет состоянием формы и вызывает Rust-команды через Tauri IPC.
- `src/styles.css` отвечает за компактный вид главного окна, toolbar, статусы, подсветку drag-and-drop и окно скетча.

Backend:

- `save_capture` создает Markdown-заметку и копирует вложения в vault.
- `save_pasted_image` принимает байты изображения из буфера, сохраняет временный файл, после чего он идет в общий поток вложений.
- `save_image_from_url` скачивает изображение по URL из browser drag-and-drop без CORS-ограничений WebView.
- `unique_path` защищает от перезаписи файлов.
- `sanitize_file_name` чистит имена вложений.
- `is_image_file` определяет, вставлять ли вложение как Obsidian image embed.
- `build_markdown` пишет нейтральную inbox-заготовку frontmatter (`type: note`, `folder_id: inbox`, пустые `tags/topics/domains/related`, пустой `summary`) для последующего triage.

## Управление

- `Ctrl+Enter` - сохранить заметку.
- Кнопка со стрелкой - сохранить заметку.
- Кнопка файла - выбрать вложения через системный диалог.
- `Ctrl+V` - вставить изображение из буфера.
- Drag-and-drop изображения в окно - добавить изображение как вложение.
- Кнопка скетча - открыть отдельное окно `sketch-YYYY-MM-DD_HH-MM-SS`, изменить название, нарисовать черным цветом, выбрать толщину и сохранить PNG как вложение.

Кнопка микрофона пока остается заготовкой.

## Сборка

В этой рабочей машине Rust установлен в пользовательской папке:

```text
C:\Users\tema mavrits\.cargo\bin
```

Для надежной сборки Tauri под Windows команды нужно запускать через Visual Studio developer environment:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run build"
```

Для dev-режима:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && set PATH=C:\Users\tema mavrits\.cargo\bin;%PATH% && npm.cmd run dev"
```

Обычный PowerShell может не видеть `cargo`, даже если Rust установлен. Это не значит, что Rust отсутствует: используйте команду выше.

## Артефакты сборки

Готовый exe:

```text
src-tauri\target\release\notes-ketchup.exe
```

NSIS-установщик:

```text
src-tauri\target\release\bundle\nsis\Notes Ketchup_0.1.0_x64-setup.exe
```

MSI-установщик:

```text
src-tauri\target\release\bundle\msi\Notes Ketchup_0.1.0_x64_en-US.msi
```

Release exe должен иметь subsystem `Windows GUI`, а не `Windows CUI`. Это проверяется так:

```powershell
cmd /c "call ""C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"" -arch=x64 && dumpbin /headers src-tauri\target\release\notes-ketchup.exe | findstr /i subsystem"
```

Ожидаемая строка:

```text
2 subsystem (Windows GUI)
```

## Проверка после изменений

1. Собрать приложение командой из раздела "Сборка".
2. Запустить `src-tauri\target\release\notes-ketchup.exe`.
3. Убедиться, что пустое `cmd`-окно не появляется.
4. Ввести текст и сохранить заметку.
5. Прикрепить файл через кнопку файла и сохранить.
6. Вставить картинку через `Ctrl+V` и сохранить заметку без текста.
7. Перетащить картинку-файл в окно и сохранить заметку без текста.
8. Перетащить изображение из браузера или другой программы. Если источник передал файл/blob/data-url или прямую ссылку на изображение, оно добавится как вложение.
9. Создать скетч кнопкой скетча, изменить название окна, сохранить его и убедиться, что PNG с этим названием появился в списке вложений.
10. Проверить, что `.md` появился в `D:\Obsidian\Second brain\1 – Инбокс`.
11. Проверить, что вложения появились в `5 – Ресурсы\Notes Ketchup\YYYY-MM-DD`.
12. Открыть заметку в Obsidian и проверить, что image embeds отображаются.

## Скетчи

Базовый режим скетчей уже реализован в отдельном Tauri-окне:

1. Кнопка скетча открывает отдельное окно `sketch-YYYY-MM-DD_HH-MM-SS`.
2. Название в окне можно изменить; оно становится именем PNG-файла.
3. Рисование работает черным цветом.
4. Можно выбрать толщину линии.
5. Можно очистить холст, закрыть окно без сохранения или сохранить.
6. При сохранении canvas экспортируется в PNG и добавляется как обычное image-вложение к текущей заметке.

Следующие улучшения:

1. Ластик.
2. Undo/redo.
3. Цвета.
4. Сохранение JSON-исходника рядом с PNG для будущего редактирования.
5. Открытие существующего скетча и автосохранение черновика.

Не нужно добавлять React/Svelte только ради скетчей. Текущей архитектуры HTML/CSS/TypeScript достаточно.
