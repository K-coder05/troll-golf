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
  /** The game view (world coordinates, what is under a point), or null before the Hole scene is up. */
  view(): AdminView | null;
}

/** What is under a point of the Hole, for the right-click radial menu. */
export type AdminHit =
  | { kind: "ball"; id: string; name: string }
  | { kind: "cup" }
  | { kind: "terrain" };

/**
 * What the admin UI may ask of the public game view. Generic geometry only
 * (nothing here knows about Admin Powers), so the public client stays free of
 * admin code.
 */
export interface AdminView {
  /** The game canvas: right-clicks on it open the radial menu. */
  canvas: HTMLCanvasElement;
  /** A pointer position (viewport px) as a point of the Hole (world px). */
  worldAt(clientX: number, clientY: number): { x: number; y: number };
  /** A world point as a viewport position (px): the inverse of worldAt. */
  screenAt(x: number, y: number): { x: number; y: number };
  /** What is at a world point: a ball in play, the Cup, or plain terrain. */
  hitTest(world: { x: number; y: number }): AdminHit;
  /** Stop the camera following the ball (while dragging your own ball it would run away from the pointer). */
  holdCamera(hold: boolean): void;
}

/** What the admin bundle exports. */
export interface AdminBundle {
  mount(host: AdminHost): void;
}
