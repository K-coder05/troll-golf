import { ballGrabPanel } from "./ballGrab";
import { nukePanel } from "./nuke";
import { scoreboardEditPanel } from "./scoreboardEdit";
import type { AdminPowerPanel } from "./types";

/** Every Admin Power the console offers, in list order. Later tickets add theirs here. */
export const ADMIN_POWER_PANELS: readonly AdminPowerPanel[] = [scoreboardEditPanel, ballGrabPanel, nukePanel];
