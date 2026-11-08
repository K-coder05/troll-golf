import type { AdminMessage, AdminMode, AdminResultMessage, Phase } from "@troll-golf/shared";
import type { AdminHost } from "../adminHost";
import { ADMIN_POWER_PANELS } from "./powers";
import type { AdminPowerPanel, PanelContext, PlayerView } from "./powers/types";

const HOTBAR_KEY = "troll-golf:hotbar";
const SLOTS = 9;

/** The decoded synced state, as the console reads it. */
interface SyncedState {
  phase: Phase;
  holeIndex: number;
  players: {
    forEach(cb: (player: { name: string; color: string; strokes: ArrayLike<number> & { at(i: number): number | undefined } }, id: string) => void): void;
  };
}

/**
 * The admin console. Backtick opens and closes it (Escape closes it). While
 * it's open, keys 1–9 pick the power in that hotbar slot. Caps Lock is the
 * Stealth/Loud toggle: on means Loud. Nothing shows on screen while it's
 * closed, so a screen share gives nothing away.
 */
export function startConsole(host: AdminHost): ConsoleController {
  const { room } = host;
  injectStyle();

  let mode: AdminMode = "stealth";
  let open = false;
  let active: AdminPowerPanel | null = null;
  const hotbar = loadHotbar();

  const root = el("div", "tga-console");
  root.hidden = true;
  const header = el("div", "tga-header");
  const title = el("strong");
  title.textContent = "Console";
  const modeBadge = el("span", "tga-mode");
  header.append(title, modeBadge);
  const hotbarRow = el("div", "tga-hotbar");
  const list = el("div", "tga-list");
  const panelBox = el("div", "tga-panel-box");
  const results = el("ul", "tga-results");
  const help = el("div", "tga-muted");
  help.textContent = "` close · 1–9 hotbar · Caps Lock = Loud · Alt+X x-ray";
  root.append(header, hotbarRow, list, panelBox, results, help);
  document.body.append(root);

  const players = (): PlayerView[] => {
    const state = room.state as unknown as SyncedState | undefined;
    const out: PlayerView[] = [];
    state?.players?.forEach((p, id) => {
      const strokes: number[] = [];
      for (let i = 0; i < p.strokes.length; i++) strokes.push(p.strokes.at(i) ?? 0);
      out.push({ id, name: p.name, color: p.color, strokes });
    });
    return out;
  };
  let preselected: string | null = null;
  const ctx: PanelContext = {
    host,
    mode: () => mode,
    takePreselected() {
      const id = preselected;
      preselected = null;
      return id;
    },
    myId: room.sessionId,
    players,
    phase: () => (room.state as unknown as SyncedState).phase,
    holeIndex: () => (room.state as unknown as SyncedState).holeIndex,
    use(power, params) {
      room.send("admin", { power, mode, params } as AdminMessage);
    },
  };

  function renderMode(): void {
    modeBadge.textContent = mode === "loud" ? "👑 LOUD" : "🥷 STEALTH";
    root.classList.toggle("tga-loud", mode === "loud");
  }

  function renderHotbar(): void {
    hotbarRow.replaceChildren(
      ...hotbar.map((id, i) => {
        const panel = ADMIN_POWER_PANELS.find((p) => p.id === id);
        const slot = el("button", "tga-slot");
        slot.type = "button";
        slot.title = panel ? panel.label : "Empty slot";
        slot.innerHTML = `<small>${i + 1}</small>${panel ? panel.icon : ""}`;
        slot.classList.toggle("tga-on", !!panel && panel === active);
        slot.addEventListener("click", () => panel && select(panel));
        return slot;
      }),
    );
  }

  function renderList(): void {
    list.replaceChildren(
      ...ADMIN_POWER_PANELS.map((panel) => {
        const row = el("div", "tga-power");
        const name = el("button", "tga-name");
        name.type = "button";
        name.textContent = `${panel.icon} ${panel.label}`;
        name.classList.toggle("tga-on", panel === active);
        name.addEventListener("click", () => select(panel));
        // Which hotbar slot holds this power.
        const slot = document.createElement("select");
        slot.title = "Hotbar slot";
        slot.add(new Option("–", ""));
        for (let i = 0; i < SLOTS; i++) slot.add(new Option(String(i + 1), String(i)));
        const current = hotbar.indexOf(panel.id);
        slot.value = current < 0 ? "" : String(current);
        slot.addEventListener("change", () => {
          for (let i = 0; i < SLOTS; i++) if (hotbar[i] === panel.id) hotbar[i] = "";
          if (slot.value !== "") hotbar[Number(slot.value)] = panel.id;
          saveHotbar(hotbar);
          renderHotbar();
          renderList();
        });
        row.append(name, slot);
        return row;
      }),
    );
  }

  function select(panel: AdminPowerPanel): void {
    active = panel;
    panelBox.replaceChildren(panel.render(ctx));
    renderHotbar();
    renderList();
  }

  function setOpen(next: boolean): void {
    open = next;
    root.hidden = !open;
    if (open) {
      renderHotbar();
      renderList();
      if (active) select(active);
    } else if (root.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }

  room.onMessage("adminResult", (message: AdminResultMessage) => {
    const line = el("li", message.ok ? "" : "tga-error");
    line.textContent = message.ok
      ? `${message.mode === "loud" ? "👑" : "🥷"} ${message.summary}`
      : `✗ ${message.power}: ${message.reason}`;
    results.prepend(line);
    while (results.children.length > 5) results.lastChild!.remove();
  });

  // Caps Lock state is readable on every key event; on means Loud.
  const syncCapsLock = (e: KeyboardEvent) => {
    const loud = e.getModifierState?.("CapsLock") ?? false;
    const next: AdminMode = loud ? "loud" : "stealth";
    if (next !== mode) {
      mode = next;
      renderMode();
    }
  };
  window.addEventListener("keyup", syncCapsLock, true);
  window.addEventListener(
    "keydown",
    (e) => {
      syncCapsLock(e);
      if (e.code === "Backquote") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
      if (digit && !typing) {
        const panel = ADMIN_POWER_PANELS.find((p) => p.id === hotbar[Number(digit) - 1]);
        if (panel) {
          e.preventDefault();
          e.stopPropagation();
          select(panel);
        }
      }
    },
    true,
  );
  renderMode();
  return {
    ctx,
    mode: () => mode,
    openPanel(panel, playerId) {
      preselected = playerId ?? null;
      setOpen(true);
      select(panel);
    },
  };
}

/** What the radial menu needs from the console. */
export interface ConsoleController {
  ctx: PanelContext;
  mode(): AdminMode;
  /** Open the console on a power's panel, optionally with a Player preselected. */
  openPanel(panel: AdminPowerPanel, playerId?: string): void;
}

function loadHotbar(): string[] {
  let saved: unknown = null;
  try {
    saved = JSON.parse(localStorage.getItem(HOTBAR_KEY) ?? "null");
  } catch {
    // Storage blocked: defaults.
  }
  if (Array.isArray(saved) && saved.length === SLOTS && saved.every((s) => typeof s === "string")) return saved;
  // Defaults: every power in list order.
  return Array.from({ length: SLOTS }, (_, i) => ADMIN_POWER_PANELS[i]?.id ?? "");
}

function saveHotbar(hotbar: string[]): void {
  try {
    localStorage.setItem(HOTBAR_KEY, JSON.stringify(hotbar));
  } catch {
    // Storage blocked: the hotbar resets on reload.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
    .tga-console { position: fixed; left: 12px; top: 110px; z-index: 20; width: min(300px, calc(100% - 24px));
      display: grid; gap: 8px; padding: 10px; border-radius: 8px; background: rgba(20,12,36,0.94);
      border: 1px solid #5b3d8f; font-size: 13px; color: #f2eefa; box-shadow: 0 6px 24px rgba(0,0,0,0.5); }
    .tga-console.tga-loud { border-color: #ffd24d; }
    .tga-header { display: flex; justify-content: space-between; align-items: center; }
    .tga-mode { font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #2d2347; }
    .tga-loud .tga-mode { background: #ffd24d; color: #2b2100; }
    .tga-hotbar { display: grid; grid-template-columns: repeat(9, 1fr); gap: 3px; }
    .tga-slot { position: relative; height: 28px; padding: 0; border-radius: 4px; background: #2d2347; color: #fff;
      font-size: 15px; font-weight: 700; }
    .tga-slot small { position: absolute; top: 1px; left: 3px; font-size: 9px; opacity: 0.6; }
    .tga-on { outline: 2px solid #b48cff; }
    .tga-list { display: grid; gap: 4px; }
    .tga-power { display: flex; gap: 4px; }
    .tga-power .tga-name { flex: 1; text-align: left; padding: 5px 8px; background: #2d2347; color: #fff; }
    .tga-power select, .tga-panel select { padding: 3px 6px; font-size: 13px; }
    .tga-panel { display: grid; gap: 6px; padding: 8px; border-radius: 6px; background: #1a1230; }
    .tga-panel label { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #c9bce6; }
    .tga-row { display: flex; gap: 4px; }
    .tga-row button { padding: 6px; }
    .tga-muted { color: #9d8fbd; font-size: 12px; }
    .tga-results { margin: 0; padding: 0 0 0 16px; font-size: 12px; color: #c9bce6; }
    .tga-results:empty { display: none; }
    .tga-error { color: #ff8080; }
  `;
  document.head.append(style);
}
