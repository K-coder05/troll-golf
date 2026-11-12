import type { SlidingWallData, Vec2, WindmillData } from "./course";

/**
 * Where a moving obstacle is at a given time. Pure functions of the obstacle's
 * data and the Hole's obstacle time, so the server's physics and every client
 * agree on the pose without it being sent. Obstacle time starts at 0 when a
 * Hole's play begins and only runs while the Hole is being played.
 */

/** Bar angle of a Windmill (radians) at `tSec` seconds. */
export function windmillAngle(windmill: WindmillData, tSec: number): number {
  return windmill.phase + windmill.angularSpeed * tSec;
}

/** Centre of a Sliding Wall at `tSec` seconds: a sinusoidal ease from start to end and back. */
export function slidingWallCentre(wall: SlidingWallData, tSec: number): Vec2 {
  const cycle = tSec / wall.period + wall.phase;
  const along = (1 - Math.cos(2 * Math.PI * cycle)) / 2;
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * along,
    y: wall.start.y + (wall.end.y - wall.start.y) * along,
  };
}

/** The four corners of a Windmill bar at `tSec`, in order. */
export function windmillCorners(windmill: WindmillData, tSec: number): Vec2[] {
  const angle = windmillAngle(windmill, tSec);
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const [hl, ht] = [windmill.length / 2, windmill.thickness / 2];
  return [
    [-hl, -ht],
    [hl, -ht],
    [hl, ht],
    [-hl, ht],
  ].map(([x, y]) => ({ x: windmill.x + x! * c - y! * s, y: windmill.y + x! * s + y! * c }));
}
