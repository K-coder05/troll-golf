import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a join brought the admin secret. The secret is the ADMIN_SECRET env
 * var; with it unset or empty nobody can become the Admin. Compared in
 * constant time so response timing doesn't leak it.
 */
export function isAdminSecret(given: unknown, expected: string | undefined = process.env.ADMIN_SECRET): boolean {
  if (!expected || typeof given !== "string" || given === "") return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
