import type { GameEvent } from "../simulation";

/** The connections an event can be delivered to, as seen by the adapter. */
export interface Recipients<C> {
  all: readonly C[];
  /** The connection currently bound to a Player, if any. */
  forPlayer(playerId: string): C | undefined;
  /** The authenticated Admin's connection, if one is in the room. */
  admin(): C | undefined;
}

/**
 * Who receives an event. Pure, so the secrecy rules can be checked without a
 * running server: an admin-only event with no Admin present goes nowhere,
 * never to everyone.
 */
export function recipientsFor<C>(event: GameEvent, recipients: Recipients<C>): C[] {
  switch (event.audience.kind) {
    case "everyone":
      return [...recipients.all];
    case "player": {
      const client = recipients.forPlayer(event.audience.playerId);
      return client ? [client] : [];
    }
    case "admin": {
      const client = recipients.admin();
      return client ? [client] : [];
    }
  }
}
