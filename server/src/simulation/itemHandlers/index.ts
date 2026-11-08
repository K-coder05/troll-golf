import type { ItemHandlerRegistry } from "../items";
import { mulligan } from "./mulligan";

/**
 * Every Item's server-side use handler, by Item id. Adding an Item: its data
 * entry in shared/src/items.ts (ITEM_CATALOGUE), a handler file here, an
 * entry in this map, and a renderer in client/src/items/. An Item with no
 * handler here is never drawn from a box (see drawItem in ../items.ts).
 */
export const ITEM_HANDLERS: ItemHandlerRegistry = {
  mulligan,
};
