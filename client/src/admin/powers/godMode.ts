import type { AdminPowerPanel } from "./types";

/** God Mode: while on you are immune to every Item. Stealth blocks look like a Shield pop; Loud shows a divine block. */
export const godModePanel: AdminPowerPanel = {
  id: "godMode",
  label: "God Mode",
  icon: "😇",
  appliesTo: [],
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const row = document.createElement("div");
    row.className = "tga-row";
    for (const [label, enabled] of [["God Mode on", true], ["God Mode off", false]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => ctx.use("godMode", { enabled }));
      row.append(b);
    }
    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "The mode (Caps Lock) you toggle it in decides how a block looks.";
    root.append(row, help);
    return root;
  },
};
