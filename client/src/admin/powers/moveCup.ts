import { CUP_SLIDE_MAX_SPEED, CUP_SLIDE_MAX_TRIGGER, CUP_SLIDE_MIN_TRIGGER, CUP_SLIDE_SPEED, CUP_SLIDE_TRIGGER } from "@troll-golf/shared";
import { lastPointer } from "../lastPointer";
import type { AdminPowerPanel } from "./types";

/**
 * Move the Cup: teleport it (right-click terrain and choose Move the Cup, or
 * pick a point from the panel), or make it slide away from balls that come close.
 */
export const moveCupPanel: AdminPowerPanel = {
  id: "moveCup",
  label: "Move the Cup",
  icon: "🚩",
  appliesTo: ["terrain", "cup"],
  onRadial(ctx) {
    const view = ctx.host.view();
    if (!view) return;
    const at = view.worldAt(lastPointer.x, lastPointer.y);
    ctx.use("moveCup", { mode: "teleport", x: at.x, y: at.y });
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";

    const arm = document.createElement("button");
    arm.type = "button";
    arm.textContent = "Teleport: pick a spot";
    arm.addEventListener("click", () => {
      const view = ctx.host.view();
      if (!view) return;
      const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        view.canvas.removeEventListener("click", onClick, true);
        const at = view.worldAt(e.clientX, e.clientY);
        ctx.use("moveCup", { mode: "teleport", x: at.x, y: at.y });
        arm.textContent = "Teleport: pick a spot";
      };
      view.canvas.addEventListener("click", onClick, true);
      arm.textContent = "Click the course…";
    });

    const trigger = document.createElement("input");
    trigger.type = "number";
    trigger.min = String(CUP_SLIDE_MIN_TRIGGER);
    trigger.max = String(CUP_SLIDE_MAX_TRIGGER);
    trigger.value = String(CUP_SLIDE_TRIGGER);
    const speed = document.createElement("input");
    speed.type = "number";
    speed.min = "10";
    speed.max = String(CUP_SLIDE_MAX_SPEED);
    speed.value = String(CUP_SLIDE_SPEED);
    const slide = document.createElement("button");
    slide.type = "button";
    slide.textContent = "Slide away from balls";
    slide.addEventListener("click", () =>
      ctx.use("moveCup", { mode: "slide", triggerDistance: Number(trigger.value), speed: Number(speed.value) }),
    );

    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Teleport cancels a slide. Everything resets at the next Hole.";
    root.append(arm, labelled("Trigger distance (px)", trigger), labelled("Slide speed (px/s)", speed), slide, help);
    return root;
  },
};

function labelled(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  label.append(text, control);
  return label;
}
