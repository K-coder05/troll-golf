# 03: Shoot a ball on a walled Hole

**What to build:** A Player in a room sees their ball on the Tee of a simple walled Hole. They click and drag back from the ball and release to shoot it. Drag length sets power up to a maximum, and the angle is opposite the drag. A dotted aim line shows about the first 2 ball-lengths. The ball rolls with baseline damping, bounces off walls and comes to rest. The Player can shoot again only once the ball is at rest (speed under the rest threshold for 300 ms). The camera follows the ball, and holding Tab shows the whole Hole. Physics (Planck.js) runs only in the Game simulation at 60 Hz. The client sends a shoot intent (angle, power 0–1) and renders the synced state.

**Blocked by:** 01

**Status:** resolved

- [x] A shoot intent with a given angle and power moves the ball in that direction, and stepping time brings it to rest. Tested through the simulation.
- [x] A shoot intent sent while the ball is moving is rejected.
- [x] A ball shot at a wall bounces off and stays inside the Hole.
- [x] Each shot adds 1 Stroke.
- [x] The Rest Spot updates whenever the ball comes to rest.
- [x] The client has the slingshot input with the aim line and power cap, camera follow and the Tab overview.
- [x] A hand-written Hole fixture in the course data shape is enough for this ticket; the converter isn't needed.

## Comments

**Implementation note (ticket 03).**

Built:
- `server/src/simulation/physics.ts`: `PhysicsWorld`, the only code that knows Planck.js (`planck@1.5.1`, server dependency). Hole units outside (px, px/s, y down), metres inside at `PIXELS_PER_METRE = 32`. Walls and the Hole's outer edge are static closed chain loops (concave polygons work as-is). The outer edge is always solid, also for later Ghost Balls. Balls are bullet circles with `BALL_RADIUS = 8` (in `shared/src/ball.ts`), no rotation, no Planck damping. Rolling friction is applied by hand every step: `speed * 0.9/s + 40 px/s^2`, both times a per-ball `dampingScale(ballId, position)` hook (default 1). Methods: `addBall`, `removeBall`, `motion`, `speed`, `setVelocity`, `addVelocity` (mass-free impulse), `teleport`, `stop`, `setCollisions(id, { walls, balls })` (filter bits; categories boundary/wall/ball/obstacle), `step()` (exactly one 1/60 s step).
- `game.ts`: `step(dtMs)` builds up time and runs whole fixed 60 Hz physics steps (at most 15 per call). The `shoot` intent `{ angle, power }` checks the payload, rejects a moving ball with `ball_moving`, sets velocity `power * MAX_SHOT_SPEED` (1100 px/s, about 1000 px on Fairway), and adds 1 to `strokes[holeIndex]`. After each step every ball's position and velocity are copied into state. A moving ball under `REST_SPEED` (2 px/s) for 18 steps in a row (300 ms) is stopped, set `atRest`, and its `restSpot` updated. A resting ball pushed over the threshold becomes moving again with no Stroke, ready for ball-ball hits and Items. Joining Players get the next free spot around the Tee.
- State: `PlayerState.ball` (`x, y, vx, vy, atRest, restSpot`) and `strokes: number[]` per Hole, mirrored in `schema.ts` / `syncState.ts`. The M0 cursor intent, state, schema and `CursorScene` are removed. New server message `hole` (`{ holeIndex, hole: HoleData }`) goes to the joining Player only, so the client can draw static geometry.
- `server/src/courses/placeholder.ts`: a 960x640 box with thin edge walls and a centre block (needs a bank shot).
- Client `client/src/scenes/HoleScene.ts`: draws fairway, walls, Tee and Cup. Balls ease toward synced positions and have name labels. Slingshot: press within 4 ball radii of your resting ball, drag back. Power = drag / 180 screen px, capped at 1. The angle is opposite the drag. There is a coloured pull-back band and a dotted aim line 2 ball-lengths long. Esc or right-click cancels. The camera follows your ball at a zoom of about 520 px per screen side, and holding Tab eases to a fit-the-whole-Hole overview. The HUD shows Strokes. Phaser now uses `Scale.RESIZE`.
- Tests: `server/test/simulation/shooting.test.ts` (16 scenarios on a hand-written walled-Hole fixture plus the placeholder): direction, rest, power scaling and cap, moving-ball rejection, Strokes, Rest Spot, 300 ms rest timing, bad payloads, wall bounce staying inside, bank angle, no tunnelling through a 4 px wall, outer edge, fixed-step independence from dt chunking, determinism. The e2e test now shoots over the network. Harness gained `shoot`, `ball`, `advanceUntilRest`.

Notes for later tickets:
- 04: pass `dampingScale` (surface lookup) to `new PhysicsWorld`. Sand power cut goes in `shoot`. Hazards/Boost Pads/Teleporters are per-step checks in `physicsStep` using `teleport`/`addVelocity`. Point-in-polygon in the simulation is simpler than Planck sensors.
- 05: shoot has no phase check yet (allowed in `lobby`). Add it, and rebuild the `PhysicsWorld` per Hole and re-send `hole`.
- 06: add kinematic bodies in `PhysicsWorld` with the reserved `obstacle` category (already in the ball mask when walls are on).
- 07: ball-ball collisions are already on (restitution 0.9). Use `setCollisions(id, { balls: false })` inside the capture radius. No contact events are collected yet: add a `begin-contact` listener in `PhysicsWorld` when fx (wall clink, 22) need them.
- Client shot input isn't covered by automated tests (typecheck and build only, not run in a real browser).
