import { generateRoomCode } from "@troll-golf/shared";

/**
 * Room codes in use on this server. One always-on machine hosts every room,
 * so an in-process set is enough to keep codes unique.
 */
const inUse = new Set<string>();

export function claimRoomCode(random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = generateRoomCode(random);
    if (!inUse.has(code)) {
      inUse.add(code);
      return code;
    }
  }
  throw new Error("No free room codes");
}

export function releaseRoomCode(code: string): void {
  inUse.delete(code);
}
