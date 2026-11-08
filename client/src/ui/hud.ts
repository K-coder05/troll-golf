import type { Room } from "@colyseus/sdk";
import type { HoleMessage, Phase, TimeMessage } from "@troll-golf/shared";

/** The decoded synced state, as the HUD reads it. */
interface SyncedPlayer {
  name: string;
  color: string;
  holedOut: boolean;
  standing: number;
  strokes: ArrayLike<number> & { at(i: number): number | undefined };
}
interface SyncedState {
  phase: Phase;
  leaderId: string;
  holeIndex: number;
  phaseEndsAt: number;
  holeEndsAt: number;
  pars: ArrayLike<number> & { at(i: number): number | undefined };
  players: {
    size: number;
    forEach(cb: (player: SyncedPlayer, id: string) => void): void;
    get(id: string): SyncedPlayer | undefined;
  };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** What the Hole scene tells the HUD about the view. */
export interface HudView {
  /** Id of the Player whose ball a Holed-Out Player is watching, or "" when not spectating. */
  spectating: string;
}

/**
 * The DOM HUD over the Phaser canvas: Hole, Par and Strokes top-left, the
 * timer top-centre, live Standings top-right, the 3-2-1 countdown, the
 * scoreboard between Holes (and while Tab is held) and the final results.
 * It only reads synced state. Hidden in the lobby.
 */
export function startHud(room: Room, hole: () => HoleMessage | null, view: HudView): void {
  // Server clock minus ours, so clock times in state turn into countdowns even if our clock is off.
  let clockOffset = 0;
  room.onMessage("time", (message: TimeMessage) => (clockOffset = message.now - Date.now()));
  const serverNow = () => Date.now() + clockOffset;

  // Holding Tab shows the scoreboard (the Hole scene zooms out at the same time).
  let tabHeld = false;
  window.addEventListener("keydown", (e) => {
    if (e.key === "Tab") tabHeld = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Tab") tabHeld = false;
  });
  window.addEventListener("blur", () => (tabHeld = false));

  const els = {
    hud: $("hud"),
    standings: $("standings"),
    standingsTable: $("standings-table"),
    spectate: $("spectate"),
    playerCount: $("player-count"),
    holeInfo: $("hole-info"),
    timer: $("timer"),
    banner: $("banner"),
    board: $("scoreboard"),
    boardTitle: $("scoreboard-title"),
    boardTable: $("scoreboard-table"),
    boardFooter: $("scoreboard-footer"),
  };
  let lastBoard = "";
  let lastStandings = "";
  let goUntil = 0;
  let lastPhase: Phase | null = null;

  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text;
  };

  function frame(): void {
    requestAnimationFrame(frame);
    const state = room.state as unknown as SyncedState | undefined;
    if (!state?.players || !state.pars) return;
    const now = serverNow();
    const inLobby = state.phase === "lobby";
    els.hud.hidden = inLobby;
    const holeCount = state.pars.length;
    const par = state.pars.at(state.holeIndex) ?? 0;
    const me = state.players.get(room.sessionId);
    const strokes = me?.strokes.at(state.holeIndex) ?? 0;

    const n = state.players.size;
    setText(els.playerCount, `${n} player${n === 1 ? "" : "s"}`);
    const holeName = hole()?.holeIndex === state.holeIndex ? ` · ${hole()!.hole.name}` : "";
    setText(
      els.holeInfo,
      state.phase === "lobby"
        ? "Waiting to start"
        : `Hole ${state.holeIndex + 1}/${holeCount}${holeName} · Par ${par} · ${strokes} stroke${strokes === 1 ? "" : "s"}${me?.holedOut ? " · in!" : ""}`,
    );

    // Timer top-centre while playing.
    const secondsLeft = Math.max(0, Math.ceil((state.holeEndsAt - now) / 1000));
    els.timer.hidden = state.phase !== "playing";
    setText(els.timer, `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`);
    els.timer.classList.toggle("urgent", secondsLeft <= 10);

    // 3-2-1, then a short GO!
    if (lastPhase === "countdown" && state.phase === "playing") goUntil = performance.now() + 700;
    lastPhase = state.phase;
    if (state.phase === "countdown") {
      els.banner.hidden = false;
      setText(els.banner, String(Math.max(1, Math.ceil((state.phaseEndsAt - now) / 1000))));
    } else if (state.phase === "playing" && performance.now() < goUntil) {
      els.banner.hidden = false;
      setText(els.banner, "GO!");
    } else {
      els.banner.hidden = true;
    }

    // Live Standings top-right while a Hole is on.
    const live = state.phase === "countdown" || state.phase === "playing";
    els.standings.hidden = !live;
    if (live) {
      const html = standingsHtml(state, room.sessionId);
      if (html !== lastStandings) {
        els.standingsTable.innerHTML = html;
        lastStandings = html;
      }
    }

    // Holed Out: watching someone else's ball.
    const watched = view.spectating ? state.players.get(view.spectating) : undefined;
    els.spectate.hidden = !(state.phase === "playing" && me?.holedOut);
    setText(
      els.spectate,
      watched ? `In the Cup! Watching ${watched.name} · click a ball to watch it` : "In the Cup! Spectating · click a ball to watch it",
    );

    // Scoreboard between Holes, final results at the end, and while Tab is held during a Hole.
    const between = state.phase === "holeEnd" || state.phase === "gameEnd";
    const showBoard = between || (tabHeld && live);
    els.board.hidden = !showBoard;
    if (showBoard) {
      const final = state.phase === "gameEnd";
      setText(els.boardTitle, final ? "Final results" : `Hole ${state.holeIndex + 1} of ${holeCount}`);
      const next = Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000));
      setText(
        els.boardFooter,
        final
          ? "Thanks for playing!"
          : !between
            ? "Standing: total Strokes so far, closest to the Cup breaks ties"
            : state.holeIndex + 1 < holeCount
              ? `Next Hole in ${next}s`
              : `Final results in ${next}s`,
      );
      const html = scoreboardHtml(state, room.sessionId, final);
      if (html !== lastBoard) {
        els.boardTable.innerHTML = html;
        lastBoard = html;
      }
    }
  }
  requestAnimationFrame(frame);
}

/**
 * The compact live Standings: place, name, Strokes this Hole and in total.
 * A tick marks Players in the Cup, a star the Leader.
 */
function standingsHtml(state: SyncedState, myId: string): string {
  const rows: { id: string; p: SyncedPlayer; total: number }[] = [];
  state.players.forEach((p, id) => {
    let total = 0;
    for (let i = 0; i < p.strokes.length; i++) total += p.strokes.at(i) ?? 0;
    rows.push({ id, p, total });
  });
  rows.sort((a, b) => a.p.standing - b.p.standing);
  return rows
    .map(({ id, p, total }) => {
      const mark = p.holedOut ? " ✓" : id === state.leaderId ? " ★" : "";
      const cls = [id === myId ? "me" : "", p.holedOut ? "out" : ""].join(" ");
      return `<tr class="${cls}"><td class="num">${p.standing}.</td><td class="name"><span class="dot" style="background:${escapeHtml(p.color)}"></span> ${escapeHtml(p.name)}${mark}</td><td class="num">${p.strokes.at(state.holeIndex) ?? 0}</td><td class="num"><b>${total}</b></td></tr>`;
    })
    .join("");
}

/** A table of Strokes per Hole against Par, in Standing order. */
function scoreboardHtml(state: SyncedState, myId: string, final: boolean): string {
  const played = final ? state.pars.length : state.holeIndex + 1;
  const pars = Array.from({ length: played }, (_, i) => state.pars.at(i) ?? 0);
  const parTotal = pars.reduce((a, b) => a + b, 0);
  const rows: { id: string; name: string; color: string; holes: number[]; total: number; standing: number }[] = [];
  state.players.forEach((p, id) => {
    const holes = pars.map((_, i) => p.strokes.at(i) ?? 0);
    rows.push({ id, name: p.name, color: p.color, holes, total: holes.reduce((a, b) => a + b, 0), standing: p.standing });
  });
  // Standing order: lowest total first, distance to the Cup breaking ties
  // during a Hole. Equal totals share a place. Ticket 15 adds the Item Hits tiebreak.
  rows.sort((a, b) => a.standing - b.standing);

  const head = `<tr><th></th><th>Player</th>${pars.map((_, i) => `<th>${i + 1}</th>`).join("")}<th>Total</th><th>±Par</th></tr>`;
  const parRow = `<tr class="par"><td></td><td>Par</td>${pars.map((p) => `<td>${p}</td>`).join("")}<td>${parTotal}</td><td></td></tr>`;
  const body = rows
    .map((r, rank) => {
      const cells = r.holes.map((s, i) => `<td class="${s < pars[i]! ? "under" : s > pars[i]! ? "over" : ""}">${s}</td>`).join("");
      const place = rank > 0 && r.total === rows[rank - 1]!.total ? "" : String(rank + 1);
      return `<tr class="${r.id === myId ? "me" : ""}${final && rank === 0 ? " winner" : ""}"><td>${place}</td><td><span class="dot" style="background:${escapeHtml(r.color)}"></span>${escapeHtml(r.name)}</td>${cells}<td><b>${r.total}</b></td><td>${vsPar(r.total - parTotal)}</td></tr>`;
    })
    .join("");
  return `<thead>${head}</thead><tbody>${parRow}${body}</tbody>`;
}

function vsPar(diff: number): string {
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
