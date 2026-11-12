import type { ItemRenderer } from "./index";

/** Cup Magnet: rings pull inward onto the ball (the red ring and badge stay while it is armed). */
export const cupMagnetRenderer: ItemRenderer = {
  playUse(scene, fx) {
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.circle(fx.x, fx.y, 34).setStrokeStyle(3, 0xff5a5a).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: ring, scale: 0.3, alpha: { from: 0.9, to: 0 }, duration: 500, delay: i * 130, onComplete: () => ring.destroy() });
    }
  },
};
