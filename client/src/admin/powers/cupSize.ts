import { CUP_CRATER_RADIUS, CUP_MAX_RADIUS, CUP_MIN_RADIUS, CUP_PINHOLE_RADIUS } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";

/** Cup Size: shrink the Cup to a pinhole, blow it up to a crater, or type a radius. */
export const cupSizePanel: AdminPowerPanel = {
  id: "cupSize",
  label: "Cup Size",
  icon: "🕳️",
  appliesTo: ["cup"],
  onRadial(ctx) {
    ctx.use("cupSize", { radius: CUP_CRATER_RADIUS });
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const row = document.createElement("div");
    row.className = "tga-row";
    for (const [label, radius] of [["Pinhole", CUP_PINHOLE_RADIUS], ["Normal", 12], ["Crater", CUP_CRATER_RADIUS]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => ctx.use("cupSize", { radius }));
      row.append(b);
    }
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(CUP_MIN_RADIUS);
    input.max = String(CUP_MAX_RADIUS);
    input.value = "24";
    const set = document.createElement("button");
    set.type = "button";
    set.textContent = "Set radius";
    set.addEventListener("click", () => ctx.use("cupSize", { radius: Number(input.value) }));
    const label = document.createElement("label");
    label.append("Radius (px)", input);
    root.append(row, label, set);
    return root;
  },
};
