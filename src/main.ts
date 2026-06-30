import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

type SaveCaptureResponse = {
  notePath: string;
  attachmentCount: number;
};

type SavePastedImageResponse = {
  path: string;
};

type ImagePreviewResponse = {
  dataUrl: string;
};

type SketchSavedPayload = {
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
const sketchButton = getRequiredElement<HTMLButtonElement>("#sketchButton");
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

function fileExtensionLabel(fileName: string): string {
  const extension = fileName.split(".").filter(Boolean).at(-1);
  return extension ? extension.toUpperCase() : "Файл";
}

function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isImageFileName(file.name);
}

function imageExtensionFromType(type: string): string {
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  if (type === "image/bmp") return "bmp";
  if (type === "image/svg+xml") return "svg";
  return "png";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sketchTitleFromNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `sketch-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return name && isImageFileName(name) ? name : fallback;
  } catch {
    return fallback;
  }
}

function getImageFilesFromDataTransfer(data: DataTransfer | null): File[] {
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

function getDroppedImageUrls(data: DataTransfer | null): string[] {
  if (!data) {
    return [];
  }

  const urls: string[] = [];
  const downloadUrl = data.getData("DownloadURL");
  const uriList = data.getData("text/uri-list");
  const plainText = data.getData("text/plain");
  const html = data.getData("text/html");

  if (downloadUrl.trim()) {
    const parts = downloadUrl.trim().split(":");
    urls.push(parts.slice(2).join(":"));
  }

  for (const line of uriList.split(/\r?\n/)) {
    const value = line.trim();
    if (value && !value.startsWith("#")) {
      urls.push(value);
    }
  }

  if (plainText.trim()) {
    urls.push(plainText.trim());
  }

  if (html.trim()) {
    const documentFromDrop = new DOMParser().parseFromString(html, "text/html");
    documentFromDrop.querySelectorAll("img[src], source[srcset]").forEach((element) => {
      if (element instanceof HTMLImageElement) {
        urls.push(element.currentSrc || element.src);
      } else {
        const source = element.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
        if (source) urls.push(source);
      }
    });
  }

  return uniqueStrings(urls).filter((url) => {
    if (url.startsWith("data:image/")) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}

async function dataUrlToFile(url: string, index: number): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  const extension = imageExtensionFromType(blob.type);
  return new File([blob], `dropped-image-${index}.${extension}`, {
    type: blob.type || "image/png"
  });
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
    const fileName = fileNameFromPath(path);
    const isImage = isImageFileName(fileName);
    const item = document.createElement("div");
    item.className = isImage ? "attachment attachment-image" : "attachment attachment-file";

    if (isImage) {
      const image = document.createElement("img");
      image.className = "attachment-preview-image";
      image.alt = "";
      image.draggable = false;
      void loadImagePreview(path, image, item);
      item.append(image);
    } else {
      const icon = document.createElement("div");
      icon.className = "attachment-file-icon";
      icon.textContent = "□";

      const meta = document.createElement("div");
      meta.className = "attachment-file-meta";

      const name = document.createElement("span");
      name.className = "attachment-file-name";
      name.textContent = fileName;

      const type = document.createElement("span");
      type.className = "attachment-file-type";
      type.textContent = fileExtensionLabel(fileName);

      meta.append(name, type);
      item.append(icon, meta);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Убрать файл";
    remove.ariaLabel = `Убрать ${fileName}`;
    remove.addEventListener("click", () => {
      attachmentPaths = attachmentPaths.filter((existing) => existing !== path);
      renderAttachments();
      updateSendState();
    });

    item.append(remove);
    attachmentsEl.append(item);
  }
}

async function loadImagePreview(path: string, image: HTMLImageElement, item: HTMLElement) {
  try {
    const result = await invoke<ImagePreviewResponse>("get_image_preview", {
      request: { path }
    });
    image.src = result.dataUrl;
  } catch {
    item.classList.add("attachment-preview-fallback");
  }
}

function addAttachmentPaths(paths: string[], message?: string) {
  const nextPaths = paths.filter(Boolean);
  if (nextPaths.length === 0) {
    return;
  }

  attachmentPaths = uniqueStrings([...attachmentPaths, ...nextPaths]);
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
  sketchButton.disabled = nextSaving;
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

async function saveImageFile(file: File): Promise<string> {
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

async function saveImageUrl(url: string, index: number): Promise<string> {
  if (url.startsWith("data:image/")) {
    return saveImageFile(await dataUrlToFile(url, index));
  }

  const result = await invoke<SavePastedImageResponse>("save_image_from_url", {
    request: {
      url,
      fileName: fileNameFromUrl(url, `dropped-image-${index}.png`)
    }
  });

  return result.path;
}

async function addImageFiles(files: File[], sourceLabel = "Image") {
  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0 || isSaving) {
    return false;
  }

  setStatus(`${sourceLabel} adding...`);

  try {
    const savedPaths = await Promise.all(imageFiles.map(saveImageFile));
    addAttachmentPaths(savedPaths, imageFiles.length === 1 ? `${sourceLabel} added` : `${sourceLabel}s added`);
    return true;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error", true);
    return false;
  }
}

async function addDroppedImageData(data: DataTransfer | null): Promise<boolean> {
  const imageFiles = getImageFilesFromDataTransfer(data);
  if (imageFiles.length > 0) {
    return addImageFiles(imageFiles, "Dropped image");
  }

  const imageUrls = getDroppedImageUrls(data);
  if (imageUrls.length === 0) {
    return false;
  }

  setStatus("Dropped image loading...");

  try {
    const savedPaths = await Promise.all(imageUrls.map(saveImageUrl));
    addAttachmentPaths(savedPaths, savedPaths.length === 1 ? "Dropped image added" : "Dropped images added");
    return true;
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Could not read this dropped image.",
      "error",
      true
    );
    return false;
  }
}

function openSketchWindow() {
  const title = sketchTitleFromNow();
  const label = title.replace(/[^a-zA-Z0-9-/:_]/g, "-");

  const sketchWindow = new WebviewWindow(label, {
    url: "sketch.html",
    title: "Sketch",
    width: 620,
    height: 760,
    minWidth: 560,
    minHeight: 680,
    center: true,
    resizable: true,
    decorations: false,
    transparent: false,
    shadow: true,
    alwaysOnTop: true,
    dragDropEnabled: false
  });

  sketchWindow.once("tauri://error", (event) => {
    setStatus(String(event.payload), "error", true);
  });
}

void appWindow.listen<SketchSavedPayload>("sketch-saved", ({ payload }) => {
  addAttachmentPaths([payload.path], "Sketch added");
});

document.addEventListener("paste", (event) => {
  const files = getImageFilesFromDataTransfer(event.clipboardData);
  if (files.length === 0) {
    return;
  }

  event.preventDefault();
  void addImageFiles(files, "Pasted image");
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  captureCard.classList.add("is-drag-over");
});

document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget === null) {
    captureCard.classList.remove("is-drag-over");
  }
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  captureCard.classList.remove("is-drag-over");

  if (isSaving) {
    return;
  }

  void addDroppedImageData(event.dataTransfer);
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

sketchButton.addEventListener("click", openSketchWindow);

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

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (canSend()) {
      sendButton.click();
    }
  }
}, true);

renderAttachments();
updateSendState();
