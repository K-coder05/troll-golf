# 18: Banana Mine

**What to build:** A Player uses Banana Mine to drop a trap where their ball is. The next ball that touches it, including the owner's, spins off in a random direction. The trap lasts until it's triggered or 45 s pass. A Player who has Holed Out clicks to place it anywhere on the Hole except within 3 cup-radii of the Cup. Triggering it counts as an Item Hit for the owner when another Player's ball sets it off.

**Blocked by:** 15

**Status:** resolved

- [x] Using Banana Mine adds a trap at the ball's position; the next ball to touch it gets a random-direction push (deterministic with a seeded random number generator), and the trap disappears. Tested through the simulation.
- [x] An untriggered trap disappears after 45 s.
- [x] A holed-out Player's placement inside 3 cup-radii is rejected and the Item is kept; a placement outside is accepted.
- [x] An opponent setting it off counts as an Item Hit for the owner and shows in the kill feed.
- [x] Traps show on every client.

## Comments

**Implementation note (ticket 18).**

Built: Banana Mine handler `server/src/simulation/itemHandlers/bananaMine.ts`; traps live in `items.ts` (`placeTrap`, `triggerTraps`, `expireTraps`, `clearTraps`). Public state `RoomState.traps: TrapState[] {id, x, y, expiresAt}` (shared/state.ts, schema.ts `TrapSchema`, syncState.ts); the owner is server-only (the kill feed names them). Catalogue params gained `trapRadius` 14 and `pushSpeed` 600. New rejection `bad_placement`; `ItemBallControl.holeSize()`; `ItemContext.placeTrap`.
Rules decided:
- Detection is a swept-segment distance check per physics step (`game.ts` physicsStep, next to Item Box pickup), reach = trapRadius + ball radius; traps are not physics bodies.
- A ball already touching the trap when it is laid (the owner's, normally) is exempt until it rolls clear, so dropping it and shooting away doesn't trigger it; rolling back over it does.
- Push angle = one `rng.next()` per trigger (seeded, deterministic), speed `pushSpeed`, via `ItemBallControl.push`.
- Owner triggering: spin + feed "Maya slipped on their own banana", no Item Hit, no immunity.
- Opponent triggering goes through `items.applyItemHit(owner, victim, "bananaMine", land)`: Shield eats it ("X's Shield ate a Banana Mine", no push, no hit), an immune ball takes no push; in both cases the trap is still consumed. Landed: push, Item Hit for the owner, 3 s immunity, feed "Ben slipped on Maya's banana".
- Lasts 45 s (`durationMs`, not chaos-scaled yet); cleared at Hole end and Hole start.
- Holed-out owner: `useItem {point}`; refused with `bad_placement` (Item kept) if within 3 cup-radii of the Cup or off the Hole; missing point -> `invalid_payload`. Not holed out: dropped at the ball, point ignored.
Client: banana sprite from state in HoleScene (`renderTraps`), spin/puff fx (`client/src/items/bananaMine.ts`), placement-click mode (`placement.armed`, slot use toggles it for holed-out Players; next Hole click sends the point). Typechecked/built only, not browser-tested.
Tests: `server/test/simulation/bananaMine.test.ts` (9); 287 total.
