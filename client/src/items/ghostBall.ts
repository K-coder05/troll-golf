import type { ItemRenderer } from "./index";

/** Ghost Ball: a pale puff drifts up from the ball (the ball itself turns translucent while armed). */
export const ghostBallRenderer: ItemRenderer = {
  playUse(scene, fx) {
    const puff = scene.add.circle(fx.x, fx.y, 14, 0xe8f4ff, 0.7).setDepth(8);
    scene.tweens.add({ targets: puff, y: fx.y - 30, scale: 2.2, alpha: 0, duration: 650, onComplete: () => puff.destroy() });
    const label = scene.add
      .text(fx.x, fx.y - 14, "👻", { fontSize: "20px" })
      .setOrigin(0.5)
      .setDepth(8);
    scene.tweens.add({ targets: label, y: fx.y - 44, alpha: 0, duration: 800, onComplete: () => label.destroy() });
  },
};
