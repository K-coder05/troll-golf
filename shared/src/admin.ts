/**
 * The Admin Power contract shared by the server and the admin client bundle.
 *
 * Types and a few constants only. The public client imports nothing from here
 * except the Golf Gods banner text, so no admin UI code ends up in its bundle
 * (see docs/adr/0001-secret-admin-with-separate-bundle.md).
 */

/** How an Admin Power is used: Stealth looks like bad luck, Loud adds spectacle and a Golf Gods banner. */
export type AdminMode = "stealth" | "loud";

/** The only text a Loud banner ever shows. It never names the Admin. */
export const GOLF_GODS_BANNER = "👑 The Golf Gods have spoken";

/**
 * Parameters of each Admin Power, by id. Later tickets add their powers here
 * (ballGrab, nuke, moveCup, cupSize, lipOut, terrainPaint, giveItem, rigBox,
 * godMode, magnet, spawnWall, invertControls) and a handler on each side.
 */
export interface AdminPowerParams {
  /** Add (positive) or remove (negative) Strokes on a Player. Strokes never go below 0. */
  scoreboardEdit: {
    targetId: string;
    delta: number;
    /** Which Hole's Strokes to edit (0-based, up to the current one). Defaults to the current Hole. */
    holeIndex?: number;
  };
  /**
   * Ball Grab: hold any ball in play and drag it anywhere, then let go. One
   * grab is a `grab`, any number of `move`s, then a `release`. Only the grab
   * is logged (one use per grab) and shows the Loud banner; `move` and
   * `release` carry on the same hold.
   * - release without a velocity leaves the ball at rest where it was let go;
   *   with one, it is thrown (speed capped at MAX_THROW_SPEED).
   * - after release the normal rules apply: Cup, Water, Void, rest.
   */
  ballGrab:
    | { action: "grab"; targetId: string }
    | { action: "move"; x: number; y: number }
    | { action: "release"; x: number; y: number; vx?: number; vy?: number };
  /**
   * Nuke: an impact point, a 3 s siren (balls untouched), then a blast that
   * pushes every ball on the course outward from the point, then the
   * aftermath. `aftermath` defaults to "wipe" (balls still on the course go
   * back to the Tee, Strokes kept, timer untouched); "reset" makes everyone
   * replay the Hole, Holed-Out Players included, with this Hole's Strokes
   * wiped and the Hole timer restarted.
   */
  nuke: { x: number; y: number; aftermath?: NukeAftermath };
}

export type NukeAftermath = "wipe" | "reset";

/** The air-raid siren and red flash before a Nuke goes off, ms. Nothing moves until it ends. */
export const NUKE_SIREN_MS = 3000;
/** From the blast to the aftermath (Wipe or Reset): balls fly outward in between, ms. */
export const NUKE_BLAST_MS = 1500;
/** Blast speed (px/s) at the impact point, falling off to NUKE_BLAST_MIN_SPEED at NUKE_BLAST_RANGE px and beyond. */
export const NUKE_BLAST_SPEED = 1200;
export const NUKE_BLAST_MIN_SPEED = 500;
export const NUKE_BLAST_RANGE = 700;

/** The fastest a released Ball Grab can throw a ball, px/s (a full-power shot is 1100). */
export const MAX_THROW_SPEED = 1500;

export type AdminPowerId = keyof AdminPowerParams;

/** Client -> server: use an Admin Power. Only the Admin's session may; anyone else is rejected. */
export type AdminMessage = {
  [K in AdminPowerId]: { power: K; mode: AdminMode; params: AdminPowerParams[K] };
}[AdminPowerId];

/**
 * Server -> Admin only: the outcome of each Admin Power use, so the console
 * can confirm it. Never sent to anyone else.
 */
export type AdminResultMessage =
  | { ok: true; power: AdminPowerId; mode: AdminMode; summary: string; at: number }
  | { ok: false; power: string; reason: string };

/**
 * Server -> Admin only: where to fetch the admin client bundle. The URL holds
 * a one-time token, so the bundle is served only to this authenticated session.
 */
export interface AdminBundleMessage {
  /** Path on the game server, e.g. "/admin-bundle/<token>.js". */
  path: string;
}

/** Server -> everyone: the Golf Gods banner after a Loud Admin Power. */
export interface BannerMessage {
  /** Always GOLF_GODS_BANNER. */
  text: string;
  /** What happened, without saying who did it, e.g. "Ben: +2 Strokes". */
  detail?: string;
}
