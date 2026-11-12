# 06: Moving obstacles

**What to build:** Holes can include windmills (rotating blades) and sliding walls that move on a path in a loop. The ball bounces off them the same way it does off static walls, and their motion is synced so every client sees them in the same place.

**Blocked by:** 02, 03

**Status:** resolved

- [x] A windmill rotates at its configured speed, and a sliding wall follows its path with its configured period. Tested by stepping time.
- [x] A ball hitting a moving obstacle is deflected and picks up the obstacle's motion.
- [x] A ball can't get stuck inside or pushed through a wall by a moving obstacle.
- [x] A Hole with obstacles converted from Tiled plays correctly.
- [x] Obstacles are drawn on the client and stay in sync with the server.

## Comments

**Implementation note (ticket 06).**

Built:
- `shared/src/obstacles.ts`: pure pose functions `windmillAngle`, `slidingWallCentre` (sinusoidal ease, `(1 - cos(2*pi*(t/period + phase)))/2`), `windmillCorners`. Server physics and client rendering both use them.
- `PhysicsWorld`: kinematic Planck bodies (category `obstacle`) for every Windmill and Sliding Wall. Each step they are set exactly on their pose for the step's time and given the velocity that ends on the next pose, so balls pick up the motion and bullet balls are swept (no drift, no tunnelling). Obstacle time = whole steps taken. `obstacleTimeMs`, `obstaclePoses()` expose it. Balls never sleep. A safety net (`keepLegal`) puts a ball back at its last legal spot if a squeeze ever leaves it outside the Hole or inside a wall (Planck held in every test even without it).
- State: `RoomState.obstacleTimeMs` (schema + syncState). It is 0 from `startHole`, runs only while `playing` (obstacles are frozen at their starting pose during the countdown and the scoreboard, which matches physics only stepping in `playing`), and resets each Hole. Only the time is synced; clients compute poses.
- Client: `HoleScene.renderObstacles` draws the bars and walls every frame from the synced time, running the time on locally (max 150 ms) between 20 Hz patches. Not run in a browser.
- Sample course: the Dogleg (Hole 2) has a Windmill in the left corridor and a Sliding Wall in the top corridor (`02-dogleg.tmj`, `sample.json` regenerated).
- Tests: `server/test/simulation/obstacles.test.ts` (12): rotation and period by stepping time, countdown freeze and reset, deflection and picked-up motion, pinning against a static wall and the Hole edge, fast shots at a thin fast wall, determinism, the converted Dogleg.

Notes: a ball resting in a wall's path is carried (no Stroke); its Rest Spot updates only when it comes to rest again. Obstacles don't stop Cup capture or hazards. Later tickets that reset a Hole mid-play (Nuke Reset) should decide whether to rebuild the world (resets obstacle time).
