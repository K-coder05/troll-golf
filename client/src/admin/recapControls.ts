import type { RevealMessage, RevealStateMessage, SessionLogMessage } from "@troll-golf/shared";
import type { Room } from "@colyseus/sdk";

/**
 * Console section for the end-of-game Troll Recap (ticket 23): the reveal
 * switch (works before and after the game ends: flipping it at the results
 * screen re-sends the Recap to everyone) and a download of the full
 * timestamped session log, offered once the server sends it at game end.
 */
export function createRecapControls(room: Room): HTMLElement {
  const box = document.createElement("div");
  box.className = "tga-panel";

  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = "👑 Reveal me in the Troll Recap";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.addEventListener("change", () => room.send("reveal", { enabled: toggle.checked } satisfies RevealMessage));
  label.append(text, toggle);

  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download session log (after game end)";
  download.disabled = true;
  let log: SessionLogMessage | null = null;
  download.addEventListener("click", () => {
    if (!log) return;
    const url = URL.createObjectURL(new Blob([log.text], { type: "application/x-ndjson" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = log.filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  room.onMessage("revealState", (message: RevealStateMessage) => (toggle.checked = message.enabled));
  room.onMessage("sessionLog", (message: SessionLogMessage) => {
    log = message;
    download.disabled = false;
    download.textContent = "Download session log";
  });

  box.append(label, download);
  return box;
}
