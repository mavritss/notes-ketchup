import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

type SavePastedImageResponse = {
  path: string;
};

type SketchTool = "marker" | "water" | "eraser";

type SketchPoint = {
  x: number;
  y: number;
};

type SketchSnapshot = {
  water: string;
  ink: string;
  hasInk: boolean;
};

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`UI element not found: ${selector}`);
  }
  return element;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Sketch canvas is not supported");
  }
  return context;
}

const sketchSurface = getRequiredElement<HTMLElement>("#sketchSurface");
const waterCanvas = getRequiredElement<HTMLCanvasElement>("#waterCanvas");
const inkCanvas = getRequiredElement<HTMLCanvasElement>("#inkCanvas");
const sketchSize = getRequiredElement<HTMLInputElement>("#sketchSize");
const sketchColor = getRequiredElement<HTMLInputElement>("#sketchColor");
const sketchColorPreview = getRequiredElement<HTMLSpanElement>("#sketchColorPreview");
const sketchClearButton = getRequiredElement<HTMLButtonElement>("#sketchClearButton");
const sketchCloseButton = getRequiredElement<HTMLButtonElement>("#sketchCloseButton");
const sketchUndoButton = getRequiredElement<HTMLButtonElement>("#sketchUndoButton");
const sketchRedoButton = getRequiredElement<HTMLButtonElement>("#sketchRedoButton");
const sketchCopyButton = getRequiredElement<HTMLButtonElement>("#sketchCopyButton");
const sketchSaveButton = getRequiredElement<HTMLButtonElement>("#sketchSaveButton");
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sketch-tool-button"));
const waterContext = getCanvasContext(waterCanvas);
const inkContext = getCanvasContext(inkCanvas);
const sketchWindow = getCurrentWindow();

const HISTORY_LIMIT = 60;
const CANVAS_BACKGROUND = "#fbfaf7";

let activeTool: SketchTool = "marker";
let isDrawing = false;
let hasInk = false;
let didStrokeChange = false;
let lastPoint: SketchPoint | null = null;
let history: SketchSnapshot[] = [];
let historyIndex = -1;

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function sketchFileName(): string {
  const now = new Date();
  return `sketch-${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(now.getDate())}_${padDatePart(now.getHours())}-${padDatePart(now.getMinutes())}-${padDatePart(now.getSeconds())}.png`;
}

function clearLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function prepareContext(context: CanvasRenderingContext2D, scale: number) {
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
}

function canvasCssSize(): { width: number; height: number } {
  const rect = inkCanvas.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  };
}

function resizeCanvasPair() {
  const scale = window.devicePixelRatio || 1;
  const { width, height } = canvasCssSize();
  const nextWidth = Math.max(1, Math.floor(width * scale));
  const nextHeight = Math.max(1, Math.floor(height * scale));

  waterCanvas.width = nextWidth;
  waterCanvas.height = nextHeight;
  inkCanvas.width = nextWidth;
  inkCanvas.height = nextHeight;

  prepareContext(waterContext, scale);
  prepareContext(inkContext, scale);
}

function snapshotCanvases(): SketchSnapshot {
  return {
    water: waterCanvas.toDataURL("image/png"),
    ink: inkCanvas.toDataURL("image/png"),
    hasInk
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not restore sketch history"));
    image.src = source;
  });
}

async function restoreSnapshot(snapshot: SketchSnapshot) {
  const [waterImage, inkImage] = await Promise.all([
    loadImage(snapshot.water),
    loadImage(snapshot.ink)
  ]);
  const { width, height } = canvasCssSize();

  clearLayer(waterContext, waterCanvas);
  clearLayer(inkContext, inkCanvas);
  waterContext.drawImage(waterImage, 0, 0, width, height);
  inkContext.drawImage(inkImage, 0, 0, width, height);
  hasInk = snapshot.hasInk;
  updateControls();
}

function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(snapshotCanvases());

  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }

  historyIndex = history.length - 1;
  updateControls();
}

function updateControls() {
  sketchUndoButton.disabled = historyIndex <= 0;
  sketchRedoButton.disabled = historyIndex >= history.length - 1;
  sketchClearButton.disabled = !hasInk;
  sketchCopyButton.disabled = !hasInk;
  sketchSaveButton.disabled = !hasInk;
}

function setBusy(isBusy: boolean) {
  sketchClearButton.disabled = isBusy || !hasInk;
  sketchCloseButton.disabled = isBusy;
  sketchUndoButton.disabled = isBusy || historyIndex <= 0;
  sketchRedoButton.disabled = isBusy || historyIndex >= history.length - 1;
  sketchCopyButton.disabled = isBusy || !hasInk;
  sketchSaveButton.disabled = isBusy || !hasInk;
  toolButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function updateToolButtons() {
  toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === activeTool);
  });
}

function updateColorPreview() {
  sketchColorPreview.style.backgroundColor = sketchColor.value;
}

function setActiveTool(tool: SketchTool) {
  activeTool = tool;
  inkCanvas.dataset.tool = tool;
  updateToolButtons();
}

function getPoint(event: PointerEvent): SketchPoint {
  const rect = inkCanvas.getBoundingClientRect();
  return {
    x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
  };
}

function strokeOnContext(
  context: CanvasRenderingContext2D,
  from: SketchPoint,
  to: SketchPoint,
  options: {
    color: string;
    width: number;
    alpha?: number;
    composite?: GlobalCompositeOperation;
  }
) {
  context.save();
  context.globalCompositeOperation = options.composite ?? "source-over";
  context.globalAlpha = options.alpha ?? 1;
  context.strokeStyle = options.color;
  context.lineWidth = options.width;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function drawLine(from: SketchPoint, to: SketchPoint) {
  const size = Number(sketchSize.value);

  if (activeTool === "eraser") {
    const eraseWidth = size * 1.4;
    strokeOnContext(waterContext, from, to, {
      color: "#000000",
      width: eraseWidth,
      composite: "destination-out"
    });
    strokeOnContext(inkContext, from, to, {
      color: "#000000",
      width: eraseWidth,
      composite: "destination-out"
    });
  } else if (activeTool === "water") {
    strokeOnContext(waterContext, from, to, {
      color: sketchColor.value,
      width: size * 2.2,
      alpha: 0.24
    });
    hasInk = true;
  } else {
    strokeOnContext(inkContext, from, to, {
      color: sketchColor.value,
      width: size
    });
    hasInk = true;
  }

  didStrokeChange = true;
  updateControls();
}

function canvasHasVisiblePixels(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): boolean {
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) {
      return true;
    }
  }
  return false;
}

function refreshHasInk() {
  hasInk = canvasHasVisiblePixels(waterCanvas, waterContext) || canvasHasVisiblePixels(inkCanvas, inkContext);
}

function startStroke(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  isDrawing = true;
  didStrokeChange = false;
  lastPoint = getPoint(event);
  inkCanvas.setPointerCapture(event.pointerId);
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
  if (inkCanvas.hasPointerCapture(event.pointerId)) {
    inkCanvas.releasePointerCapture(event.pointerId);
  }

  if (didStrokeChange) {
    refreshHasInk();
    pushHistory();
  }
}

function clearCanvas() {
  if (!hasInk) {
    return;
  }

  clearLayer(waterContext, waterCanvas);
  clearLayer(inkContext, inkCanvas);
  hasInk = false;
  pushHistory();
}

async function undoSketch() {
  if (historyIndex <= 0) {
    return;
  }

  historyIndex -= 1;
  await restoreSnapshot(history[historyIndex]);
}

async function redoSketch() {
  if (historyIndex >= history.length - 1) {
    return;
  }

  historyIndex += 1;
  await restoreSnapshot(history[historyIndex]);
}

function exportSketchBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const output = document.createElement("canvas");
    output.width = inkCanvas.width;
    output.height = inkCanvas.height;
    const outputContext = output.getContext("2d");

    if (!outputContext) {
      reject(new Error("Sketch export is not supported"));
      return;
    }

    outputContext.fillStyle = CANVAS_BACKGROUND;
    outputContext.fillRect(0, 0, output.width, output.height);
    outputContext.drawImage(waterCanvas, 0, 0);
    outputContext.drawImage(inkCanvas, 0, 0);
    output.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not export sketch"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function canvasToPngFile(): Promise<File> {
  const blob = await exportSketchBlob();
  return new File([blob], sketchFileName(), { type: "image/png" });
}

async function copySketch() {
  if (!hasInk) {
    return;
  }

  const clipboardItemCtor = (window as unknown as {
    ClipboardItem?: new (items: Record<string, Blob>) => unknown;
  }).ClipboardItem;

  if (!navigator.clipboard || !clipboardItemCtor) {
    return;
  }

  sketchCopyButton.classList.remove("is-copied");
  const blob = await exportSketchBlob();
  await navigator.clipboard.write([new clipboardItemCtor({ [blob.type]: blob })] as never);
  sketchCopyButton.classList.add("is-copied");
  window.setTimeout(() => {
    sketchCopyButton.classList.remove("is-copied");
  }, 650);
}

async function saveSketch() {
  if (!hasInk) {
    return;
  }

  setBusy(true);

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
    setBusy(false);
  }
}

async function restoreCurrentAfterResize(previous: SketchSnapshot) {
  resizeCanvasPair();
  await restoreSnapshot(previous);
  if (historyIndex >= 0) {
    history[historyIndex] = snapshotCanvases();
  }
}

function startWindowDrag(event: PointerEvent) {
  if (event.button !== 0 || event.target !== sketchSurface) {
    return;
  }

  event.preventDefault();
  void sketchWindow.startDragging();
}

sketchSurface.addEventListener("pointerdown", startWindowDrag);

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tool = button.dataset.tool;
    if (tool === "marker" || tool === "water" || tool === "eraser") {
      setActiveTool(tool);
    }
  });
});

sketchColor.addEventListener("input", updateColorPreview);
sketchClearButton.addEventListener("click", clearCanvas);
sketchCloseButton.addEventListener("click", () => {
  void sketchWindow.close();
});
sketchUndoButton.addEventListener("click", () => {
  void undoSketch();
});
sketchRedoButton.addEventListener("click", () => {
  void redoSketch();
});
sketchCopyButton.addEventListener("click", () => {
  void copySketch();
});
sketchSaveButton.addEventListener("click", () => {
  void saveSketch();
});

inkCanvas.addEventListener("pointerdown", startStroke);
inkCanvas.addEventListener("pointermove", continueStroke);
inkCanvas.addEventListener("pointerup", endStroke);
inkCanvas.addEventListener("pointercancel", endStroke);
window.addEventListener("pointerup", endStroke);
window.addEventListener("pointercancel", endStroke);
window.addEventListener("resize", () => {
  const previous = historyIndex >= 0 ? snapshotCanvases() : null;
  if (previous) {
    void restoreCurrentAfterResize(previous);
  } else {
    resizeCanvasPair();
  }
});
document.addEventListener("keydown", (event) => {
  const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
  const isRedo =
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
    ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z");

  if (event.key === "Escape") {
    event.preventDefault();
    void sketchWindow.close();
  } else if (isUndo) {
    event.preventDefault();
    void undoSketch();
  } else if (isRedo) {
    event.preventDefault();
    void redoSketch();
  }
});

requestAnimationFrame(() => {
  document.title = "Sketch";
  resizeCanvasPair();
  setActiveTool("marker");
  updateColorPreview();
  pushHistory();
});
