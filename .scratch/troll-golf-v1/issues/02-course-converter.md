# 02: Course converter

**What to build:** A course author draws Holes in the Tiled map editor and runs a converter that produces the course data the Game simulation loads. A Course is an ordered list of Holes. Each Hole has a Tee, a Cup, a Par, wall polygons, surface zones (Fairway, Rough, Sand, Ice, Water, Void, Boost Pad with direction, Teleporter pairs), Item Box spawn points and moving obstacles (windmills, sliding walls). The converter is a pure function plus a small CLI wrapper, and it is test seam 2 in the spec. It also defines the Tiled conventions (layer and object names, custom properties), documented for course authors.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The Tiled layer, object and property conventions are documented, enough for someone to draw a Hole without reading the code.
- [x] Converting a small sample Tiled export gives the expected course data, checked by a test.
- [x] Maps missing a Tee, Cup or Par are rejected with an error naming the Hole and what's missing.
- [x] Bad geometry (self-intersecting or degenerate wall polygons, a Teleporter without a pair) is rejected with a clear error.
- [x] Moving obstacles keep their motion parameters (rotation speed, or path and period).
- [x] The course data shape lives in the shared package.

## Comments

Built the converter as a pure function in `shared/src/courseConverter/` (`convertHole`, `convertCourse`, `CourseConversionError` listing every problem; geometry checks in `geometry.ts`), exported from `@troll-golf/shared`. `shared/src/course.ts` now holds the full model (surface zones, BoostPadData with angle in radians, TeleporterPair, itemBoxes, WindmillData with angularSpeed rad/s, SlidingWallData start/end/period/phase). `HoleData` gained a required `name` and all the new arrays; the server placeholder was updated. CLI: new `tools/` workspace, `npm run convert-course -- --id x --name "X" --out file.json a.tmj b.tmj`. Conventions are in `docs/course-authoring.md`; fixture and tests in `shared/src/courseConverter/` (16 tests in total for shared incl. room codes).

Notes for later tickets: overlapping surface zones resolve as later-wins; uncovered ground is Fairway; sliding walls ease sinusoidally between start and end over `period` (that's a documented intent, ticket 06 implements it). Converted JSON is not yet wired into the server (placeholder still used); that needs a loader when real Courses exist.
