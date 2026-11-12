/**
 * Items: the data-driven catalogue shared by the server and the client.
 *
 * Everything here is data (no behaviour): each Item's category, targeting
 * kind, duration, counters and distribution weight, plus the box and odds
 * tuning. The server has one use handler per Item
 * (server/src/simulation/itemHandlers/) and the client one renderer
 * (client/src/items/). Tuning a duration or a weight means editing the data
 * below, not code.
 *
 * Held Items are private: a Player's slot is never in synced state. The
 * holder alone is told what they hold (`item` message); the Admin's x-ray
 * (ticket 20) is the only other way to see it.
 */

/** Every v1 Item. */
export type ItemId =
  | "freezeRay"
  | "golfGun"
  | "inkSplat"
  | "shield"
  | "mulligan"
  | "cupMagnet"
  | "bananaMine"
  | "ghostBall"
  | "swap";

/**
 * The three columns of the distribution table: defensive/self Items, attack
 * Items and chaos Items.
 */
export type ItemCategory = "self" | "attack" | "chaos";

export const ITEM_CATEGORIES: readonly ItemCategory[] = ["self", "attack", "chaos"];

/**
 * How an Item picks what it acts on:
 * - self: the user's own ball;
 * - opponent: one opponent (tap = the Leader, hold = the target picker);
 * - aimed: a crosshair point (Golf Gun);
 * - placed: a point on the Hole (Banana Mine after Holing Out);
 * - randomOpponent: a random opponent who can be targeted (Swap).
 */
export type ItemTargeting = "self" | "opponent" | "aimed" | "placed" | "randomOpponent";

export interface ItemDefinition {
  id: ItemId;
  /** Display name, e.g. "Freeze Ray". */
  name: string;
  /** One emoji for the item slot and roulette. */
  icon: string;
  category: ItemCategory;
  targeting: ItemTargeting;
  /** How long its Effect lasts, ms; 0 = instant. Ticket 24 scales this by the chaos level. */
  durationMs: number;
  /** A disabling Effect (Freeze, Ink): at most one at a time per Player. */
  disabling: boolean;
  /** What can stop or shorten it, for the client's help text. */
  counters: string[];
  /** Relative chance within its category when a box picks one. 0 = never from a box (Give Item only). */
  weight: number;
  /**
   * Item-specific numbers (shots, ranges...), so tuning them stays data too.
   * Freeze Ray: `mashClicks` clicks of mashing take `mashSavesMs` off the Freeze.
   */
  params: Record<string, number>;
}

export type ItemCatalogue = { readonly [K in ItemId]: ItemDefinition };

/** The v1 Items. Durations and weights are tuning data. */
export const ITEM_CATALOGUE: ItemCatalogue = {
  freezeRay: {
    id: "freezeRay",
    name: "Freeze Ray",
    icon: "🧊",
    category: "attack",
    targeting: "opponent",
    durationMs: 6000,
    disabling: true,
    counters: ["Shield", "mash click to break out 1 s sooner"],
    weight: 3,
    params: { mashSavesMs: 1000, mashClicks: 10 },
  },
  golfGun: {
    id: "golfGun",
    name: "Golf Gun",
    icon: "🔫",
    category: "attack",
    targeting: "aimed",
    durationMs: 10_000,
    disabling: false,
    counters: ["Shield blocks one shot"],
    weight: 3,
    params: { shots: 3, pushSpeed: 700, aimTolerance: 32 },
  },
  inkSplat: {
    id: "inkSplat",
    name: "Ink Splat",
    icon: "🦑",
    category: "attack",
    targeting: "opponent",
    durationMs: 6000,
    disabling: true,
    counters: ["Shield", "scrub to wipe it away"],
    weight: 3,
    params: { coverage: 0.6 },
  },
  bananaMine: {
    id: "bananaMine",
    name: "Banana Mine",
    icon: "🍌",
    category: "attack",
    targeting: "placed",
    durationMs: 45_000,
    disabling: false,
    counters: [],
    weight: 2,
    params: { minCupRadii: 3, trapRadius: 14, pushSpeed: 600 },
  },
  shield: {
    id: "shield",
    name: "Shield",
    icon: "🛡️",
    category: "self",
    targeting: "self",
    durationMs: 30_000,
    disabling: false,
    counters: [],
    weight: 3,
    params: {},
  },
  mulligan: {
    id: "mulligan",
    name: "Mulligan",
    icon: "↩️",
    category: "self",
    targeting: "self",
    durationMs: 0,
    disabling: false,
    counters: [],
    weight: 3,
    params: {},
  },
  cupMagnet: {
    id: "cupMagnet",
    name: "Cup Magnet",
    icon: "🧲",
    category: "self",
    targeting: "self",
    // How long it waits armed for a shot (effectively until the Hole ends).
    durationMs: 3_600_000,
    disabling: false,
    counters: [],
    weight: 2,
    // pull: acceleration toward the Cup while the shot rolls, px/s^2.
    params: { pull: 120 },
  },
  ghostBall: {
    id: "ghostBall",
    name: "Ghost Ball",
    icon: "👻",
    category: "self",
    targeting: "self",
    // How long it waits armed for a shot (effectively until the Hole ends).
    durationMs: 3_600_000,
    disabling: false,
    counters: [],
    weight: 2,
    params: {},
  },
  swap: {
    id: "swap",
    name: "Swap",
    icon: "🔀",
    category: "chaos",
    targeting: "randomOpponent",
    durationMs: 0,
    disabling: false,
    counters: ["Shield"],
    weight: 1,
    params: {},
  },
};

export const ITEM_IDS = Object.keys(ITEM_CATALOGUE) as ItemId[];

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && Object.hasOwn(ITEM_CATALOGUE, value);
}

/** Which row of the distribution table a Standing uses. */
export type OddsRow = "first" | "middle" | "last";

/** Percent chance of each category; each row adds up to 100. */
export type OddsTable = { readonly [R in OddsRow]: { readonly [C in ItemCategory]: number } };

/**
 * Item Box and distribution tuning. Data, like the catalogue: ticket 24
 * derives a scaled copy per chaos level (box count, attack odds).
 */
export interface ItemTuning {
  /** Rubber-band odds by Standing (defensive/self, attack, chaos). */
  odds: OddsTable;
  /** A shattered box comes back after this long, ms. */
  boxRespawnMs: number;
  /** A ball whose centre comes within this distance (px) of a box centre rolls through it. */
  boxRadius: number;
  /** Fraction of a Hole's spawn points that get a box (1 = all of them). */
  boxCountScale: number;
  /** The client's slot-machine roulette after a pickup, ms. The Item can be used once it ends. */
  rouletteMs: number;
}

export const ITEM_TUNING: ItemTuning = {
  odds: {
    first: { self: 70, attack: 28, chaos: 2 },
    middle: { self: 40, attack: 55, chaos: 5 },
    last: { self: 15, attack: 70, chaos: 15 },
  },
  boxRespawnMs: 10_000,
  boxRadius: 14,
  boxCountScale: 0.7,
  rouletteMs: 1500,
};

// ---- Chaos level --------------------------------------------------------------

/** The lobby's chaos level, picked by the room creator (also in GameSettings). */
export type ChaosLevelId = "chill" | "normal" | "unhinged";

export const CHAOS_LEVELS: readonly ChaosLevelId[] = ["chill", "normal", "unhinged"];

/**
 * What a chaos level multiplies: Item Box count, the attack column of the odds
 * table and Item Effect durations. Admin Powers are never scaled.
 */
export const CHAOS_FACTORS: { readonly [L in ChaosLevelId]: { boxes: number; attack: number; duration: number } } = {
  chill: { boxes: 0.6, attack: 0.6, duration: 0.6 },
  normal: { boxes: 1, attack: 1, duration: 1 },
  unhinged: { boxes: 1.5, attack: 1.5, duration: 1.5 },
};

export function isChaosLevel(value: unknown): value is ChaosLevelId {
  return typeof value === "string" && (CHAOS_LEVELS as readonly string[]).includes(value);
}

/**
 * The odds table for a chaos level. Each row's attack chance is multiplied by
 * the level's attack factor (capped at 100), and the self and chaos chances
 * share what is left in their original proportions, so every row still adds
 * up to 100.
 */
export function scaleOdds(odds: OddsTable, level: ChaosLevelId): OddsTable {
  const factor = CHAOS_FACTORS[level].attack;
  const row = (r: OddsTable[OddsRow]): OddsTable[OddsRow] => {
    const attack = Math.min(100, r.attack * factor);
    const others = r.self + r.chaos;
    if (others <= 0) return { self: 0, attack: 100, chaos: 0 };
    const left = 100 - attack;
    return { self: (r.self / others) * left, attack, chaos: (r.chaos / others) * left };
  };
  return { first: row(odds.first), middle: row(odds.middle), last: row(odds.last) };
}

/**
 * The tuning in force at a chaos level: scaled odds and box count. The box
 * count is a fraction of the Hole's spawn points, so it cannot go above 1.
 * With the base boxCountScale of 0.7, Normal fills about 70% of the spawn
 * points, Unhinged all of them and Chill about 42%.
 */
export function tuningForChaos(tuning: ItemTuning, level: ChaosLevelId): ItemTuning {
  return {
    ...tuning,
    odds: scaleOdds(tuning.odds, level),
    boxCountScale: Math.min(1, tuning.boxCountScale * CHAOS_FACTORS[level].boxes),
  };
}

// ---- Messages ---------------------------------------------------------------

/**
 * Client -> server: use the held Item. Targeted Items take `targetId`
 * (otherwise the Leader, ticket 15); aimed and placed ones take `point`.
 */
export interface UseItemMessage {
  targetId?: string;
  point?: { x: number; y: number };
}

/**
 * Server -> the holder only: what is in your item slot now. Sent on pickup
 * (`roulette: true`: spin, then land on `item`), after a use (`item: null`),
 * and when you (re)join. `readyAt` is the server clock time the Item can be
 * used (the end of the roulette).
 */
export interface ItemSlotMessage {
  item: ItemId | null;
  roulette: boolean;
  readyAt: number;
  /**
   * An Item in use that stays in the slot (Golf Gun crosshair mode): shots
   * left and the server clock time it runs out. Absent when not in use.
   */
  active?: { shotsLeft: number; endsAt: number };
}

/** Server -> the holder only: a use was refused; the Item is still held. */
export interface ItemDeniedMessage {
  item: ItemId;
  reason: string;
}
