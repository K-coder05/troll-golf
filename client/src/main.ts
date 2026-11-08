import type { Room } from "@colyseus/sdk";
import {
  isValidRoomCode,
  normalizeRoomCode,
  type FeedMessage,
  type HoleMessage,
  type JoinOptions,
} from "@troll-golf/shared";
import * as Phaser from "phaser";
import { createRoom, joinRoom } from "./net/connection";
import { HoleScene, type HoleSceneData } from "./scenes/HoleScene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("join-form");
const nameInput = $<HTMLInputElement>("name");
const colorInput = $<HTMLInputElement>("color");
const codeInput = $<HTMLInputElement>("code");
const createButton = $<HTMLButtonElement>("create");
const joinButton = $<HTMLButtonElement>("join");
const errorText = $<HTMLParagraphElement>("error");

// A shared link can carry the code: https://example/?room=GOLF
const linkedCode = new URLSearchParams(location.search).get("room");
if (linkedCode) codeInput.value = normalizeRoomCode(linkedCode);

function joinOptions(): JoinOptions | null {
  const name = nameInput.value.trim();
  if (!name) {
    errorText.textContent = "Pick a nickname first.";
    nameInput.focus();
    return null;
  }
  return { name, color: colorInput.value };
}

async function enter(connect: (options: JoinOptions) => Promise<Room>): Promise<void> {
  const options = joinOptions();
  if (!options) return;
  errorText.textContent = "";
  createButton.disabled = joinButton.disabled = true;
  try {
    startGame(await connect(options));
  } catch (err) {
    console.error(err);
    errorText.textContent = "Couldn't join that room. Check the code, or it may be full.";
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

function startGame(room: Room): void {
  $("lobby").hidden = true;
  $("hud").hidden = false;
  $("room-code").textContent = room.roomId;
  history.replaceState(null, "", `?room=${room.roomId}`);

  // Register handlers right away: the server sends the Hole as soon as we join.
  let hole: HoleMessage | null = null;
  room.onMessage("hole", (message: HoleMessage) => (hole = message));
  room.onMessage("feed", (message: FeedMessage) => console.info(`[feed] ${message.text}`));

  const playerCount = $("player-count");
  room.onStateChange((state: { players?: { size: number } }) => {
    const n = state.players?.size ?? 0;
    playerCount.textContent = `${n} player${n === 1 ? "" : "s"}`;
  });
  room.onLeave(() => {
    errorText.textContent = "Disconnected from the room.";
    location.reload();
  });

  const strokesText = $("strokes");
  const sceneData: HoleSceneData = {
    room,
    hole: () => hole,
    onStrokes: (n) => {
      const text = `${n} stroke${n === 1 ? "" : "s"}`;
      if (strokesText.textContent !== text) strokesText.textContent = text;
    },
  };

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#12301c",
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    scene: [],
    callbacks: {
      postBoot: (game) => game.scene.add("hole", HoleScene, true, sceneData),
    },
  });
}
