import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

type SaveCaptureResponse = {
  notePath: string;
  attachmentCount: number;
};

type SavePastedImageResponse = {
  path: string;
};

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`UI element not found: ${selector}`);
  }
  return element;
}

const noteInput = getRequiredElement<HTMLTextAreaElement>("#noteInput");
const captureCard = getRequiredElement<HTMLElement>("#captureCard");
const attachButton = getRequiredElement<HTMLButtonElement>("#attachButton");
const sendButton = getRequiredElement<HTMLButtonElement>("#sendButton");
const attachmentsEl = getRequiredElement<HTMLDivElement>("#attachments");
const statusEl = getRequiredElement<HTMLParagraphElement>("#status");
const appWindow = getCurrentWindow();

let attachmentPaths: string[] = [];
let isSaving = false;
let statusTimer: number | undefined;

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isImageFileName(file.name);
}

function getClipboardImageFiles(data: DataTransfer | null): File[] {
  const files = Array.from(data?.files ?? []).filter(isImageFile);
  if (files.length > 0) {
    return files;
  }

  return Array.from(data?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
    .filter(isImageFile);
}

function canSend(): boolean {
  return (noteInput.value.trim().length > 0 || attachmentPaths.length > 0) && !isSaving;
}

function updateSendState() {
  sendButton.disabled = !canSend();
}

function renderAttachments() {
  attachmentsEl.replaceChildren();
  attachmentsEl.hidden = attachmentPaths.length === 0;

  for (const path of attachmentPaths) {
    const item = document.createElement("div");
    item.className = "attachment";

    const name = document.createElement("span");
    name.textContent = fileNameFromPath(path);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "Убрать файл";
    remove.ariaLabel = `Убрать ${name.textContent}`;
    remove.addEventListener("click", () => {
      attachmentPaths = attachmentPaths.filter((existing) => existing !== path);
      renderAttachments();
      updateSendState();
    });

    item.append(name, remove);
    attachmentsEl.append(item);
  }
}

function addAttachmentPaths(paths: string[], message?: string) {
  const nextPaths = paths.filter(Boolean);
  if (nextPaths.length === 0) {
    return;
  }

  attachmentPaths = Array.from(new Set([...attachmentPaths, ...nextPaths]));
  renderAttachments();
  updateSendState();

  if (message) {
    setStatus(message, "success", true);
  } else {
    setStatus("");
  }
}

function clearStatusLater() {
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusEl.textContent = "";
    statusEl.dataset.kind = "idle";
  }, 3000);
}

function setStatus(
  message: string,
  kind: "idle" | "success" | "error" = "idle",
  autoClear = false
) {
  window.clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;

  if (autoClear && message) {
    clearStatusLater();
  }
}

function setSaving(nextSaving: boolean) {
  isSaving = nextSaving;
  attachButton.disabled = nextSaving;
  sendButton.classList.toggle("is-saving", nextSaving);
  updateSendState();
}

function startWindowDrag(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  void appWindow.startDragging();
}

document.querySelectorAll<HTMLElement>("[data-drag-handle]").forEach((element) => {
  element.addEventListener("pointerdown", startWindowDrag);
});

async function savePastedImage(file: File): Promise<string> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const result = await invoke<SavePastedImageResponse>("save_pasted_image", {
    request: {
      bytes,
      mimeType: file.type || null,
      fileName: file.name || null
    }
  });

  return result.path;
}

async function addPastedImages(files: File[]) {
  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0 || isSaving) {
    return;
  }

  setStatus("Добавляю изображение...");

  try {
    const savedPaths = await Promise.all(imageFiles.map(savePastedImage));
    addAttachmentPaths(savedPaths, imageFiles.length === 1 ? "Изображение добавлено" : "Изображения добавлены");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error", true);
  }
}

document.addEventListener("paste", (event) => {
  const files = getClipboardImageFiles(event.clipboardData);
  if (files.length === 0) {
    return;
  }

  event.preventDefault();
  void addPastedImages(files);
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
});

void appWindow.onDragDropEvent(({ payload }) => {
  if (payload.type === "enter" || payload.type === "over") {
    captureCard.classList.add("is-drag-over");
    return;
  }

  captureCard.classList.remove("is-drag-over");

  if (payload.type !== "drop" || isSaving) {
    return;
  }

  const imagePaths = payload.paths.filter(isImageFileName);
  if (imagePaths.length === 0) {
    setStatus("Перетащите изображение PNG, JPG, GIF, WEBP, BMP или SVG", "error", true);
    return;
  }

  addAttachmentPaths(imagePaths, imagePaths.length === 1 ? "Изображение добавлено" : "Изображения добавлены");
});

attachButton.addEventListener("click", async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Выберите файлы для заметки"
    });

    if (!selected) return;

    const selectedPaths = Array.isArray(selected) ? selected : [selected];
    addAttachmentPaths(selectedPaths);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Не удалось выбрать файлы", "error", true);
  }
});

sendButton.addEventListener("click", async () => {
  if (!canSend()) {
    return;
  }

  const text = noteInput.value.trim();

  setSaving(true);
  setStatus("Сохраняю...");

  try {
    const result = await invoke<SaveCaptureResponse>("save_capture", {
      request: {
        text,
        attachments: attachmentPaths
      }
    });

    noteInput.value = "";
    attachmentPaths = [];
    renderAttachments();
    updateSendState();
    setStatus(`Сохранено: ${fileNameFromPath(result.notePath)}`, "success", true);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error", true);
  } finally {
    setSaving(false);
  }
});

noteInput.addEventListener("input", () => {
  updateSendState();
});

noteInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (canSend()) {
      sendButton.click();
    }
  }
});

renderAttachments();
updateSendState();
