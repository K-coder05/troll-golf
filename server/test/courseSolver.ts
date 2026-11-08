import type { CourseData, HoleData } from "@troll-golf/shared";
import { TestGame } from "./harness";

/** One shot: `angle` in radians (0 = +x, clockwise on screen), `power` 0..1. */
export interface Shot {
  angle: number;
  power: number;
}

export interface Playthrough {
  /** Strokes counted by the game (shots plus penalties). */
  strokes: number;
  holedOut: boolean;
  ball: { x: number; y: number };
  atRest: boolean;
  /** True if the ball was still moving after a minute. */
  stuck: boolean;
}

/** A one-Hole Course, so a search plays exactly this Hole with a lone Player and no Items. */
export function singleHole(hole: HoleData): CourseData {
  return { id: "solo", name: "Solo", holes: [hole] };
}

function newGame(hole: HoleData): TestGame {
  const t = new TestGame({ course: singleHole(hole), settings: { itemsEnabled: false, holeTimerSec: 100_000 } });
  t.join("p");
  t.startPlaying();
  return t;
}

/** Play the shots in order from the Tee, each once the ball is at rest, and report where that leaves the ball. */
export function play(hole: HoleData, shots: readonly Shot[]): Playthrough {
  const t = newGame(hole);
  let stuck = false;
  for (const shot of shots) {
    if (t.state.players.p!.holedOut) break;
    if (!t.shoot("p", shot.angle, shot.power).ok) throw new Error("shot refused");
    try {
      t.advanceUntilRest("p", 60_000);
    } catch {
      stuck = true;
      break;
    }
  }
  const player = t.state.players.p!;
  return {
    strokes: player.strokes[0] ?? 0,
    holedOut: player.holedOut,
    ball: { x: player.ball.x, y: player.ball.y },
    atRest: player.ball.atRest,
    stuck,
  };
}

export interface SearchOptions {
  /** Most shots (not counting penalties) in a solution. */
  maxShots: number;
  angles?: number;
  powers?: readonly number[];
  /** Positions kept per level, best (closest to the Cup) first. */
  beam?: number;
  /** When set, a solution only counts if it still Holes Out when the last aim is off by this many degrees either way: no lucky pixel-perfect banks. */
  robustDeg?: number;
}

function isRobust(hole: HoleData, shots: Shot[], strokes: number, deg: number): boolean {
  return [-1, 1].every((sign) => {
    const last = shots[shots.length - 1]!;
    const off = [...shots.slice(0, -1), { angle: last.angle + (sign * deg * Math.PI) / 180, power: last.power }];
    const r = play(hole, off);
    return r.holedOut && r.strokes <= strokes;
  });
}

export interface Solution {
  strokes: number;
  shots: Shot[];
}

/**
 * Looks for the fewest-Strokes way to Hole Out: tries every angle and power
 * from the Tee, keeps the rest spots that got closest to the Cup (one per
 * 20 px cell), and shoots on from those. Returns null if nothing Holes Out
 * within `maxShots` shots.
 */
export function solveHole(hole: HoleData, options: SearchOptions): Solution | null {
  const angles = options.angles ?? 72;
  const powers = options.powers ?? [0.3, 0.5, 0.7, 0.9, 1];
  const beam = options.beam ?? 10;
  let best = null as Solution | null;
  const stuckShots: Shot[][] = [];
  let frontier: { shots: Shot[]; strokes: number; at: { x: number; y: number } }[] = [{ shots: [], strokes: 0, at: hole.tee }];
  for (let depth = 1; depth <= options.maxShots; depth++) {
    const next: { shots: Shot[]; strokes: number; at: { x: number; y: number }; dist: number; cell: string }[] = [];
    for (const node of frontier) {
      if (best && node.strokes + 1 >= best.strokes) continue;
      // Replay the prefix once, then branch by re-playing: the Game cannot be cloned.
      // A coarse fan of directions, plus a fine fan straight at the Cup.
      const toCup = Math.atan2(hole.cup.y - node.at.y, hole.cup.x - node.at.x);
      const headings = Array.from({ length: angles }, (_, a) => (a / angles) * Math.PI * 2);
      for (let k = -4; k <= 4; k++) headings.push(toCup + (k * 0.5 * Math.PI) / 180);
      for (const angle of headings) {
        for (const power of powers) {
          const shot = { angle, power };
          const shots = [...node.shots, shot];
          const result = play(hole, shots);
          if (result.stuck) {
            stuckShots.push(shots);
            continue;
          }
          if (result.holedOut) {
            if (options.robustDeg && !isRobust(hole, shots, result.strokes, options.robustDeg)) continue;
            if (!best || result.strokes < best.strokes) best = { strokes: result.strokes, shots };
            continue;
          }
          const dist = Math.hypot(result.ball.x - hole.cup.x, result.ball.y - hole.cup.y);
          next.push({
            shots,
            strokes: result.strokes,
            at: result.ball,
            dist,
            cell: `${Math.round(result.ball.x / 20)},${Math.round(result.ball.y / 20)}`,
          });
        }
      }
    }
    if (best && best.shots.length <= depth) break;
    next.sort((x, y) => x.dist - y.dist);
    const seen = new Set<string>();
    frontier = [];
    for (const n of next) {
      if (seen.has(n.cell)) continue;
      seen.add(n.cell);
      frontier.push(n);
      if (frontier.length >= beam) break;
    }
  }
  if (stuckShots.length > 0) console.log("stuck", JSON.stringify(stuckShots.slice(0, 3)));
  return best;
}
