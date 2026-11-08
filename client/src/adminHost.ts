/**
 * The seam between the public client and the admin bundle. Types only: this
 * file compiles to nothing, so the public bundle learns no admin code from it.
 *
 * The public client loads the admin bundle only when the server sends an
 * `adminBundle` message (to the authenticated Admin's session alone), then
 * calls its `mount` with this host. Later tickets add what their admin UI
 * needs from the game view (e.g. ticket 10's radial menu: the world point
 * under the pointer and what's there).
 */
import type { Room } from "@colyseus/sdk";

export interface AdminHost {
  /** The joined room: the admin UI sends `admin` messages and listens to `adminResult` on it. */
  room: Room;
}

/** What the admin bundle exports. */
export interface AdminBundle {
  mount(host: AdminHost): void;
}
