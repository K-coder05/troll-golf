import type { ItemRenderer } from "./index";

/**
 * Whether this Player is choosing where to place a Banana Mine (only once
 * they have Holed Out: otherwise it drops at the ball). The item slot turns
 * it on; the Hole scene turns the next click into the placement.
 */
export const placement = { armed: false };

/** Banana Mine used or set off: a yellow puff, and a spinning banana at the spot. */
export const bananaMineRenderer: ItemRenderer = {
  playUse(scene, fx) {
    const puff = scene.add.circle(fx.x, fx.y, 6, 0xffe14d, 0.8).setDepth(8);
    scene.tweens.add({ targets: puff, scale: 3, alpha: 0, duration: 350, onComplete: () => puff.destroy() });
    if (fx.targetId === undefined) return;
    const banana = scene.add
      .text(fx.x, fx.y, "\u{1F34C}", { fontSize: "22px" })
      .setOrigin(0.5)
      .setDepth(9);
    scene.tweens.add({ targets: banana, angle: 720, y: fx.y - 18, alpha: 0, duration: 600, onComplete: () => banana.destroy() });
  },
};
