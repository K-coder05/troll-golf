import type { Room } from "@colyseus/sdk";
import type { ConfigureMessage, CourseSummary, Phase, StartMessage } from "@troll-golf/shared";

/** The decoded synced state, as the lobby reads it. */
interface SyncedState {
  phase: Phase;
  creatorId: string;
  courseId: string;
  players: {
    size: number;
    forEach(cb: (player: { name: string; color: string }, id: string) => void): void;
    get(id: string): { name: string } | undefined;
  };
}

export interface LobbyOptions {
  /** The Courses the room can play (sent by the server on join). */
  courses: () => CourseSummary[];
  /** Called whenever the room enters or leaves the lobby phase. */
  onPhase: (inLobby: boolean) => void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * The Lobby screen: the room code and invite link, everyone who has joined,
 * and, for the room creator only, the Course picker and the Start button.
 * The server enforces who may configure and start; this only hides the
 * controls from everyone else.
 */
export function startLobby(room: Room, options: LobbyOptions): void {
  const els = {
    code: $("lobby-code"),
    count: $("lobby-count"),
    players: $("lobby-players"),
    course: $<HTMLSelectElement>("lobby-course"),
    courseLabel: $("lobby-course").parentElement!,
    courseName: $("lobby-course-name"),
    start: $<HTMLButtonElement>("start"),
    wait: $("lobby-wait"),
    copy: $<HTMLButtonElement>("copy-link"),
    leave: $<HTMLButtonElement>("leave"),
  };
  els.code.textContent = room.roomId;

  const inviteLink = () => `${location.origin}${location.pathname}?room=${room.roomId}`;
  els.copy.addEventListener("click", () => {
    navigator.clipboard
      ?.writeText(inviteLink())
      .then(() => {
        els.copy.textContent = "Copied!";
        setTimeout(() => (els.copy.textContent = "Copy invite link"), 1500);
      })
      .catch(() => window.prompt("Invite link", inviteLink()));
  });
  els.course.addEventListener("change", () => {
    room.send("configure", { courseId: els.course.value } satisfies ConfigureMessage);
  });
  els.start.addEventListener("click", () => {
    els.start.disabled = true;
    room.send("start", {} satisfies StartMessage);
    setTimeout(() => (els.start.disabled = false), 1000);
  });
  els.leave.addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    void room.leave();
  });

  let lastPlayers = "";
  let lastCourses = "";
  let wasLobby: boolean | null = null;

  function frame(): void {
    requestAnimationFrame(frame);
    const state = room.state as unknown as SyncedState | undefined;
    if (!state?.players) return;
    const inLobby = state.phase === "lobby";
    if (inLobby !== wasLobby) {
      wasLobby = inLobby;
      options.onPhase(inLobby);
    }
    if (!inLobby) return;

    const isCreator = state.creatorId === room.sessionId;
    const n = state.players.size;
    els.count.textContent = `${n}/8 players`;

    const rows: string[] = [];
    state.players.forEach((p, id) => {
      const tags = [id === room.sessionId ? "you" : "", id === state.creatorId ? "room creator" : ""].filter(Boolean).join(" · ");
      rows.push(
        `<li><span class="dot" style="background:${escapeHtml(p.color)}"></span><span>${escapeHtml(p.name)}</span><span class="tag">${tags}</span></li>`,
      );
    });
    const playersHtml = rows.join("");
    if (playersHtml !== lastPlayers) {
      els.players.innerHTML = playersHtml;
      lastPlayers = playersHtml;
    }

    const courses = options.courses();
    const coursesKey = courses.map((c) => c.id).join();
    if (coursesKey !== lastCourses) {
      els.course.innerHTML = courses
        .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(describe(c))}</option>`)
        .join("");
      lastCourses = coursesKey;
    }
    if (els.course.value !== state.courseId && document.activeElement !== els.course) els.course.value = state.courseId;
    const current = courses.find((c) => c.id === state.courseId);
    els.courseName.textContent = isCreator ? "" : `Course: ${current ? describe(current) : state.courseId}`;
    els.courseLabel.hidden = !isCreator;
    els.courseName.hidden = isCreator;
    els.start.hidden = !isCreator;

    const creatorName = state.players.get(state.creatorId)?.name ?? "the room creator";
    els.wait.textContent = isCreator
      ? n < 2
        ? "Share the code with friends, or start solo."
        : "Everyone in? Start when ready."
      : `Waiting for ${creatorName} to start…`;
  }
  requestAnimationFrame(frame);
}

function describe(course: CourseSummary): string {
  return `${course.name} (${course.holes} Hole${course.holes === 1 ? "" : "s"})`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
