import type { ServerMessage } from "@troll-golf/shared";

/**
 * Who an outbound event is for. The adapter routes by this and nothing else:
 * - everyone: fx, feed lines, Golf Gods banners;
 * - player: screenFx for the victim only (ink, fog), per-Player notices;
 * - admin: x-ray and anything else only the Admin's session may see.
 */
export type Audience =
  | { kind: "everyone" }
  | { kind: "player"; playerId: string }
  | { kind: "admin" };

/** A server message plus the audience it may be delivered to. */
export type GameEvent = ServerMessage & { audience: Audience };

export const everyone: Audience = { kind: "everyone" };
export const toPlayer = (playerId: string): Audience => ({ kind: "player", playerId });
export const toAdmin: Audience = { kind: "admin" };
