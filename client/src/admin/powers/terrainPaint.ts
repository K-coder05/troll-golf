import { PAINT_MAX_DURATION_SEC, PAINT_MAX_RADIUS, PAINT_MIN_RADIUS, PAINT_SURFACES, type PaintSurface } from "@troll-golf/shared";
import { armBrush, brush, brushArmed, disarmBrush } from "../brush";
import type { AdminPowerPanel } from "./types";

const LABEL: Record<PaintSurface, string> = { ice: "🧊 Ice", sand: "🏜️ Sand", water: "🌊 Water", void: "🕳️ Void" };

/**
 * Terrain Paint: pick a surface and brush size, arm the brush, then press and
 * drag on the course. Right-clicking terrain and choosing Terrain Paint arms
 * the brush with the current settings. Esc or right-click puts it away.
 */
export const terrainPaintPanel: AdminPowerPanel = {
  id: "terrainPaint",
  label: "Terrain Paint",
  icon: "🖌️",
  appliesTo: ["terrain"],
  onRadial(ctx) {
    armBrush(ctx);
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";

    const surfaces = document.createElement("div");
    surfaces.className = "tga-row";
    const buttons = PAINT_SURFACES.map((surface) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = LABEL[surface];
      b.addEventListener("click", () => {
        brush.surface = surface;
        mark();
      });
      surfaces.append(b);
      return [surface, b] as const;
    });
    const mark = () => {
      for (const [surface, b] of buttons) b.style.outline = surface === brush.surface ? "2px solid #ffd24d" : "none";
    };
    mark();

    const radius = document.createElement("input");
    radius.type = "range";
    radius.min = String(PAINT_MIN_RADIUS);
    radius.max = String(PAINT_MAX_RADIUS);
    radius.value = String(brush.radius);
    radius.addEventListener("input", () => (brush.radius = Number(radius.value)));

    const duration = document.createElement("input");
    duration.type = "number";
    duration.min = "0";
    duration.max = String(PAINT_MAX_DURATION_SEC);
    duration.value = String(brush.durationSec);
    duration.addEventListener("change", () => {
      const v = Math.min(PAINT_MAX_DURATION_SEC, Math.max(0, Number(duration.value) || 0));
      brush.durationSec = v;
      duration.value = String(v);
    });

    const arm = document.createElement("button");
    arm.type = "button";
    const label = (armed: boolean) => (arm.textContent = armed ? "Brush out: drag on the course (Esc to stop)" : "Paint");
    label(brushArmed());
    arm.addEventListener("click", () => (brushArmed() ? disarmBrush() : armBrush(ctx, label)));

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear all paint";
    clear.addEventListener("click", () => ctx.use("terrainPaint", { action: "clear" }));

    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Painted ground acts like the real thing for every ball. Fade 0 = until the next Hole.";

    root.append(surfaces, labelled("Brush size", radius), labelled("Fade after (s)", duration), arm, clear, help);
    return root;
  },
};

function labelled(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  label.append(text, control);
  return label;
}
