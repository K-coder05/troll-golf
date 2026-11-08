import { ballGrabPanel } from "./ballGrab";
import { cupSizePanel } from "./cupSize";
import { giveItemPanel } from "./giveItem";
import { godModePanel } from "./godMode";
import { lipOutPanel } from "./lipOut";
import { moveCupPanel } from "./moveCup";
import { nukePanel } from "./nuke";
import { rigBoxPanel } from "./rigBox";
import { scoreboardEditPanel } from "./scoreboardEdit";
import { terrainPaintPanel } from "./terrainPaint";
import type { AdminPowerPanel } from "./types";

/** Every Admin Power the console offers, in list order. Later tickets add theirs here. */
export const ADMIN_POWER_PANELS: readonly AdminPowerPanel[] = [
  scoreboardEditPanel,
  ballGrabPanel,
  nukePanel,
  moveCupPanel,
  cupSizePanel,
  lipOutPanel,
  terrainPaintPanel,
  giveItemPanel,
  rigBoxPanel,
  godModePanel,
];
