/**
 * The Troll Recap shown after the final results. Computed server-side from the
 * Item and Effect logs (server/src/simulation/recap.ts) and sent to everyone
 * at game end.
 *
 * Secrecy (docs/adr/0001): without `reveal` nothing here may depend on who the
 * Admin is or what they did. The `reveal` block exists only when the Admin has
 * switched the reveal on.
 */

/** One Player's number in a Recap ranking. */
export interface RecapStat {
  playerId: string;
  name: string;
  value: number;
}

/** A funny moment, ready to display. */
export interface RecapHighlight {
  id: "longestFrozen" | "mostHitsTaken" | "topTroll" | "mostSniped" | "shieldMaster";
  icon: string;
  title: string;
  text: string;
}

/** One Admin Power use, listed when the Admin reveals themselves. */
export interface RecapRevealEntry {
  /** 1-based Hole number it happened on. */
  holeNumber: number;
  /** Power id, e.g. "lipOut". */
  power: string;
  mode: "stealth" | "loud";
  /** The Player it was used on, if any. */
  targetName?: string;
  /** What happened, e.g. "Ben +2 Strokes on Hole 1". */
  text: string;
  /** Clock time (ms) of the use. */
  at: number;
}

export interface Recap {
  /** Total Freeze time per Player in ms, longest first (Players never frozen are left out). */
  frozen: RecapStat[];
  /** Item Hits taken per Player, most first (Players never hit are left out). */
  hitsTaken: RecapStat[];
  highlights: RecapHighlight[];
  /** Present only when the Admin turned the reveal on. */
  reveal?: { adminName: string; entries: RecapRevealEntry[] };
}

/** Admin only: switch the Recap reveal on or off. Works until the Admin leaves, even after the game ends. */
export interface RevealMessage {
  enabled: boolean;
}

/** Admin only: the reveal setting as the server holds it. */
export interface RevealStateMessage {
  enabled: boolean;
}

/** Admin only: the full timestamped session log (JSON lines) at game end, for a download. */
export interface SessionLogMessage {
  filename: string;
  /** One JSON object per line. */
  text: string;
}
