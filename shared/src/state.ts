/**
 * The room state every client sees. The Game simulation produces exactly this
 * shape, and the Colyseus adapter mirrors it into the synced schema.
 *
 * Nothing secret belongs here (see docs/adr/0001-secret-admin-with-separate-bundle.md):
 * no admin flag, no rigged boxes, no pending lip-outs. Server-only state lives
 * inside the simulation and never reaches this type.
 */

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
  connected: boolean;
  ball: BallState;
  /** Strokes per Hole, indexed by Hole number (0-based). Includes penalties. */
  strokes: number[];
  /** True once the ball has dropped into the Cup on the current Hole. The Player then spectates. */
  holedOut: boolean;
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
  settings: GameSettings;
  players: Record<string, PlayerState>;
}
