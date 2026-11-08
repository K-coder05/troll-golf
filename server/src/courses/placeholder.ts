import type { CourseData } from "@troll-golf/shared";

/** A one-Hole walled box. Stand-in until the course converter (ticket 02) produces real Courses. */
export const placeholderCourse: CourseData = {
  id: "placeholder",
  name: "Placeholder",
  holes: [
    {
      id: "box",
      par: 2,
      width: 960,
      height: 640,
      tee: { x: 160, y: 320 },
      cup: { x: 800, y: 320, radius: 12 },
      walls: [
        [
          { x: 0, y: 0 },
          { x: 960, y: 0 },
          { x: 960, y: 640 },
          { x: 0, y: 640 },
        ],
      ],
    },
  ],
};
