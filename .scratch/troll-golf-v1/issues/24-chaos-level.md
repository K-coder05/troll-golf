# 24: Chaos level

**What to build:** In the lobby, the room creator picks Chill, Normal or Unhinged. The chaos level scales the number of active Item Boxes per Hole, the attack odds in the distribution table, and Item Effect durations: 0.6× for Chill, 1× for Normal, 1.5× for Unhinged. Admin Powers aren't affected.

**Blocked by:** 15

**Status:** resolved

- [x] At Unhinged, a Freeze lasts 9 s; at Chill, 3.6 s. Tested through the simulation.
- [x] The number of active Item Boxes and the attack odds change with the chaos level, and the odds rows still add up to 100%.
- [x] Admin Power behaviour is the same at every chaos level.
- [x] The setting is in the lobby and shown in synced settings.

## Comments

Built: `configure` intent / `ConfigureMessage` take `chaosLevel` (room creator, lobby only; bad level -> `invalid_payload`, and nothing changes if either field is bad). A level change in the lobby re-draws the Hole's boxes. Lobby select in `client/src/ui/lobby.ts` + `index.html` (non-creators see a text line); synced via the existing `settings.chaosLevel`.

- `shared/src/items.ts`: `CHAOS_FACTORS` (0.6 / 1 / 1.5 for boxes, attack, duration), `scaleOdds`, `tuningForChaos`. Odds rule: attack x factor (capped at 100), self and chaos share the remainder in their original proportions, so rows sum to 100. `ITEM_TUNING` stays the base data; `createItemSystem` derives the scaled tuning on every draw / Hole setup from `state.settings.chaosLevel`.
- Effects: `durationScale` in `game.ts` returns the level's duration factor; Item Effects (`scaled` default) scale, Admin Powers and Cup Magnet / Ghost Ball (`scaled:false`) do not. Freeze 3.6 / 6 / 9 s tested.
- Decision: "Item Effect durations" includes the Golf Gun's 10 s window and the Banana Mine's 45 s lifetime (both are Item durations); they scale via `ctx.scaleDuration` / the trap placement. Golf Gun shots (3) and Cup Magnet / Ghost Ball armed lifetimes do not scale. Shield (30 s) scales.
- Box count: the scale is a fraction of spawn points and is capped at 1, so with the default `boxCountScale` of 1 Unhinged has the same boxes as Normal (all spawn points); only Chill thins them out (0.6). A base `boxCountScale` below 1 lets Unhinged add boxes. Deferred: if Unhinged should have more boxes than Normal on stock Courses, lower the base scale (e.g. 0.7) or add spawn points.
- Tests: `server/test/simulation/chaos.test.ts` (15 tests).
