import type { AdminPowerPanel } from "./types";

/** Lip-Out: the chosen Player's next would-be hole-out pops back out, once. */
export const lipOutPanel: AdminPowerPanel = {
  id: "lipOut",
  label: "Lip-Out",
  icon: "🙃",
  appliesTo: ["ball"],
  onRadial(ctx, hit) {
    if (hit.kind === "ball") ctx.use("lipOut", { targetId: hit.id });
  },
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";
    const target = document.createElement("select");
    for (const p of ctx.players()) target.add(new Option(`${p.name}${p.id === ctx.myId ? " (you)" : ""}`, p.id));
    const preselected = ctx.takePreselected();
    if (preselected) target.value = preselected;
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = "Arm Lip-Out";
    go.addEventListener("click", () => {
      if (target.value) ctx.use("lipOut", { targetId: target.value });
    });
    const help = document.createElement("div");
    help.className = "tga-muted";
    help.textContent = "Their next ball that would drop in lips out instead, once.";
    const label = document.createElement("label");
    label.append("Player", target);
    root.append(label, go, help);
    return root;
  },
};
