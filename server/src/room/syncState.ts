import type { RoomState } from "@troll-golf/shared";
import { EffectSchema, ItemBoxSchema, PlayerSchema, PointSchema, TerrainEditSchema, type RoomStateSchema } from "./schema";

/**
 * Copies the simulation's public state into the synced schema. Colyseus only
 * sends fields whose values changed, so copying everything every tick is cheap.
 */
export function syncState(target: RoomStateSchema, source: Readonly<RoomState>): void {
  target.code = source.code;
  target.phase = source.phase;
  target.creatorId = source.creatorId;
  target.leaderId = source.leaderId;
  target.courseId = source.courseId;
  target.holeIndex = source.holeIndex;
  target.holeEndsAt = source.holeEndsAt;
  target.phaseEndsAt = source.phaseEndsAt;
  syncNumbers(target.pars, source.pars);
  target.cup.x = source.cup.x;
  target.cup.y = source.cup.y;
  target.cup.radius = source.cup.radius;
  target.obstacleTimeMs = source.obstacleTimeMs;

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
    synced.spectating = player.spectating;
    const ball = synced.ball;
    ball.x = player.ball.x;
    ball.y = player.ball.y;
    ball.vx = player.ball.vx;
    ball.vy = player.ball.vy;
    ball.atRest = player.ball.atRest;
    ball.restSpot.x = player.ball.restSpot.x;
    ball.restSpot.y = player.ball.restSpot.y;
    synced.holedOut = player.holedOut;
    synced.standing = player.standing;
    syncNumbers(synced.strokes, player.strokes);
    synced.immuneUntil = player.immuneUntil;
    synced.itemHits = player.itemHits;
    syncEffects(synced.effects, player.effects);
  }

  syncTerrain(target.terrainEdits, source.terrainEdits);
  syncItemBoxes(target.itemBoxes, source.itemBoxes);
}

/** A Player's visible Effects: few and short-lived, so rebuild from the first id that differs. */
function syncEffects(target: PlayerSchema["effects"], source: Readonly<RoomState>["players"][string]["effects"]): void {
  let same = 0;
  while (same < target.length && same < source.length && target[same]!.id === source[same]!.id) same++;
  while (target.length > same) target.pop();
  source.forEach((effect, i) => {
    let synced = target[i];
    if (!synced) {
      synced = new EffectSchema();
      synced.id = effect.id;
      synced.kind = effect.kind;
      synced.startedAt = effect.startedAt;
      target.push(synced);
    }
    synced.endsAt = effect.endsAt;
  });
}

/** A Hole's boxes are a fixed list (rebuilt per Hole), so update in place and resize. Held Items are never synced. */
function syncItemBoxes(target: RoomStateSchema["itemBoxes"], source: Readonly<RoomState>["itemBoxes"]): void {
  while (target.length > source.length) target.pop();
  source.forEach((box, i) => {
    let synced = target[i];
    if (!synced) {
      synced = new ItemBoxSchema();
      target.push(synced);
    }
    synced.id = box.id;
    synced.x = box.x;
    synced.y = box.y;
    synced.active = box.active;
    synced.respawnAt = box.respawnAt;
  });
}

/**
 * Terrain edits are append-mostly: a new edit goes on the end and a stroke
 * being painted only gains points. So keep the synced prefix that still
 * matches by id, rebuild from the first mismatch (an edit removed by clear or
 * expiry), and append only the new points of a growing stroke.
 */
function syncTerrain(target: RoomStateSchema["terrainEdits"], source: Readonly<RoomState>["terrainEdits"]): void {
  let same = 0;
  while (same < target.length && same < source.length && target[same]!.id === source[same]!.id) same++;
  while (target.length > same) target.pop();
  source.forEach((edit, i) => {
    let synced = target[i];
    if (!synced) {
      synced = new TerrainEditSchema();
      synced.id = edit.id;
      synced.kind = edit.kind;
      synced.surface = edit.kind === "paint" ? edit.surface : "";
      synced.radius = edit.radius;
      target.push(synced);
    }
    synced.expiresAt = edit.expiresAt;
    const points = synced.points;
    while (points.length > edit.points.length) points.pop();
    for (let j = 0; j < edit.points.length; j++) {
      const p = edit.points[j]!;
      const at = points[j];
      if (!at) {
        const point = new PointSchema();
        point.x = p.x;
        point.y = p.y;
        points.push(point);
      } else if (at.x !== p.x || at.y !== p.y) {
        at.x = p.x;
        at.y = p.y;
      }
    }
  });
}

/** Write a number array in place, so only changed entries are sent. */
function syncNumbers(target: { length: number; pop(): unknown; [i: number]: number }, source: readonly number[]): void {
  while (target.length > source.length) target.pop();
  source.forEach((n, i) => {
    if (target[i] !== n) target[i] = n;
  });
}
