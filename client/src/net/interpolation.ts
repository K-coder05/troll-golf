/**
 * Smooth ball motion from 20 Hz state patches.
 *
 * Each patch is stored with the local time it arrived. Balls are drawn
 * {@link INTERPOLATION_DELAY_MS} in the past, between the two patches around
 * that moment, so a late or bunched-up patch doesn't make them stutter. There is
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

interface Snapshot {
  /** Local arrival time, ms. */
  t: number;
  positions: ReadonlyMap<string, Point>;
}

export class SnapshotBuffer {
  private snapshots: Snapshot[] = [];

  constructor(private readonly delayMs = INTERPOLATION_DELAY_MS) {}

  /** Record the ball positions of a patch that arrived at local time `t` (ms). */
  push(t: number, positions: ReadonlyMap<string, Point>): void {
    const last = this.snapshots.at(-1);
    // Two patches in the same instant: the later one wins.
    if (last && t <= last.t) this.snapshots.pop();
    this.snapshots.push({ t, positions: new Map(positions) });
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
