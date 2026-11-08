import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Where session logs go: the SESSION_LOG_DIR env var, else ./logs (gitignored). */
export function sessionLogDir(env: string | undefined = process.env.SESSION_LOG_DIR): string {
  return path.resolve(env && env.trim() !== "" ? env : "logs");
}

/**
 * Save one session's log (JSON lines, see simulation/recap.ts) as
 * `<dir>/<room code>-<timestamp>.jsonl`, creating the directory if needed.
 * Returns the file written. The room code is sanitized, so it can't escape
 * the directory.
 */
export function writeSessionLog(dir: string, roomCode: string, text: string, timestamp: number = Date.now()): string {
  mkdirSync(dir, { recursive: true });
  const safe = roomCode.replace(/[^A-Za-z0-9_-]/g, "_") || "room";
  const file = path.join(dir, `${safe}-${timestamp}.jsonl`);
  writeFileSync(file, text, { encoding: "utf8", flag: "wx" });
  return file;
}
