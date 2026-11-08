import type { FxMessage, ItemId } from "@troll-golf/shared";
import type * as Phaser from "phaser";
import { mulliganRenderer } from "./mulligan";

/**
 * How the client shows an Item being used: one renderer per Item, played for
 * the `itemUse` fx everyone gets. Screen effects for the victim only (Ink,
 * ticket 16) and ball badges (ticket 15) hook in here too.
 */
export interface ItemRenderer {
  /** Play the use at fx.x, fx.y in world coordinates. */
  playUse(scene: Phaser.Scene, fx: FxMessage): void;
}

/** Every Item's client renderer, by Item id. Items without one show nothing extra. */
export const ITEM_RENDERERS: { readonly [K in ItemId]?: ItemRenderer } = {
  mulligan: mulliganRenderer,
};
