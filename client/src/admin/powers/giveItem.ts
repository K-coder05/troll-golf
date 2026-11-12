import { ITEM_CATALOGUE, type ItemId } from "@troll-golf/shared";
import type { AdminPowerPanel } from "./types";

/** Give Item: Puts the Item in their slot now, replacing what they hold. */
export const giveItemPanel: AdminPowerPanel = {
  id: "giveItem",
  label: "Give Item",
  icon: "🎁",
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
    go.textContent = "Give Item";
    go.addEventListener("click", () => {
      if (target.value) ctx.use("giveItem", { targetId: target.value, item: item.value as ItemId });
    });
    const hint = document.createElement("div");
    hint.className = "tga-muted";
    hint.textContent = "Puts the Item in their slot now, replacing what they hold.";
    const who = document.createElement("label");
    who.append("Player", target);
    const what = document.createElement("label");
    what.append("Item", item);
    root.append(who, what, go, hint);
    return root;
  },
};
