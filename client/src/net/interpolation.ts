/**
 * Smooth ball motion from 20 Hz state patches.
 *
 * Each patch is stored with the local time it arrived, evened out: the
 * server sends one every {@link PATCH_INTERVAL_MS} while anything moves, so
 * back-to-back patches are placed that far apart, drifting only slowly towards
 * their real arrival times. Network jitter then doesn't make the ball surge
 * and stall. Balls are drawn {@link INTERPOLATION_DELAY_MS} in the past,
 * between the two patches around that moment, so a late or bunched-up patch
 * doesn't make them stutter. There is
 * no extrapolation: past the newest patch a ball waits on it. A jump longer than
 * {@link SNAP_DISTANCE} (a new Hole, a Teleporter, a hazard return) snaps
 * instead of sliding across the course.
 */

export interface Point {
  x: number;
  y: number;
}

/** How far behind the newest patch balls are drawn: two 20 Hz patches. */
export const INTERPOLATION_DELAY_MS = 100;
/** Jumps longer than this (px) between two patches snap instead of sliding. */
export const SNAP_DISTANCE = 150;
/** Patches older than this behind the newest are dropped. */
const KEEP_MS = 1000;
/** The server's patch rate (20 Hz) while anything changes. */
export const PATCH_INTERVAL_MS = 50;
/** A patch's evened-out time stays within this of its real arrival. */
const MAX_LAG_MS = 40;
/** How much of the gap to the real arrival time each patch closes. */
const DRIFT = 0.05;

interface Snapshot {
  /** Local arrival time, evened out (see push), ms. */
  t: number;
  /** Local arrival time, ms. */
  arrival: number;
  positions: ReadonlyMap<string, Point>;
}

export class SnapshotBuffer {
  private snapshots: Snapshot[] = [];

  constructor(private readonly delayMs = INTERPOLATION_DELAY_MS) {}

  /** Record the ball positions of a patch that arrived at local time `arrival` (ms). */
  push(arrival: number, positions: ReadonlyMap<string, Point>): void {
    let last = this.snapshots.at(-1);
    // Two patches in the same instant: the later one wins.
    if (last && arrival <= last.arrival) {
      this.snapshots.pop();
      last = this.snapshots.at(-1);
    }
    let t = arrival;
    // Part of a steady stream (no pause in sending): one patch interval after the last one,
    // nudged towards the real arrival time, and never later than it.
    if (last && arrival - last.arrival < PATCH_INTERVAL_MS * 3) {
      const expected = last.t + PATCH_INTERVAL_MS;
      t = Math.min(arrival, Math.max(arrival - MAX_LAG_MS, expected + (arrival - expected) * DRIFT));
    }
    this.snapshots.push({ t, arrival, positions: new Map(positions) });
    while (this.snapshots.length > 2 && this.snapshots[1]!.t < t - KEEP_MS) this.snapshots.shift();
  }

  /** Where ball `id` should be drawn at local time `now` (ms), or undefined if no patch has it yet. */
  sample(id: string, now: number): Point | undefined {
    const renderAt = now - this.delayMs;
    let before: Point | undefined;
    let beforeT = 0;
    for (const snap of this.snapshots) {
      const p = snap.positions.get(id);
      if (!p) continue;
      if (snap.t <= renderAt) {
        before = p;
        beforeT = snap.t;
        continue;
      }
      // The first patch after the render time.
      if (!before) return { ...p };
      if (Math.hypot(p.x - before.x, p.y - before.y) > SNAP_DISTANCE) return { ...before };
      const f = (renderAt - beforeT) / (snap.t - beforeT);
      return { x: before.x + (p.x - before.x) * f, y: before.y + (p.y - before.y) * f };
    }
    return before && { ...before };
  }
}
