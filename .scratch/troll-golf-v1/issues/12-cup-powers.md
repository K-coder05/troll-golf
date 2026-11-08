# 12: Cup powers: Move the Cup, Cup Size, Lip-Out

**What to build:** Three Admin Powers that target the Cup:
- **Move the Cup:** teleport the Cup, or set it to slide away when a ball gets close.
- **Cup Size:** shrink the Cup to a pinhole or blow it up to a crater. This changes the capture radius.
- **Lip-Out:** the chosen Player's next ball that would drop in pops back out.

In Stealth these look natural: an ordinary lip-out, the Cup simply being somewhere else. In Loud they come with the Golf Gods banner.

**Blocked by:** 09

**Status:** resolved

- [x] Teleporting the Cup changes where balls can Hole Out. Tested through the simulation.
- [x] A sliding Cup moves away when a ball comes within its trigger distance.
- [x] Cup Size changes the capture radius both ways, and the no-collision zone around the Cup scales with it.
- [x] Lip-Out makes the targeted Player's next capture-worthy ball lip out exactly once, then clears. Other Players aren't affected.
- [x] Pending Lip-Outs are server-only state. The Stealth lip-out fx is the same as a natural lip-out (secrecy test extended).

## Comments

Built: `moveCup` (teleport | slide), `cupSize` (radius 5..80), `lipOut` (targetId). Params in `shared/src/admin.ts` (plus CUP_* constants); handlers in `server/src/simulation/powers/{moveCup,cupSize,lipOut}.ts`; `AdminCupControl` added to `AdminPowerContext` (admin.ts) and implemented in `game.ts` (`cupControl`, `slideCup`, `popOut`). Console panels in `client/src/admin/powers/`; `lastPointer.ts` extracted from nuke.ts for radial-menu world points (Move the Cup on terrain/Cup, Cup Size crater on the Cup, Lip-Out on a ball). Tests: `server/test/simulation/cupPowers.test.ts` and the secrecy script.

Notes for later tickets:
- Pending Lip-Out, popped-out set and the slide state are server-only variables in game.ts; all cleared at `startHole`. Cup position/size already reset there via `state.cup`.
- A forced Lip-Out fires in `checkCup` only when the ball would drop (below CUP_CAPTURE_SPEED); a fast natural lip-out doesn't consume it. The ball is kicked on along its heading at 1.4x capture speed, emits the plain `lipOut` fx, and cannot drop until it has left the radius. Stealth events are identical to a natural lip-out (tested).
- Sliding Cup moves in the physics step toward a legal spot (inside Hole, centre not in wall), steering round obstacles; the synced `state.cup` carries the position each step.
- Resting balls are still not checked against the Cup (existing behaviour, a test relies on it), so growing or moving the Cup under a resting ball doesn't drop it until it moves.
- New rejection reason `no_ball_in_play` (Lip-Out on a Holed-Out/spectating Player).
