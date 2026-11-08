/**
 * Course data: what the Game simulation loads. Produced by the course
 * converter (`courseConverter/`) from Tiled maps, consumed by the physics
 * (ticket 03), surfaces (04) and moving obstacles (06).
 *
 * Coordinates are world units (px) with the origin at the Hole's top-left,
 * x to the right and y DOWN. Angles are radians, 0 = +x, positive = clockwise
 * on screen (because y is down).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface CupData {
  x: number;
  y: number;
  radius: number;
}

/** A closed polygon: points in order, the last implicitly joins the first. At least 3 points. */
export type Polygon = Vec2[];

/**
 * Ground types painted as zones. Anything not covered by a zone is Fairway.
 * Boost Pads are separate (they carry a direction), see {@link BoostPadData}.
 */
export type SurfaceKind = "fairway" | "rough" | "sand" | "ice" | "water" | "void";

export const SURFACE_KINDS: readonly SurfaceKind[] = ["fairway", "rough", "sand", "ice", "water", "void"];

/** A surface zone. When zones overlap, later entries in `HoleData.surfaces` win. */
export interface SurfaceZone {
  kind: SurfaceKind;
  polygon: Polygon;
}

/** A zone that accelerates a ball in a fixed direction. */
export interface BoostPadData {
  polygon: Polygon;
  /** Direction of the push, radians (0 = +x, clockwise on screen). */
  angle: number;
  /** Strength multiplier; 1 is the default push. */
  strength: number;
}

/** Two linked portals: entering one exits the other. */
export interface TeleporterPair {
  /** The pair id the author used in Tiled. */
  id: string;
  a: Vec2;
  b: Vec2;
  radius: number;
}

/** A bar rotating about a pivot at constant speed. The bar is centred on the pivot. */
export interface WindmillData {
  /** Pivot (centre of rotation). */
  x: number;
  y: number;
  /** Bar length (tip to tip) and thickness. */
  length: number;
  thickness: number;
  /** Radians per second; negative = counter-clockwise on screen. */
  angularSpeed: number;
  /** Bar angle at time 0, radians. */
  phase: number;
}

/**
 * A rectangle sliding back and forth between two centre points. One full
 * cycle (start -> end -> start) takes `period` seconds, using a smooth
 * (sinusoidal) ease; `phase` shifts the cycle (0..1 of a period).
 */
export interface SlidingWallData {
  width: number;
  height: number;
  /** Centre at the start of the path. */
  start: Vec2;
  /** Centre at the far end of the path. */
  end: Vec2;
  /** Seconds for a full there-and-back cycle. */
  period: number;
  /** Fraction of the period (0..1) the cycle is already through at time 0. */
  phase: number;
}

export interface HoleData {
  id: string;
  /** Display name of the Hole. */
  name: string;
  par: number;
  /** Size of the Hole's playable area in world units (px). */
  width: number;
  height: number;
  tee: Vec2;
  cup: CupData;
  /** Static wall polygons. */
  walls: Polygon[];
  surfaces: SurfaceZone[];
  boostPads: BoostPadData[];
  teleporters: TeleporterPair[];
  /** Where Item Boxes float. */
  itemBoxes: Vec2[];
  windmills: WindmillData[];
  slidingWalls: SlidingWallData[];
}

export interface CourseData {
  id: string;
  name: string;
  holes: HoleData[];
}
