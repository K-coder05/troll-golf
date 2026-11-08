import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * The Colyseus schema mirroring `RoomState` from @troll-golf/shared.
 * Only public state goes here. Never add an admin flag (ADR 0001).
 */

export const CursorSchema = schema(
  {
    x: t.number(),
    y: t.number(),
    active: t.boolean(),
  },
  "Cursor",
);

export const PlayerSchema = schema(
  {
    id: t.string(),
    name: t.string(),
    color: t.string(),
    connected: t.boolean(),
    cursor: CursorSchema,
  },
  "Player",
);
export type PlayerSchema = SchemaType<typeof PlayerSchema>;

export const SettingsSchema = schema(
  {
    chaosLevel: t.string(),
    holeTimerSec: t.number(),
    strokeCapOverPar: t.number(),
    itemsEnabled: t.boolean(),
  },
  "Settings",
);

export const RoomStateSchema = schema(
  {
    code: t.string(),
    phase: t.string(),
    courseId: t.string(),
    holeIndex: t.number(),
    holeEndsAt: t.number(),
    settings: SettingsSchema,
    players: t.map(PlayerSchema),
  },
  "RoomState",
);
export type RoomStateSchema = SchemaType<typeof RoomStateSchema>;
