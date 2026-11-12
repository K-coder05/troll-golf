import { INVERT_DEFAULT_SEC, INVERT_MAX_SEC } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";

/** Invert Controls: the target's shots go opposite to their drag for a while. Stealth is invisible to everyone else. */
export const invertControlsPanel: AdminPowerPanel = {
  id: "invertControls",
  label: "Invert Controls",
  icon: "🔄",
  appliesTo: ["ball"],
  onRadial(ctx, hit) {
    if (hit.kind === "ball") ctx.use("invertControls", { targetId: hit.id });
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const target = document.createElement("select");
    for (const p of ctx.players()) target.add(new Option(`${p.name}${p.id === ctx.myId ? " (you)" : ""}`, p.id));
    const preselected = ctx.takePreselected();
    if (preselected) target.value = preselected;
    const seconds = document.createElement("input");
    seconds.type = "number";
    seconds.min = "1";
    seconds.max = String(INVERT_MAX_SEC);
    seconds.value = String(INVERT_DEFAULT_SEC);
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = "Invert";
    go.addEventListener("click", () => {
      if (target.value) ctx.use("invertControls", { targetId: target.value, durationSec: Number(seconds.value) || INVERT_DEFAULT_SEC });
    });
    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Their shot fires the opposite way; their aim line still shows their drag. Ends with the Hole.";
    const p = document.createElement("label");
    p.append("Player", target);
    const s = document.createElement("label");
    s.append("Duration (s)", seconds);
    root.append(p, s, go, help);
    return root;
  },
};
