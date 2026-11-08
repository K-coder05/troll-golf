/**
 * The room state every client sees. The Game simulation produces exactly this
 * shape, and the Colyseus adapter mirrors it into the synced schema.
 *
 * Nothing secret belongs here (see docs/adr/0001-secret-admin-with-separate-bundle.md):
 * no admin flag, no rigged boxes, no pending lip-outs. Server-only state lives
 * inside the simulation and never reaches this type.
 */

import type { TerrainEdit } from "./terrain";

export type Phase = "lobby" | "countdown" | "playing" | "holeEnd" | "gameEnd";

export type ChaosLevel = "chill" | "normal" | "unhinged";

export interface GameSettings {
  chaosLevel: ChaosLevel;
  holeTimerSec: number;
  strokeCapOverPar: number;
  itemsEnabled: boolean;
}

/** A point on the Hole, px, y down. */
export interface PointState {
  x: number;
  y: number;
}

/** A Player's ball, as the server's physics last left it. Units: px and px/s. */
export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** True once the ball has stayed under the rest threshold long enough; only then can it be shot. */
  atRest: boolean;
  /** Where the ball last came to rest (the Tee before the first shot). */
  restSpot: PointState;
}

export interface PlayerState {
  id: string;
  name: string;
  /** CSS hex colour, e.g. "#ff3366". */
  color: string;
  /**
   * False while the Player's connection is gone (they may still reconnect).
   * A disconnected ball stays where it is, has no collisions and can't be
   * targeted; the Player keeps everything else (ball, Strokes, held Item).
   */
  connected: boolean;
  /**
   * True for a late joiner waiting for the next Hole. Their ball isn't on the
   * course, and each Hole they missed is already scored at its stroke cap.
   */
  spectating: boolean;
  ball: BallState;
  /** Strokes per Hole, indexed by Hole number (0-based). Includes penalties. */
  strokes: number[];
  /** True once the ball has dropped into the Cup on the current Hole. The Player then spectates. */
  holedOut: boolean;
  /**
   * Standing, 1 = first: Strokes from earlier Holes plus Strokes so far on
   * this Hole, with distance to the Cup breaking ties (a Holed-Out ball counts
   * as distance 0). Every Player has a distinct Standing; last-resort ties go
   * to whoever joined first. Recomputed every simulation step.
   */
  standing: number;
}

/** The Cup of the current Hole. Synced (not just in the Hole layout) because Admin Powers can move or resize it. */
export interface CupState {
  x: number;
  y: number;
  /** Capture radius, px. */
  radius: number;
}

export interface RoomState {
  /** The 4-letter room code. */
  code: string;
  phase: Phase;
  /**
   * The Player who runs the lobby: picks the Course and starts the game. The
   * room creator, or the longest-present Player once they leave. Public; it
   * has nothing to do with the (secret) Admin.
   */
  creatorId: string;
  /** The Leader: first in Standing among Players who haven't Holed Out. "" if there is none. */
  leaderId: string;
  courseId: string;
  holeIndex: number;
  /** Clock time (ms) when the current Hole's timer runs out; 0 outside the playing phase. */
  holeEndsAt: number;
  /**
   * Clock time (ms) when the current phase ends on its own: the end of the
   * countdown, the Hole timer while playing (same as holeEndsAt), or the end
   * of the scoreboard. 0 in lobby and gameEnd. Clients convert it with the
   * offset from the `time` message.
   */
  phaseEndsAt: number;
  /** Par of every Hole of the Course, in play order. Its length is the number of Holes. */
  pars: number[];
  cup: CupState;
  /**
   * Obstacle time (ms) of the current Hole: 0 when play begins, running only
   * while `playing`. Windmills and Sliding Walls are at the pose their data
   * gives for this time (see obstacles.ts), so clients compute it themselves.
   */
  obstacleTimeMs: number;
  settings: GameSettings;
  players: Record<string, PlayerState>;
  /**
   * Changes to the ground made during this Hole (Terrain Paint, later Spawn
   * Wall), oldest first; later edits win where they overlap. Replayed by every
   * client, so a late joiner or a reconnecting Player sees the same terrain.
   * Emptied when a new Hole starts. Never says who made an edit.
   */
  terrainEdits: TerrainEdit[];
}
