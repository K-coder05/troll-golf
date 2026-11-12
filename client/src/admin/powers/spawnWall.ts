import { WALL_DEFAULT_THICKNESS, WALL_MAX_DURATION_SEC, WALL_MAX_LENGTH, WALL_MAX_THICKNESS, WALL_MIN_LENGTH, WALL_MIN_THICKNESS } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";

/**
 * Spawn Wall: press "Draw wall", then press-drag-release on the course. The
 * drag is the wall (its length is limited; a longer drag is cut short). The
 * canvas swallows the press so no shot starts. Optional thickness and
 * vanish-after seconds; "Clear walls" removes them all.
 */
export const spawnWallPanel: AdminPowerPanel = {
  id: "spawnWall",
  label: "Spawn Wall",
  icon: "🧱",
  appliesTo: [],
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.min = String(WALL_MIN_THICKNESS);
    thickness.max = String(WALL_MAX_THICKNESS);
    thickness.value = String(WALL_DEFAULT_THICKNESS);
    const duration = document.createElement("input");
    duration.type = "number";
    duration.min = "0";
    duration.max = String(WALL_MAX_DURATION_SEC);
    duration.value = "0";

    const draw = document.createElement("button");
    draw.type = "button";
    draw.textContent = "Draw wall";
    draw.addEventListener("click", () => {
      const view = ctx.host.view();
      if (!view) return;
      draw.textContent = "Drag on the course…";
      const down = (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        view.canvas.removeEventListener("mousedown", down, true);
        view.holdCamera(true);
        const a = view.worldAt(e.clientX, e.clientY);
        const up = (u: MouseEvent) => {
          window.removeEventListener("mouseup", up, true);
          view.holdCamera(false);
          draw.textContent = "Draw wall";
          const raw = view.worldAt(u.clientX, u.clientY);
          let dx = raw.x - a.x;
          let dy = raw.y - a.y;
          const length = Math.hypot(dx, dy);
          if (length < WALL_MIN_LENGTH) return;
          if (length > WALL_MAX_LENGTH) {
            dx *= WALL_MAX_LENGTH / length;
            dy *= WALL_MAX_LENGTH / length;
          }
          const seconds = Number(duration.value);
          ctx.use("spawnWall", {
            action: "spawn",
            a,
            b: { x: a.x + dx, y: a.y + dy },
            thickness: Number(thickness.value) || WALL_DEFAULT_THICKNESS,
            ...(seconds > 0 ? { durationSec: seconds } : {}),
          });
        };
        window.addEventListener("mouseup", up, true);
      };
      view.canvas.addEventListener("mousedown", down, true);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear walls";
    clear.addEventListener("click", () => ctx.use("spawnWall", { action: "clear" }));

    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Balls bounce off it. 0 s = until the next Hole. Walls can't touch the Cup; balls in the way are moved aside.";
    const t = document.createElement("label");
    t.append("Thickness (px)", thickness);
    const d = document.createElement("label");
    d.append("Vanish after (s, 0 = never)", duration);
    root.append(t, d, draw, clear, help);
    return root;
  },
};
