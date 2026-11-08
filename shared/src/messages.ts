/**
 * Network contract between client and server.
 *
 * Clients send intents only, never positions or results. The server answers
 * with state patches plus the one-shot messages below. Each message type here
 * is also the Colyseus message name.
 */

import type { AdminBundleMessage, AdminMessage, AdminResultMessage, BannerMessage } from "./admin";
import type { HoleData } from "./course";
import type { ItemDeniedMessage, ItemId, ItemSlotMessage, UseItemMessage } from "./items";

/** The single Colyseus room type. */
export const ROOM_NAME = "golf";

/** Options a client passes when creating or joining a room. */
export interface JoinOptions {
  name: string;
  color: string;
  /**
   * The admin secret, if this Player claims to be the Admin. The adapter
   * compares it with the ADMIN_SECRET env var; a wrong one joins as an
   * ordinary Player. Never stored in state.
   */
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

/** A mash click while Frozen (no payload). */
export type MashMessage = Record<string, never>;

/** Start the game from the lobby. Room creator only. */
export type StartMessage = Record<string, never>;

export interface ClientMessages {
  shoot: ShootMessage;
  configure: ConfigureMessage;
  start: StartMessage;
  /** Use the held Item. */
  useItem: UseItemMessage;
  /** One click of mashing to break out of a Freeze sooner. Ignored when not Frozen. */
  mash: MashMessage;
  /** Use an Admin Power (the Admin's session only). */
  admin: AdminMessage;
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
 * `grab`: the Golf Gods picking a ball up or putting it down (Loud Ball Grab only).
 * `nukeSiren`: a Nuke is incoming at (x, y): 3 s of siren and red flash (Stealth too: a Nuke is always spectacular).
 * `nukeBlast`: it goes off: white-out, screen shake, balls fly outward from (x, y).
 * `nukeAbort`: the Hole ended before the Nuke went off; stop the siren.
 * `itemBox`: an Item Box shattered at (x, y) (it never says what was inside).
 * `itemUse`: `item` was used at (x, y); the client's renderer for that Item plays it.
 * `shieldPop`: a Shield absorbed an attack at (x, y) (the ball's spot).
 * `thaw`: a Freeze ended at (x, y): the ice cracks.
 */
export interface FxMessage {
  kind:
    | "splash"
    | "void"
    | "boost"
    | "teleport"
    | "holeOut"
    | "lipOut"
    | "grab"
    | "nukeSiren"
    | "nukeBlast"
    | "nukeAbort"
    | "itemBox"
    | "itemUse"
    | "shieldPop"
    | "thaw";
  x: number;
  y: number;
  /** `itemUse` and `shieldPop`: which Item. */
  item?: ItemId;
  /** `itemUse` of a targeted Item, `shieldPop`, `thaw`: whose ball. */
  targetId?: string;
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
  /** Admin only: where to load the admin client bundle. Sent by the adapter, never by the simulation. */
  adminBundle: AdminBundleMessage;
  /** Admin only: the outcome of an Admin Power use. */
  adminResult: AdminResultMessage;
  /** Everyone: the Golf Gods banner of a Loud Admin Power. */
  banner: BannerMessage;
  courses: CoursesMessage;
  feed: FeedMessage;
  fx: FxMessage;
  hole: HoleMessage;
  /** The holder only: what is in their item slot. */
  item: ItemSlotMessage;
  /** The holder only: an Item use was refused (the Item is kept). */
  itemDenied: ItemDeniedMessage;
  time: TimeMessage;
}

export type ServerMessageType = keyof ServerMessages;

/** A server message as a discriminated union: `{ type: "feed", payload: {...} }`. */
export type ServerMessage = {
  [K in ServerMessageType]: { type: K; payload: ServerMessages[K] };
}[ServerMessageType];
