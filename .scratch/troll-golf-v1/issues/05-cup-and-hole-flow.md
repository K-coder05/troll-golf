# 05: Cup and Hole flow: a 3-Hole round

**What to build:** A single Player can play a full 3-Hole round loaded from converted course data. Each Hole goes:
1. A 3-2-1 countdown, then the Player can shoot.
2. The ball Holes Out when it's inside the Cup's capture radius and moving under the capture speed. Too fast and it lips out.
3. The Hole ends when every Player has Holed Out or the Hole timer (90 s by default) runs out. Anyone unfinished scores min(Strokes + 2, stroke cap), with the stroke cap at Par + 4.
4. An 8-second scoreboard shows Strokes against Par.
5. The next Hole starts.

After the last Hole comes a final results screen. The HUD shows Hole number, Par and Strokes top-left and the timer top-centre.

**Blocked by:** 02, 03

**Status:** resolved

- [x] Phases go lobby → countdown → playing → holeEnd → … → gameEnd.
- [x] Shots are rejected outside the playing phase.
- [x] A slow ball inside the capture radius Holes Out; a fast one lips out and keeps rolling. Tested through the simulation.
- [x] The Hole ends early when everyone has Holed Out.
- [x] When the timer runs out, unfinished Players get min(Strokes + 2, Par + 4).
- [x] The round loads 3 Holes made with the course converter (sample maps are fine).
- [x] The client shows the HUD, the scoreboard between Holes and the final results.

## Comments

**Implementation note (ticket 05).**

Built:
- Hole flow in `server/src/simulation/game.ts`. New `start` intent (lobby only, any Player for now) → `startHole(i)` (fresh `PhysicsWorld` + surfaces, Cup reset from the Hole, every ball on Tee slots, `holedOut` cleared, `hole` message to **everyone**) → `countdown` (`COUNTDOWN_MS` 3000) → `startPlaying()` (`holeEndsAt = now + holeTimerSec`) → `endHole()` when every Player has Holed Out or the timer runs out (unfinished: `unfinishedScore` = min(Strokes + 2, Par + strokeCapOverPar); balls frozen) → `holeEnd` (`SCOREBOARD_MS` 8000) → next Hole or `gameEnd`. Phase changes are checked at the end of every `step()` against the injected Clock. Physics only steps in `playing`.
- Shots outside `playing` are rejected `wrong_phase`; by a Holed-Out Player `holed_out`.
- Cup: `checkCup` per moving ball per physics step. Inside `state.cup.radius` and slower than `CUP_CAPTURE_SPEED` (220 px/s) → Hole Out: ball removed from the physics world, parked at the Cup, `fx holeOut` + feed line. Faster → `fx lipOut` once per pass, ball keeps its velocity; it can still drop in on a later slower pass.
- State: `RoomState.phaseEndsAt` (end of countdown / Hole timer / scoreboard), `pars: number[]`, `cup: {x,y,radius}` (synced, reset per Hole, so ticket 12 just mutates `state.cup`), `PlayerState.holedOut`. Schema/syncState updated. New server message `time {now}` to a joining Player so clients can convert clock times despite skew. `FxMessage.kind` gained `holeOut`, `lipOut`.
- Courses: `server/src/courses/index.ts` (`loadCourse` shape check, `sampleCourse`, `courses` by id, `defaultCourse`). Sample 3-Hole Course (Warm-Up par 2, Dogleg par 3, Island Hop par 3) authored as Tiled maps in `server/src/courses/sample/*.tmj`, converted to `sample.json` by `npm run convert-sample-course`; a test checks the JSON matches the sources. `GolfRoom` plays `defaultCourse` and sends `start` on the first join (no lobby screen yet).
- Client: `client/src/ui/hud.ts` (DOM HUD: Hole n/N, name, Par, Strokes top-left; timer top-centre; 3-2-1/GO banner; scoreboard table of Strokes per Hole vs Par during `holeEnd`; final results with ranking at `gameEnd`). `HoleScene` draws the Cup (with flag) from synced state, hides Holed-Out balls, snaps sprites on big jumps (new Hole), only aims/shoots in `playing`. Not exercised in a real browser (typecheck/build only).
- Tests: `server/test/simulation/holeFlow.test.ts` (Cup capture/lip-out, phases, early end, timer scoring and cap, settings, freeze at Hole end, scoreboard → next Hole, full 3-Hole phase sequence, gameEnd), `server/test/courses.test.ts` (sample Course matches converter output, full round on it, loader rejects bad data). Harness gained `startPlaying()` and `advanceUntilPhase()`; older shooting/surface tests now start the game first. e2e waits for the countdown. 80 tests total.

Notes for later tickets:
- 07: replace the auto-start in `GolfRoom.onJoin` with a lobby Start button sending `{ type: "start" }`; restrict it to the room creator in `start()`. The "everyone Holed Out" check is in `advancePhase()`; 08 should make it ignore disconnected Players. Ball-ball no-collision inside the capture radius isn't done (Holed-Out balls simply leave the physics world).
- 08: joining mid-game currently puts the ball on the current Hole's Tee and plays immediately; late joins should spectate until `startHole` and get missed Holes at Par + `strokeCapOverPar`. `leave` still deletes the Player.
- 11: Nuke Reset can call `startPlaying()`-style logic: zero `strokes[holeIndex]`, re-add Holed-Out balls (`physics.addBall`), reset `holeEndsAt`. `startHole(index)` does a full re-setup including the countdown.
- 12: capture and lip-out read `state.cup` every step, so moving/resizing it is enough; a forced Lip-Out goes in `checkCup` before `holeOut`.
- 15/27: the client scoreboard sorts by total Strokes only; add the Item Hits tiebreak.
- 23: final results are the `gameEnd` scoreboard in `hud.ts`; the Recap goes after it.
