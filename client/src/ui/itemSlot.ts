import type { Room } from "@colyseus/sdk";
import {
  ITEM_CATALOGUE,
  ITEM_IDS,
  ITEM_TUNING,
  type ItemDeniedMessage,
  type ItemId,
  type ItemSlotMessage,
  type UseItemMessage,
} from "@troll-golf/shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Short reasons for a refused use, shown under the slot. */
const DENIED: Record<string, string> = {
  holed_out: "Not after holing out",
  no_shot: "No shot to take back yet",
  item_not_ready: "Still spinning…",
  wrong_phase: "Not right now",
  spectating: "Wait for the next Hole",
};

/**
 * The item slot, bottom-centre. Only this Player's own Item is ever shown:
 * the server tells the holder alone. On a pickup it plays a 1.5 s
 * slot-machine roulette (display only: the server already decided), then
 * shows the Item. Tap Space or click the slot to use it.
 * Ticket 15 turns holding Space into the target picker.
 */
export function startItemSlot(room: Room): void {
  const slot = $("item-slot");
  const icon = $("item-icon");
  const name = $("item-name");
  const note = $("item-note");
  let item: ItemId | null = null;
  let spinUntil = 0;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  const show = (id: ItemId | null) => {
    icon.textContent = id ? ITEM_CATALOGUE[id].icon : "";
    name.textContent = id ? ITEM_CATALOGUE[id].name : "";
    slot.classList.toggle("empty", !id);
  };

  room.onMessage("item", (message: ItemSlotMessage) => {
    item = message.item;
    note.textContent = "";
    if (!message.roulette || !item) {
      spinUntil = 0;
      slot.classList.remove("spinning");
      show(item);
      return;
    }
    spinUntil = performance.now() + ITEM_TUNING.rouletteMs;
    slot.classList.add("spinning");
    name.textContent = "";
    slot.classList.remove("empty");
  });

  room.onMessage("itemDenied", (message: ItemDeniedMessage) => {
    note.textContent = DENIED[message.reason] ?? "Can't use that now";
    slot.classList.remove("denied");
    void slot.offsetWidth;
    slot.classList.add("denied");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note.textContent = ""), 1800);
  });

  // The roulette: flick through the Items, slowing down, then land on ours.
  let lastFlick = 0;
  let flick = 0;
  const hud = $("hud");
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // Shown with the rest of the HUD (not in the lobby).
    if (slot.hidden !== hud.hidden) slot.hidden = hud.hidden;
    if (!spinUntil) return;
    const left = spinUntil - now;
    if (left <= 0) {
      spinUntil = 0;
      slot.classList.remove("spinning");
      slot.classList.add("landed");
      setTimeout(() => slot.classList.remove("landed"), 400);
      show(item);
      return;
    }
    const interval = 50 + (1 - left / ITEM_TUNING.rouletteMs) * 140;
    if (now - lastFlick < interval) return;
    lastFlick = now;
    flick = (flick + 1) % ITEM_IDS.length;
    icon.textContent = ITEM_CATALOGUE[ITEM_IDS[flick]!].icon;
  };
  requestAnimationFrame(frame);

  const use = () => {
    if (!item || spinUntil) return;
    room.send("useItem", {} satisfies UseItemMessage);
  };
  slot.addEventListener("click", use);
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
    if (slot.hidden) return; // the HUD isn't showing (lobby)
    e.preventDefault();
    use();
  });
}
