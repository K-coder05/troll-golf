# 19: Cup Magnet, Ghost Ball, Swap

**What to build:** Three more Items:
- **Cup Magnet** (self): your next shot curves toward the Cup.
- **Ghost Ball** (self): your next shot passes through walls but not hazards.
- **Swap** (chaos): your ball trades positions with a random opponent who can be targeted. A Shield blocks it.

These are the only form of Ghost Ball and Swap. The Admin gets them through Give Item (ticket 20).

**Blocked by:** 15

**Status:** resolved

- [x] After Cup Magnet, the next shot ends closer to the Cup than the same shot without it; the Effect clears after that shot. Tested through the simulation.
- [x] After Ghost Ball, the next shot passes through a wall but still takes a Water penalty; the Effect clears when the ball comes to rest.
- [x] Swap trades the positions of the user's ball and a seeded-random opponent who can be targeted. It skips Players who have Holed Out, are disconnected or are immune, and is blocked by a Shield.
- [x] Swap can't be used after Holing Out.
- [x] Badges and fx show on the client.

## Comments

**Implementation note (ticket 19).**

Built:
- **Effects** `cupMagnet` and `ghostBall` (shared `EffectKind`/`EFFECT_INFO`, definitions in `server/src/simulation/effectKinds/`). Both are visible self Effects armed on use (`durationMs` 3,600,000 in the catalogue = until the Hole ends; not chaos-scaled) and work on the NEXT shot: new engine hooks `onShot` (called from `shoot`, sets `data.flying = 1`) and `onRest` (called from `physicsStep` when a ball settles, from `sinkBall` and from `holeOut`); the Effect ends `consumed` on rest. `EffectHookContext.end(effect, why)` added; `EffectBallControl` gained `setGhost`, `pullToCup`, `settle`. A second use while armed is refused `already_active` (Item kept); both refuse after Holing Out / while spectating.
- **Cup Magnet**: per physics step while flying, adds `params.pull` (120 px/s^2) toward the Cup to the velocity: a curve, not a teleport (tested: ends closer, plain shot stops short).
- **Ghost Ball**: `PhysicsWorld.setCollisions({walls:false})` for the flight; the Hole's edge stays solid; `keepLegal` no longer pulls a ghost out of a wall (`PhysicsWorld.isGhost`), but still keeps it inside the Hole; `guardCup` respects the ghost flag. Decision: it passes through walls AND moving obstacles (Windmills, Sliding Walls) but NOT other balls; Water/Void, Cup, pads, Teleporters and surfaces work normally (so Water still costs +1 and the Rest Spot return). At rest inside a wall it is moved to the nearest legal dry spot (`legalRestSpot`/`nearestDrySpot` in game.ts, refactored out of `dryReturnSpot`), which becomes its Rest Spot.
- **Swap** (`itemHandlers/swap.ts`): picks uniformly with the injected Rng from `ctx.targets()` (not Holed Out, disconnected, spectating, immune) filtered to balls that can move; goes through `ctx.hit` (Shield eats it with the usual feed/fx, no swap, no Item Hit; a landed one is an Item Hit and gives 3 s immunity). Decisions: each ball keeps its own velocity and resting state; a resting ball's new spot becomes its Rest Spot (a rolling ball keeps its old Rest Spot); Frozen (pinned) balls and Ball-Grab-held balls can't be swapped (skipped as targets; a Frozen user is refused `frozen`); refused (Item kept) after Holing Out, with nobody valid (`no_target`). New `ItemBallControl.canSwap/swap` (uses `physics.teleport` directly; destinations that are inside a wall, only possible mid Ghost flight, are moved to a legal spot).
- Client: `client/src/items/{cupMagnet,ghostBall,swap}.ts` renderers (swap draws a line between the two old places and rings), pulsing red ring + 🧲 badge for an armed Cup Magnet, translucent ball + 👻 badge for Ghost Ball (HoleScene), slot denial texts. Typechecked/built only, not browser-tested.
- Tests: `server/test/simulation/selfItems.test.ts` (14); 301 total.

Notes: Admin Give Item (20) of these just works via `items.give`. Cup Magnet / Ghost Ball are not cleared by a Mulligan that rewinds the ball mid-flight other than via the rest hook.
