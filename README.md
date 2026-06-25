# Notes Ketchup

Notes Ketchup - небольшое Windows desktop-приложение для быстрых заметок в Obsidian vault.

Приложение живет поверх других окон, принимает текст и вложения, а затем создает обычный Markdown-файл в локальном vault. Obsidian может быть закрыт: Notes Ketchup работает напрямую с файловой системой.

## Что делает приложение

- показывает компактное окно без стандартной рамки;
- держит окно поверх остальных окон;
- позволяет написать текстовую заметку;
- позволяет прикрепить файлы через системный выбор файла;
- позволяет добавить изображения через `Ctrl+V`;
- позволяет добавить изображения через drag-and-drop;
- позволяет сохранить заметку только с вложением, без текста;
- копирует вложения в папку assets внутри vault;
- создает Markdown-заметку с frontmatter и Obsidian-ссылками;
- в release-сборке запускается как Windows GUI-приложение без отдельного `cmd`-окна.

## Текущий vault

Путь сейчас зафиксирован в Rust-коде:

```text
D:\Obsidian\notes-ketchup
```

Заметки создаются здесь:

```text
D:\Obsidian\notes-ketchup\Inbox
```

Вложения копируются сюда:

```text
D:\Obsidian\notes-ketchup\99 Assets\Notes Ketchup\YYYY-MM-DD
```

## Формат заметки

Имя заметки строится по локальной дате и времени:

```text
2026-06-25 18-42-10.md
```

Пример Markdown:

```markdown
---
created: 2026-06-25T18:42:10+05:00
source: notes-ketchup
status: inbox
---

# 2026-06-25 18-42-10

Текст заметки.

## Вложения

![[99 Assets/Notes Ketchup/2026-06-25/2026-06-25_184210_photo.png]]
- [[99 Assets/Notes Ketchup/2026-06-25/2026-06-25_184210_document.pdf]]
```

Изображения вставляются через `![[...]]`, остальные файлы - через обычные Obsidian wiki-ссылки.

## Архитектура

Проект сделан на Tauri 2 без React/Svelte/Vue.

```text
notes-ketchup/
  index.html
  src/
    main.ts        # логика интерфейса, вставка, drag-and-drop, IPC-вызовы
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
- `src/styles.css` отвечает за компактный вид, toolbar, статусы и подсветку drag-and-drop.

Backend:

- `save_capture` создает Markdown-заметку и копирует вложения в vault.
- `save_pasted_image` принимает байты изображения из буфера, сохраняет временный файл, после чего он идет в общий поток вложений.
- `unique_path` защищает от перезаписи файлов.
- `sanitize_file_name` чистит имена вложений.
- `is_image_file` определяет, вставлять ли вложение как Obsidian image embed.

## Управление

- `Ctrl+Enter` - сохранить заметку.
- Кнопка со стрелкой - сохранить заметку.
- Кнопка файла - выбрать вложения через системный диалог.
- `Ctrl+V` - вставить изображение из буфера.
- Drag-and-drop изображения в окно - добавить изображение как вложение.

Кнопки микрофона и скетча пока остаются заготовками.

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
7. Перетащить картинку в окно и сохранить заметку без текста.
8. Проверить, что `.md` появился в `D:\Obsidian\notes-ketchup\Inbox`.
9. Проверить, что вложения появились в `99 Assets\Notes Ketchup\YYYY-MM-DD`.
10. Открыть заметку в Obsidian и проверить, что image embeds отображаются.

## Ближайший план: скетчи

Рекомендуемый путь реализации:

1. Включить кнопку скетча и открывать отдельное Tauri-окно или отдельный режим рисования.
2. Сделать canvas-редактор без смены frontend-стека: ручка, ластик, цвет, толщина, undo/redo, очистить, сохранить, отменить.
3. При сохранении экспортировать canvas в PNG и добавлять его в текущую заметку как обычное изображение-вложение.
4. Дополнительно сохранять JSON-исходник скетча рядом с PNG, чтобы позже можно было редактировать рисунок.
5. На следующем этапе добавить открытие существующего скетча и автосохранение черновика.

Не нужно добавлять React/Svelte только ради скетчей. Текущей архитектуры HTML/CSS/TypeScript достаточно.
