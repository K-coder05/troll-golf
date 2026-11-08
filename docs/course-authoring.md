# Authoring Courses in Tiled

A Course is an ordered list of Holes. You draw each Hole as one Tiled map, export it as JSON (`.tmj`), and run the converter. You don't need to read the code.

## Workflow

1. In Tiled, make a new map (any orientation, tile size 16 is fine). The map's pixel size (`width x tilewidth`, `height x tileheight`) is the Hole's playable area. Everything is drawn with **objects**, not tiles. Use Object Layers; put them in groups if you like. Layer names are free: only each object's **Class** matters.
2. Set the map's custom properties (Map > Map Properties): `par` (int, required) and optionally `name` (string; defaults to the file name).
3. Draw objects using the classes below. In Tiled set the object's **Class** field (called **Type** in Tiled before 1.9; both work) and add custom properties where listed.
4. File > Export As > JSON (`.tmj`).
5. Convert (files are played in the order listed):

```sh
npm run convert-course -- --id my-course --name "My Course" --out server/src/courses/my-course.json hole1.tmj hole2.tmj hole3.tmj
```

Without `--out` the JSON prints to stdout. Problems are listed with the Hole name and the object id, and nothing is written if any Hole is bad.

Coordinates are pixels, origin top-left, y pointing down. Angles you type are **degrees**: 0 = right, 90 = down (clockwise on screen). Polygons and rectangles may be rotated in Tiled; rectangles can be used wherever a polygon is allowed.

## Required

| Class | Shape | Properties |
| --- | --- | --- |
| `Tee` | Point | None. Exactly one per Hole. |
| `Cup` | Point | `radius` (float, default 12). Exactly one per Hole. |
| map `par` | Map property | int, 1 or more. |

## Walls

`Wall`: a polygon or rectangle, solid. Draw the outer boundary as thin rectangles or a polygon ring, plus any inner obstacles. Polygons must have at least 3 points, no repeated points, non-zero area and **must not cross themselves**.

## Surfaces

Polygon or rectangle objects. Ground not covered by any zone is Fairway. Where zones overlap, the one drawn later (further down in the layer order) wins.

| Class | Effect |
| --- | --- |
| `Fairway` | Normal ground (use to cancel a zone under it). |
| `Rough` | Slows the ball. |
| `Sand` | Slows the ball a lot. |
| `Ice` | Very low friction. |
| `Water` | Penalty, ball returns to its Rest Spot. |
| `Void` | Penalty, ball returns to its Rest Spot. |
| `BoostPad` | Pushes the ball. Needs `direction` (float, degrees). Optional `strength` (float, default 1). |

## Teleporters

`Teleporter`: a point. Needs `pair` (string): give exactly two Teleporters the same `pair` value (for example `A`). Optional `radius` (float, default 20). A ball entering one leaves from the other. A lone Teleporter, or three with the same `pair`, is an error.

## Item Boxes

`ItemBox`: a point where an Item Box floats. Any number.

## Moving obstacles

`Windmill`: a point at the pivot. A bar centred on the pivot rotates at constant speed.
- `length` (float, required): tip to tip, px.
- `thickness` (float, required): px.
- `speed` (float, required): degrees per second; negative turns counter-clockwise.
- `phase` (float, default 0): starting angle in degrees.

`SlidingWall`: a rectangle (not rotated) at its **start** position. It slides to the start plus an offset and back.
- `travelX`, `travelY` (float, default 0): offset to the far end, px. At least one must be non-zero.
- `period` (float, required): seconds for a full there-and-back.
- `phase` (float, default 0): how far through the cycle it is at the start, 0 up to (not including) 1.

## What gets rejected

Missing or duplicate Tee or Cup, missing or invalid `par`, unknown classes, wall or surface polygons that are degenerate or self-intersecting, a Teleporter without exactly one partner, a Boost Pad without `direction`, and incomplete Windmills or Sliding Walls. Every problem found is reported together.

The output shape is `CourseData` in `shared/src/course.ts`. A sample map is in `shared/src/courseConverter/fixtures/sample-hole.tmj`.

## Playing a Course

The server plays converted JSON imported in `server/src/courses/index.ts` (`loadCourse` checks its shape at startup; `courses` lists them by id, `defaultCourse` is what new rooms play). The 3-Hole sample Course is built from `server/src/courses/sample/*.tmj`:

```sh
npm run convert-sample-course   # rewrites server/src/courses/sample.json
```

A test checks that `sample.json` matches its `.tmj` sources, so re-run this after editing them.
