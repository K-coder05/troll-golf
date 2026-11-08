/**
 * Network contract between client and server.
 *
 * Clients send intents only, never positions or results. The server answers
 * with state patches plus the one-shot messages below. Each message type here
 * is also the Colyseus message name.
 */

import type { HoleData } from "./course";

/** The single Colyseus room type. */
export const ROOM_NAME = "golf";

/** Options a client passes when creating or joining a room. */
export interface JoinOptions {
  name: string;
  color: string;
  /** Admin secret (ticket 09). Checked by the adapter, never stored in state. */
  adminSecret?: string;
}

// ---- Client -> server ------------------------------------------------------

/** Shoot the ball. Accepted only while the ball is at rest. */
export interface ShootMessage {
  /** Direction of travel, radians (0 = +x, clockwise on screen because y is down). */
  angle: number;
  /** 0..1 of the maximum shot power. */
  power: number;
}

/** Lobby settings the room creator changes. Fields left out stay as they are. Ticket 24 adds the chaos level. */
export interface ConfigureMessage {
  courseId?: string;
}

/** Start the game from the lobby. Room creator only. */
export type StartMessage = Record<string, never>;

export interface ClientMessages {
  shoot: ShootMessage;
  configure: ConfigureMessage;
  start: StartMessage;
}

export type ClientMessageType = keyof ClientMessages;

// ---- Server -> client ------------------------------------------------------

/** A kill-feed line. */
export interface FeedMessage {
  text: string;
}

/**
 * The Hole being played, sent to a Player when they join and to everyone
 * when a new Hole starts. Static geometry only: anything that changes during
 * play (balls, the Cup, terrain edits) lives in synced state.
 */
export interface HoleMessage {
  holeIndex: number;
  hole: HoleData;
}

/**
 * A one-shot visual effect at a point of the Hole. Cosmetic: carries no secrets.
 * `holeOut`: a ball dropped into the Cup. `lipOut`: a ball rolled over the Cup too fast.
 */
export interface FxMessage {
  kind: "splash" | "void" | "boost" | "teleport" | "holeOut" | "lipOut";
  x: number;
  y: number;
}

/**
 * The server clock, sent to a Player when they join, so the client can turn
 * the clock times in state (phaseEndsAt, holeEndsAt) into a countdown even if
 * its own clock is off.
 */
export interface TimeMessage {
  /** Server clock time (ms) when the message was sent. */
  now: number;
}

/** A Course the room creator can pick in the lobby. */
export interface CourseSummary {
  id: string;
  name: string;
  /** Number of Holes. */
  holes: number;
}

/** The Courses this room can play, sent to a Player when they join. */
export interface CoursesMessage {
  courses: CourseSummary[];
}

export interface ServerMessages {
  courses: CoursesMessage;
  feed: FeedMessage;
  fx: FxMessage;
  hole: HoleMessage;
  time: TimeMessage;
}

export type ServerMessageType = keyof ServerMessages;

/** A server message as a discriminated union: `{ type: "feed", payload: {...} }`. */
export type ServerMessage = {
  [K in ServerMessageType]: { type: K; payload: ServerMessages[K] };
}[ServerMessageType];
