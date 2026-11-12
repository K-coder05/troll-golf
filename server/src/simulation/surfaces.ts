import type { HoleData, Polygon, SurfaceKind, Vec2 } from "@troll-golf/shared";

/**
 * Surface lookup for one Hole. `at(point)` is the single "what is the ground
 * here" question the simulation asks; ticket 13 (Terrain Paint) wraps a
 * {@link SurfaceMap} to override course zones with painted ones.
 */
export interface SurfaceMap {
  at(point: Vec2): SurfaceKind;
}

/** Friction multiplier per surface (1 = Fairway). Water and Void are hazards, so friction never matters there. */
export const SURFACE_DAMPING: Record<SurfaceKind, number> = {
  fairway: 1,
  rough: 2,
  sand: 5,
  ice: 0.2,
  water: 1,
  void: 1,
};

/** Shot power multiplier when shooting from a surface. */
export const SAND_POWER_FACTOR = 0.7;
export const shotPowerFactor = (kind: SurfaceKind): number => (kind === "sand" ? SAND_POWER_FACTOR : 1);

export const isHazard = (kind: SurfaceKind): boolean => kind === "water" || kind === "void";

/** The Hole's own zones: ground with no zone is Fairway, later zones win on overlap. */
export function courseSurfaces(hole: HoleData): SurfaceMap {
  return {
    at(point) {
      for (let i = hole.surfaces.length - 1; i >= 0; i--) {
        const zone = hole.surfaces[i]!;
        if (pointInPolygon(point, zone.polygon)) return zone.kind;
      }
      return "fairway";
    },
  };
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Vec2, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
