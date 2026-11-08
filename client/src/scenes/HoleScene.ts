import type { Room } from "@colyseus/sdk";
import {
  BALL_RADIUS,
  type BallState,
  type CupState,
  type FxMessage,
  type HoleMessage,
  type Phase,
  type ShootMessage,
  type SurfaceKind,
  slidingWallCentre,
  windmillCorners,
} from "@troll-golf/shared";
import * as Phaser from "phaser";
import { SnapshotBuffer, type Point } from "../net/interpolation";
import type { AdminHit, AdminView } from "../adminHost";
import type { HudView } from "../ui/hud";

/** The decoded synced state, as the client reads it. Mirrors RoomState with Map-like players. */
interface SyncedPlayer {
  name: string;
  color: string;
  ball: BallState;
  holedOut: boolean;
  connected: boolean;
  spectating: boolean;
}
interface SyncedState {
  phase: Phase;
  leaderId: string;
  holeIndex: number;
  cup: CupState;
  obstacleTimeMs: number;
  players: {
    forEach(cb: (player: SyncedPlayer, id: string) => void): void;
    get(id: string): SyncedPlayer | undefined;
  };
}

export interface HoleSceneData {
  room: Room;
  /** The latest Hole layout the server sent, or null before it arrives. */
  hole: () => HoleMessage | null;
  /** Hands over the one-shot effects received since the last call. */
  takeFx: () => FxMessage[];
  /** Shared with the HUD: whose ball a Holed-Out Player is watching. */
  view: HudView;
}

interface BallSprite {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  /** "offline" tag under a disconnected Player's ball. */
  badge: Phaser.GameObjects.Text;
}

/** Drag length (screen px) for a full-power shot. */
const MAX_DRAG_PX = 180;
/** Releases shorter than this fraction of max power are treated as a cancelled aim. */
const MIN_POWER = 0.03;
/** How close to the ball (world px) a press must start to begin aiming. */
const GRAB_RADIUS = BALL_RADIUS * 4;
/** The aim line shows about the first 2 ball-lengths of the path. */
const AIM_LINE_LENGTH = BALL_RADIUS * 2 * 2;
/** World px visible across the shorter screen side while following the ball. */
const FOLLOW_VIEW = 520;
/** A Holed-Out Player clicking within this distance (world px) of a ball starts watching it. */
const PICK_RADIUS = BALL_RADIUS * 5;

const COLORS = {
  fairway: 0x2f8f46,
  outside: 0x12301c,
  wall: 0x6b4a2b,
  wallEdge: 0x3f2a16,
  cup: 0x0b0b0b,
  tee: 0xd8f0dc,
  obstacle: 0xc0562b,
  obstacleEdge: 0x5c2410,
};

/** Fill and detail colour of each non-Fairway surface. */
const SURFACE_STYLE: Record<SurfaceKind, { fill: number; detail: number }> = {
  fairway: { fill: 0x2f8f46, detail: 0x2f8f46 },
  rough: { fill: 0x1f6a31, detail: 0x144d22 },
  sand: { fill: 0xe3cf8f, detail: 0xc2aa62 },
  ice: { fill: 0xbfe9f7, detail: 0xffffff },
  water: { fill: 0x2a6fd6, detail: 0x7fb4ff },
  void: { fill: 0x050509, detail: 0x5b2a8c },
};

/**
 * The Hole being played: walls, Cup, Tee and every ball, plus the slingshot
 * input, camera follow and the Tab overview. It only renders synced state and
 * sends shoot intents; it never simulates.
 */
export class HoleScene extends Phaser.Scene {
  private room!: Room;
  private holeSource!: () => HoleMessage | null;
  private takeFx!: () => FxMessage[];
  private view!: HudView;
  /** Ball positions from recent patches; balls are drawn ~100 ms behind, interpolated. */
  private snapshots = new SnapshotBuffer();
  /** Whose ball a Holed-Out Player chose to watch ("" = follow the Leader). */
  private watchChoice = "";

  private drawnHole: HoleMessage | null = null;
  private course!: Phaser.GameObjects.Graphics;
  private cup!: Phaser.GameObjects.Graphics;
  private drawnCup = "";
  private obstacles!: Phaser.GameObjects.Graphics;
  /** Last obstacle time the server sent, and when (performance.now) it arrived, to run on between patches. */
  private obstacleSync = { serverMs: 0, receivedAt: 0 };
  private aim!: Phaser.GameObjects.Graphics;
  private balls = new Map<string, BallSprite>();
  private tab!: Phaser.Input.Keyboard.Key;
  private escape!: Phaser.Input.Keyboard.Key;

  /** Pointer world position while aiming, or null when not aiming. */
  private aimPoint: Phaser.Math.Vector2 | null = null;
  private camCenter = new Phaser.Math.Vector2(0, 0);
  private cameraHeld = false;

  constructor() {
    super("hole");
  }

  init(data: HoleSceneData): void {
    this.room = data.room;
    this.holeSource = data.hole;
    this.takeFx = data.takeFx;
    this.view = data.view;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.outside);
    this.course = this.add.graphics().setDepth(0);
    this.cup = this.add.graphics().setDepth(1);
    this.obstacles = this.add.graphics().setDepth(3);
    this.aim = this.add.graphics().setDepth(10);

    const keyboard = this.input.keyboard!;
    // Capture Tab so the browser doesn't move focus away from the game.
    this.tab = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB, true);
    this.escape = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escape.on("down", () => (this.aimPoint = null));
    this.input.mouse?.disableContextMenu();

    // Every patch (20 Hz) is one snapshot of ball positions.
    const record = () => {
      const state = this.syncedState();
      if (!state?.players) return;
      const positions = new Map<string, Point>();
      state.players.forEach((p, id) => positions.set(id, { x: p.ball.x, y: p.ball.y }));
      this.snapshots.push(performance.now(), positions);
    };
    record();
    this.room.onStateChange(record);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.aimPoint = null;
        return;
      }
      if (this.isSpectating()) {
        this.pickBallToWatch(this.worldPoint(pointer));
        return;
      }
      const sprite = this.balls.get(this.room.sessionId);
      if (!this.canShoot() || !sprite) return;
      const world = this.worldPoint(pointer);
      if (Phaser.Math.Distance.Between(world.x, world.y, sprite.circle.x, sprite.circle.y) > GRAB_RADIUS) return;
      this.aimPoint = world;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.aimPoint) this.aimPoint = this.worldPoint(pointer);
    });
    this.input.on("pointerup", () => {
      const shot = this.currentShot();
      this.aimPoint = null;
      if (shot && shot.power >= MIN_POWER && this.canShoot()) {
        this.room.send("shoot", shot satisfies ShootMessage);
      }
    });
  }

  override update(): void {
    const hole = this.holeSource();
    if (hole && hole !== this.drawnHole) this.drawHole(hole);
    if (!this.drawnHole) return;

    for (const fx of this.takeFx()) this.playFx(fx);
    this.renderCup();
    this.renderObstacles();
    this.renderBalls();
    // A shot can only start from a ball at rest during play; drop the aim otherwise.
    if (this.aimPoint && !this.canShoot()) this.aimPoint = null;
    this.renderAim();
    this.updateCamera();
  }

  /** Shots are accepted only while playing, from a ball at rest that hasn't Holed Out. */
  private canShoot(): boolean {
    const state = this.syncedState();
    const me = state?.players?.get(this.room.sessionId);
    return state?.phase === "playing" && !!me && !me.holedOut && !me.spectating && me.ball.atRest;
  }

  /**
   * A Holed-Out Player watches the others while the Hole goes on, and so
   * does a late joiner waiting for the next Hole.
   */
  private isSpectating(): boolean {
    const state = this.syncedState();
    const me = state?.players.get(this.room.sessionId);
    if (!state || !me) return false;
    return (state.phase === "playing" && me.holedOut) || (me.spectating && state.phase !== "gameEnd");
  }

  private pickBallToWatch(at: Phaser.Math.Vector2): void {
    let best = "";
    let bestDistance = PICK_RADIUS;
    this.syncedState()?.players.forEach((player, id) => {
      const sprite = this.balls.get(id);
      if (!onCourse(player) || !sprite) return;
      const d = Phaser.Math.Distance.Between(at.x, at.y, sprite.circle.x, sprite.circle.y);
      if (d < bestDistance) {
        best = id;
        bestDistance = d;
      }
    });
    if (best) this.watchChoice = best;
  }

  /** The ball the camera follows: your own, or while spectating the chosen ball (else the Leader's). */
  private followedId(): string {
    const state = this.syncedState();
    if (!state || !this.isSpectating()) {
      this.view.spectating = "";
      return this.room.sessionId;
    }
    const chosen = state.players.get(this.watchChoice);
    const id = chosen && onCourse(chosen) ? this.watchChoice : state.leaderId;
    this.view.spectating = id;
    return id || this.room.sessionId;
  }

  private syncedState(): SyncedState | undefined {
    return this.room.state as unknown as SyncedState | undefined;
  }

  /** The Cup comes from synced state, not the layout, because Admin Powers can move and resize it. */
  private renderCup(): void {
    const cup = this.syncedState()?.cup;
    if (!cup) return;
    const key = `${cup.x},${cup.y},${cup.radius}`;
    if (key === this.drawnCup) return;
    this.drawnCup = key;
    const g = this.cup.clear();
    g.fillStyle(COLORS.cup).fillCircle(cup.x, cup.y, cup.radius);
    g.lineStyle(2, 0xffffff, 0.6).strokeCircle(cup.x, cup.y, cup.radius + 1);
    // The flag.
    g.lineStyle(2, 0xdddddd).lineBetween(cup.x, cup.y, cup.x, cup.y - 34);
    g.fillStyle(0xff3b3b).fillTriangle(cup.x, cup.y - 34, cup.x + 18, cup.y - 28, cup.x, cup.y - 22);
  }

  /**
   * Windmills and Sliding Walls are drawn at the pose their data gives for the
   * server's obstacle time (the same formulas the physics uses). Between 20 Hz
   * patches the time runs on locally while playing, and snaps to the server's.
   */
  private renderObstacles(): void {
    const state = this.syncedState();
    const hole = this.drawnHole?.hole;
    const g = this.obstacles.clear();
    if (!state || !hole || (hole.windmills.length === 0 && hole.slidingWalls.length === 0)) return;
    const now = performance.now();
    const sync = this.obstacleSync;
    if (state.obstacleTimeMs !== sync.serverMs) {
      sync.serverMs = state.obstacleTimeMs;
      sync.receivedAt = now;
    }
    const runOn = state.phase === "playing" ? Math.min(now - sync.receivedAt, 150) : 0;
    const tSec = (sync.serverMs + runOn) / 1000;

    for (const wall of hole.slidingWalls) {
      const c = slidingWallCentre(wall, tSec);
      g.fillStyle(COLORS.obstacle).fillRect(c.x - wall.width / 2, c.y - wall.height / 2, wall.width, wall.height);
      g.lineStyle(2, COLORS.obstacleEdge).strokeRect(c.x - wall.width / 2, c.y - wall.height / 2, wall.width, wall.height);
    }
    for (const mill of hole.windmills) {
      const corners = windmillCorners(mill, tSec).map((p) => new Phaser.Math.Vector2(p.x, p.y));
      g.fillStyle(COLORS.obstacle).fillPoints(corners, true);
      g.lineStyle(2, COLORS.obstacleEdge).strokePoints(corners, true);
      g.fillStyle(COLORS.obstacleEdge).fillCircle(mill.x, mill.y, mill.thickness * 0.8);
    }
  }

  private drawHole(message: HoleMessage): void {
    this.drawnHole = message;
    const { hole } = message;
    const g = this.course.clear();
    g.fillStyle(COLORS.fairway).fillRect(0, 0, hole.width, hole.height);

    for (const zone of hole.surfaces) this.drawZone(g, zone.kind, zone.polygon);
    for (const pad of hole.boostPads) this.drawBoostPad(g, pad.polygon, pad.angle);
    for (const pair of hole.teleporters) {
      this.drawPortal(g, pair.a.x, pair.a.y, pair.radius);
      this.drawPortal(g, pair.b.x, pair.b.y, pair.radius);
    }

    g.fillStyle(COLORS.tee).fillRect(hole.tee.x - 12, hole.tee.y - 12, 24, 24);
    g.fillStyle(COLORS.fairway).fillRect(hole.tee.x - 10, hole.tee.y - 10, 20, 20);

    for (const wall of hole.walls) {
      const points = wall.map((p) => new Phaser.Math.Vector2(p.x, p.y));
      g.fillStyle(COLORS.wall).fillPoints(points, true);
      g.lineStyle(2, COLORS.wallEdge).strokePoints(points, true);
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, hole.width, hole.height);
    this.camCenter.set(hole.tee.x, hole.tee.y);
  }

  private drawZone(g: Phaser.GameObjects.Graphics, kind: SurfaceKind, polygon: { x: number; y: number }[]): void {
    const style = SURFACE_STYLE[kind];
    const points = polygon.map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.fillStyle(style.fill).fillPoints(points, true);
    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Texture inside the zone's bounds (deterministic, no randomness): dots, ticks, streaks, ripples.
    g.fillStyle(style.detail, 0.8).lineStyle(1.5, style.detail, 0.8);
    for (let y = y0 + 6; y < y1; y += 12) {
      for (let x = x0 + 6 + ((Math.round(y / 12) % 2) * 6); x < x1; x += 12) {
        if (!pointInPoly(x, y, polygon)) continue;
        if (kind === "sand") g.fillCircle(x, y, 1.2);
        else if (kind === "rough") g.lineBetween(x, y + 3, x + 1.5, y - 3);
        else if (kind === "ice") g.lineBetween(x - 3, y + 3, x + 3, y - 3);
        else if (kind === "water") g.lineBetween(x - 4, y, x, y - 2).lineBetween(x, y - 2, x + 4, y);
        else if (kind === "void") g.fillCircle(x, y, 0.8);
      }
    }
    g.lineStyle(2, style.detail, 1).strokePoints(points, true);
  }

  private drawBoostPad(g: Phaser.GameObjects.Graphics, polygon: { x: number; y: number }[], angle: number): void {
    const points = polygon.map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.fillStyle(0xf2a900).fillPoints(points, true);
    g.lineStyle(2, 0x7a5200).strokePoints(points, true);
    const cx = polygon.reduce((a, p) => a + p.x, 0) / polygon.length;
    const cy = polygon.reduce((a, p) => a + p.y, 0) / polygon.length;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    const [nx, ny] = [-dy, dx];
    g.lineStyle(3, 0xfff3b0);
    for (const o of [-8, 8]) {
      const [bx, by] = [cx + dx * o, cy + dy * o];
      g.lineBetween(bx - dx * 6 + nx * 8, by - dy * 6 + ny * 8, bx + dx * 6, by + dy * 6);
      g.lineBetween(bx - dx * 6 - nx * 8, by - dy * 6 - ny * 8, bx + dx * 6, by + dy * 6);
    }
  }

  private drawPortal(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number): void {
    g.fillStyle(0x2b0f4d).fillCircle(x, y, radius);
    g.lineStyle(3, 0xc77dff).strokeCircle(x, y, radius);
    g.lineStyle(2, 0xe9c7ff).strokeCircle(x, y, radius * 0.6);
    g.lineStyle(2, 0xc77dff).strokeCircle(x, y, radius * 0.25);
  }

  /** Short expanding ring and droplets at a point. */
  private playFx(fx: FxMessage): void {
    const colour = {
      splash: 0xcfe6ff,
      void: 0x8e44ad,
      boost: 0xffe066,
      teleport: 0xe9c7ff,
      holeOut: 0xffd24d,
      lipOut: 0xffffff,
      grab: 0xfff1a8,
    }[fx.kind];
    const ring = this.add.circle(fx.x, fx.y, 4).setStrokeStyle(2, colour).setDepth(8);
    const scale = fx.kind === "splash" || fx.kind === "holeOut" ? 5 : 3;
    this.tweens.add({ targets: ring, scale, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    if (fx.kind !== "splash" && fx.kind !== "holeOut") return;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const drop = this.add.circle(fx.x, fx.y, 2, colour).setDepth(8);
      this.tweens.add({
        targets: drop,
        x: fx.x + Math.cos(a) * 22,
        y: fx.y + Math.sin(a) * 22 - 6,
        alpha: 0,
        duration: 500,
        onComplete: () => drop.destroy(),
      });
    }
  }

  private renderBalls(): void {
    const state = this.syncedState();
    if (!state?.players) return;

    const seen = new Set<string>();
    const now = performance.now();
    state.players.forEach((player, id) => {
      seen.add(id);
      let sprite = this.balls.get(id);
      if (!sprite) {
        sprite = {
          circle: this.add.circle(player.ball.x, player.ball.y, BALL_RADIUS).setDepth(5),
          // The name tag floating over the ball.
          label: this.add
            .text(0, 0, "", {
              fontFamily: "system-ui, sans-serif",
              fontSize: "12px",
              fontStyle: "bold",
              color: "#ffffff",
              stroke: "#000000",
              strokeThickness: 3,
            })
            .setOrigin(0.5, 1)
            .setDepth(6),
          badge: this.add
            .text(0, 0, "offline", {
              fontFamily: "system-ui, sans-serif",
              fontSize: "10px",
              fontStyle: "bold",
              color: "#ffffff",
              backgroundColor: "#8a2b2b",
              padding: { x: 3, y: 1 },
            })
            .setOrigin(0.5, 0)
            .setDepth(6),
        };
        this.balls.set(id, sprite);
      }
      const isMe = id === this.room.sessionId;
      sprite.circle.setFillStyle(Phaser.Display.Color.HexStringToColor(player.color).color);
      sprite.circle.setStrokeStyle(isMe ? 2 : 1, isMe ? 0xffffff : 0x000000, isMe ? 1 : 0.5);
      // Every ball, yours included (no local prediction), is drawn ~100 ms behind, between patches.
      const at = this.snapshots.sample(id, now) ?? player.ball;
      sprite.circle.setPosition(at.x, at.y);
      sprite.label.setText(player.name).setPosition(sprite.circle.x, sprite.circle.y - BALL_RADIUS - 4);
      // A ball in the Cup is gone from the course; its Player spectates. So is a late joiner's until the next Hole.
      const visible = onCourse(player);
      sprite.circle.setVisible(visible);
      sprite.label.setVisible(visible);
      // A disconnected Player's ball stays put, greyed out, with an "offline" badge, until they reconnect.
      const offline = !player.connected;
      sprite.circle.setAlpha(offline ? 0.35 : 1);
      sprite.label.setAlpha(offline ? 0.6 : 1);
      sprite.badge.setVisible(visible && offline).setPosition(sprite.circle.x, sprite.circle.y + BALL_RADIUS + 2);
    });

    for (const [id, sprite] of this.balls) {
      if (seen.has(id)) continue;
      sprite.circle.destroy();
      sprite.label.destroy();
      sprite.badge.destroy();
      this.balls.delete(id);
    }
  }

  /** The shot the current drag would fire: angle opposite the drag, power from its length. */
  private currentShot(): ShootMessage | null {
    const sprite = this.balls.get(this.room.sessionId);
    if (!this.aimPoint || !sprite) return null;
    const dx = sprite.circle.x - this.aimPoint.x;
    const dy = sprite.circle.y - this.aimPoint.y;
    const dragPx = Math.hypot(dx, dy) * this.cameras.main.zoom;
    if (dragPx === 0) return null;
    return { angle: Math.atan2(dy, dx), power: Math.min(dragPx / MAX_DRAG_PX, 1) };
  }

  private renderAim(): void {
    const g = this.aim.clear();
    const shot = this.currentShot();
    const sprite = this.balls.get(this.room.sessionId);
    if (!shot || !sprite) return;
    const { x, y } = sprite.circle;
    const dir = new Phaser.Math.Vector2(Math.cos(shot.angle), Math.sin(shot.angle));

    // The pull-back band, capped at max power, shading from green to red.
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x7dff7d),
      Phaser.Display.Color.ValueToColor(0xff4d4d),
      100,
      Math.round(shot.power * 100),
    );
    const bandColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    const bandLength = (shot.power * MAX_DRAG_PX) / this.cameras.main.zoom;
    g.lineStyle(3, bandColor, 0.8);
    g.lineBetween(x, y, x - dir.x * bandLength, y - dir.y * bandLength);

    // Dotted aim line: only the first ~2 ball-lengths, so it guides without playing the shot.
    g.fillStyle(0xffffff, 0.9);
    for (let d = BALL_RADIUS + 4; d <= BALL_RADIUS + AIM_LINE_LENGTH; d += 6) {
      g.fillCircle(x + dir.x * d, y + dir.y * d, 1.6);
    }
  }

  private updateCamera(): void {
    const hole = this.drawnHole!.hole;
    const cam = this.cameras.main;
    const overview = this.tab.isDown;
    const fitZoom = Math.min(cam.width / hole.width, cam.height / hole.height) * 0.95;
    const followZoom = Math.max(fitZoom, Math.min(cam.width, cam.height) / FOLLOW_VIEW);

    // Overview: the whole Hole is visible, so let the camera leave its bounds to centre it.
    cam.useBounds = !overview && followZoom > fitZoom;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, overview ? fitZoom : followZoom, 0.15));

    const target = overview ? { x: hole.width / 2, y: hole.height / 2 } : this.balls.get(this.followedId())?.circle;
    if (target && !this.cameraHeld) {
      this.camCenter.x = Phaser.Math.Linear(this.camCenter.x, target.x, 0.12);
      this.camCenter.y = Phaser.Math.Linear(this.camCenter.y, target.y, 0.12);
    }
    cam.centerOn(this.camCenter.x, this.camCenter.y);
  }

  /**
   * Generic geometry for the admin bundle's radial menu and ball dragging
   * (src/adminHost.ts). Nothing here knows about Admin Powers.
   */
  adminView(): AdminView {
    const canvas = this.game.canvas;
    return {
      canvas,
      worldAt: (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const p = this.cameras.main.getWorldPoint(
          ((clientX - rect.left) * this.scale.width) / rect.width,
          ((clientY - rect.top) * this.scale.height) / rect.height,
        );
        return { x: p.x, y: p.y };
      },
      hitTest: (world): AdminHit => {
        const state = this.syncedState();
        let best: AdminHit | null = null;
        let bestDistance = BALL_RADIUS * 2;
        state?.players.forEach((player, id) => {
          const sprite = this.balls.get(id);
          if (!onCourse(player) || !sprite) return;
          const d = Phaser.Math.Distance.Between(world.x, world.y, sprite.circle.x, sprite.circle.y);
          if (d < bestDistance) {
            best = { kind: "ball", id, name: player.name };
            bestDistance = d;
          }
        });
        if (best) return best;
        const cup = state?.cup;
        if (cup && Phaser.Math.Distance.Between(world.x, world.y, cup.x, cup.y) <= cup.radius + 6) return { kind: "cup" };
        return { kind: "terrain" };
      },
      holdCamera: (hold) => (this.cameraHeld = hold),
    };
  }

  private worldPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }
}

/** The ball is on the course: not in the Cup, and not a late joiner's waiting for the next Hole. */
function onCourse(player: SyncedPlayer): boolean {
  return !player.holedOut && !player.spectating;
}

function pointInPoly(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
