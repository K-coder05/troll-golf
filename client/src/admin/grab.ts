import type { AdminMessage } from "@troll-golf/shared";
import type { PanelContext } from "./powers/types";

/** Position updates go out at most this often (ms). */
const SEND_INTERVAL_MS = 33;
/** The throw velocity is measured over the last this many ms of pointer movement. */
const THROW_WINDOW_MS = 90;
/** A slower release than this (world px/s) just puts the ball down at rest. */
const MIN_THROW_SPEED = 180;
/** World px/s of pointer motion to ball speed. */
const THROW_GAIN = 1;

let active: (() => void) | null = null;

/**
 * Hold a ball: it follows the pointer until a click puts it down. The release
 * velocity is the pointer's recent velocity, so a flick throws and a still
 * click leaves the ball at rest. Esc or right-click puts it down at rest.
 * Mouse events are swallowed while holding so the game doesn't start a shot.
 */
export function beginGrab(ctx: PanelContext, targetId: string): void {
  const view = ctx.host.view();
  if (!view) return;
  active?.();
  const { room } = ctx.host;
  const send = (params: Extract<AdminMessage, { power: "ballGrab" }>["params"]) =>
    room.send("admin", { power: "ballGrab", mode: ctx.mode(), params } as AdminMessage);

  const samples: { t: number; x: number; y: number }[] = [];
  let latest = { x: 0, y: 0 };
  let done = false;
  let dirty = false;
  let lastSent = 0;
  const tag = document.createElement("div");
  tag.className = "tga-grab-tag";
  tag.textContent = "✋ click to drop · flick to throw · Esc to drop";
  document.body.append(tag);

  function track(e: MouseEvent): void {
    if (done) return;
    latest = view!.worldAt(e.clientX, e.clientY);
    const now = performance.now();
    samples.push({ t: now, ...latest });
    while (samples.length > 2 && now - samples[0]!.t > 250) samples.shift();
    dirty = true;
    tag.style.left = `${e.clientX + 14}px`;
    tag.style.top = `${e.clientY + 14}px`;
    flush(false);
  }
  function flush(force: boolean): void {
    const now = performance.now();
    if (!dirty || (!force && now - lastSent < SEND_INTERVAL_MS)) return;
    dirty = false;
    lastSent = now;
    send({ action: "move", ...latest });
  }
  const timer = setInterval(() => flush(false), SEND_INTERVAL_MS);

  function throwVelocity(): { vx: number; vy: number } | undefined {
    const now = performance.now();
    const recent = samples.filter((s) => now - s.t <= THROW_WINDOW_MS);
    const a = recent[0];
    const b = recent.at(-1);
    if (!a || !b || b.t - a.t < 10) return undefined;
    const dt = (b.t - a.t) / 1000;
    const vx = ((b.x - a.x) / dt) * THROW_GAIN;
    const vy = ((b.y - a.y) / dt) * THROW_GAIN;
    return Math.hypot(vx, vy) >= MIN_THROW_SPEED ? { vx, vy } : undefined;
  }

  function stop(): void {
    clearInterval(timer);
    tag.remove();
    view!.holdCamera(false);
    done = true;
    active = null;
    // The release click's own mousedown, mouseup and click must not reach the game
    // (they would start a shot): keep swallowing them for a moment.
    setTimeout(() => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    }, 150);
  }
  function drop(withThrow: boolean): void {
    flush(true);
    const v = withThrow ? throwVelocity() : undefined;
    send({ action: "release", ...latest, ...(v ?? {}) });
    stop();
  }

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const listeners: [string, (e: Event) => void][] = [
    ["pointermove", (e) => track(e as MouseEvent)],
    ["mousemove", (e) => track(e as MouseEvent)],
    [
      "pointerdown",
      (e) => {
        swallow(e);
        if (done) return;
        track(e as MouseEvent);
        drop((e as MouseEvent).button === 0);
      },
    ],
    ["mousedown", swallow],
    ["pointerup", swallow],
    ["mouseup", swallow],
    ["click", swallow],
    ["contextmenu", swallow],
    [
      "keydown",
      (e) => {
        if (done || (e as KeyboardEvent).key !== "Escape") return;
        swallow(e);
        drop(false);
      },
    ],
  ];
  for (const [type, fn] of listeners) window.addEventListener(type, fn, true);

  active = () => drop(false);
  // The ball starts under the pointer's last known spot; the first move brings it along.
  send({ action: "grab", targetId });
  // Dragging your own ball moves the camera under the pointer; keep the view still instead.
  view.holdCamera(true);
  injectStyle();
}

function injectStyle(): void {
  if (document.getElementById("tga-grab-style")) return;
  const style = document.createElement("style");
  style.id = "tga-grab-style";
  style.textContent = `.tga-grab-tag { position: fixed; z-index: 30; pointer-events: none; font-size: 12px; padding: 3px 8px;
    border-radius: 10px; background: rgba(20,12,36,0.9); color: #f2eefa; border: 1px solid #5b3d8f; white-space: nowrap; }`;
  document.head.append(style);
}
