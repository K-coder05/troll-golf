import type { ItemRenderer } from "./index";

/**
 * Swap: a flash and a line between the two balls (fx.x/y is the user's old
 * place, fx.fromX/fromY the opponent's), then rings where each landed. Plays
 * even when a Shield eats the Swap (the Shield pop follows it).
 */
export const swapRenderer: ItemRenderer = {
  playUse(scene, fx) {
    const bx = fx.fromX ?? fx.x;
    const by = fx.fromY ?? fx.y;
    const line = scene.add.line(0, 0, fx.x, fx.y, bx, by, 0xffd24a, 0.9).setOrigin(0, 0).setLineWidth(3).setDepth(8);
    scene.tweens.add({ targets: line, alpha: 0, duration: 600, onComplete: () => line.destroy() });
    for (const [x, y] of [[fx.x, fx.y], [bx, by]] as const) {
      const ring = scene.add.circle(x, y, 8).setStrokeStyle(3, 0xffd24a).setDepth(8);
      scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    }
  },
};
