import {
  PAINT_DEFAULT_RADIUS,
  PAINT_MAX_POINTS_PER_MESSAGE,
  type AdminMessage,
  type PaintSurface,
} from "@troll-golf/shared";
import type { PanelContext } from "./powers/types";

/** Brush points go out at most this often (ms): ~20 Hz, batched. */
const SEND_INTERVAL_MS = 50;
/** A pointer move shorter than this fraction of the brush radius (world px) adds no point. */
const SPACING = 0.4;

/** The brush settings, shared by the console panel and the radial menu. */
export const brush: { surface: PaintSurface; radius: number; durationSec: number } = {
  surface: "water",
  radius: PAINT_DEFAULT_RADIUS,
  /** 0 = until the next Hole. */
  durationSec: 0,
};

const SURFACE_COLOR: Record<PaintSurface, string> = {
  ice: "#bfe9f7",
  sand: "#e3cf8f",
  water: "#2a6fd6",
  void: "#5b2a8c",
};

let disarm: (() => void) | null = null;

export const brushArmed = () => disarm !== null;

/**
 * Brush mode: while armed, pressing and dragging on the course paints with
 * the current brush (each press is one stroke, dragged on with `extend`
 * messages batched at ~20 Hz). The game never sees those mouse events, so no
 * shot starts. Esc or right-click puts the brush away.
 */
export function armBrush(ctx: PanelContext, onChange?: (armed: boolean) => void): void {
  const view = ctx.host.view();
  if (!view) return;
  disarm?.();
  const { room } = ctx.host;
  const send = (params: Extract<AdminMessage, { power: "terrainPaint" }>["params"]) =>
    room.send("admin", { power: "terrainPaint", mode: ctx.mode(), params } as AdminMessage);

  let down = false;
  let last: { x: number; y: number } | null = null;
  let queue: { x: number; y: number }[] = [];
  const cursor = document.createElement("div");
  cursor.className = "tga-brush";
  document.body.append(cursor);
  injectStyle();

  /** Screen px per world px right now (the camera zooms). */
  const scale = (clientX: number, clientY: number) => {
    const a = view.worldAt(clientX, clientY);
    const b = view.worldAt(clientX + 100, clientY);
    return 100 / Math.max(1e-6, Math.abs(b.x - a.x));
  };

  function flush(): void {
    while (queue.length > 0) {
      send({ action: "extend", points: queue.slice(0, PAINT_MAX_POINTS_PER_MESSAGE) });
      queue = queue.slice(PAINT_MAX_POINTS_PER_MESSAGE);
    }
  }
  const timer = setInterval(flush, SEND_INTERVAL_MS);

  const onCanvas = (e: Event) => e.target === view.canvas;
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  function moveCursor(e: MouseEvent): void {
    const size = brush.radius * 2 * scale(e.clientX, e.clientY);
    cursor.style.width = cursor.style.height = `${size}px`;
    cursor.style.left = `${e.clientX - size / 2}px`;
    cursor.style.top = `${e.clientY - size / 2}px`;
    cursor.style.borderColor = SURFACE_COLOR[brush.surface];
    cursor.style.display = onCanvas(e) || down ? "block" : "none";
  }

  const listeners: [string, (e: Event) => void][] = [
    [
      "pointerdown",
      (e) => {
        const m = e as PointerEvent;
        if (!onCanvas(e)) return;
        swallow(e);
        if (m.button !== 0) {
          stop();
          return;
        }
        down = true;
        last = view.worldAt(m.clientX, m.clientY);
        queue = [];
        send({
          action: "stroke",
          surface: brush.surface,
          radius: brush.radius,
          points: [last],
          ...(brush.durationSec > 0 ? { durationSec: brush.durationSec } : {}),
        });
      },
    ],
    [
      "pointermove",
      (e) => {
        const m = e as PointerEvent;
        moveCursor(m);
        if (!down) return;
        swallow(e);
        const at = view.worldAt(m.clientX, m.clientY);
        if (last && Math.hypot(at.x - last.x, at.y - last.y) < brush.radius * SPACING) return;
        last = at;
        queue.push(at);
      },
    ],
    [
      "pointerup",
      (e) => {
        if (!down && !onCanvas(e)) return;
        swallow(e);
        down = false;
        flush();
      },
    ],
    ["mousedown", (e) => onCanvas(e) && swallow(e)],
    ["mousemove", (e) => down && swallow(e)],
    ["mouseup", (e) => onCanvas(e) && swallow(e)],
    ["click", (e) => onCanvas(e) && swallow(e)],
    [
      "contextmenu",
      (e) => {
        if (!onCanvas(e)) return;
        swallow(e);
        stop();
      },
    ],
    [
      "keydown",
      (e) => {
        if ((e as KeyboardEvent).key !== "Escape") return;
        stop();
      },
    ],
  ];

  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (down) flush();
    down = false;
    clearInterval(timer);
    cursor.remove();
    view!.holdCamera(false);
    disarm = null;
    onChange?.(false);
    // Let the right-click/Esc that ended it finish before the game sees mouse events again.
    setTimeout(() => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    }, 0);
  }

  for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
  // Keep the view still while painting, so the course doesn't slide under the brush.
  view.holdCamera(true);
  disarm = stop;
  onChange?.(true);
}

/** Put the brush away, if it is out. */
export function disarmBrush(): void {
  disarm?.();
}

function injectStyle(): void {
  if (document.getElementById("tga-brush-style")) return;
  const style = document.createElement("style");
  style.id = "tga-brush-style";
  style.textContent = `.tga-brush { position: fixed; z-index: 30; pointer-events: none; border-radius: 50%;
    border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.6); display: none; }`;
  document.head.append(style);
}
