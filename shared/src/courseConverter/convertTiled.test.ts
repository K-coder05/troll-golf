import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CourseConversionError, convertCourse, convertHole } from "./convertTiled";
import type { TiledMap, TiledObject } from "./tiledTypes";

const sample: TiledMap = JSON.parse(readFileSync(new URL("./fixtures/sample-hole.tmj", import.meta.url), "utf8"));

/** A deep copy of the sample with extra objects appended and/or properties replaced. */
function variant(opts: { add?: TiledObject[]; par?: unknown; drop?: string[] } = {}): TiledMap {
  const map: TiledMap = structuredClone(sample);
  if (opts.par !== undefined) map.properties = [{ name: "par", value: opts.par }];
  if ("par" in opts && opts.par === undefined) map.properties = [];
  const drop = new Set(opts.drop ?? []);
  const strip = (layers: TiledMap["layers"]) => {
    for (const l of layers) {
      if (l.objects) l.objects = l.objects.filter((o) => !drop.has(o.class ?? ""));
      if (l.layers) strip(l.layers);
    }
  };
  strip(map.layers);
  map.layers.push({ type: "objectgroup", name: "extra", objects: opts.add ?? [] });
  return map;
}

function errorsOf(map: TiledMap): string[] {
  try {
    convertHole({ name: "Bad", map });
  } catch (e) {
    expect(e).toBeInstanceOf(CourseConversionError);
    return (e as CourseConversionError).errors;
  }
  throw new Error("expected conversion to fail");
}

describe("convertHole", () => {
  it("converts the sample map into the expected Hole", () => {
    expect(convertHole({ name: "ignored", map: sample })).toEqual({
      id: "sample-run",
      name: "Sample Run",
      par: 3,
      width: 480,
      height: 320,
      tee: { x: 40, y: 160 },
      cup: { x: 440, y: 160, radius: 14 },
      walls: [
        [
          { x: 0, y: 0 },
          { x: 480, y: 0 },
          { x: 480, y: 8 },
          { x: 0, y: 8 },
        ],
        [
          { x: 0, y: 312 },
          { x: 480, y: 312 },
          { x: 480, y: 320 },
          { x: 0, y: 320 },
        ],
        [
          { x: 100, y: 100 },
          { x: 140, y: 100 },
          { x: 100, y: 140 },
        ],
      ],
      surfaces: [
        {
          kind: "sand",
          polygon: [
            { x: 200, y: 100 },
            { x: 260, y: 100 },
            { x: 260, y: 160 },
            { x: 200, y: 160 },
          ],
        },
        {
          kind: "water",
          polygon: [
            { x: 300, y: 200 },
            { x: 340, y: 200 },
            { x: 340, y: 240 },
            { x: 300, y: 240 },
          ],
        },
      ],
      boostPads: [
        {
          polygon: [
            { x: 150, y: 160 },
            { x: 190, y: 160 },
            { x: 190, y: 180 },
            { x: 150, y: 180 },
          ],
          angle: Math.PI / 2,
          strength: 1,
        },
      ],
      teleporters: [{ id: "A", a: { x: 60, y: 260 }, b: { x: 400, y: 60 }, radius: 20 }],
      itemBoxes: [{ x: 240, y: 60 }],
      windmills: [{ x: 350, y: 160, length: 80, thickness: 8, angularSpeed: Math.PI / 2, phase: 0 }],
      slidingWalls: [
        {
          width: 10,
          height: 50,
          start: { x: 285, y: 45 },
          end: { x: 285, y: 145 },
          period: 4,
          phase: 0.25,
        },
      ],
    });
  });

  it("accepts the legacy 'type' field and plain-object properties", () => {
    const map = variant();
    for (const l of map.layers) for (const o of l.objects ?? []) if (o.class) {
      o.type = o.class;
      delete o.class;
    }
    map.properties = { par: 3 } as never;
    expect(convertHole({ name: "Legacy", map }).par).toBe(3);
  });

  it("names the Hole and what's missing for a missing Tee, Cup or Par", () => {
    expect(errorsOf(variant({ drop: ["Tee"] }))).toEqual([expect.stringMatching(/Hole "Sample Run".*missing Tee/)]);
    expect(errorsOf(variant({ drop: ["Cup"] }))).toEqual([expect.stringMatching(/Hole "Sample Run".*missing Cup/)]);
    expect(errorsOf(variant({ par: undefined }))).toEqual([expect.stringMatching(/Hole "Bad".*missing Par/)]);
  });

  it("reports every problem at once", () => {
    const errors = errorsOf(variant({ drop: ["Tee", "Cup"], par: 0 }));
    expect(errors).toHaveLength(3);
  });

  it("rejects a non-positive or fractional Par", () => {
    expect(errorsOf(variant({ par: 0 }))[0]).toMatch(/Par must be a positive whole number/);
    expect(errorsOf(variant({ par: 2.5 }))[0]).toMatch(/Par must be a positive whole number/);
  });

  it("rejects two Tees", () => {
    const extra: TiledObject = { id: 90, class: "Tee", x: 10, y: 10, point: true };
    expect(errorsOf(variant({ add: [extra] }))[0]).toMatch(/2 Tees/);
  });

  it("rejects a self-intersecting wall polygon", () => {
    const bowtie: TiledObject = {
      id: 91,
      class: "Wall",
      x: 50,
      y: 50,
      polygon: [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 20, y: 0 }, { x: 0, y: 20 }],
    };
    const errors = errorsOf(variant({ add: [bowtie] }));
    expect(errors[0]).toMatch(/Hole "Sample Run".*Wall object #91.*self-intersecting/);
  });

  it("rejects degenerate wall polygons", () => {
    const line: TiledObject = { id: 92, class: "Wall", x: 0, y: 0, polygon: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] };
    const two: TiledObject = { id: 93, class: "Wall", x: 0, y: 0, polygon: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
    const flat: TiledObject = { id: 94, class: "Wall", x: 0, y: 0, width: 50, height: 0 };
    const errors = errorsOf(variant({ add: [line, two, flat] }));
    expect(errors[0]).toMatch(/#92.*degenerate/);
    expect(errors[1]).toMatch(/#93.*only 2 point/);
    expect(errors[2]).toMatch(/#94.*polygon or a rectangle/);
  });

  it("rejects a Teleporter without a pair", () => {
    const errors = errorsOf(variant({ drop: ["Teleporter"], add: [{ id: 95, class: "Teleporter", x: 5, y: 5, point: true, properties: [{ name: "pair", value: "Z" }] }] }));
    expect(errors[0]).toMatch(/Teleporter pair "Z" has no partner/);
  });

  it("rejects a Teleporter with no pair property", () => {
    const errors = errorsOf(variant({ add: [{ id: 96, class: "Teleporter", x: 5, y: 5, point: true }] }));
    expect(errors[0]).toMatch(/missing the "pair" property/);
  });

  it("rejects a BoostPad without direction and unknown classes", () => {
    const errors = errorsOf(
      variant({ add: [{ id: 97, class: "BoostPad", x: 0, y: 0, width: 10, height: 10 }, { id: 98, class: "Lava", x: 0, y: 0, point: true }] }),
    );
    expect(errors[0]).toMatch(/BoostPad.*"direction"/);
    expect(errors[1]).toMatch(/Lava/);
  });

  it("keeps windmill and sliding wall motion parameters, rejecting incomplete ones", () => {
    const hole = convertHole({ name: "x", map: sample });
    expect(hole.windmills[0]?.angularSpeed).toBeCloseTo(Math.PI / 2);
    expect(hole.slidingWalls[0]).toMatchObject({ period: 4, phase: 0.25 });
    const errors = errorsOf(
      variant({ add: [{ id: 99, class: "Windmill", x: 1, y: 1, point: true }, { id: 100, class: "SlidingWall", x: 1, y: 1, width: 5, height: 5 }] }),
    );
    expect(errors.join("\n")).toMatch(/Windmill.*"length"/);
    expect(errors.join("\n")).toMatch(/SlidingWall.*"travelX"/);
  });

  it("rotates Tiled-rotated rectangles about their anchor", () => {
    const rotated: TiledObject = { id: 101, class: "Wall", x: 100, y: 200, width: 20, height: 10, rotation: 90 };
    const hole = convertHole({ name: "r", map: variant({ add: [rotated] }) });
    const last = hole.walls.at(-1)!;
    expect(last[1]!.x).toBeCloseTo(100);
    expect(last[1]!.y).toBeCloseTo(220);
  });
});

describe("convertCourse", () => {
  it("keeps Hole order and reports bad Holes together", () => {
    const course = convertCourse({ id: "c", name: "C" }, [{ name: "one", map: variant() }]);
    expect(course.holes.map((h) => h.id)).toEqual(["sample-run"]);
    let message = "";
    try {
      convertCourse({ id: "c", name: "C" }, [
        { name: "a", map: variant({ drop: ["Tee"] }) },
        { name: "b", map: variant({ drop: ["Cup"] }) },
      ]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/missing Tee[\s\S]*missing Cup/);
  });
});
