import type { NukeAftermath } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";
import type { PanelContext } from "./types";

/** Aftermath chosen in the panel / radial menu; Wipe is the default. */
let aftermath: NukeAftermath = "wipe";

function launch(ctx: PanelContext, x: number, y: number): void {
  ctx.use("nuke", { x, y, aftermath });
}

/**
 * Nuke: right-click the terrain (or anywhere on the course) and pick Nuke to
 * launch it at that point, or use the panel to launch at the Hole's centre
 * (or arm a click on the course). The aftermath toggle is Wipe (default) or Reset.
 */
export const nukePanel: AdminPowerPanel = {
  id: "nuke",
  label: "Nuke",
  icon: "☢️",
  appliesTo: ["terrain", "ball", "cup"],
  onRadial(ctx, hit) {
    const view = ctx.host.view();
    if (!view) return;
    // The radial menu was opened at the pointer; the hit carries no point, so use the last pointer position.
    const at = view.worldAt(lastPointer.x, lastPointer.y);
    void hit;
    launch(ctx, at.x, at.y);
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const select = document.createElement("select");
    select.add(new Option("Wipe: balls back to the Tee, Strokes kept", "wipe"));
    select.add(new Option("Reset: everyone replays the Hole", "reset"));
    select.value = aftermath;
    select.addEventListener("change", () => (aftermath = select.value as NukeAftermath));
    const arm = document.createElement("button");
    arm.type = "button";
    arm.textContent = "Pick impact point";
    arm.addEventListener("click", () => {
      const view = ctx.host.view();
      if (!view) return;
      const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        view.canvas.removeEventListener("click", onClick, true);
        const at = view.worldAt(e.clientX, e.clientY);
        launch(ctx, at.x, at.y);
      };
      view.canvas.addEventListener("click", onClick, true);
      arm.textContent = "Click the course…";
    });
    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "3 s siren, then the blast. Right-click the course and choose Nuke to launch there.";
    const label = document.createElement("label");
    label.append("After the blast", select);
    root.append(label, arm, help);
    return root;
  },
};

const lastPointer = { x: 0, y: 0 };
window.addEventListener(
  "contextmenu",
  (e) => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
  },
  true,
);
