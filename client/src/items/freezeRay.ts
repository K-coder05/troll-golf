import type { ItemRenderer } from "./index";

/** Freeze Ray: a burst of frost at the target's ball (the ice block itself is drawn from its Frozen Effect). */
export const freezeRayRenderer: ItemRenderer = {
  playUse(scene, fx) {
    const flash = scene.add.circle(fx.x, fx.y, 6, 0xbfe9ff, 0.9).setDepth(8);
    scene.tweens.add({ targets: flash, scale: 5, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const shard = scene.add.rectangle(fx.x + Math.cos(a) * 30, fx.y + Math.sin(a) * 30, 3, 9, 0xe6f8ff).setDepth(8);
      shard.setRotation(a + Math.PI / 2);
      scene.tweens.add({ targets: shard, x: fx.x, y: fx.y, alpha: 0.2, duration: 300, onComplete: () => shard.destroy() });
    }
  },
};
