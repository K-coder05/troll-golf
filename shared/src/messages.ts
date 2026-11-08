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

export interface ClientMessages {
  shoot: ShootMessage;
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

export interface ServerMessages {
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
