import type { Room } from "@colyseus/sdk";
import {
  EFFECT_INFO,
  ITEM_CATALOGUE,
  type EffectKind,
  type ItemId,
  type TimeMessage,
  type UseItemMessage,
} from "@troll-golf/shared";

/** The synced fields the picker reads. */
interface PickerPlayer {
  name: string;
  color: string;
  connected: boolean;
  holedOut: boolean;
  spectating: boolean;
  standing: number;
  immuneUntil: number;
  effects: Iterable<{ kind: string }>;
}
interface PickerState {
  players: { forEach(cb: (player: PickerPlayer, id: string) => void): void };
}

export interface PickerTarget {
  id: string;
  name: string;
  color: string;
  /** The number key that picks it (1-8). */
  key: number;
  /** False = greyed out; `why` says why. */
  targetable: boolean;
  why: string;
}

export interface TargetPicker {
  readonly isOpen: boolean;
  /** Every opponent, best Standing first, with whether they can be targeted now. */
  targets(): PickerTarget[];
  open(item: ItemId): void;
  close(): void;
  /** Use the held Item on this Player, if they can be targeted. Closes the picker. */
  pick(id: string): void;
}

let active: TargetPicker | null = null;
/** The picker, for the Hole scene (clicking a ball picks it; balls are marked while it's open). */
export function targetPicker(): TargetPicker | null {
  return active;
}

/**
 * The target picker, opened by holding Space with an opponent Item. Lists
 * every opponent by Standing with a number key; the ones the server would
 * refuse right now (in the Cup, offline, waiting for the next Hole, in their
 * 3 s immunity window, or already disabled for a disabling Item) are greyed
 * out, using the same rule as the server (canBeTargeted in shared). Click a
 * row or a ball, or press 1-8.
 */
export function startTargetPicker(room: Room): TargetPicker {
  const panel = document.getElementById("target-picker")!;
  const list = document.getElementById("target-list")!;
  let clockOffset = 0;
  room.onMessage("time", (message: TimeMessage) => (clockOffset = message.now - Date.now()));
  let item: ItemId | null = null;
  let lastHtml = "";

  function targets(): PickerTarget[] {
    const state = room.state as unknown as PickerState | undefined;
    if (!state?.players || !item) return [];
    const disabling = ITEM_CATALOGUE[item].disabling;
    const now = Date.now() + clockOffset;
    const rows: (PickerTarget & { standing: number })[] = [];
    state.players.forEach((p, id) => {
      if (id === room.sessionId) return;
      const kinds = Array.from(p.effects, (e) => e.kind as EffectKind);
      const disabledBy = kinds.find((k) => EFFECT_INFO[k]?.disabling);
      const why = p.holedOut
        ? "in the Cup"
        : p.spectating
          ? "next Hole"
          : !p.connected
            ? "offline"
            : now < p.immuneUntil
              ? "immune"
              : disabling && disabledBy
                ? `already ${EFFECT_INFO[disabledBy].name.toLowerCase()}`
                : "";
      rows.push({ id, name: p.name, color: p.color, key: 0, targetable: why === "", why, standing: p.standing });
    });
    rows.sort((a, b) => a.standing - b.standing);
    return rows.slice(0, 8).map(({ standing: _standing, ...row }, i) => ({ ...row, key: i + 1 }));
  }

  const render = () => {
    if (!item) return;
    requestAnimationFrame(render);
    const html = targets()
      .map(
        (t) =>
          `<button type="button" data-id="${escapeHtml(t.id)}"${t.targetable ? "" : " disabled"}><span class="key">${t.key}</span><span class="dot" style="background:${escapeHtml(t.color)}"></span>${escapeHtml(t.name)}<span class="why">${escapeHtml(t.why)}</span></button>`,
      )
      .join("");
    if (html !== lastHtml) {
      list.innerHTML = html || "<em>Nobody to target</em>";
      lastHtml = html;
    }
  };

  const picker: TargetPicker = {
    get isOpen() {
      return item !== null;
    },
    targets,
    open(next) {
      item = next;
      lastHtml = "";
      panel.hidden = false;
      render();
    },
    close() {
      item = null;
      panel.hidden = true;
    },
    pick(id) {
      const target = targets().find((t) => t.id === id);
      if (!target?.targetable) return;
      room.send("useItem", { targetId: id } satisfies UseItemMessage);
      picker.close();
    },
  };

  list.addEventListener("mousedown", (e) => {
    const button = (e.target as HTMLElement).closest("button");
    if (button?.dataset.id) picker.pick(button.dataset.id);
  });
  window.addEventListener("keydown", (e) => {
    if (!picker.isOpen || !/^Digit[1-8]$/.test(e.code)) return;
    e.preventDefault();
    const target = targets()[Number(e.code.slice(5)) - 1];
    if (target) picker.pick(target.id);
  });

  active = picker;
  return picker;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
