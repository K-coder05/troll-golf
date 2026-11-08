import type { AdminHit, AdminHost } from "../adminHost";
import type { ConsoleController } from "./console";
import { ADMIN_POWER_PANELS } from "./powers";
import type { AdminPowerPanel } from "./powers/types";

/** Radius of the ring of power buttons, px. */
const RING_RADIUS = 78;

/**
 * Right-click a ball, the Cup or the terrain to open a radial menu of the
 * Admin Powers that apply there (each power's `appliesTo`). Choosing one runs
 * its `onRadial`, or opens its console panel. Escape, another click or a
 * second right-click closes it. Admin client only; the public client just
 * hands over world coordinates and hit-tests (AdminView).
 */
export function startRadialMenu(host: AdminHost, console: ConsoleController): void {
  injectStyle();
  let menu: HTMLElement | null = null;

  const close = () => {
    menu?.remove();
    menu = null;
  };

  function powersAt(hit: AdminHit): AdminPowerPanel[] {
    return ADMIN_POWER_PANELS.filter((panel) => panel.appliesTo.includes(hit.kind));
  }

  function open(clientX: number, clientY: number, hit: AdminHit): void {
    close();
    const root = document.createElement("div");
    root.className = "tga-radial";
    root.style.left = `${clientX}px`;
    root.style.top = `${clientY}px`;

    const centre = document.createElement("div");
    centre.className = "tga-radial-centre";
    const what = hit.kind === "ball" ? `${hit.name}'s ball` : hit.kind === "cup" ? "The Cup" : "Terrain";
    centre.textContent = what;
    centre.title = console.mode() === "loud" ? "Loud" : "Stealth";
    centre.classList.toggle("tga-loud", console.mode() === "loud");
    root.append(centre);

    const powers = powersAt(hit);
    powers.forEach((panel, i) => {
      const angle = -Math.PI / 2 + (i / powers.length) * Math.PI * 2;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "tga-radial-item";
      item.style.transform = `translate(${Math.cos(angle) * RING_RADIUS}px, ${Math.sin(angle) * RING_RADIUS}px)`;
      item.innerHTML = `<span>${panel.icon}</span><small>${panel.label}</small>`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
        if (panel.onRadial) panel.onRadial(console.ctx, hit);
        else console.openPanel(panel, hit.kind === "ball" ? hit.id : undefined);
      });
      root.append(item);
    });
    if (powers.length === 0) centre.textContent = `${what}: nothing applies`;

    document.body.append(root);
    menu = root;
  }

  window.addEventListener(
    "contextmenu",
    (e) => {
      const view = host.view();
      if (!view || e.target !== view.canvas) {
        close();
        return;
      }
      e.preventDefault();
      const hit = view.hitTest(view.worldAt(e.clientX, e.clientY));
      open(e.clientX, e.clientY, hit);
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (menu && !menu.contains(e.target as Node)) close();
    },
    true,
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
    .tga-radial { position: fixed; z-index: 25; width: 0; height: 0; }
    .tga-radial-centre { position: absolute; transform: translate(-50%, -50%); padding: 4px 10px; border-radius: 12px;
      background: rgba(20,12,36,0.94); border: 1px solid #5b3d8f; color: #f2eefa; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .tga-radial-centre.tga-loud { border-color: #ffd24d; }
    .tga-radial-item { position: absolute; left: -32px; top: -32px; width: 64px; height: 64px; border-radius: 50%; padding: 0;
      display: grid; place-items: center; align-content: center; background: #2d2347; color: #fff; border: 2px solid #b48cff; cursor: pointer; }
    .tga-radial-item span { font-size: 20px; line-height: 1; }
    .tga-radial-item small { font-size: 9px; line-height: 1.1; text-align: center; max-width: 56px; }
    .tga-radial-item:hover { background: #4a3578; }
  `;
  document.head.append(style);
}
