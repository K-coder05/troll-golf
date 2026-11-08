# 08: Disconnects, reconnects, late joins

**What to build:** Connection problems and late arrivals don't break the game.

- **Disconnects:** if a Player drops mid-Hole, their ball stays where it is, can't be targeted and has no collisions.
- **Reconnects:** when they come back, they get the same ball, Strokes and held Item.
- **Still gone at Hole end:** the normal unfinished-Hole rule applies.
- **Late joins:** a friend who joins a game in progress waits as a spectator until the next Hole, then plays. Each Hole they missed is scored at its stroke cap.

**Blocked by:** 07

**Status:** resolved

- [x] A disconnected Player's ball doesn't collide with other balls and stays put. Tested through the simulation.
- [x] Reconnecting within the session restores the same Player (ball, Strokes, held Item).
- [x] A Player still disconnected at Hole end gets min(Strokes + 2, stroke cap).
- [x] A disconnected Player doesn't hold up the "everyone Holed Out" check.
- [x] A late joiner starts at the next Hole, with each missed Hole scored at Par + 4.
- [x] The client shows a disconnected badge on the ball and a spectator view for late joiners.

## Comments

**Implementation note (ticket 08).**

Built:
- **Simulation** (`server/src/simulation/game.ts`, `intents.ts`). New intents `disconnect` and `reconnect`; `leave` now means "gone for good". Player ids stay the Colyseus session id, which Colyseus keeps across a reconnection, so the Player's identity is stable.
  - `disconnect`: `connected = false`, the ball is taken out of the physics world (a rolling ball stops dead where it is; nothing collides with or moves it, not even obstacles). Feed "X disconnected".
  - `reconnect`: `connected = true`, the ball gets its body back at rest where it was frozen (or on the Tee if a new Hole started meanwhile). Nothing about the Player is ever deleted on disconnect, so Strokes, Rest Spot and any future per-Player state (the held Item of ticket 14) come back by construction. The Player is re-sent `time`, `courses` and `hole` (a reloaded page needs them). Feed "X is back". Rejections: `not_connected`, `already_connected`, `left_game`.
  - `leave`: in the lobby the Player is removed (as before). Mid-game they stay in state, disconnected, with their scores; they give up their seat (a newcomer can take it) and can't reconnect. The room creator role passes to the longest-present Player who hasn't left.
  - A ball has a physics body iff its Player is connected, not Holed Out and not a waiting late joiner (`hasBallInPlay`). `guardCup` and `physicsStep` only touch balls with a body, so the Cup no-collision guard and the disconnect rule don't fight (instead of merging two `setCollisions` reasons, the disconnected ball simply isn't in the world).
  - `isTargetable(player)` (exported from `server/src/simulation`): connected, not Holed Out, not spectating. Ticket 15 should extend it with immunity and the disabling cap.
  - Hole end: the unfinished rule min(Strokes + 2, cap) applies to disconnected Players. **Decision:** a Player who was never connected at any point while a Hole was set up or played (e.g. dropped on Hole 1 and still gone for all of Hole 2) is scored that Hole's stroke cap, like a late joiner, otherwise sitting a Hole out would score a cheap 0 + 2.
  - Everyone-Holed-Out check ignores disconnected Players and waiting late joiners.
  - **Late joins**: joining in the lobby or during the 3-2-1 plays normally (nothing has been played yet). Joining while a Hole is played, during the scoreboard, or at the final results makes the Player `spectating`: no ball on the course, every Hole up to and including the current one scored Par + strokeCapOverPar immediately (so Standing counts it), shots rejected `spectating`. `startHole` puts them on the Tee. In Standing they sort behind equal totals and are never the Leader. Feed "X joined, playing from the next Hole" / "X joined to watch".
- **State**: `PlayerState.spectating` (shared state, schema, syncState).
- **Adapter** (`server/src/room/GolfRoom.ts`): `onDrop` sends `disconnect` and calls `allowReconnection` with `RECONNECT_WINDOW_SEC` (30 s in the lobby, 20 min mid-game, roughly a whole 9-Hole game); `onReconnect` sends `reconnect`; `onLeave` (consented leave, or the window ran out) sends `leave`.
- **Client**: the SDK retries a dropped connection on its own; a red "Connection lost · reconnecting…" banner shows meanwhile. The reconnection token is kept in sessionStorage (`client/src/net/connection.ts`: `rememberSeat`/`rejoinRoom`/`forgetSeat`), so reloading the page with `?room=CODE` comes back as the same Player. Disconnected balls are drawn greyed out with an "offline" badge; live Standings tag them "offline" and late joiners "next Hole"; the lobby tags "reconnecting…". Late joiners get the spectator view (camera follows the Leader or a clicked ball, banner "You joined mid-game: you'll play from the next Hole").
- Tests: `server/test/simulation/connections.test.ts` (17: frozen ball, no collisions vs a control, untargetable/no shots, doesn't hold up the Hole, Strokes + 2 and cap at Hole end, whole Hole missed while gone, reconnect restores ball/Strokes and collides again, reconnect into the next Hole, mid-game leave frees the seat, creator hand-over, lobby drop + return, late join mid-Hole / during scoreboard / several Holes in / during the 3-2-1 / after the game). `server/test/room.e2e.test.ts` now drops a Player mid-Hole over WebSockets, checks the other client sees them disconnected, then reconnected with the same session id and Strokes, both via the SDK's automatic reconnection and via a fresh client using the stored token (page reload); the Player then shoots again. 129 tests in total.

Not ticked:
- "The client shows a disconnected badge on the ball and a spectator view for late joiners": built, but only typechecked and built, never run in a real browser.

Notes for later tickets:
- 14: keep the held Item on the Player (state or a per-Player map that disconnect doesn't clear) and reconnect restores it automatically. Holed-Out and disconnected Players have no physics body, so Item Box pickup checks should skip them.
- 15: use and extend `isTargetable`. A disconnected Player can still be the Leader (Standing is about score); targeting should skip to the next targetable Standing.
- 10/11/19 (Ball Grab, Nuke, Swap): balls without a body (`connected = false`, `spectating`, Holed Out) must not be moved through `physics`; decide per power whether a disconnected ball is affected (Nuke Wipe could move it in state only).

**Browser check (e2e, 2026-11-08).** `e2e/reconnect.spec.ts`: a test hook wraps the page's WebSocket to drop it (close 4010, refuse new sockets) and later restore it. The dropped Player sees "Connection lost · reconnecting…". The other sees that ball greyed out (alpha 0.35) with the "offline" badge and an "offline" tag in the Standings, and all of it clears after the auto-reconnect (same session id). A mid-game reload then rejoins as the same Player. A late joiner (via a `?room=` link) gets the spectate bar ("You joined mid-game… Watching Maya"), no ball on the course, and "next Hole" in the Standings. **Bug found and fixed:** a reload after an auto-reconnect landed on the join screen, because `onReconnect` saved the seat before the SDK had stored the new reconnection token (the server refused the stale one with 524). `main.ts` now saves it in a microtask after the handler. Cosmetic, not fixed: on a crowded Tee the "offline" badge under a ball can sit on the neighbouring ball's name.
