# 13: Terrain Paint

**What to build:** The Admin paints Ice, Sand, Water or Void anywhere on the Hole with a brush, and the painted terrain immediately behaves like that surface for every ball. Terrain edits are stored as a replayable list in room state, so reconnecting and late-joining clients see the same terrain. Edits are cleared when the next Hole starts. This also sets up the terrain-edit system that Spawn Wall (ticket 21) reuses.

**Blocked by:** 04, 09

**Status:** ready-for-agent

- [ ] A brush stroke of Water across a ball's path makes the ball take the Water penalty. Tested through the simulation.
- [ ] Painted Ice and Sand change damping like their course-defined versions, and painted Sand cuts shot power.
- [ ] Painted terrain overrides the original surface where they overlap.
- [ ] Terrain edits are in synced state; a reconnecting client renders them the same way.
- [ ] Edits reset when a new Hole starts.
- [ ] Stealth paint has no banner; Loud paint does.
