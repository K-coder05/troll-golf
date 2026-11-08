/**
 * Everything a session can ask the simulation to do. The adapter turns
 * network messages and connection events into these; the simulation decides
 * whether they are allowed.
 *
 * Later tickets add shoot, useItem, emote and admin here.
 */
export type Intent =
  | { type: "join"; name: string; color: string }
  | { type: "leave" }
  | { type: "cursor"; x: number; y: number };

export type IntentRejection =
  | "room_full"
  | "already_joined"
  | "unknown_player"
  | "invalid_payload";

export type IntentResult = { ok: true } | { ok: false; reason: IntentRejection };
