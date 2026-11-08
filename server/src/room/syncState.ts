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
    const ball = synced.ball;
    ball.x = player.ball.x;
    ball.y = player.ball.y;
    ball.vx = player.ball.vx;
    ball.vy = player.ball.vy;
    ball.atRest = player.ball.atRest;
    ball.restSpot.x = player.ball.restSpot.x;
    ball.restSpot.y = player.ball.restSpot.y;

    // Strokes only change length when Holes do; write in place so only changed entries are sent.
    while (synced.strokes.length > player.strokes.length) synced.strokes.pop();
    player.strokes.forEach((n, i) => {
      if (synced.strokes[i] !== n) synced.strokes[i] = n;
    });
  }
}
