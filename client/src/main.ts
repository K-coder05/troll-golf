import type { Room } from "@colyseus/sdk";
import {
  type AdminBundleMessage,
  type BannerMessage,
  isValidRoomCode,
  normalizeRoomCode,
  type CourseSummary,
  type CoursesMessage,
  type EmoteEventMessage,
  type FeedMessage,
  type FxMessage,
  type HoleMessage,
  type JoinOptions,
} from "@troll-golf/shared";
import * as Phaser from "phaser";
import type { AdminBundle } from "./adminHost";
import { createRoom, forgetSeat, joinRoom, rejoinRoom, rememberSeat, serverResource } from "./net/connection";
import { HoleScene, type HoleSceneData } from "./scenes/HoleScene";
import { startHud, type HudView } from "./ui/hud";
import { startEmoteWheel } from "./ui/emoteWheel";
import { startItemSlot } from "./ui/itemSlot";
import { startKillFeed } from "./ui/killFeed";
import { startLobby } from "./ui/lobby";
import { startMuteButton } from "./ui/muteButton";

startMuteButton();

// The Hole scene, once it's up; the admin bundle asks it for world coordinates and hit-tests.
let holeScene: HoleScene | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("join-form");
const nameInput = $<HTMLInputElement>("name");
const colorInput = $<HTMLInputElement>("color");
const codeInput = $<HTMLInputElement>("code");
const createButton = $<HTMLButtonElement>("create");
const joinButton = $<HTMLButtonElement>("join");
const errorText = $<HTMLParagraphElement>("error");
const secretInput = $<HTMLInputElement>("secret");

/** Ball colours offered as one-click swatches; the colour input next to them takes any other. */
const SWATCHES = ["#ff3366", "#ff9f40", "#ffd24d", "#5cd65c", "#40e0d0", "#4da6ff", "#c266ff", "#f2f2f2"];
const PROFILE_KEY = "troll-golf:profile";

// ---- Screen flow: Title -> Create/Join -> Lobby -> game ----

type Screen = "title" | "join-screen" | "lobby-screen" | "game";
function show(screen: Screen): void {
  for (const id of ["title", "join-screen", "lobby-screen"] as const) $(id).hidden = id !== screen;
}

// A shared link can carry the code: https://example/?room=GOLF. It skips the title.
const linkedCode = new URLSearchParams(location.search).get("room");
if (linkedCode) codeInput.value = normalizeRoomCode(linkedCode);
show(linkedCode ? "join-screen" : "title");
// After a page reload mid-game this tab still has its seat: come back as the same Player.
if (linkedCode && isValidRoomCode(normalizeRoomCode(linkedCode))) {
  show("game");
  void rejoinRoom(normalizeRoomCode(linkedCode)).then((room) => {
    if (room) enterRoom(room);
    else show("join-screen");
  });
}
// Backtick on the Create/Join screen shows the passphrase field (the admin secret). Nothing advertises it.
window.addEventListener("keydown", (e) => {
  if (e.code !== "Backquote" || $("join-screen").hidden) return;
  e.preventDefault();
  secretInput.hidden = !secretInput.hidden;
  if (!secretInput.hidden) secretInput.focus();
});
$("play").addEventListener("click", () => {
  show("join-screen");
  nameInput.focus();
});

// ---- Create/Join: nickname, colour, code ----

const swatches = $("swatches");
const swatchButtons = SWATCHES.map((color) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.background = color;
  button.title = color;
  button.addEventListener("click", () => setColor(color));
  swatches.insertBefore(button, colorInput);
  return button;
});
function setColor(color: string): void {
  colorInput.value = color;
  swatchButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(SWATCHES[i] === color)));
}
colorInput.addEventListener("input", () => setColor(colorInput.value));

// Remember the last nickname and colour on this device (a convenience; fine if storage is blocked).
try {
  const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as { name?: string; color?: string } | null;
  if (saved?.name) nameInput.value = saved.name;
  setColor(saved?.color && /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : SWATCHES[0]!);
} catch {
  setColor(SWATCHES[0]!);
}

function joinOptions(): JoinOptions | null {
  const name = nameInput.value.trim();
  if (!name) {
    errorText.textContent = "Pick a nickname first.";
    nameInput.focus();
    return null;
  }
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, color: colorInput.value }));
  } catch {
    // Storage blocked: nothing to remember.
  }
  const secret = secretInput.value;
  return secret ? { name, color: colorInput.value, adminSecret: secret } : { name, color: colorInput.value };
}

async function enter(connect: (options: JoinOptions) => Promise<Room>): Promise<void> {
  const options = joinOptions();
  if (!options) return;
  errorText.textContent = "";
  createButton.disabled = joinButton.disabled = true;
  try {
    enterRoom(await connect(options));
  } catch (err) {
    console.error(err);
    errorText.textContent = /admin_taken/.test(String(err))
      ? "That passphrase is already in use in this room."
      : "Couldn't join that room. Check the code, or it may be full.";
  } finally {
    createButton.disabled = joinButton.disabled = false;
  }
}

createButton.addEventListener("click", () => void enter(createRoom));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = normalizeRoomCode(codeInput.value);
  if (!isValidRoomCode(code)) {
    errorText.textContent = "Room codes are 4 letters.";
    codeInput.focus();
    return;
  }
  void enter((options) => joinRoom(code, options));
});

// ---- In a room: the lobby, then the game ----

function enterRoom(room: Room): void {
  $("room-code").textContent = room.roomId;
  history.replaceState(null, "", `?room=${room.roomId}`);
  rememberSeat(room);

  // Register handlers right away: the server sends these as soon as we join.
  let hole: HoleMessage | null = null;
  room.onMessage("hole", (message: HoleMessage) => (hole = message));
  let courses: CourseSummary[] = [];
  room.onMessage("courses", (message: CoursesMessage) => (courses = message.courses));
  const pendingFx: FxMessage[] = [];
  room.onMessage("fx", (message: FxMessage) => pendingFx.push(message));
  const pendingEmotes: EmoteEventMessage[] = [];
  room.onMessage("emote", (message: EmoteEventMessage) => pendingEmotes.push(message));
  room.onMessage("feed", (message: FeedMessage) => console.info(`[feed] ${message.text}`));
  room.onMessage("banner", (message: BannerMessage) => showGodsBanner(message));
  // Only the authenticated Admin's session is ever sent this; everyone else never loads anything.
  room.onMessage("adminBundle", (message: AdminBundleMessage) => void loadAdminBundle(room, message));

  const view: HudView = { spectating: "" };
  startHud(room, () => hole, view);
  startItemSlot(room);
  startKillFeed(room);
  startEmoteWheel(room);
  startLobby(room, {
    courses: () => courses,
    // The lobby screen covers the game until the room creator starts it.
    onPhase: (inLobby) => show(inLobby ? "lobby-screen" : "game"),
  });
  show("lobby-screen");
  // A dropped connection: the SDK keeps retrying with our reconnection token
  // while the server holds our seat (and our ball, frozen). Say so meanwhile.
  const connectionBanner = $("connection");
  room.onDrop(() => (connectionBanner.hidden = false));
  room.onReconnect(() => {
    connectionBanner.hidden = true;
    rememberSeat(room);
  });
  room.onLeave(() => {
    // Left for good (or reconnecting failed): back to the join screen with the code still in the address bar.
    forgetSeat();
    location.reload();
  });

  const sceneData: HoleSceneData = {
    room,
    hole: () => hole,
    takeFx: () => pendingFx.splice(0),
    takeEmotes: () => pendingEmotes.splice(0),
    view,
  };

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#12301c",
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    scene: [],
    callbacks: {
      postBoot: (game) => {
        holeScene = game.scene.add("hole", HoleScene, true, sceneData) as HoleScene;
      },
    },
  });
}

// ---- The Golf Gods banner (a Loud Admin Power; it never says who) ----

let godsTimer: ReturnType<typeof setTimeout> | undefined;
function showGodsBanner(message: BannerMessage): void {
  const banner = $("gods-banner");
  $("gods-text").textContent = message.text;
  $("gods-detail").textContent = message.detail ?? "";
  // Restart the entrance animation for back-to-back banners.
  banner.hidden = true;
  void banner.offsetWidth;
  banner.hidden = false;
  clearTimeout(godsTimer);
  godsTimer = setTimeout(() => (banner.hidden = true), 3000);
}

// ---- Extra code the server hands this session (once per page) ----

let adminBundleLoaded = false;

async function loadAdminBundle(room: Room, message: AdminBundleMessage): Promise<void> {
  if (adminBundleLoaded) return;
  adminBundleLoaded = true;
  try {
    const bundle = (await import(/* @vite-ignore */ serverResource(message.path))) as AdminBundle;
    bundle.mount({ room, view: () => holeScene?.adminView() ?? null });
  } catch (err) {
    adminBundleLoaded = false;
    console.error(err);
  }
}
