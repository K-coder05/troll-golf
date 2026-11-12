# 21: Magnet/Repel, Spawn Wall, Invert Controls

**What to build:** Three more Admin Powers:
- **Magnet/Repel:** the Cup pulls the Admin's ball in and pushes other balls away. It can be set per Player.
- **Spawn Wall:** the Admin draws a wall segment that balls bounce off, optionally vanishing after N seconds. It's stored as a terrain edit (ticket 13's system), so reconnecting clients see it.
- **Invert Controls:** the target's drag direction is flipped. It's silent in Stealth.

**Blocked by:** 09, 13

**Status:** resolved

- [x] With Magnet on, the Admin's rolling ball curves toward the Cup and others curve away; turning it off stops this. Tested through the simulation.
- [x] A spawned wall deflects balls; a timed one disappears after N seconds; walls reset at the next Hole.
- [x] Under Invert Controls, the target's shoot intent fires opposite to their drag.
- [x] Invert Controls is server-only state, and in Stealth it produces no event to anyone but the Admin (secrecy test extended).
- [x] Loud uses show the Golf Gods banner.

## Comments

**Implementation note (ticket 21).**

Built:
- **Magnet/Repel** (`powers/magnet.ts`; params `toggle {enabled}` / `set {targetId, polarity: attract|repel|off}`): server-only state in game.ts (`magnetOn`, per-Player overrides). Each physics step (`applyMagnet`, before `physics.step`) a rolling ball within `MAGNET_RANGE` (500 px) of the Cup gets `MAGNET_ACCEL` (260 px/s^2) toward (attract) or away from (repel) the Cup, via the same `pullBallToCup` as Cup Magnet. Default once on: the Admin attracted, everyone else repelled. Decision: it is cleared at the next Hole (and on a Course change), not kept for the game. Playing phase only. Stealth emits nothing; Loud banner.
- **Spawn Wall** (`powers/spawnWall.ts`; `spawn {a, b, thickness?, durationSec?}` / `clear`): new `WallEdit` in the `TerrainEdit` union (`shared/src/terrain.ts`, `points: [a, b]`, `radius` = half thickness, `expiresAt`); added through `surfaces.add`, ids from `nextEditId`, physics body via new `PhysicsWorld.addWall/removeWall` (static capsule in the ordinary `wall` collision category, so Ghost Ball passes through). Expiry and Clear go through `removeWalls` in game.ts, which also destroys bodies; Terrain Paint `clear` still removes only paint. Counts against the same edit/point budget. Limits: length 16..600 px, thickness 6..30 (default 14), duration <= 300 s. Rejected `wall_blocked` (new IntentRejection) if it touches the Cup's capture circle. Balls it overlaps (not mid-flight ghosts) are moved to the nearest legal dry spot beside it (their Rest Spot too if at rest). `legalBallSpot`/`legalCupSpot` now also respect spawned walls (Ball Grab, Swap, Ghost settle, Move the Cup). Walls vanish with the Hole's terrain reset (new physics world). Client: `renderTerrain` draws walls; panel draws by press-drag-release on the course.
- **Invert Controls** (`powers/invertControls.ts`, Effect `invertControls` in `effectKinds/`): started directly with `effects.start(..., {scaled:false})` (no Shield/immunity/cap) for `durationSec` (default 20, max 120). `shoot` adds pi to the angle when the Effect is active, server-side. New `EffectStartOptions.hidden` / `ActiveEffect.visible`: Stealth starts it hidden (not in `PlayerState.effects`, no events), Loud visible (badge from `EFFECT_INFO`, banner). The x-ray now reports the real per-Effect `visible`. Decision: the victim's aim line always shows their real drag (the client does not flip it, even in Loud), so the shot "lies". Cleared at Hole end like every Effect. Target must have a ball in play (`no_ball_in_play`).
- Client panels: `client/src/admin/powers/{magnet,spawnWall,invertControls}.ts` registered in `ADMIN_POWER_PANELS` (only the admin bundle). Typechecked/built only, not clicked through in a browser.
- Tests: `server/test/simulation/magnetWallInvert.test.ts` (23), `secrecy.test.ts` extended with all three powers in both modes; 342 tests in total.

Notes: the secrecy script sets the same Magnet polarity for everyone, since the default favours the Admin and would (correctly) differ between the Maya-Admin and Ben-Admin runs.
