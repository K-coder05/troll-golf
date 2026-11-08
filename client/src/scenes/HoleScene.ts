import type { Room } from "@colyseus/sdk";
import { BALL_RADIUS, type BallState, type HoleMessage, type ShootMessage } from "@troll-golf/shared";
import * as Phaser from "phaser";

/** The decoded synced state, as the client reads it. Mirrors RoomState with Map-like players. */
interface SyncedPlayer {
  name: string;
  color: string;
  ball: BallState;
  strokes: { at(i: number): number | undefined };
}
interface SyncedState {
  holeIndex: number;
  players: {
    forEach(cb: (player: SyncedPlayer, id: string) => void): void;
    get(id: string): SyncedPlayer | undefined;
  };
}

export interface HoleSceneData {
  room: Room;
  /** The latest Hole layout the server sent, or null before it arrives. */
  hole: () => HoleMessage | null;
  /** Called every frame with the local Player's Strokes on this Hole. */
  onStrokes: (strokes: number) => void;
}

interface BallSprite {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
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

const COLORS = {
  fairway: 0x2f8f46,
  outside: 0x12301c,
  wall: 0x6b4a2b,
  wallEdge: 0x3f2a16,
  cup: 0x0b0b0b,
  tee: 0xd8f0dc,
};

/**
 * The Hole being played: walls, Cup, Tee and every ball, plus the slingshot
 * input, camera follow and the Tab overview. It only renders synced state and
 * sends shoot intents; it never simulates.
 */
export class HoleScene extends Phaser.Scene {
  private room!: Room;
  private holeSource!: () => HoleMessage | null;
  private onStrokes!: (strokes: number) => void;

  private drawnHole: HoleMessage | null = null;
  private course!: Phaser.GameObjects.Graphics;
  private aim!: Phaser.GameObjects.Graphics;
  private balls = new Map<string, BallSprite>();
  private tab!: Phaser.Input.Keyboard.Key;
  private escape!: Phaser.Input.Keyboard.Key;

  /** Pointer world position while aiming, or null when not aiming. */
  private aimPoint: Phaser.Math.Vector2 | null = null;
  private camCenter = new Phaser.Math.Vector2(0, 0);

  constructor() {
    super("hole");
  }

  init(data: HoleSceneData): void {
    this.room = data.room;
    this.holeSource = data.hole;
    this.onStrokes = data.onStrokes;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.outside);
    this.course = this.add.graphics().setDepth(0);
    this.aim = this.add.graphics().setDepth(10);

    const keyboard = this.input.keyboard!;
    // Capture Tab so the browser doesn't move focus away from the game.
    this.tab = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB, true);
    this.escape = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escape.on("down", () => (this.aimPoint = null));
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.aimPoint = null;
        return;
      }
      const mine = this.myBall();
      const sprite = this.balls.get(this.room.sessionId);
      if (!mine?.atRest || !sprite) return;
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
      if (shot && shot.power >= MIN_POWER && this.myBall()?.atRest) {
        this.room.send("shoot", shot satisfies ShootMessage);
      }
    });
  }

  override update(): void {
    const hole = this.holeSource();
    if (hole && hole !== this.drawnHole) this.drawHole(hole);
    if (!this.drawnHole) return;

    this.renderBalls();
    // A shot can only start from a ball at rest; drop the aim if it got knocked.
    if (this.aimPoint && !this.myBall()?.atRest) this.aimPoint = null;
    this.renderAim();
    this.updateCamera();

    const me = (this.room.state as unknown as SyncedState | undefined)?.players?.get(this.room.sessionId);
    if (me) this.onStrokes(me.strokes.at(this.drawnHole.holeIndex) ?? 0);
  }

  private drawHole(message: HoleMessage): void {
    this.drawnHole = message;
    const { hole } = message;
    const g = this.course.clear();
    g.fillStyle(COLORS.fairway).fillRect(0, 0, hole.width, hole.height);

    g.fillStyle(COLORS.tee).fillRect(hole.tee.x - 12, hole.tee.y - 12, 24, 24);
    g.fillStyle(COLORS.fairway).fillRect(hole.tee.x - 10, hole.tee.y - 10, 20, 20);

    g.fillStyle(COLORS.cup).fillCircle(hole.cup.x, hole.cup.y, hole.cup.radius);
    g.lineStyle(2, 0xffffff, 0.6).strokeCircle(hole.cup.x, hole.cup.y, hole.cup.radius + 1);

    for (const wall of hole.walls) {
      const points = wall.map((p) => new Phaser.Math.Vector2(p.x, p.y));
      g.fillStyle(COLORS.wall).fillPoints(points, true);
      g.lineStyle(2, COLORS.wallEdge).strokePoints(points, true);
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, hole.width, hole.height);
    this.camCenter.set(hole.tee.x, hole.tee.y);
  }

  private renderBalls(): void {
    const state = this.room.state as unknown as SyncedState | undefined;
    if (!state?.players) return;

    const seen = new Set<string>();
    state.players.forEach((player, id) => {
      seen.add(id);
      let sprite = this.balls.get(id);
      if (!sprite) {
        sprite = {
          circle: this.add.circle(player.ball.x, player.ball.y, BALL_RADIUS).setDepth(5),
          label: this.add
            .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#ffffff" })
            .setOrigin(0.5, 1)
            .setDepth(6),
        };
        this.balls.set(id, sprite);
      }
      const isMe = id === this.room.sessionId;
      sprite.circle.setFillStyle(Phaser.Display.Color.HexStringToColor(player.color).color);
      sprite.circle.setStrokeStyle(isMe ? 2 : 1, isMe ? 0xffffff : 0x000000, isMe ? 1 : 0.5);
      // Patches arrive at 20 Hz; ease toward the latest one (ticket 07 brings real interpolation).
      sprite.circle.x = Phaser.Math.Linear(sprite.circle.x, player.ball.x, 0.4);
      sprite.circle.y = Phaser.Math.Linear(sprite.circle.y, player.ball.y, 0.4);
      sprite.label.setText(player.name).setPosition(sprite.circle.x, sprite.circle.y - BALL_RADIUS - 4);
    });

    for (const [id, sprite] of this.balls) {
      if (seen.has(id)) continue;
      sprite.circle.destroy();
      sprite.label.destroy();
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

    const target = overview ? { x: hole.width / 2, y: hole.height / 2 } : this.balls.get(this.room.sessionId)?.circle;
    if (target) {
      this.camCenter.x = Phaser.Math.Linear(this.camCenter.x, target.x, 0.12);
      this.camCenter.y = Phaser.Math.Linear(this.camCenter.y, target.y, 0.12);
    }
    cam.centerOn(this.camCenter.x, this.camCenter.y);
  }

  private myBall(): BallState | undefined {
    const state = this.room.state as unknown as SyncedState | undefined;
    return state?.players?.get(this.room.sessionId)?.ball;
  }

  private worldPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }
}
