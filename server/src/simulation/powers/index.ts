import type { AdminPowerRegistry } from "../admin";
import { ballGrab } from "./ballGrab";
import { cupSize } from "./cupSize";
import { lipOut } from "./lipOut";
import { moveCup } from "./moveCup";
import { nuke } from "./nuke";
import { scoreboardEdit } from "./scoreboardEdit";

/**
 * Every Admin Power, by id. Adding one: a params type in
 * shared/src/admin.ts (AdminPowerParams), a handler file here, an entry in
 * this map, and a console panel in client/src/admin/powers/.
 */
export const ADMIN_POWERS: AdminPowerRegistry = {
  scoreboardEdit,
  ballGrab,
  nuke,
  moveCup,
  cupSize,
  lipOut,
};
