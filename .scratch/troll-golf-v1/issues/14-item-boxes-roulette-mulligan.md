# 14: Item Boxes, roulette, rubber-band odds, Mulligan

**What to build:** Each Hole has Item Boxes at its spawn points. A ball rolling through one gets an Item. The box is a sensor that doesn't change the ball's path; it shatters and respawns after 10 s. A Player already holding an Item rolls through without picking anything up.

**Roulette and odds:**
- On pickup, the server decides the Item right away using rubber-band odds by Standing (defensive/self, attack, chaos):
  - 1st: 70 / 28 / 2
  - middle: 40 / 55 / 5
  - last: 15 / 70 / 15
- The item slot (bottom-centre) plays a 1.5 s roulette, then shows the result.
- Tap Space or click the slot to use it.

**Items are data-driven:** class, duration, targeting kind, counters, weights. A registry maps each Item to one server-side use handler and one client renderer.

**First Item, Mulligan:** sends your ball back to where it was before your last shot and refunds that Stroke plus every penalty since. It can't be used after Holing Out.

**Players who have Holed Out** keep and can use their held Item but can't pick up new ones. Items can be used while the ball is moving. Every Item use is logged with a timestamp.

**Blocked by:** 07

**Status:** resolved

- [x] Rolling through an active Item Box with an empty slot gives an Item; the box deactivates and respawns after 10 s. Tested through the simulation.
- [x] The ball's path is unchanged by the box; a Player holding an Item doesn't pick up.
- [x] With a seeded random number generator, the Item class follows the right odds row for 1st, middle and last Standing (statistical test over many draws).
- [x] The Item is decided at pickup; the roulette is client-side display only.
- [x] Mulligan after a shot that went into Water restores the ball's position from before that shot and refunds 2 Strokes (the shot and the penalty).
- [x] Mulligan is rejected after Holing Out.
- [x] A holed-out Player can't pick up but can still use their held Item.
- [x] Item definitions are data; changing a duration or weight needs no code change.

## Comments

**Implementation note (ticket 14).**

Built:
- **Data** (`shared/src/items.ts`): `ITEM_CATALOGUE` (all 9 v1 Items: id, name, icon, category `self|attack|chaos`, targeting `self|opponent|aimed|placed|randomOpponent`, durationMs, disabling, counters, weight, params), `ITEM_TUNING` (odds table 70/28/2, 40/55/5, 15/70/15; `boxRespawnMs` 10000; `boxRadius` 14; `boxCountScale` 1; `rouletteMs` 1500). Messages: client `useItem {targetId?, point?}`; server `item {item|null, roulette, readyAt}` and `itemDenied {item, reason}` (both holder-only); fx `itemBox` (shatter) and `itemUse` (+ `item`).
- **State**: `RoomState.itemBoxes: ItemBoxState[] {id, x, y, active, respawnAt}` (shared, schema `ItemBoxSchema`, syncState). **Decision: held Items are private.** They are NOT in synced state; they live in the Item system's per-Player map (not touched by disconnect), and only the holder is told (`item` message, resent on join/reconnect via `sendRoomTo`). Server-only accessors `Game.getHeldItem(id)` (for 20's x-ray) and `Game.getItemLog()`. Tests check that nothing about the held Item reaches state or another Player.
- **Pipeline** (`server/src/simulation/items.ts`, `createItemSystem`): `setupHole` (boxes from `hole.itemBoxes` via `chooseBoxSpawns(points, boxCountScale, rng)`; none if `settings.itemsEnabled` is false), `respawnBoxes` (each step while playing), `rollThrough(player, from, to)` (called from `physicsStep` for every ball with a body, before the Cup/hazard checks, using a swept segment test against `boxRadius + BALL_RADIUS`; skips holders, Holed Out, spectating, disconnected; boxes are not physics bodies, so paths are unchanged), `use` (no_item -> not_connected -> wrong_phase (playing only) -> `item_not_ready` until roulette end -> request parse -> `item_unavailable` -> `handler.use`; rejections after the slot check send `itemDenied` to the holder and keep the Item; on success the slot is emptied unless the outcome has `keep: true` and a `use` log entry is added), `give` / `rig` (hooks for ticket 20: Give Item and Rig the Box; a rigged pickup is logged `rigged: true`), `forget`, `resetAll` (on `start`). Held Items carry across Holes and survive Nukes.
- **Draw**: `oddsRowFor(standing, playerCount)` (1 -> first, == count -> last, else middle), `drawCategory`, `drawItem(rng, odds, row, catalogue, available)`: category by row, then an Item of that category by weight among Items with a handler and weight > 0. **Placeholder:** if the drawn category has no such Item yet, it draws by weight from every available Item (today always Mulligan); the logged `category` is still the rolled one. Two Rng rolls per pickup, all via the injected Rng.
- **Handlers** (`server/src/simulation/itemHandlers/`, registry `ITEM_HANDLERS: ItemHandlerRegistry`, Partial until 15-19). `ItemContext` = state, user, def (catalogue entry), request {targetId?, point?}, now, rng, emit, updateStandings, `balls: ItemBallControl` (lastShot / clearLastShot / placeAtRest; extend it in game.ts as Items need more). **Mulligan**: rejects `holed_out`, `spectating`, `no_shot`; refunds 1 + penalties since the last shot (game.ts `lastShots`, recorded in `shoot`, penalties counted in `sinkBall`, cleared on new Hole/configure/Nuke Reset); ball put at rest at its pre-shot spot (works while rolling; a ball held by Ball Grab is let go); fx `itemUse` + feed "Maya took a Mulligan (-2)".
- `createGame({ items: { catalogue?, tuning?, handlers? } })` injects other data/handlers (tests use it to show weights/durations are data). Adapter maps `useItem` and prints `[item-log]` lines.
- **Sample Course**: one or two more ItemBox points per Tiled map (3 per Hole), reconverted.
- **Client**: `client/src/ui/itemSlot.ts` (bottom-centre slot; 1.5 s roulette flicking icons, then lands; Space or click sends `useItem {}`; `itemDenied` shakes with a short reason), `client/src/items/` (`ITEM_RENDERERS`, Mulligan rewind swirl), `HoleScene` draws bobbing "?" boxes from state and a shatter on `itemBox`. Typechecked/built only, not clicked through in a browser.
- Tests: `server/test/simulation/items.test.ts` (30: boxes, Items off, pickup + 10 s respawn, sensor path identical, holder rolls through, scaled box count, fresh boxes next Hole, row mapping, statistical odds per row over 20k draws, weights within a category, determinism, fallback, Standing row in the pickup log, decided-at-pickup + roulette lock, privacy, malformed requests, wrong phase, reconnect, use log, Mulligan after Water (-2), while rolling, last shot only, no shot, after Holing Out, holed-out player uses but can't pick up, data-driven weights/durations). `nuke.test.ts`: held Items survive Wipe and Reset (closes ticket 11's open box). 245 tests total.

Notes for later tickets:
- 15: add `targeting` resolution (Leader / next-best / keep Item) inside the pipeline or a shared helper using `def.targeting` and `isTargetable`; return `{ ok: false, reason }` to keep the Item. Effects go in synced state; held Items stay private.
- 17: Golf Gun can return `keep: true` per shot; it needs its own "active" timer (10 s) on top.
- 20: Give Item = `items.give`, Rig the Box = `items.rig` (expose them on `AdminPowerContext`); x-ray reads `items.held`. Give Item of an Item without a handler makes its use fail with `item_unavailable`.
- 23: pickups in the log carry `rigged`; never send the raw log to non-Admins.
- 24: scale `ITEM_TUNING.odds` (attack column, renormalised) and `boxCountScale` per chaos level and pass the tuning into `createItemSystem` (today it's fixed at creation; make it read the current settings) and scale `def.durationMs` where Effects start.
