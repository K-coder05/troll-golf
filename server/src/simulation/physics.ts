import {
  BALL_RADIUS,
  slidingWallCentre,
  windmillAngle,
  type HoleData,
  type Polygon,
  type Vec2,
} from "@troll-golf/shared";
import { Box, Chain, Circle, World, type Body, type Fixture } from "planck";
import { pointInPolygon } from "./surfaces";

/**
 * The physics world of one Hole, wrapping Planck.js. Everything outside this
 * file works in Hole units: pixels, px/s, y down, radians. Only this file
 * knows about metres and Planck bodies.
 *
 * It owns motion only (bodies, collisions, rolling friction). Game rules such
 * as rest detection, Strokes, surfaces and hazards live in the simulation and
 * steer the world through the methods below:
 * - `dampingScale` hook: per-ball friction multiplier (surfaces, ticket 04);
 * - `setVelocity` / `addVelocity`: shots, Boost Pads, Golf Gun, Nuke pushes;
 * - `teleport`: Rest Spot returns, Teleporters, Ball Grab, Swap;
 * - `setCollisions`: Ghost Ball (no walls), disconnected or cupped balls (no balls).
 *
 * It steps only in fixed {@link PHYSICS_STEP_MS} steps, so the same inputs give
 * the same motion.
 */

/** One physics step: the simulation always runs at 60 Hz. */
export const PHYSICS_STEP_MS = 1000 / 60;
const STEP_SEC = PHYSICS_STEP_MS / 1000;

/** Pixels per Planck metre. A ball is 0.25 m across in Planck's eyes, well inside its comfort range. */
export const PIXELS_PER_METRE = 32;

/**
 * Baseline rolling friction on Fairway. Each step speed falls by
 * `speed * LINEAR_DAMPING * dt + ROLLING_DECEL * dt`: the exponential part
 * dominates fast rolls, the constant part makes slow balls actually stop.
 * Both are multiplied by the ball's damping scale (Rough 2x, Ice 0.2x...).
 */
export const LINEAR_DAMPING = 0.9; // 1/s
export const ROLLING_DECEL = 40; // px/s^2

/** Wall bounciness (0..1). Balls bounce a little livelier off each other. */
const WALL_RESTITUTION = 0.75;
const BALL_RESTITUTION = 0.9;

/** Collision categories. */
const CATEGORY = {
  boundary: 0x0001,
  wall: 0x0002,
  ball: 0x0004,
  obstacle: 0x0008,
} as const;

export interface BallMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface BallCollisions {
  /** Static walls and moving obstacles. The Hole's outer edge always collides. */
  walls: boolean;
  /** Other balls. A pair collides only if both balls allow it. */
  balls: boolean;
}

export interface PhysicsWorldOptions {
  hole: HoleData;
  /**
   * Friction multiplier for a ball this step, from where it is (1 = Fairway).
   * Called once per moving ball per step. Ticket 04 plugs surfaces in here.
   */
  dampingScale?: (ballId: string, position: Vec2) => number;
}

type BodyTag = { kind: "ball"; id: string } | { kind: "wall" } | { kind: "boundary" } | { kind: "obstacle" };

/** A pose of a moving obstacle: the bar angle of a Windmill, or the centre of a Sliding Wall. */
export interface ObstaclePoses {
  windmills: { x: number; y: number; angle: number }[];
  slidingWalls: { x: number; y: number }[];
}

export class PhysicsWorld {
  private readonly world = new World({ gravity: { x: 0, y: 0 } });
  private readonly balls = new Map<string, Body>();
  private readonly dampingScale: (ballId: string, position: Vec2) => number;
  private readonly hole: HoleData;
  private readonly windmillBodies: Body[] = [];
  private readonly wallBodies: Body[] = [];
  /** Last position of each ball that was legal (inside the Hole, outside every wall). */
  private readonly safeSpots = new Map<string, Vec2>();
  /** Balls that pass through walls and obstacles (Ghost Ball). Only the Hole's edge still holds them. */
  private readonly ghosts = new Set<string>();
  private stepCount = 0;

  constructor(options: PhysicsWorldOptions) {
    this.dampingScale = options.dampingScale ?? (() => 1);
    const { hole } = options;
    this.hole = hole;
    // The Hole's edge is always solid, so no ball can ever leave the map,
    // whatever the author drew (and even for a Ghost Ball).
    const edge: Polygon = [
      { x: 0, y: 0 },
      { x: hole.width, y: 0 },
      { x: hole.width, y: hole.height },
      { x: 0, y: hole.height },
    ];
    this.addStaticLoop(edge, { kind: "boundary" }, CATEGORY.boundary);
    for (const wall of hole.walls) this.addStaticLoop(wall, { kind: "wall" }, CATEGORY.wall);
    for (const windmill of hole.windmills) {
      this.windmillBodies.push(this.addKinematic(windmill.length, windmill.thickness));
    }
    for (const wall of hole.slidingWalls) this.wallBodies.push(this.addKinematic(wall.width, wall.height));
    this.poseObstacles(0);
    this.driveObstacles(0);
  }

  /** Time since play began, ms: whole physics steps, so it is exact and repeatable. */
  get obstacleTimeMs(): number {
    return this.stepCount * PHYSICS_STEP_MS;
  }

  /** Where the obstacle bodies are right now (px, radians). */
  obstaclePoses(): ObstaclePoses {
    return {
      windmills: this.windmillBodies.map((b) => {
        const p = b.getPosition();
        return { x: p.x * PIXELS_PER_METRE, y: p.y * PIXELS_PER_METRE, angle: b.getAngle() };
      }),
      slidingWalls: this.wallBodies.map((b) => {
        const p = b.getPosition();
        return { x: p.x * PIXELS_PER_METRE, y: p.y * PIXELS_PER_METRE };
      }),
    };
  }

  /** Put a ball into the world at rest. */
  addBall(id: string, position: Vec2): void {
    if (this.balls.has(id)) throw new Error(`Ball ${id} already exists`);
    const body = this.world.createBody({
      type: "dynamic",
      position: toMetres(position),
      fixedRotation: true,
      // Fast balls must not tunnel through each other; there are at most 8.
      bullet: true,
      // A ball against a moving obstacle must never fall asleep.
      allowSleep: false,
      userData: { kind: "ball", id } satisfies BodyTag,
    });
    body.createFixture(new Circle(BALL_RADIUS / PIXELS_PER_METRE), {
      density: 1,
      friction: 0,
      restitution: BALL_RESTITUTION,
      filterCategoryBits: CATEGORY.ball,
      filterMaskBits: maskFor({ walls: true, balls: true }),
    });
    this.balls.set(id, body);
    this.safeSpots.set(id, { ...position });
  }

  removeBall(id: string): void {
    const body = this.balls.get(id);
    if (!body) return;
    this.world.destroyBody(body);
    this.balls.delete(id);
    this.safeSpots.delete(id);
    this.ghosts.delete(id);
  }

  hasBall(id: string): boolean {
    return this.balls.has(id);
  }

  motion(id: string): BallMotion {
    const body = this.body(id);
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return {
      x: p.x * PIXELS_PER_METRE,
      y: p.y * PIXELS_PER_METRE,
      vx: v.x * PIXELS_PER_METRE,
      vy: v.y * PIXELS_PER_METRE,
    };
  }

  /** Ball speed in px/s. */
  speed(id: string): number {
    const v = this.body(id).getLinearVelocity();
    return Math.hypot(v.x, v.y) * PIXELS_PER_METRE;
  }

  /** Replace a ball's velocity (px/s). */
  setVelocity(id: string, velocity: Vec2): void {
    const body = this.body(id);
    body.setLinearVelocity(toMetres(velocity));
    body.setAwake(true);
  }

  /** Add to a ball's velocity (px/s): an impulse that ignores mass. */
  addVelocity(id: string, delta: Vec2): void {
    const v = this.motion(id);
    this.setVelocity(id, { x: v.vx + delta.x, y: v.vy + delta.y });
  }

  /** Move a ball instantly, with a new velocity (default: stopped). */
  teleport(id: string, position: Vec2, velocity: Vec2 = { x: 0, y: 0 }): void {
    const body = this.body(id);
    body.setPosition(toMetres(position));
    body.setLinearVelocity(toMetres(velocity));
    body.setAwake(true);
  }

  stop(id: string): void {
    this.setVelocity(id, { x: 0, y: 0 });
  }

  /**
   * Pin a ball where it is (Freeze): it becomes a static block that stops
   * dead, ignores pushes and that other balls bounce off. Unpinning makes it
   * an ordinary rolling ball again, at rest.
   */
  setPinned(id: string, pinned: boolean): void {
    const body = this.body(id);
    if (pinned === body.isStatic()) return;
    if (pinned) {
      body.setStatic();
    } else {
      body.setDynamic();
      body.setLinearVelocity({ x: 0, y: 0 });
      body.setAwake(true);
    }
  }

  isPinned(id: string): boolean {
    return this.balls.get(id)?.isStatic() ?? false;
  }

  /** Whether the ball currently passes through walls and obstacles (it has `walls: false`). */
  isGhost(id: string): boolean {
    return this.ghosts.has(id);
  }

  setCollisions(id: string, collisions: BallCollisions): void {
    if (collisions.walls) this.ghosts.delete(id);
    else this.ghosts.add(id);
    for (let f: Fixture | null = this.body(id).getFixtureList(); f; f = f.getNext()) {
      f.setFilterData({ groupIndex: 0, categoryBits: CATEGORY.ball, maskBits: maskFor(collisions) });
    }
  }

  /** Advance exactly one fixed 60 Hz step. */
  step(): void {
    for (const [id, body] of this.balls) this.applyRollingFriction(id, body);
    // Obstacles are kinematic: they move by velocity, so balls feel their motion
    // and bullet balls are swept against them. Each step they start exactly on
    // their pose for this time and are given the velocity that ends on the next.
    this.poseObstacles(this.stepCount);
    this.driveObstacles(this.stepCount);
    this.world.step(STEP_SEC);
    this.stepCount++;
    for (const [id, body] of this.balls) this.keepLegal(id, body);
  }

  /**
   * Safety net for squeezes: a moving obstacle can press a ball into a static
   * wall harder than the solver resists. If a ball ends a step outside the Hole
   * or with its centre inside a wall, put it back where it last was legal.
   */
  private keepLegal(id: string, body: Body): void {
    const p = body.getPosition();
    const at = { x: p.x * PIXELS_PER_METRE, y: p.y * PIXELS_PER_METRE };
    const { width, height, walls } = this.hole;
    // A ghost may be inside a wall (the game moves it out when it comes to rest), but never outside the Hole.
    const ghost = this.ghosts.has(id);
    const legal =
      at.x > 0 && at.y > 0 && at.x < width && at.y < height && (ghost || !walls.some((w) => pointInPolygon(at, w)));
    if (legal) {
      this.safeSpots.set(id, at);
      return;
    }
    const safe = this.safeSpots.get(id);
    if (!safe) return;
    body.setPosition(toMetres(safe));
    body.setLinearVelocity({ x: 0, y: 0 });
  }

  private poseObstacles(step: number): void {
    const t = (step * PHYSICS_STEP_MS) / 1000;
    this.hole.windmills.forEach((w, i) => {
      this.windmillBodies[i]!.setTransform(toMetres(w), windmillAngle(w, t));
    });
    this.hole.slidingWalls.forEach((w, i) => {
      this.wallBodies[i]!.setTransform(toMetres(slidingWallCentre(w, t)), 0);
    });
  }

  private driveObstacles(step: number): void {
    const t0 = (step * PHYSICS_STEP_MS) / 1000;
    const t1 = t0 + STEP_SEC;
    this.hole.windmills.forEach((w, i) => {
      const body = this.windmillBodies[i]!;
      body.setAngularVelocity((windmillAngle(w, t1) - windmillAngle(w, t0)) / STEP_SEC);
      body.setLinearVelocity({ x: 0, y: 0 });
    });
    this.hole.slidingWalls.forEach((w, i) => {
      const a = slidingWallCentre(w, t0);
      const b = slidingWallCentre(w, t1);
      this.wallBodies[i]!.setLinearVelocity(toMetres({ x: (b.x - a.x) / STEP_SEC, y: (b.y - a.y) / STEP_SEC }));
    });
  }

  private addKinematic(width: number, height: number): Body {
    const body = this.world.createBody({ type: "kinematic", userData: { kind: "obstacle" } satisfies BodyTag });
    body.createFixture(new Box(width / 2 / PIXELS_PER_METRE, height / 2 / PIXELS_PER_METRE), {
      friction: 0,
      restitution: WALL_RESTITUTION,
      filterCategoryBits: CATEGORY.obstacle,
      filterMaskBits: CATEGORY.ball,
    });
    return body;
  }

  private applyRollingFriction(id: string, body: Body): void {
    const v = body.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y) * PIXELS_PER_METRE;
    if (speed === 0) return;
    const p = body.getPosition();
    const scale = Math.max(0, this.dampingScale(id, { x: p.x * PIXELS_PER_METRE, y: p.y * PIXELS_PER_METRE }));
    const slower = speed * (1 - LINEAR_DAMPING * scale * STEP_SEC) - ROLLING_DECEL * scale * STEP_SEC;
    const factor = Math.max(0, slower) / speed;
    body.setLinearVelocity({ x: v.x * factor, y: v.y * factor });
  }

  private addStaticLoop(polygon: Polygon, tag: BodyTag, category: number): void {
    const body = this.world.createBody({ type: "static", userData: tag });
    body.createFixture(new Chain(polygon.map(toMetres), true), {
      friction: 0,
      restitution: WALL_RESTITUTION,
      filterCategoryBits: category,
      filterMaskBits: CATEGORY.ball,
    });
  }

  private body(id: string): Body {
    const body = this.balls.get(id);
    if (!body) throw new Error(`No ball ${id}`);
    return body;
  }
}

function maskFor({ walls, balls }: BallCollisions): number {
  return CATEGORY.boundary | (walls ? CATEGORY.wall | CATEGORY.obstacle : 0) | (balls ? CATEGORY.ball : 0);
}

function toMetres(p: Vec2): Vec2 {
  return { x: p.x / PIXELS_PER_METRE, y: p.y / PIXELS_PER_METRE };
}
