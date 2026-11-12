import type { Room } from "@colyseus/sdk";
import type { FeedMessage } from "@troll-golf/shared";

const MAX_LINES = 6;
const LINE_MS = 6000;

/**
 * The kill feed, right side: every `feed` line everyone gets ("Jay got
 * frozen", "Maya's Shield ate a Freeze Ray", splashes, hole-outs...). Lines
 * fade after a few seconds; at most a handful are shown.
 */
export function startKillFeed(room: Room): void {
  const feed = document.getElementById("kill-feed")!;
  room.onMessage("feed", (message: FeedMessage) => {
    const line = document.createElement("div");
    line.className = `line${/ate an? /.test(message.text) ? " block" : / got frozen| froze /.test(message.text) ? " hit" : ""}`;
    line.textContent = message.text;
    feed.append(line);
    while (feed.childElementCount > MAX_LINES) feed.firstElementChild!.remove();
    setTimeout(() => line.classList.add("fade"), LINE_MS);
    setTimeout(() => line.remove(), LINE_MS + 700);
  });
}
