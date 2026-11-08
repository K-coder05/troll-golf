import type { ItemHandlerRegistry } from "../items";
import { freezeRay } from "./freezeRay";
import { golfGun } from "./golfGun";
import { inkSplat } from "./inkSplat";
import { mulligan } from "./mulligan";
import { shield } from "./shield";

/**
 * Every Item's server-side use handler, by Item id. Adding an Item: its data
 * entry in shared/src/items.ts (ITEM_CATALOGUE), a handler file here, an
 * entry in this map, and a renderer in client/src/items/. An Item with no
 * handler here is never drawn from a box (see drawItem in ../items.ts).
 * Attack Items reach opponents only through `ctx.hit` (applyItemHit), and
 * their lasting effects are Effects (../effects.ts, ../effectKinds/).
 */
export const ITEM_HANDLERS: ItemHandlerRegistry = {
  freezeRay,
  golfGun,
  inkSplat,
  mulligan,
  shield,
};
