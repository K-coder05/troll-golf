import type { ItemRenderer } from "./index";

/** Shield: the bubble inflates around the ball (it then stays, drawn from the Shielded Effect). */
export const shieldRenderer: ItemRenderer = {
  playUse(scene, fx) {
    const bubble = scene.add.circle(fx.x, fx.y, 4).setStrokeStyle(3, 0xb48cff).setDepth(8);
    scene.tweens.add({ targets: bubble, scale: 4.5, alpha: { from: 1, to: 0 }, duration: 500, onComplete: () => bubble.destroy() });
  },
};
