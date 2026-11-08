import type { RoomState } from "@troll-golf/shared";
import { PlayerSchema, type RoomStateSchema } from "./schema";

/**
 * Copies the simulation's public state into the synced schema. Colyseus only
 * sends fields whose values changed, so copying everything every tick is cheap.
 */
export function syncState(target: RoomStateSchema, source: Readonly<RoomState>): void {
  target.code = source.code;
  target.phase = source.phase;
  target.courseId = source.courseId;
  target.holeIndex = source.holeIndex;
  target.holeEndsAt = source.holeEndsAt;

  target.settings.chaosLevel = source.settings.chaosLevel;
  target.settings.holeTimerSec = source.settings.holeTimerSec;
  target.settings.strokeCapOverPar = source.settings.strokeCapOverPar;
  target.settings.itemsEnabled = source.settings.itemsEnabled;

  for (const id of [...target.players.keys()]) {
    if (!(id in source.players)) target.players.delete(id);
  }
  for (const [id, player] of Object.entries(source.players)) {
    let synced = target.players.get(id);
    if (!synced) {
      synced = new PlayerSchema();
      target.players.set(id, synced);
    }
    synced.id = player.id;
    synced.name = player.name;
    synced.color = player.color;
    synced.connected = player.connected;
    synced.cursor.x = player.cursor.x;
    synced.cursor.y = player.cursor.y;
    synced.cursor.active = player.cursor.active;
  }
}
