import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

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

const sketchTitleInput = getRequiredElement<HTMLInputElement>("#sketchTitleInput");
const sketchCanvas = getRequiredElement<HTMLCanvasElement>("#sketchCanvas");
const sketchSize = getRequiredElement<HTMLInputElement>("#sketchSize");
const sketchClearButton = getRequiredElement<HTMLButtonElement>("#sketchClearButton");
const sketchCloseButton = getRequiredElement<HTMLButtonElement>("#sketchCloseButton");
const sketchSaveButton = getRequiredElement<HTMLButtonElement>("#sketchSaveButton");
const sketchContextMaybe = sketchCanvas.getContext("2d");
const sketchWindow = getCurrentWindow();

if (!sketchContextMaybe) {
  throw new Error("Sketch canvas is not supported");
}

const sketchContext = sketchContextMaybe;
let isDrawing = false;
let hasInk = false;
let lastPoint: { x: number; y: number } | null = null;

function titleFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("title") || "sketch";
}

function sanitizeSketchFileName(name: string): string {
  const sanitized = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ");

  return sanitized || "sketch";
}

function setCanvasBackground() {
  const width = sketchCanvas.width;
  const height = sketchCanvas.height;
  sketchContext.save();
  sketchContext.setTransform(1, 0, 0, 1, 0, 0);
  sketchContext.fillStyle = "#ffffff";
  sketchContext.fillRect(0, 0, width, height);
  sketchContext.restore();
}

function clearCanvas() {
  setCanvasBackground();
  hasInk = false;
  lastPoint = null;
}

function resizeCanvas(keepInk = false) {
  const rect = sketchCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const previous = keepInk ? document.createElement("canvas") : null;

  if (previous) {
    previous.width = sketchCanvas.width;
    previous.height = sketchCanvas.height;
    previous.getContext("2d")?.drawImage(sketchCanvas, 0, 0);
  }

  sketchCanvas.width = Math.max(1, Math.floor(rect.width * scale));
  sketchCanvas.height = Math.max(1, Math.floor(rect.height * scale));
  sketchContext.setTransform(scale, 0, 0, scale, 0, 0);
  sketchContext.lineCap = "round";
  sketchContext.lineJoin = "round";
  sketchContext.strokeStyle = "#111111";

  if (previous) {
    setCanvasBackground();
    sketchContext.drawImage(previous, 0, 0, previous.width / scale, previous.height / scale);
  } else {
    clearCanvas();
  }
}

function getPoint(event: PointerEvent): { x: number; y: number } {
  const rect = sketchCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function drawLine(from: { x: number; y: number }, to: { x: number; y: number }) {
  sketchContext.lineWidth = Number(sketchSize.value);
  sketchContext.beginPath();
  sketchContext.moveTo(from.x, from.y);
  sketchContext.lineTo(to.x, to.y);
  sketchContext.stroke();
  hasInk = true;
}

function startStroke(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  isDrawing = true;
  lastPoint = getPoint(event);
  sketchCanvas.setPointerCapture(event.pointerId);
  drawLine(lastPoint, lastPoint);
}

function continueStroke(event: PointerEvent) {
  if (!isDrawing || !lastPoint) {
    return;
  }

  event.preventDefault();
  const nextPoint = getPoint(event);
  drawLine(lastPoint, nextPoint);
  lastPoint = nextPoint;
}

function endStroke(event: PointerEvent) {
  if (!isDrawing) {
    return;
  }

  isDrawing = false;
  lastPoint = null;
  if (sketchCanvas.hasPointerCapture(event.pointerId)) {
    sketchCanvas.releasePointerCapture(event.pointerId);
  }
}

function canvasToPngFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    sketchCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Не удалось сохранить скетч"));
        return;
      }

      const name = `${sanitizeSketchFileName(sketchTitleInput.value)}.png`;
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

async function saveSketch() {
  if (!hasInk) {
    return;
  }

  sketchSaveButton.disabled = true;
  sketchClearButton.disabled = true;
  sketchCloseButton.disabled = true;

  try {
    const sketchFile = await canvasToPngFile();
    const bytes = Array.from(new Uint8Array(await sketchFile.arrayBuffer()));
    const result = await invoke<SavePastedImageResponse>("save_pasted_image", {
      request: {
        bytes,
        mimeType: sketchFile.type,
        fileName: sketchFile.name
      }
    });

    await emitTo("main", "sketch-saved", { path: result.path });
    await sketchWindow.close();
  } finally {
    sketchSaveButton.disabled = false;
    sketchClearButton.disabled = false;
    sketchCloseButton.disabled = false;
  }
}

const initialTitle = titleFromUrl();
document.title = initialTitle;
sketchTitleInput.value = initialTitle;
void sketchWindow.setTitle(initialTitle);

sketchTitleInput.addEventListener("input", () => {
  const title = sanitizeSketchFileName(sketchTitleInput.value);
  document.title = title;
  void sketchWindow.setTitle(title);
});

sketchClearButton.addEventListener("click", clearCanvas);
sketchCloseButton.addEventListener("click", () => {
  void sketchWindow.close();
});
sketchSaveButton.addEventListener("click", () => {
  void saveSketch();
});

sketchCanvas.addEventListener("pointerdown", startStroke);
sketchCanvas.addEventListener("pointermove", continueStroke);
sketchCanvas.addEventListener("pointerup", endStroke);
sketchCanvas.addEventListener("pointercancel", endStroke);
window.addEventListener("resize", () => resizeCanvas(true));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void sketchWindow.close();
  }
});

requestAnimationFrame(() => {
  resizeCanvas();
  sketchTitleInput.focus();
  sketchTitleInput.select();
});
