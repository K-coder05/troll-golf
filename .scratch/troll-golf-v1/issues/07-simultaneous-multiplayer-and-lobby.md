# 07: Simultaneous multiplayer and lobby

**What to build:** 2–8 friends play the same Hole at the same time.

The screen flow is Title → Create/Join (4-letter code, nickname, ball colour) → Lobby (Player list; the room creator picks the Course and starts the game).

During play:
- The server syncs state at 20 Hz, and clients render about 100 ms behind with interpolation so balls move smoothly.
- Balls collide with each other, except inside the Cup's capture radius, where nobody can be knocked out.
- Name tags float over every ball.
- The scoreboard shows every Player's Strokes and their **Standing**: Strokes from earlier Holes plus Strokes so far on this Hole, with distance to the Cup breaking ties. Holed-out Players rank by their final Strokes for the Hole.
- Players who have Holed Out stay in the room and spectate.

**Blocked by:** 05

**Status:** resolved

- [x] Two balls that collide on the course both change course. Two balls inside the capture radius don't collide. Tested through the simulation.
- [x] Standing matches the spec's example: Ben (10 earlier + 2 this Hole, 20 px away) ranks above Maya (9 + 4, 300 px away).
- [x] The Leader is the first in Standing among Players who haven't Holed Out.
- [x] The Hole ends only when every connected Player has Holed Out, or when the timer runs out.
- [ ] Create/Join and Lobby screens work, including nickname and colour.
- [ ] Remote balls move smoothly with no visible rubber-banding on a real internet connection with 4 Players. This is the M2 playtest.

## Comments

**Implementation note (ticket 07).**

Built:
- **Lobby and room creator** (`server/src/simulation/game.ts`). `RoomState.creatorId` is the first Player to join; if they leave, the longest-present Player takes over (feed line "X now runs the lobby"). Glossary term: **Room creator** (not "host", which the glossary reserves as an avoided word for the Admin). `start` and the new `configure` intent (`{ courseId? }`) are room-creator-only and lobby-only (`not_creator`, `wrong_phase`, `unknown_course` rejections). `createGame` takes an optional `courses` catalogue; `configure` swaps the Course (pars, Cup, physics world, balls on the new Tee, strokes resized) and sends `hole` to everyone. Each joining Player gets a `courses` message (`CourseSummary[]`: id, name, Hole count). `start` resets strokes. `GolfRoom` no longer auto-starts; it maps `configure` / `start` messages to intents. The catalogue (`server/src/courses/index.ts`) is the sample Course plus the 1-Hole "Practice Box" (the placeholder).
- **Ball-ball collisions inside the Cup** (`guardCup()` before every physics step): a ball whose centre is within `cup.radius + BALL_RADIUS` of the Cup has ball-ball collisions off via `PhysicsWorld.setCollisions`, and a contact needs both balls to allow it, so nothing can knock a ball in or at the Cup. Holed-Out balls still leave the physics world.
- **Standing and Leader** (`updateStandings()`, run after every step and on join/leave): `PlayerState.standing` (1 = first, distinct) = total Strokes, then distance to the Cup (Holed Out = 0), then join order. `RoomState.leaderId` = first in Standing among Players who haven't Holed Out ("" if none). Both synced. Ticket 14 can read `player.standing` (1st / middle / last) and 15 `state.leaderId`; "next-best Standing" is just ascending `standing`.
- **Hole end**: the everyone-Holed-Out check in `advancePhase()` now only counts `connected` Players (08 sets `connected = false` instead of deleting).
- **Client**: DOM screens in `client/index.html`: Title (Play) → Create/Join (nickname, 8 colour swatches + any-colour picker, remembered in localStorage; `?room=` links skip the title) → Lobby (`client/src/ui/lobby.ts`: big code, copy-invite-link, Player list with "you"/"room creator" tags, Course select and Start for the room creator only, "Waiting for X" for others, Leave). `client/src/net/interpolation.ts` (`SnapshotBuffer`, unit tested): every patch is a snapshot stamped with arrival time; all balls (including your own; no prediction) are drawn 100 ms behind, interpolated, with no extrapolation and a snap on jumps > 150 px. Name tags have an outline. HUD (`hud.ts`): hidden in the lobby; live Standings top-right (place, name, this Hole, total, ✓ in the Cup, ★ Leader); Tab shows the full scoreboard mid-Hole; the between-Hole/final scoreboard sorts by Standing. Spectating: once Holed Out the camera follows the Leader, or the ball you click; a bottom banner says who you're watching.
- Tests: `server/test/simulation/multiplayer.test.ts` (14: lobby permissions and Course choice, room creator hand-over, glancing hit changes both balls' course, no collisions inside the capture radius (both inside, and one inside vs one coming from outside) plus a control, the Ben/Maya example, Strokes-before-distance, live distance ties, Holed-Out ranking, Leader, no Leader when all are in, spectators still get events). `server/test/room.e2e.test.ts` now checks over WebSockets that three clients join the lobby, a non-creator's `configure`/`start` are ignored, the room creator's work, and the role passes on when the room creator leaves. `client/src/net/interpolation.test.ts` (4; vitest now includes `client/src/**/*.test.ts`). 111 tests in total.

Not ticked:
- "Create/Join and Lobby screens work": built, and the lobby protocol is covered by the e2e test, but the screens were only typechecked and built, never clicked through in a real browser.
- "Remote balls move smoothly ... 4 Players": needs the M2 playtest on a real connection.

Notes for later tickets:
- 08: a mid-game `leave` still deletes the Player (and passes the room creator role on). Disconnected Players should keep their ball with `setCollisions(id, { balls: false })`; `guardCup` only toggles balls it is tracking in `cupGuarded`, so 08 should merge both reasons (e.g. collisions on only if connected and not guarded). Late joiners are still placed on the current Tee.
- 09: the admin secret goes in `JoinOptions.adminSecret`; the room creator is unrelated to the Admin.
- 24: add `chaosLevel` to the `configure` intent / `ConfigureMessage` and a select in `lobby.ts` next to the Course.
