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
      // One of each, tucked into the corners so the centre line stays Fairway.
      surfaces: [
        { kind: "rough", polygon: rect(40, 40, 200, 120) },
        { kind: "sand", polygon: rect(300, 40, 200, 120) },
        { kind: "ice", polygon: rect(560, 40, 200, 120) },
        { kind: "water", polygon: rect(300, 480, 200, 120) },
        { kind: "void", polygon: rect(560, 480, 200, 120) },
      ],
      boostPads: [{ polygon: rect(40, 480, 80, 120), angle: 0, strength: 1 }],
      teleporters: [{ id: "1", a: { x: 800, y: 100 }, b: { x: 800, y: 540 }, radius: 20 }],
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
