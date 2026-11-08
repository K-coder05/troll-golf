# 13: Terrain Paint

**What to build:** The Admin paints Ice, Sand, Water or Void anywhere on the Hole with a brush, and the painted terrain immediately behaves like that surface for every ball. Terrain edits are stored as a replayable list in room state, so reconnecting and late-joining clients see the same terrain. Edits are cleared when the next Hole starts. This also sets up the terrain-edit system that Spawn Wall (ticket 21) reuses.

**Blocked by:** 04, 09

**Status:** resolved

- [x] A brush stroke of Water across a ball's path makes the ball take the Water penalty. Tested through the simulation.
- [x] Painted Ice and Sand change damping like their course-defined versions, and painted Sand cuts shot power.
- [x] Painted terrain overrides the original surface where they overlap.
- [x] Terrain edits are in synced state; a reconnecting client renders them the same way.
- [x] Edits reset when a new Hole starts.
- [x] Stealth paint has no banner; Loud paint does.

## Comments

**Implementation note (ticket 13).**

Built:
- **Edit list** (`shared/src/terrain.ts`): `TerrainEdit` is a discriminated union on `kind`, currently only `PaintStrokeEdit { kind: "paint", id, surface: ice|sand|water|void, radius, points[], expiresAt }`. A stroke covers every point within `radius` of its polyline (capsule chain; one point = disc). `id` increases across the whole game (later edits win), `expiresAt` 0 = until the next Hole. Helpers `strokeSegmentCovers`/`strokeCovers` are shared with the client. `RoomState.terrainEdits` holds the list (schema `TerrainEditSchema`: one flat shape for every kind, `surface` "" when a kind has none; `syncState` keeps the matching prefix by id, appends new edits and only the new points of a growing stroke).
- **Lookup** (`server/src/simulation/terrain.ts`, `createTerrain(courseSurfaces(hole), state.terrainEdits)`): a `SurfaceMap` over the course zones that owns the edit array. `at(point)` checks a 32 px grid of stroke segments and returns the highest-id covering stroke, else the course's surface. `game.ts`'s `surfaces` is now this, so damping, the Sand power cut and Water/Void read painted terrain with no other changes. Non-paint kinds are kept in the list but ignored by `at`.
- **Power** `terrainPaint` (`shared/src/admin.ts` params; `server/src/simulation/powers/terrainPaint.ts`): `stroke {surface, radius 8..80, points (1..32), durationSec? ≤120}` is the logged use (Loud banner, e.g. "The waters rise"); `extend {points}` adds to the Admin's current stroke (`quiet`); `clear` removes all paint this Hole (logged). Playing phase only. `AdminTerrainControl` (`admin.ts`) is implemented in `game.ts` (`terrainControl`). Points are clamped into the Hole, rounded to whole px, and dropped if closer than 0.4×radius to the previous one. Budget per Hole: `MAX_TERRAIN_EDITS` 48, `MAX_TERRAIN_POINTS` 1500, `MAX_STROKE_POINTS` 64 (a longer stroke carries on as a new edit from its last point). New rejections: `no_stroke`, `terrain_full`. Timed edits are removed by `expireTerrain()` in `step` while playing. `startHole`/`configure` call `resetTerrain()`.
- **Decision: balls at rest.** Hazards are now checked for every ball with a body each step, resting or not, so painting Water/Void under a resting ball sinks it at once (+1, ordinary splash/void fx). This is safe because `sinkBall` now returns the ball to `dryReturnSpot(restSpot)`: the Rest Spot if its centre is not a hazard (same as before for course hazards), else the nearest dry legal spot searched in rings around it (then around the Tee), which becomes the new Rest Spot. Otherwise a ball whose Rest Spot was painted over would sink forever. Boost Pads, Teleporters and the Cup are still checked for moving balls only.
- **Stealth/Loud**: Stealth emits nothing (the terrain just changes; edits carry no author). Loud adds the pipeline's banner on `stroke`/`clear`. Secrecy script extended.
- **Client, public** (`HoleScene`): the course graphics are split into ground (depth 0) and features (Boost Pads, portals, Tee, walls; depth 0.8), and each terrain edit gets its own Graphics in between, in list order, drawn with the same fill and texture as a course zone of that surface (redrawn only when it gains points; destroyed when gone). Late joiners/reconnects get the list in the full state.
- **Client, admin** (`client/src/admin/brush.ts`, `powers/terrainPaint.ts`): panel with surface picker, brush size, optional fade time, Paint (arms the brush), Clear. Radial menu on terrain arms the brush. While armed, press-drag on the canvas paints: `stroke` on press, `extend` batched at ~20 Hz (≤32 points/message), canvas mouse events swallowed so no shot starts, camera held, a circle cursor shows the brush size. Esc or right-click puts it away. Typechecked/built only, not clicked through in a browser.
- **e2e flakiness** (`server/test/room.e2e.test.ts`): the server listened on a random port in 25670..26669. Colyseus's `listen()` never settles on EADDRINUSE (the error is only logged; checked: it hangs), and a port shared with another run/dev server sends clients to the wrong process ("fetch failed" when it goes away). Now it listens on port 0 at 127.0.0.1 and reads the real port, raises the HTTP keep-alive timeout (no reuse race with idle-socket close), and setup/teardown are wrapped in 5 s timeouts so they fail loudly instead of hanging. The admin e2e now also paints and checks Ben and a late joiner get the same `terrainEdits`.
- Tests: `server/test/simulation/terrainPaint.test.ts` (18), secrecy script, e2e. 214 tests in total.

Notes for ticket 21 (Spawn Wall):
- Add `WallEdit { kind: "wall", id, points: [a, b], radius (half thickness), expiresAt }` to the `TerrainEdit` union; the schema needs no change. Add it through `surfaces.add(...)` (the `Terrain` from `createTerrain`) with ids from `nextEditId`, and create its physics body in game.ts; `surfaces.remove()` returns removed edits (expiry/clear), so remove bodies for those (hook into `expireTerrain`). `clear` of Terrain Paint only removes `kind === "paint"`. Count walls against the same budget. The client's `renderTerrain` ignores unknown kinds; add a wall drawing there.
