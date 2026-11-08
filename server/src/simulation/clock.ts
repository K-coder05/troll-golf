/**
 * Wall-clock time in ms, used for timestamps that leave the simulation
 * (holeEndsAt, Effect startedAt, the admin action log). Inject a manual clock
 * in tests and advance it together with `step`.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock that only moves when told to. */
export class ManualClock implements Clock {
  constructor(private time = 0) {}
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}
