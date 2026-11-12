import { ITEM_CATALOGUE, type ItemId } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";

/** Rig the Box: Their next Item Box gives exactly this Item. */
export const rigBoxPanel: AdminPowerPanel = {
  id: "rigBox",
  label: "Rig the Box",
  icon: "🎲",
  appliesTo: ["ball"],
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const target = document.createElement("select");
    for (const p of ctx.players()) target.add(new Option(`${p.name}${p.id === ctx.myId ? " (you)" : ""}`, p.id));
    const preselected = ctx.takePreselected();
    if (preselected) target.value = preselected;
    const item = document.createElement("select");
    for (const def of Object.values(ITEM_CATALOGUE)) item.add(new Option(`${def.icon} ${def.name}`, def.id));
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = "Rig next box";
    go.addEventListener("click", () => {
      if (target.value) ctx.use("rigBox", { targetId: target.value, item: item.value as ItemId });
    });
    const hint = document.createElement("div");
    hint.className = "tga-muted";
    hint.textContent = "Their next Item Box gives exactly this Item.";
    const who = document.createElement("label");
    who.append("Player", target);
    const what = document.createElement("label");
    what.append("Item", item);
    root.append(who, what, go, hint);
    return root;
  },
};
