# Troll Golf

Top-down, real-time multiplayer mini-golf for 2–8 friends, with Items and a secret Admin.
Design: `Troll Golf — Spec Sheet.md`, `.scratch/troll-golf-v1/spec.md`, `GLOSSARY.md`, `docs/adr/`.

Needs Node 24+ and npm 11+.

## Layout

npm workspaces, all TypeScript:

| Package | What's in it |
| --- | --- |
| `shared/` | State, course data and message types used by both sides, and room-code helpers. Consumed as TypeScript source. |
| `server/` | `src/simulation/`: the Game simulation (framework-free, owns every rule). `src/room/`: the thin Colyseus adapter. `src/app.ts`: HTTP + WebSocket server that also serves the built client. |
| `tools/` | Dev tooling. `npm run convert-course` turns Tiled maps into course data; see `docs/course-authoring.md`. The sample Course's maps are in `server/src/courses/sample/`; `npm run convert-sample-course` rebuilds `server/src/courses/sample.json`. |
| `client/` | Phaser + Vite browser client. DOM screens for Title, Create/Join, Lobby and the HUD; a Phaser scene for the Hole. It renders synced state (balls interpolated ~100 ms behind) and sends intents. |

Tests live in `server/test/` (simulation scenarios through `test/harness.ts`, plus a WebSocket smoke test) and next to shared and client code (`client/src/net/interpolation.test.ts`).

## Run it

```sh
npm install
npm run dev        # server on :2567 (tsx watch) + client on http://localhost:5173 (Vite)
```

Open http://localhost:5173 in two or more browsers. Press Play, pick a nickname and ball colour, and create a room in one; enter its 4-letter code in the others (a link like `http://localhost:5173/?room=ABCD` skips the title and pre-fills the code). Everyone waits in the lobby, where the room creator picks the Course (the 3-Hole sample Course or the 1-Hole Practice Box) and presses Start. After a 3-2-1 countdown everyone plays the Hole at once: drag back from your ball and release to shoot, hold Tab to see the whole Hole and the scoreboard. Live Standings are top-right. Once you've Holed Out you spectate (click a ball to watch it; by default you follow the Leader). A Hole ends when everyone has Holed Out or the 90 s timer runs out, then an 8 s scoreboard shows; final results follow the last Hole. If your connection drops, your ball freezes where it is (greyed out, "offline") and the client reconnects on its own; reloading the page also brings you back as the same Player. Friends who join a game in progress spectate until the next Hole, and each Hole they missed is scored at its stroke cap.

### Being the Admin

Start the server with an admin secret, e.g. `ADMIN_SECRET=hunter2 npm run dev` (no secret set means nobody can be the Admin). On the Create/Join screen press the backtick key (`` ` ``) to show a passphrase field, type the secret, then create or join any room as usual. A wrong secret just joins as a normal Player; a room takes one Admin. Once in, the server sends your session (only yours) a one-time link to the admin bundle (`client/src/admin`, built separately into `client/dist-admin/`). Press backtick to open the console; keys 1–9 pick hotbar slots while it's open, and Caps Lock on means Loud (off = Stealth). Every Admin Power use is written to the server log as an `[admin-log]` JSON line.

Other scripts:

```sh
npm test           # Vitest, all packages
npm run typecheck  # tsc in every workspace
npm run build      # client -> client/dist, admin bundle -> client/dist-admin, server bundle -> server/dist
npm start          # production server on $PORT (default 2567), serving client/dist
```

## Deploy

The production build is one Node process: Colyseus over WebSockets plus the static client on the same origin. `GET /health` returns `{"ok":true}`.

```sh
docker build -t troll-golf .
docker run -p 8080:8080 troll-golf   # then open http://localhost:8080
```

`fly.toml` is set up for the spec's one always-on Fly.io machine (`auto_stop_machines = "off"`, `min_machines_running = 1`). Choose an app name, then `fly launch --no-deploy`, `fly secrets set ADMIN_SECRET=...` and `fly deploy`. It has not been deployed yet.
