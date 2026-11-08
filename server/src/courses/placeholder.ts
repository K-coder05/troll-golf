import type { CourseData, Polygon } from "@troll-golf/shared";

const W = 960;
const H = 640;
const T = 16; // wall thickness

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/**
 * A one-Hole walled box with a block in the middle, so the straight line to
 * the Cup needs a bank shot. Stand-in until converted Courses are loaded (ticket 05).
 */
export const placeholderCourse: CourseData = {
  id: "placeholder",
  name: "Placeholder",
  holes: [
    {
      id: "box",
      name: "Box",
      par: 3,
      width: W,
      height: H,
      tee: { x: 160, y: 320 },
      cup: { x: 800, y: 320, radius: 12 },
      surfaces: [],
      boostPads: [],
      teleporters: [],
      itemBoxes: [],
      windmills: [],
      slidingWalls: [],
      walls: [
        rect(0, 0, W, T), // top
        rect(0, H - T, W, T), // bottom
        rect(0, 0, T, H), // left
        rect(W - T, 0, T, H), // right
        rect(440, 220, 80, 200), // centre block
      ],
    },
  ],
};
