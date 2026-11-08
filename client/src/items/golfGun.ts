import type { ItemRenderer } from "./index";

/**
 * Whether this Player's Golf Gun is armed (crosshair mode). Set by the item
 * slot from the server's `item` message; the Hole scene turns clicks into
 * shots while it is on.
 */
export const crosshair = { armed: false };

/** Golf Gun: a muzzle flash, a tracer from the shooter's ball (or the Cup) to the aim point, and a hit burst with screen shake. */
export const golfGunRenderer: ItemRenderer = {
  playUse(scene, fx) {
    const fromX = fx.fromX ?? fx.x;
    const fromY = fx.fromY ?? fx.y;
    const tracer = scene.add.line(0, 0, fromX, fromY, fx.x, fx.y, 0xfff1a8, 0.95).setOrigin(0, 0).setLineWidth(2).setDepth(8);
    scene.tweens.add({ targets: tracer, alpha: 0, duration: 220, onComplete: () => tracer.destroy() });
    const flash = scene.add.circle(fromX, fromY, 5, 0xfff1a8, 1).setDepth(9);
    scene.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 160, onComplete: () => flash.destroy() });
    const mark = scene.add.circle(fx.x, fx.y, 4).setStrokeStyle(2, fx.hit ? 0xff5a4d : 0xffffff).setDepth(9);
    scene.tweens.add({ targets: mark, scale: fx.hit ? 5 : 2.5, alpha: 0, duration: 350, onComplete: () => mark.destroy() });
    if (fx.hit) scene.cameras.main.shake(180, 0.008);
  },
};
