import type { ItemRenderer } from "./index";

/** Mulligan: a rewind swirl where the ball lands back. */
export const mulliganRenderer: ItemRenderer = {
  playUse(scene, fx) {
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.circle(fx.x, fx.y, 28).setStrokeStyle(2, 0x9ad0ff).setDepth(8).setAlpha(0);
      scene.tweens.add({ targets: ring, scale: 0.2, alpha: { from: 0.9, to: 0 }, duration: 450, delay: i * 120, onComplete: () => ring.destroy() });
    }
    const label = scene.add
      .text(fx.x, fx.y - 18, "↩", { fontFamily: "system-ui, sans-serif", fontSize: "18px", color: "#9ad0ff", stroke: "#000000", strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(8);
    scene.tweens.add({ targets: label, y: fx.y - 36, alpha: 0, duration: 700, onComplete: () => label.destroy() });
  },
};
