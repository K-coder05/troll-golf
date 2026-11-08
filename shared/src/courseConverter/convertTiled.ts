import type {
  BoostPadData,
  CourseData,
  HoleData,
  Polygon,
  SlidingWallData,
  SurfaceKind,
  SurfaceZone,
  TeleporterPair,
  Vec2,
  WindmillData,
} from "../course";
import { SURFACE_KINDS } from "../course";
import { polygonProblem, rotateAround } from "./geometry";
import type { TiledLayer, TiledMap, TiledObject } from "./tiledTypes";

export const DEFAULT_CUP_RADIUS = 12;
export const DEFAULT_TELEPORTER_RADIUS = 20;

/** Thrown when a Hole (or Course) fails validation. `errors` lists every problem found. */
export class CourseConversionError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "CourseConversionError";
  }
}

export interface HoleSource {
  /** Fallback Hole name and id, usually the file name without extension. */
  name: string;
  map: TiledMap;
}

type Props = Record<string, unknown>;

function propsOf(source: { properties?: unknown }): Props {
  const raw = source.properties;
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Props = {};
    for (const p of raw as { name: string; value: unknown }[]) out[p.name] = p.value;
    return out;
  }
  return raw as Props;
}

function kindOf(o: TiledObject): string {
  return (o.class || o.type || "").trim().toLowerCase();
}

function* walkObjects(layers: TiledLayer[]): Generator<TiledObject> {
  for (const layer of layers) {
    if (layer.type === "objectgroup") yield* layer.objects ?? [];
    else if (layer.type === "group") yield* walkObjects(layer.layers ?? []);
  }
}

/** Convert one Tiled map into a Hole. Throws CourseConversionError naming the Hole. */
export function convertHole(source: HoleSource, index = 0): HoleData {
  const { map } = source;
  if (!map || !Array.isArray(map.layers)) {
    throw new CourseConversionError([`Hole "${source.name}": not a Tiled map export (no "layers"); export as JSON (.tmj)`]);
  }
  const mapProps = propsOf(map);
  const name = typeof mapProps.name === "string" && mapProps.name ? mapProps.name : source.name;
  const label = `Hole "${name}"`;
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`${label}: ${msg}`);

  const num = (props: Props, key: string, fallback: number | undefined, where: string): number | undefined => {
    const v = props[key];
    if (v === undefined || v === null || v === "") return fallback;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      err(`${where}: property "${key}" must be a number`);
      return fallback;
    }
    return v;
  };

  const width = map.width * map.tilewidth;
  const height = map.height * map.tileheight;
  if (!(width > 0 && height > 0)) err("map has no size (width/height/tilewidth/tileheight)");

  // Par
  let par = 0;
  if (mapProps.par === undefined) err('missing Par (add a custom property "par" to the map)');
  else if (typeof mapProps.par !== "number" || !Number.isInteger(mapProps.par) || mapProps.par < 1) {
    err(`Par must be a positive whole number, got ${JSON.stringify(mapProps.par)}`);
  } else par = mapProps.par;

  const where = (o: TiledObject, what: string) => `${what} object #${o.id}${o.name ? ` "${o.name}"` : ""}`;

  /** Reference point of an object: its x,y for a point, its centre for a shape. */
  const centre = (o: TiledObject): Vec2 => {
    if (o.point || !o.width || !o.height) return { x: o.x, y: o.y };
    const corners = rotateAround(
      [
        { x: o.x, y: o.y },
        { x: o.x + o.width, y: o.y + o.height },
      ],
      { x: o.x, y: o.y },
      o.rotation ?? 0,
    );
    return { x: (corners[0]!.x + corners[1]!.x) / 2, y: (corners[0]!.y + corners[1]!.y) / 2 };
  };

  /** Polygon of a polygon or rectangle object (honouring Tiled rotation), or null with an error. */
  const shapeOf = (o: TiledObject, what: string): Polygon | null => {
    const origin = { x: o.x, y: o.y };
    let pts: Vec2[];
    if (o.polygon) {
      pts = o.polygon.map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
    } else if (o.width && o.height && !o.point && !o.ellipse && !o.polyline) {
      pts = [
        { x: o.x, y: o.y },
        { x: o.x + o.width, y: o.y },
        { x: o.x + o.width, y: o.y + o.height },
        { x: o.x, y: o.y + o.height },
      ];
    } else {
      err(`${where(o, what)} must be a polygon or a rectangle`);
      return null;
    }
    pts = rotateAround(pts, origin, o.rotation ?? 0);
    const problem = polygonProblem(pts);
    if (problem) {
      err(`${where(o, what)} ${problem}`);
      return null;
    }
    return pts;
  };

  const tees: Vec2[] = [];
  const cups: { x: number; y: number; radius: number }[] = [];
  const walls: Polygon[] = [];
  const surfaces: SurfaceZone[] = [];
  const boostPads: BoostPadData[] = [];
  const itemBoxes: Vec2[] = [];
  const windmills: WindmillData[] = [];
  const slidingWalls: SlidingWallData[] = [];
  const portals = new Map<string, { at: Vec2; radius: number }[]>();

  for (const o of walkObjects(map.layers)) {
    const kind = kindOf(o);
    const props = propsOf(o);
    switch (kind) {
      case "tee":
        tees.push(centre(o));
        break;
      case "cup": {
        const radius = num(props, "radius", DEFAULT_CUP_RADIUS, where(o, "Cup"))!;
        if (radius <= 0) err(`${where(o, "Cup")}: radius must be positive`);
        cups.push({ ...centre(o), radius });
        break;
      }
      case "wall": {
        const p = shapeOf(o, "Wall");
        if (p) walls.push(p);
        break;
      }
      case "boostpad": {
        const p = shapeOf(o, "BoostPad");
        const w = where(o, "BoostPad");
        const dir = num(props, "direction", undefined, w);
        if (dir === undefined) err(`${w} is missing the "direction" property (degrees, 0 = right, 90 = down)`);
        const strength = num(props, "strength", 1, w)!;
        if (strength <= 0) err(`${w}: strength must be positive`);
        if (p && dir !== undefined) boostPads.push({ polygon: p, angle: (dir * Math.PI) / 180, strength });
        break;
      }
      case "itembox":
        itemBoxes.push(centre(o));
        break;
      case "teleporter": {
        const w = where(o, "Teleporter");
        const pair = props.pair;
        if (typeof pair !== "string" && typeof pair !== "number") {
          err(`${w} is missing the "pair" property (same value on both ends)`);
          break;
        }
        const radius = num(props, "radius", DEFAULT_TELEPORTER_RADIUS, w)!;
        const list = portals.get(String(pair)) ?? [];
        list.push({ at: centre(o), radius });
        portals.set(String(pair), list);
        break;
      }
      case "windmill": {
        const w = where(o, "Windmill");
        const length = num(props, "length", undefined, w);
        const thickness = num(props, "thickness", undefined, w);
        const speed = num(props, "speed", undefined, w);
        if (length === undefined || length <= 0) err(`${w} needs a positive "length" property (px)`);
        if (thickness === undefined || thickness <= 0) err(`${w} needs a positive "thickness" property (px)`);
        if (speed === undefined) err(`${w} needs a "speed" property (degrees per second, negative = counter-clockwise)`);
        const phase = num(props, "phase", 0, w)!;
        if (length && length > 0 && thickness && thickness > 0 && speed !== undefined) {
          const c = centre(o);
          windmills.push({
            x: c.x,
            y: c.y,
            length,
            thickness,
            angularSpeed: (speed * Math.PI) / 180,
            phase: (phase * Math.PI) / 180,
          });
        }
        break;
      }
      case "slidingwall": {
        const w = where(o, "SlidingWall");
        if (!o.width || !o.height || o.point || o.ellipse || o.polygon || o.polyline) {
          err(`${w} must be a rectangle`);
          break;
        }
        if (o.rotation) {
          err(`${w} must not be rotated`);
          break;
        }
        const dx = num(props, "travelX", 0, w)!;
        const dy = num(props, "travelY", 0, w)!;
        const period = num(props, "period", undefined, w);
        if (dx === 0 && dy === 0) err(`${w} needs a non-zero "travelX" and/or "travelY" (distance to slide, px)`);
        if (period === undefined || period <= 0) err(`${w} needs a positive "period" property (seconds per there-and-back)`);
        const phase = num(props, "phase", 0, w)!;
        if (phase < 0 || phase >= 1) err(`${w}: phase must be at least 0 and below 1`);
        if (period && period > 0 && (dx !== 0 || dy !== 0)) {
          const c = centre(o);
          slidingWalls.push({
            width: o.width,
            height: o.height,
            start: c,
            end: { x: c.x + dx, y: c.y + dy },
            period,
            phase,
          });
        }
        break;
      }
      default: {
        if ((SURFACE_KINDS as readonly string[]).includes(kind)) {
          const p = shapeOf(o, kind);
          if (p) surfaces.push({ kind: kind as SurfaceKind, polygon: p });
        } else {
          err(`${where(o, "unknown")} has unrecognised class "${o.class || o.type || ""}"`);
        }
      }
    }
  }

  if (tees.length === 0) err("missing Tee (add a point object with class Tee)");
  else if (tees.length > 1) err(`has ${tees.length} Tees, needs exactly 1`);
  if (cups.length === 0) err("missing Cup (add a point object with class Cup)");
  else if (cups.length > 1) err(`has ${cups.length} Cups, needs exactly 1`);

  const teleporters: TeleporterPair[] = [];
  for (const [id, ends] of portals) {
    if (ends.length !== 2) {
      err(
        ends.length === 1
          ? `Teleporter pair "${id}" has no partner (needs exactly 2 ends sharing pair "${id}")`
          : `Teleporter pair "${id}" has ${ends.length} ends, needs exactly 2`,
      );
    } else {
      teleporters.push({ id, a: ends[0]!.at, b: ends[1]!.at, radius: ends[0]!.radius });
    }
  }

  if (errors.length > 0) throw new CourseConversionError(errors);

  const tee = tees[0]!;
  const cup = cups[0]!;
  const inside = (p: Vec2) => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;
  if (!inside(tee)) err("Tee is outside the map");
  if (!inside(cup)) err("Cup is outside the map");
  if (errors.length > 0) throw new CourseConversionError(errors);

  return {
    id: slug(name) || `hole-${index + 1}`,
    name,
    par,
    width,
    height,
    tee,
    cup,
    walls,
    surfaces,
    boostPads,
    teleporters,
    itemBoxes,
    windmills,
    slidingWalls,
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Convert an ordered list of Tiled maps into a Course. Reports every Hole's problems together. */
export function convertCourse(meta: { id: string; name: string }, sources: HoleSource[]): CourseData {
  const errors: string[] = [];
  const holes: HoleData[] = [];
  sources.forEach((src, i) => {
    try {
      holes.push(convertHole(src, i));
    } catch (e) {
      if (e instanceof CourseConversionError) errors.push(...e.errors);
      else throw e;
    }
  });
  if (sources.length === 0) errors.push(`Course "${meta.name}" has no Holes`);
  const seen = new Set<string>();
  for (const h of holes) {
    if (seen.has(h.id)) errors.push(`Course "${meta.name}": two Holes share the id "${h.id}" (give one a different name)`);
    seen.add(h.id);
  }
  if (errors.length > 0) throw new CourseConversionError(errors);
  return { id: meta.id, name: meta.name, holes };
}
