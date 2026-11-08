import type { AdminPowerPanel } from "./types";

/** Scoreboard Edit: pick a Player and a Hole, then add or remove Strokes. */
export const scoreboardEditPanel: AdminPowerPanel = {
  id: "scoreboardEdit",
  label: "Scoreboard Edit",
  icon: "±",
  appliesTo: ["ball"],
  render(ctx) {
    const root = document.createElement("div");
    root.className = "tga-panel";

    const target = document.createElement("select");
    for (const p of ctx.players()) {
      const option = new Option(`${p.name}${p.id === ctx.myId ? " (you)" : ""}`, p.id);
      target.add(option);
    }
    const hole = document.createElement("select");
    const current = ctx.holeIndex();
    for (let i = current; i >= 0; i--) hole.add(new Option(`Hole ${i + 1}${i === current ? " (now)" : ""}`, String(i)));

    const strokesNow = document.createElement("div");
    strokesNow.className = "tga-muted";
    const refresh = () => {
      const p = ctx.players().find((x) => x.id === target.value);
      const h = Number(hole.value);
      strokesNow.textContent = p ? `${p.name}: ${p.strokes[h] ?? 0} on Hole ${h + 1}` : "";
    };
    target.addEventListener("change", refresh);
    hole.addEventListener("change", refresh);

    const buttons = document.createElement("div");
    buttons.className = "tga-row";
    for (const delta of [-2, -1, 1, 2]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = delta > 0 ? `+${delta}` : String(delta);
      b.addEventListener("click", () => {
        if (!target.value) return;
        ctx.use("scoreboardEdit", { targetId: target.value, delta, holeIndex: Number(hole.value) });
        setTimeout(refresh, 150);
      });
      buttons.append(b);
    }

    root.append(labelled("Player", target), labelled("Hole", hole), buttons, strokesNow);
    refresh();
    return root;
  },
};

function labelled(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  label.append(text, control);
  return label;
}
