import type { Room } from "@colyseus/sdk";
import type { CursorMessage, PlayerState } from "@troll-golf/shared";
import * as Phaser from "phaser";

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 640;
const SEND_INTERVAL_MS = 33;

/** The decoded synced state, as the client reads it. Mirrors RoomState with Map-like players. */
interface SyncedState {
  players: { forEach(cb: (player: PlayerState, id: string) => void): void };
}

interface Dot {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

/**
 * M0 scene: every Player's cursor as a coloured dot. It only renders synced
 * state and sends intents; it never decides anything.
 */
export class CursorScene extends Phaser.Scene {
  private room!: Room;
  private dots = new Map<string, Dot>();
  private lastSentAt = 0;
  private pending: CursorMessage | null = null;

  constructor() {
    super("cursor");
  }

  init(data: { room: Room }): void {
    this.room = data.room;
  }

  create(): void {
    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x2f8f46).setOrigin(0).setStrokeStyle(8, 0x6b4a2b);
    this.add
      .text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "Move your mouse. Your friends see your dot.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#d8f0dc",
      })
      .setOrigin(0.5)
      .setAlpha(0.5);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.pending = { x: Math.round(pointer.worldX), y: Math.round(pointer.worldY) };
    });
  }

  override update(time: number): void {
    if (this.pending && time - this.lastSentAt >= SEND_INTERVAL_MS) {
      this.room.send("cursor", this.pending);
      this.pending = null;
      this.lastSentAt = time;
    }
    this.renderDots();
  }

  private renderDots(): void {
    const state = this.room.state as unknown as SyncedState | undefined;
    if (!state?.players) return;

    const seen = new Set<string>();
    state.players.forEach((player, id) => {
      seen.add(id);
      let dot = this.dots.get(id);
      if (!dot) {
        dot = {
          circle: this.add.circle(player.cursor.x, player.cursor.y, 8),
          label: this.add.text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#ffffff" }),
        };
        this.dots.set(id, dot);
      }
      const visible = player.cursor.active;
      dot.circle.setVisible(visible).setFillStyle(Phaser.Display.Color.HexStringToColor(player.color).color);
      dot.circle.setStrokeStyle(id === this.room.sessionId ? 3 : 0, 0xffffff);
      // Ease toward the latest synced position; patches arrive at 20 Hz.
      dot.circle.x = Phaser.Math.Linear(dot.circle.x, player.cursor.x, 0.35);
      dot.circle.y = Phaser.Math.Linear(dot.circle.y, player.cursor.y, 0.35);
      dot.label.setVisible(visible).setText(player.name).setPosition(dot.circle.x + 12, dot.circle.y - 8);
    });

    for (const [id, dot] of this.dots) {
      if (seen.has(id)) continue;
      dot.circle.destroy();
      dot.label.destroy();
      this.dots.delete(id);
    }
  }
}
