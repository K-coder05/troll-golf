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
 * The Hole being played, sent to a Player when they join (and, from ticket 05,
 * when a new Hole starts). Static geometry only: anything that changes during
 * play (balls, the Cup, terrain edits) lives in synced state.
 */
export interface HoleMessage {
  holeIndex: number;
  hole: HoleData;
}

export interface ServerMessages {
  feed: FeedMessage;
  hole: HoleMessage;
}

export type ServerMessageType = keyof ServerMessages;

/** A server message as a discriminated union: `{ type: "feed", payload: {...} }`. */
export type ServerMessage = {
  [K in ServerMessageType]: { type: K; payload: ServerMessages[K] };
}[ServerMessageType];
