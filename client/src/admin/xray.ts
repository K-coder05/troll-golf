import { EFFECT_INFO, ITEM_CATALOGUE, type XrayMessage } from "@troll-golf/shared";
import type { AdminHost } from "../adminHost";

/** Toggle: Alt+X. Off by default, so a screen share shows nothing. */
const TOGGLE = (e: KeyboardEvent) => e.altKey && e.code === "KeyX";

interface SyncedBall {
  name: string;
  holedOut: boolean;
  spectating: boolean;
  ball: { x: number; y: number };
}

/**
 * The x-ray overlay: a canvas laid over the game that shows every Player's
 * held Item, active Effects (with who caused them) and aim line. The data is
 * the `xray` message the server sends to the Admin's connection alone; this
 * code only ever loads in the admin bundle.
 */
export function startXray(host: AdminHost): void {
  const { room } = host;
  let latest: XrayMessage | null = null;
  let on = false;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;";
  canvas.hidden = true;
  document.body.append(canvas);

  room.onMessage("xray", (message: XrayMessage) => {
    latest = message;
  });
  window.addEventListener("keydown", (e) => {
    if (!TOGGLE(e)) return;
    on = !on;
    canvas.hidden = !on;
    if (on) requestAnimationFrame(draw);
  });

  function draw(): void {
    if (!on) return;
    requestAnimationFrame(draw);
    const view = host.view();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    }
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const state = room.state as unknown as { players?: { get(id: string): SyncedBall | undefined } };
    if (!latest || !view || !state.players) return;
    g.font = "12px system-ui, sans-serif";
    g.textBaseline = "middle";
    for (const p of latest.players) {
      const player = state.players.get(p.id);
      if (!player || player.spectating) continue;
      const at = view.screenAt(player.ball.x, player.ball.y);
      if (p.aim) {
        const len = 30 + p.aim.power * 110;
        const end = view.screenAt(player.ball.x + Math.cos(p.aim.angle) * len, player.ball.y + Math.sin(p.aim.angle) * len);
        g.strokeStyle = "rgba(255,80,80,0.9)";
        g.lineWidth = 3;
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(at.x, at.y);
        g.lineTo(end.x, end.y);
        g.stroke();
        g.setLineDash([]);
      }
      const lines: string[] = [];
      lines.push(p.item ? `${ITEM_CATALOGUE[p.item].icon} ${ITEM_CATALOGUE[p.item].name}` : "no item");
      for (const e of p.effects) {
        const by = state.players.get(e.sourceId)?.name ?? "?";
        lines.push(`${EFFECT_INFO[e.kind].icon}${e.visible ? "" : " (hidden)"} ${EFFECT_INFO[e.kind].name} by ${by}`);
      }
      const h = lines.length * 15 + 6;
      const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 12;
      g.fillStyle = "rgba(10,6,24,0.8)";
      g.fillRect(at.x + 14, at.y - h - 6, w, h);
      g.fillStyle = "#fff";
      lines.forEach((l, i) => g.fillText(l, at.x + 20, at.y - h + 3 + i * 15));
    }
  }
}
