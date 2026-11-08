import { ITEM_CATALOGUE, type Recap, type RecapHighlight, type RecapRevealEntry, type RecapStat } from "@troll-golf/shared";
import type { AdminLogEntry } from "./admin";
import type { EffectLogEntry } from "./effects";
import type { ItemLogEntry } from "./items";

/**
 * The Troll Recap and the saved session log, as pure functions of the logs.
 * No state, clock or fs in here.
 *
 * Secrecy (docs/adr/0001). A Recap with `reveal: false` is built only from the
 * public-safe parts of the Item and Effect logs:
 * - Item Hits taken and dealt come from `hit` entries (the feed already says
 *   these in public);
 * - a God Mode block (`by: "god"`) is left out entirely, as if the attack had
 *   never been made: it isn't an Item Hit and it doesn't count as a Shield
 *   block either, so the Admin can't be spotted by never being hit;
 * - Freeze time comes from `frozen` Effects, which only the Freeze Ray causes
 *   (no Admin Power freezes anyone);
 * - `rigged` pickups, Give Item, Invert Controls (hidden in Stealth) and the
 *   whole Admin log are never read.
 */
export interface RecapInput {
  players: readonly { id: string; name: string }[];
  itemLog: readonly ItemLogEntry[];
  effectLog: readonly EffectLogEntry[];
  adminLog: readonly AdminLogEntry[];
  adminId: string | null;
  reveal: boolean;
}

export function computeRecap(input: RecapInput): Recap {
  const names = new Map(input.players.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? "Someone";

  const frozenMs = new Map<string, number>();
  for (const entry of input.effectLog) {
    if (entry.kind === "end" && entry.effect === "frozen") {
      frozenMs.set(entry.targetId, (frozenMs.get(entry.targetId) ?? 0) + entry.lastedMs);
    }
  }
  const hitsTaken = new Map<string, number>();
  const hitsDealt = new Map<string, number>();
  const sniped = new Map<string, number>();
  const shieldBlocks = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const entry of input.itemLog) {
    if (entry.kind === "hit") {
      bump(hitsTaken, entry.targetId);
      bump(hitsDealt, entry.playerId);
      if (entry.item === "golfGun") bump(sniped, entry.targetId);
    } else if (entry.kind === "blocked" && entry.by === "shield") {
      bump(shieldBlocks, entry.targetId);
    }
  }

  const ranking = (map: Map<string, number>): RecapStat[] =>
    [...map]
      .filter(([id, value]) => value > 0 && names.has(id))
      .map(([playerId, value]) => ({ playerId, name: nameOf(playerId), value }))
      // Ties keep join order (the Map was filled in log order, so sort is stable on value only).
      .sort((a, b) => b.value - a.value);

  const frozen = ranking(frozenMs);
  const taken = ranking(hitsTaken);
  const dealt = ranking(hitsDealt);
  const snipedRank = ranking(sniped);
  const shields = ranking(shieldBlocks);

  const highlights: RecapHighlight[] = [];
  const top = (rank: RecapStat[]) => {
    const best = rank[0]?.value;
    const who = rank.filter((r) => r.value === best).map((r) => r.name);
    return { value: best ?? 0, who: who.join(" & ") };
  };
  if (frozen.length > 0) {
    const { value, who } = top(frozen);
    highlights.push({
      id: "longestFrozen",
      icon: "🧊",
      title: "Ice Cube",
      text: `${who} spent ${(value / 1000).toFixed(1)}s frozen solid`,
    });
  }
  if (taken.length > 0) {
    const { value, who } = top(taken);
    highlights.push({
      id: "mostHitsTaken",
      icon: "🎯",
      title: "Punching Bag",
      text: `${who} took ${value} Item Hit${value === 1 ? "" : "s"}`,
    });
  }
  if (dealt.length > 0) {
    const { value, who } = top(dealt);
    highlights.push({
      id: "topTroll",
      icon: "😈",
      title: "Top Troll",
      text: `${who} landed ${value} Item Hit${value === 1 ? "" : "s"}`,
    });
  }
  if (snipedRank.length > 0) {
    const { value, who } = top(snipedRank);
    highlights.push({
      id: "mostSniped",
      icon: "🔫",
      title: "Most Sniped Ball",
      text: `${who} got shot ${value} time${value === 1 ? "" : "s"} by the ${ITEM_CATALOGUE.golfGun.name}`,
    });
  }
  if (shields.length > 0) {
    const { value, who } = top(shields);
    highlights.push({
      id: "shieldMaster",
      icon: "🛡️",
      title: "Shield Master",
      text: `${who} had ${value} attack${value === 1 ? "" : "s"} eaten by a Shield`,
    });
  }

  const recap: Recap = { frozen, hitsTaken: taken, highlights };
  if (input.reveal && input.adminId !== null) {
    const entries: RecapRevealEntry[] = input.adminLog.map((e) => ({
      holeNumber: e.holeIndex + 1,
      power: e.power,
      mode: e.mode,
      ...(e.targetId !== undefined ? { targetName: nameOf(e.targetId) } : {}),
      text: e.summary,
      at: e.at,
    }));
    recap.reveal = { adminName: nameOf(input.adminId), entries };
  }
  return recap;
}

/** One line of the saved session log. */
export type SessionLogRecord =
  | { source: "session"; at: number; room: string; courseId: string; players: { id: string; name: string }[]; adminId: string | null; reveal: boolean; complete: boolean }
  | { source: "item"; at: number; entry: ItemLogEntry }
  | { source: "effect"; at: number; entry: EffectLogEntry }
  | { source: "admin"; at: number; entry: AdminLogEntry };

export interface SessionLogInput {
  room: string;
  courseId: string;
  now: number;
  players: readonly { id: string; name: string }[];
  adminId: string | null;
  reveal: boolean;
  /** False when the room closed before the game finished. */
  complete: boolean;
  itemLog: readonly ItemLogEntry[];
  effectLog: readonly EffectLogEntry[];
  adminLog: readonly AdminLogEntry[];
}

/** The whole session in time order: a header line, then every Item, Effect and Admin Power entry. Server-only: names the Admin and the rigged boxes. */
export function buildSessionLog(input: SessionLogInput): SessionLogRecord[] {
  const body: SessionLogRecord[] = [
    ...input.itemLog.map((entry) => ({ source: "item" as const, at: entry.at, entry })),
    ...input.effectLog.map((entry) => ({ source: "effect" as const, at: entry.at, entry })),
    ...input.adminLog.map((entry) => ({ source: "admin" as const, at: entry.at, entry })),
  ].sort((a, b) => a.at - b.at); // stable: equal timestamps keep item, effect, admin order
  return [
    {
      source: "session",
      at: input.now,
      room: input.room,
      courseId: input.courseId,
      players: [...input.players],
      adminId: input.adminId,
      reveal: input.reveal,
      complete: input.complete,
    },
    ...body,
  ];
}

/** JSON lines, one record per line, with a trailing newline. */
export function sessionLogText(records: readonly SessionLogRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}
