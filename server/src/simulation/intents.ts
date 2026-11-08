/**
 * Everything a session can ask the simulation to do. The adapter turns
 * network messages and connection events into these; the simulation decides
 * whether they are allowed.
 *
 * Later tickets add useItem, emote and admin here.
 */
export type Intent =
  | { type: "join"; name: string; color: string }
  | { type: "leave" }
  /**
   * Start the game from the lobby. For now any Player may start it and the
   * adapter sends it on the first join; ticket 07 limits it to the room
   * creator's Start button.
   */
  | { type: "start" }
  /** angle: radians, direction of travel (0 = +x, clockwise on screen). power: 0..1 of max. */
  | { type: "shoot"; angle: number; power: number };

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
  | "holed_out";

export type IntentResult = { ok: true } | { ok: false; reason: IntentRejection };
