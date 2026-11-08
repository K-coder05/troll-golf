/**
 * Course data: what the Game simulation loads. Ticket 02 (course converter)
 * fills this out with surface zones, hazards, Item Box spawns and moving
 * obstacles; M0 only needs the outline.
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

export interface HoleData {
  id: string;
  par: number;
  /** Size of the Hole's playable area in world units (px). */
  width: number;
  height: number;
  tee: Vec2;
  cup: CupData;
  /** Static wall polygons, each a list of points. */
  walls: Vec2[][];
}

export interface CourseData {
  id: string;
  name: string;
  holes: HoleData[];
}
