import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * The Colyseus schema mirroring `RoomState` from @troll-golf/shared.
 * Only public state goes here. Never add an admin flag (ADR 0001).
 */

export const PointSchema = schema(
  {
    x: t.number(),
    y: t.number(),
  },
  "Point",
);

export const BallSchema = schema(
  {
    x: t.number(),
    y: t.number(),
    vx: t.number(),
    vy: t.number(),
    atRest: t.boolean(),
    restSpot: PointSchema,
  },
  "Ball",
);

/** One visible active Effect (see EffectState in @troll-golf/shared). Never names its source. */
export const EffectSchema = schema(
  {
    id: t.number(),
    kind: t.string(),
    startedAt: t.number(),
    endsAt: t.number(),
  },
  "Effect",
);
export type EffectSchema = SchemaType<typeof EffectSchema>;

export const PlayerSchema = schema(
  {
    id: t.string(),
    name: t.string(),
    color: t.string(),
    connected: t.boolean(),
    spectating: t.boolean(),
    ball: BallSchema,
    strokes: t.array("number"),
    holedOut: t.boolean(),
    standing: t.number(),
    effects: t.array(EffectSchema),
    immuneUntil: t.number(),
    itemHits: t.number(),
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

export const CupSchema = schema(
  {
    x: t.number(),
    y: t.number(),
    radius: t.number(),
  },
  "Cup",
);

/**
 * One terrain edit (see TerrainEdit in @troll-golf/shared). One flat shape for
 * every kind, told apart by `kind`: a paint stroke uses all fields; ticket
 * 21's wall leaves `surface` empty and uses two points with `radius` as half
 * its thickness.
 */
export const TerrainEditSchema = schema(
  {
    id: t.number(),
    kind: t.string(),
    surface: t.string(),
    radius: t.number(),
    expiresAt: t.number(),
    points: t.array(PointSchema),
  },
  "TerrainEdit",
);
export type TerrainEditSchema = SchemaType<typeof TerrainEditSchema>;

/** One Item Box (see ItemBoxState in @troll-golf/shared). Never says who took it or what was in it. */
export const ItemBoxSchema = schema(
  {
    id: t.number(),
    x: t.number(),
    y: t.number(),
    active: t.boolean(),
    respawnAt: t.number(),
  },
  "ItemBox",
);
export type ItemBoxSchema = SchemaType<typeof ItemBoxSchema>;

export const RoomStateSchema = schema(
  {
    code: t.string(),
    phase: t.string(),
    creatorId: t.string(),
    leaderId: t.string(),
    courseId: t.string(),
    holeIndex: t.number(),
    holeEndsAt: t.number(),
    phaseEndsAt: t.number(),
    pars: t.array("number"),
    cup: CupSchema,
    obstacleTimeMs: t.number(),
    settings: SettingsSchema,
    players: t.map(PlayerSchema),
    terrainEdits: t.array(TerrainEditSchema),
    itemBoxes: t.array(ItemBoxSchema),
  },
  "RoomState",
);
export type RoomStateSchema = SchemaType<typeof RoomStateSchema>;
