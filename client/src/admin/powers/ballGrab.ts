import type { AdminPowerPanel } from "./types";
import { beginGrab } from "../grab";

/**
 * Ball Grab: hold any ball in play and drag it anywhere, then click to put it
 * down (at rest) or flick the pointer as you click to throw it. Esc puts it
 * down at rest. Normally started from the right-click radial menu on a ball.
 */
export const ballGrabPanel: AdminPowerPanel = {
  id: "ballGrab",
  label: "Ball Grab",
  icon: "✋",
  appliesTo: ["ball"],
  onRadial(ctx, hit) {
    if (hit.kind === "ball") beginGrab(ctx, hit.id);
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const target = document.createElement("select");
    const preselected = ctx.takePreselected();
    for (const p of ctx.players()) target.add(new Option(`${p.name}${p.id === ctx.myId ? " (you)" : ""}`, p.id));
    if (preselected) target.value = preselected;
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = "Grab ball";
    go.addEventListener("click", () => {
      if (target.value) beginGrab(ctx, target.value);
    });
    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Ball follows your pointer. Click to drop it, flick as you click to throw. Esc drops it at rest.";
    const label = document.createElement("label");
    label.append("Player", target);
    root.append(label, go, help);
    return root;
  },
};
