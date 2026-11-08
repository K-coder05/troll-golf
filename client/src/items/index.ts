import type { FxMessage, ItemId } from "@troll-golf/shared";
import type * as Phaser from "phaser";
import { freezeRayRenderer } from "./freezeRay";
import { golfGunRenderer } from "./golfGun";
import { inkSplatRenderer } from "./inkSplat";
import { mulliganRenderer } from "./mulligan";
import { shieldRenderer } from "./shield";

/**
 * How the client shows an Item being used: one renderer per Item, played for
 * the `itemUse` fx everyone gets. Screen effects for the victim only (Ink,
 * ticket 16) hook in here too. Lasting Effects (ice block, Shield bubble,
 * badges) are drawn by the Hole scene from synced PlayerState.effects.
 */
export interface ItemRenderer {
  /** Play the use at fx.x, fx.y in world coordinates. */
  playUse(scene: Phaser.Scene, fx: FxMessage): void;
}

/** Every Item's client renderer, by Item id. Items without one show nothing extra. */
export const ITEM_RENDERERS: { readonly [K in ItemId]?: ItemRenderer } = {
  freezeRay: freezeRayRenderer,
  golfGun: golfGunRenderer,
  inkSplat: inkSplatRenderer,
  mulligan: mulliganRenderer,
  shield: shieldRenderer,
};
