import type { Room } from "@colyseus/sdk";
import type { Recap } from "@troll-golf/shared";

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The Troll Recap under the final results table. The server sends it once at
 * game end (and again if the Admin flips the reveal afterwards), so this just
 * renders the latest one into #recap. The reveal block shows only when the
 * server included it.
 */
export function startRecap(room: Room): void {
  const box = document.getElementById("recap") as HTMLElement | null;
  if (!box) return;
  room.onMessage("recap", (recap: Recap) => {
    box.innerHTML = recapHtml(recap);
    box.hidden = false;
  });
}

function recapHtml(recap: Recap): string {
  const parts = ["<h3>Troll Recap</h3>"];
  if (recap.highlights.length === 0) parts.push("<p class=\"recap-none\">Nobody trolled anybody. Suspiciously peaceful.</p>");
  else {
    parts.push(
      "<ul class=\"recap-list\">" +
        recap.highlights
          .map((h) => `<li><span class="recap-icon">${escapeHtml(h.icon)}</span><b>${escapeHtml(h.title)}</b> ${escapeHtml(h.text)}</li>`)
          .join("") +
        "</ul>",
    );
  }
  if (recap.frozen.length > 1) {
    parts.push(
      `<p class="recap-small">Frozen time: ${recap.frozen.map((s) => `${escapeHtml(s.name)} ${(s.value / 1000).toFixed(1)}s`).join(" · ")}</p>`,
    );
  }
  if (recap.reveal) {
    const { adminName, entries } = recap.reveal;
    parts.push(`<h3 class="recap-reveal">👑 ${escapeHtml(adminName)} was the Golf Gods</h3>`);
    parts.push(
      entries.length === 0
        ? "<p class=\"recap-small\">...and didn't even use a power.</p>"
        : "<ul class=\"recap-list recap-reveal-list\">" +
            entries
              .map(
                (e) =>
                  `<li><b>Hole ${e.holeNumber}</b> ${e.mode === "loud" ? "👑" : "🥷"} ${escapeHtml(e.text)}${e.targetName ? ` <span class="recap-small">(${escapeHtml(e.targetName)})</span>` : ""}</li>`,
              )
              .join("") +
            "</ul>",
    );
  }
  return parts.join("");
}
