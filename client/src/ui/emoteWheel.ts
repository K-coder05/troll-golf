import type { Room } from "@colyseus/sdk";
import { EMOTE_KINDS, type EmoteKind, type EmoteMessage } from "@troll-golf/shared";

const LABELS: Record<EmoteKind, string> = {
  laugh: "\u{1F602}",
  salty: "\u{1F9C2}",
  gg: "GG",
  what: "???",
};
/** The server allows one emote a second; the wheel greys out for as long locally so presses aren't wasted. */
const COOLDOWN_MS = 1000;

/**
 * Press Q to open a wheel of emotes, then click one (or press 1-4). It sends
 * an `emote` intent; the server validates and rate-limits it and tells
 * everyone, and the Hole scene floats it over the ball.
 */
export function startEmoteWheel(room: Room): void {
  const wheel = document.getElementById("emote-wheel")!;
  const hud = document.getElementById("hud")!;
  let readyAt = 0;

  wheel.replaceChildren(
    ...EMOTE_KINDS.map((kind, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `emote emote-${i}`;
      button.dataset.kind = kind;
      button.textContent = LABELS[kind];
      button.title = `${kind} (${i + 1})`;
      return button;
    }),
  );

  const close = () => (wheel.hidden = true);
  const send = (kind: EmoteKind) => {
    close();
    if (Date.now() < readyAt) return;
    readyAt = Date.now() + COOLDOWN_MS;
    room.send("emote", { kind } satisfies EmoteMessage);
  };

  wheel.addEventListener("click", (e) => {
    const kind = (e.target as HTMLElement).closest<HTMLElement>("button")?.dataset.kind as EmoteKind | undefined;
    if (kind) send(kind);
  });
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
    if (e.code === "KeyQ" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (hud.hidden) return; // not in the game yet
      wheel.hidden = !wheel.hidden;
      return;
    }
    if (wheel.hidden) return;
    if (e.code === "Escape") close();
    const digit = /^Digit([1-4])$/.exec(e.code);
    if (digit) {
      e.preventDefault();
      send(EMOTE_KINDS[Number(digit[1]) - 1]!);
    }
  });
}
