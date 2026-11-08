import type { MagnetPolarity } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";

/**
 * Magnet/Repel: switch the Cup's force on or off, and choose per Player
 * whether it attracts, repels or leaves them alone. Default once on: your
 * ball is attracted, everyone else's repelled. Resets at the next Hole.
 */
export const magnetPanel: AdminPowerPanel = {
  id: "magnet",
  label: "Magnet/Repel",
  icon: "🧲",
  appliesTo: ["cup"],
  onRadial(ctx) {
    ctx.use("magnet", { action: "toggle", enabled: true });
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const row = document.createElement("div");
    row.className = "tga-row";
    for (const [label, enabled] of [["Magnet on", true], ["Magnet off", false]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => ctx.use("magnet", { action: "toggle", enabled }));
      row.append(b);
    }
    root.append(row);
    for (const p of ctx.players()) {
      const select = document.createElement("select");
      select.add(new Option("Default", ""));
      for (const [label, value] of [["Attract", "attract"], ["Repel", "repel"], ["Off", "off"]] as const) select.add(new Option(label, value));
      select.addEventListener("change", () => {
        if (select.value) ctx.use("magnet", { action: "set", targetId: p.id, polarity: select.value as MagnetPolarity });
      });
      const label = document.createElement("label");
      label.append(`${p.name}${p.id === ctx.myId ? " (you)" : ""}`, select);
      root.append(label);
    }
    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Bends the paths of rolling balls near the Cup. Default: you attract, others repel.";
    root.append(help);
    return root;
  },
};
