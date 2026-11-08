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

/** Where a Player's pointer is on the course. M0 only; later tickets may drop it. */
export interface CursorState {
  x: number;
  y: number;
  /** False until the Player has moved their pointer over the course. */
  active: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  /** CSS hex colour, e.g. "#ff3366". */
  color: string;
  connected: boolean;
  cursor: CursorState;
}

export interface RoomState {
  /** The 4-letter room code. */
  code: string;
  phase: Phase;
  courseId: string;
  holeIndex: number;
  /** Clock time (ms) when the current Hole ends; 0 when no Hole is running. */
  holeEndsAt: number;
  settings: GameSettings;
  players: Record<string, PlayerState>;
}
