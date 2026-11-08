import type { AdminPowerId, AdminPowerParams, Phase } from "@troll-golf/shared";

/** A Player as the admin console shows them. */
export interface PlayerView {
  id: string;
  name: string;
  color: string;
  /** Strokes per Hole. */
  strokes: number[];
}

/** What a power's console panel can read and do. */
export interface PanelContext {
  /** The Admin's own Player id. */
  myId: string;
  players(): PlayerView[];
  phase(): Phase;
  holeIndex(): number;
  /** Use the power, in the mode the Caps Lock toggle is on right now. */
  use<K extends AdminPowerId>(power: K, params: AdminPowerParams[K]): void;
}

/**
 * One Admin Power in the admin client: its console panel, and what the
 * right-click radial menu (ticket 10) may offer it on. Every power registers
 * one of these in ./index.ts; the console and hotbar pick them up from there.
 */
export interface AdminPowerPanel {
  id: AdminPowerId;
  label: string;
  /** A short glyph for the hotbar. */
  icon: string;
  /** What the radial menu can offer this power on. */
  appliesTo: readonly ("ball" | "cup" | "terrain")[];
  /** Build the panel's controls; called every time the panel is shown. */
  render(ctx: PanelContext): HTMLElement;
}
