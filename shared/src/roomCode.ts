export const ROOM_CODE_LENGTH = 4;

/** Letters only, so there is no O-vs-0 confusion; input is upper-cased. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const MAX_PLAYERS = 8;

/** Builds a room code from a random source returning values in [0, 1). */
export function generateRoomCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Trims and upper-cases what a Player typed. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
