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
    params: { shots: 3 },
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
    params: { minCupRadii: 3 },
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
    durationMs: 0,
    disabling: false,
    counters: [],
    weight: 2,
    params: {},
  },
  ghostBall: {
    id: "ghostBall",
    name: "Ghost Ball",
    icon: "👻",
    category: "self",
    targeting: "self",
    durationMs: 0,
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
  boxCountScale: 1,
  rouletteMs: 1500,
};

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
}

/** Server -> the holder only: a use was refused; the Item is still held. */
export interface ItemDeniedMessage {
  item: ItemId;
  reason: string;
}
