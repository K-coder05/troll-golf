# 02: Course converter

**What to build:** A course author draws Holes in the Tiled map editor and runs a converter that produces the course data the Game simulation loads. A Course is an ordered list of Holes. Each Hole has a Tee, a Cup, a Par, wall polygons, surface zones (Fairway, Rough, Sand, Ice, Water, Void, Boost Pad with direction, Teleporter pairs), Item Box spawn points and moving obstacles (windmills, sliding walls). The converter is a pure function plus a small CLI wrapper, and it is test seam 2 in the spec. It also defines the Tiled conventions (layer and object names, custom properties), documented for course authors.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The Tiled layer, object and property conventions are documented, enough for someone to draw a Hole without reading the code.
- [ ] Converting a small sample Tiled export gives the expected course data, checked by a test.
- [ ] Maps missing a Tee, Cup or Par are rejected with an error naming the Hole and what's missing.
- [ ] Bad geometry (self-intersecting or degenerate wall polygons, a Teleporter without a pair) is rejected with a clear error.
- [ ] Moving obstacles keep their motion parameters (rotation speed, or path and period).
- [ ] The course data shape lives in the shared package.
