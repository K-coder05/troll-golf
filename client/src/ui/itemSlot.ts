import type { Room } from "@colyseus/sdk";
import {
  ITEM_CATALOGUE,
  ITEM_IDS,
  ITEM_TUNING,
  type ItemDeniedMessage,
  type ItemId,
  type ItemSlotMessage,
  type TimeMessage,
  type UseItemMessage,
} from "@troll-golf/shared";
import { placement } from "../items/bananaMine";
import { crosshair } from "../items/golfGun";
import { startTargetPicker } from "./targetPicker";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Short reasons for a refused use, shown under the slot. */
const DENIED: Record<string, string> = {
  holed_out: "Not after holing out",
  no_shot: "No shot to take back yet",
  item_not_ready: "Still spinning…",
  wrong_phase: "Not right now",
  spectating: "Wait for the next Hole",
  no_target: "Nobody can be targeted right now",
  untargetable: "Can't hit them right now",
  bad_placement: "Too close to the Cup",
  unknown_target: "Can't hit them",
};

/** Holding Space this long with an opponent Item opens the target picker instead of a tap. */
const HOLD_MS = 220;

/**
 * The item slot, bottom-centre. Only this Player's own Item is ever shown:
 * the server tells the holder alone. On a pickup it plays a 1.5 s
 * slot-machine roulette (display only: the server already decided), then
 * shows the Item. Tap Space or click the slot to use it (an opponent Item
 * then hits the Leader, or the next-best Standing who can be targeted).
 * Holding Space with an opponent Item opens the target picker while held.
 */
export function startItemSlot(room: Room): void {
  const slot = $("item-slot");
  const icon = $("item-icon");
  const name = $("item-name");
  const note = $("item-note");
  let item: ItemId | null = null;
  let spinUntil = 0;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  const picker = startTargetPicker(room);
  // Golf Gun crosshair mode: shots left and when it runs out (server clock).
  let active: { shotsLeft: number; endsAt: number } | null = null;
  let clockOffset = 0;
  room.onMessage("time", (message: TimeMessage) => (clockOffset = message.now - Date.now()));
  const setActive = (next: typeof active) => {
    active = next;
    crosshair.armed = next !== null;
    document.body.classList.toggle("crosshair", next !== null);
  };

  const show = (id: ItemId | null) => {
    icon.textContent = id ? ITEM_CATALOGUE[id].icon : "";
    name.textContent = id ? ITEM_CATALOGUE[id].name : "";
    slot.classList.toggle("empty", !id);
  };

  room.onMessage("item", (message: ItemSlotMessage) => {
    item = message.item;
    if (placement.armed) {
      placement.armed = false;
      document.body.classList.remove("crosshair");
    }
    note.textContent = "";
    setActive(message.item && message.active ? message.active : null);
    if (!item) picker.close();
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
    if (active) {
      const left = Math.max(0, Math.ceil((active.endsAt - (Date.now() + clockOffset)) / 1000));
      name.textContent = `${active.shotsLeft} shot${active.shotsLeft === 1 ? "" : "s"} · ${left}s`;
    }
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
    if (!item || spinUntil || active) return; // armed: clicks on the Hole are the shots
    // A Banana Mine from a Holed-Out Player: click the Hole to place it (use again to cancel).
    const me = (room.state as { players?: { get(id: string): { holedOut: boolean } | undefined } }).players?.get(room.sessionId);
    if (ITEM_CATALOGUE[item].targeting === "placed" && me?.holedOut) {
      placement.armed = !placement.armed;
      document.body.classList.toggle("crosshair", placement.armed);
      return;
    }
    room.send("useItem", {} satisfies UseItemMessage);
  };
  slot.addEventListener("click", use);
  // Tap Space = use (targeted Items go to the Leader); hold Space = the target picker, open while held.
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
    if (slot.hidden) return; // the HUD isn't showing (lobby)
    e.preventDefault();
    if (e.repeat || pressed) return;
    pressed = true;
    if (!item || spinUntil || active) return;
    if (ITEM_CATALOGUE[item].targeting !== "opponent") {
      use();
      return;
    }
    const held = item;
    holdTimer = setTimeout(() => {
      holdTimer = undefined;
      if (item === held) picker.open(held);
    }, HOLD_MS);
  });
  const release = () => {
    if (!pressed) return;
    pressed = false;
    if (holdTimer !== undefined) {
      clearTimeout(holdTimer);
      holdTimer = undefined;
      use();
    }
    picker.close();
  };
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") release();
  });
  window.addEventListener("blur", release);
}
