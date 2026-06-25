import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

type SaveCaptureResponse = {
  notePath: string;
  attachmentCount: number;
};

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`UI element not found: ${selector}`);
  }
  return element;
}

const noteInput = getRequiredElement<HTMLTextAreaElement>("#noteInput");
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

function canSend(): boolean {
  return noteInput.value.trim().length > 0 && !isSaving;
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
    });

    item.append(name, remove);
    attachmentsEl.append(item);
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

attachButton.addEventListener("click", async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Выберите файлы для заметки"
    });

    if (!selected) return;

    const selectedPaths = Array.isArray(selected) ? selected : [selected];
    attachmentPaths = Array.from(new Set([...attachmentPaths, ...selectedPaths]));
    renderAttachments();
    setStatus("");
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
