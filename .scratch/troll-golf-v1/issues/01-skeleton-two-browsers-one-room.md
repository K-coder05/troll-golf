# 01: Skeleton: two browsers in one room

**What to build:** A deployed Troll Golf URL where two browsers can create and join the same room by a 4-letter code and see each other's cursor dots move in real time. This sets up the whole architecture from the spec:
- a monorepo with client, server and shared packages, all TypeScript;
- the Game simulation as a framework-free module with its public interface (create from course data and settings with an injected random number generator and clock, handle intent, step, read state, drain events tagged by audience);
- a thin Colyseus room adapter that only translates between the network and the simulation;
- a Phaser client.

See `.scratch/troll-golf-v1/spec.md` (Architecture, Modules, Testing Decisions).

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The client, server and shared packages build. Shared holds the state and message types used by both sides.
- [x] The Game simulation has no Colyseus or Phaser imports and exposes create / handle / step / state / drainEvents.
- [x] A test harness can create a Game with a seeded random number generator and a controlled clock, send intents, step time, and assert on state and drained events. At least one passing test uses it (e.g. two Players join and both appear in state).
- [x] Events drained from the simulation carry an audience (everyone, one Player, Admin only), and the adapter routes them by audience.
- [x] Creating a room returns a 4-letter code; joining with a wrong code fails; a 9th join is refused.
- [x] Two browsers on the deployed URL see each other's cursor dots.
- [ ] Deployed to one always-on Fly.io machine that also serves the client files.

## Comments

**Implementation note (ticket 01).**

Built:
- An npm workspaces monorepo with `shared`, `server` and `client`, all TypeScript. `shared/src` holds `RoomState`, `CourseData`, the client/server message types and room-code helpers. Server and client consume it as TS source; the server is bundled with esbuild, the client with Vite.
- The Game simulation is in `server/src/simulation/`, with the public entry point `index.ts`. `createGame({ course, code, settings?, rng, clock })` returns `{ handleIntent(playerId, intent), step(dtMs), getState(), drainEvents() }`. Each event is a server message tagged with an `audience` (`everyone` / `player` / `admin`). A boundary test fails if anything in that folder imports Colyseus, Phaser, express or ws.
- `server/test/harness.ts` (`TestGame`) creates a Game with a seeded RNG and a `ManualClock`, sends intents, advances time in 60 Hz frames and drains events. Lobby/cursor scenarios are in `server/test/simulation/lobby.test.ts`.
- The Colyseus adapter is `server/src/room/GolfRoom.ts`. It sets the room id to a unique 4-letter code (so join-by-code is `joinById`), turns messages into intents, steps at 60 Hz, patches at 20 Hz, copies state into the schema (`syncState.ts`) and routes events with the pure `recipientsFor` (`routeEvents.ts`, unit tested). `maxClients = 8`, and the simulation also refuses a 9th join.
- The Phaser client (`client/`) has an HTML create/join form (nickname, colour, code, `?room=` link) and a `CursorScene` that draws every Player's cursor dot from synced state.
- `server/test/room.e2e.test.ts` starts the real server and uses `@colyseus/sdk`. It checks that creating a room returns a 4-letter code, that a second client joins by code and sees the first one's cursor, that feed events arrive, that a wrong code fails and that a 9th join is refused.

How to run: `npm install`, then `npm run dev` (open http://localhost:5173 in two browsers). Also `npm test`, `npm run typecheck`, `npm run build` and `npm start`. See README.md.

Deferred / not done:
- **Not deployed.** Two acceptance boxes are left unticked: "two browsers on the deployed URL" and "deployed to Fly.io". The app is deployable: `Dockerfile` + `fly.toml` (one always-on machine, client served by the server). The Docker image was built and run locally, and a scripted two-client check passed against it. The browser client was checked by typecheck and build only, not in a real browser.
- Planck.js isn't installed yet (ticket 03). `step` only advances simulation time.
- `leave` removes the Player (lobby behaviour). Ticket 08 keeps the ball and sets `connected = false` mid-game. Player ids are Colyseus session ids for now.
- Admin auth: `JoinOptions.adminSecret` exists, but the adapter ignores it, and admin-audience events are dropped until ticket 09 provides the Admin's session.
- The cursor intent and `PlayerState.cursor` are M0 scaffolding. Remove them once balls are in.

**Browser check (e2e, 2026-11-08).** `e2e/prod.two-browsers.spec.ts` (`npm run test:browser`, headless Chromium) runs two browser contexts against the local production build (`client/dist` served by `server/dist`, as `npm run build && npm start`), not a deployed URL: create a room, a wrong code is refused, join by code, both lobbies list both Players with their colours, the creator starts, and both see each other in the Standings and on the Hole canvas (screenshots checked). The cursor dots of M0 no longer exist (balls replaced them), so "see each other" was checked with the lobby, Standings and balls. Ticked on that basis; the Fly.io deploy box stays unticked (needs the owner's account).
