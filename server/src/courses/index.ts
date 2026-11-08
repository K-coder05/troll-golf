import type { CourseData } from "@troll-golf/shared";
import sampleJson from "./sample.json";

/**
 * Course data as the course converter wrote it (`npm run convert-course`).
 * The converter already validated the geometry; this only checks that the
 * file has the overall shape the simulation relies on, so a stale or
 * hand-edited JSON fails at startup instead of mid-game.
 */
export function loadCourse(json: unknown): CourseData {
  const course = json as Partial<CourseData> | null;
  const problems: string[] = [];
  if (!course || typeof course !== "object") throw new Error("Course data is not an object");
  if (typeof course.id !== "string" || !course.id) problems.push("missing id");
  if (typeof course.name !== "string") problems.push("missing name");
  if (!Array.isArray(course.holes) || course.holes.length === 0) problems.push("no Holes");
  (course.holes ?? []).forEach((hole, i) => {
    const where = `Hole ${i + 1}`;
    if (!hole || typeof hole !== "object") return problems.push(`${where} is not an object`);
    if (!(Number.isInteger(hole.par) && hole.par >= 1)) problems.push(`${where}: bad par`);
    if (!isPoint(hole.tee)) problems.push(`${where}: missing Tee`);
    if (!isPoint(hole.cup) || !(hole.cup.radius > 0)) problems.push(`${where}: missing Cup`);
    if (!(hole.width > 0 && hole.height > 0)) problems.push(`${where}: bad size`);
    for (const key of ["walls", "surfaces", "boostPads", "teleporters", "itemBoxes", "windmills", "slidingWalls"] as const) {
      if (!Array.isArray(hole[key])) problems.push(`${where}: missing ${key}`);
    }
  });
  if (problems.length > 0) throw new Error(`Bad course data "${course.id ?? "?"}": ${problems.join("; ")}`);
  return course as CourseData;
}

function isPoint(p: unknown): p is { x: number; y: number } {
  const v = p as { x?: unknown; y?: unknown } | null;
  return !!v && typeof v.x === "number" && typeof v.y === "number";
}

/** The 3-Hole sample Course, converted from the Tiled maps in `./sample/`. */
export const sampleCourse = loadCourse(sampleJson);

/** Courses a room can play, by id. Ticket 07 lets the room creator pick one in the lobby. */
export const courses: Readonly<Record<string, CourseData>> = { [sampleCourse.id]: sampleCourse };

/** The Course a new room plays until the lobby can choose. */
export const defaultCourse = sampleCourse;
