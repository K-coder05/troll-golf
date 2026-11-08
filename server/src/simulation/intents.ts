import type { AdminIntent } from "./admin";

/**
 * Everything a session can ask the simulation to do. The adapter turns
 * network messages and connection events into these; the simulation decides
 * whether they are allowed.
 *
 * Later tickets add useItem and emote here.
 */
export type Intent =
  /**
   * `admin`: the adapter already checked the admin secret. At most one Admin
   * per room; a second is refused (`admin_taken`).
   */
  | { type: "join"; name: string; color: string; admin?: boolean }
  /**
   * The Player is gone for good (a consented leave, or their reconnection
   * window ran out). In the lobby they are removed; mid-game their ball and
   * scores stay, disconnected, and they can't come back as the same Player.
   */
  | { type: "leave" }
  /** The connection dropped; the Player may still reconnect as themselves. */
  | { type: "disconnect" }
  /** A dropped Player is back with their same ball, Strokes and held Item. */
  | { type: "reconnect" }
  /** Start the game from the lobby. Only the room creator (state.creatorId) may. */
  | { type: "start" }
  /** Change lobby settings (room creator only, lobby only). Ticket 24 adds chaosLevel. */
  | { type: "configure"; courseId?: string }
  /** angle: radians, direction of travel (0 = +x, clockwise on screen). power: 0..1 of max. */
  | { type: "shoot"; angle: number; power: number }
  /**
   * Use an Admin Power. Untrusted: the simulation checks that the sender is
   * the Admin and validates power, mode and params (see admin.ts).
   */
  | AdminIntent;

export type IntentRejection =
  | "room_full"
  | "already_joined"
  | "unknown_player"
  | "invalid_payload"
  /** Shots are only allowed once the ball is at rest. */
  | "ball_moving"
  /** Not allowed in the current phase (e.g. a shot during the countdown, a start mid-game). */
  | "wrong_phase"
  /** The Player's ball is already in the Cup. */
  | "holed_out"
  /** Only the room creator may change lobby settings or start the game. */
  | "not_creator"
  /** No such Course in this room's catalogue. */
  | "unknown_course"
  /** The Player is disconnected (a disconnect twice, or a shot from a dropped session). */
  | "not_connected"
  /** A reconnect from a Player who never dropped. */
  | "already_connected"
  /** A reconnect from a Player who already left the game for good. */
  | "left_game"
  /** A late joiner waiting for the next Hole has no ball on the course. */
  | "spectating"
  /** The room already has an Admin. */
  | "admin_taken"
  /** An admin intent from anyone but the Admin. */
  | "not_admin"
  /** No such Admin Power. */
  | "unknown_power"
  /** An Admin Power aimed at a Player who isn't in the room. */
  | "unknown_target"
  /** Ball Grab on a ball that isn't in play (Holed Out, disconnected, a waiting late joiner) or outside the playing phase. */
  | "not_in_play"
  /** Ball Grab move or release with no ball held. */
  | "not_holding"
  /** Nuke while another one is still pending, or with an impact point outside the Hole. */
  | "nuke_pending"
  /** Lip-Out on a Player whose ball can't drop into the Cup right now (Holed Out). */
  | "no_ball_in_play";

export type IntentResult = { ok: true } | { ok: false; reason: IntentRejection };
