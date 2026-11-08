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
| `tools/` | Dev tooling. `npm run convert-course` turns Tiled maps into course data; see `docs/course-authoring.md`. |
| `client/` | Phaser + Vite browser client. It renders synced state and sends intents. |

Tests live in `server/test/` (simulation scenarios through `test/harness.ts`, plus a WebSocket smoke test) and next to shared code.

## Run it

```sh
npm install
npm run dev        # server on :2567 (tsx watch) + client on http://localhost:5173 (Vite)
```

Open http://localhost:5173 in two browsers. Create a room in one, enter its 4-letter code in the other, and move the mouse: each sees the other's cursor dot. A link like `http://localhost:5173/?room=ABCD` pre-fills the code.

Other scripts:

```sh
npm test           # Vitest, all packages
npm run typecheck  # tsc in every workspace
npm run build      # client -> client/dist, server bundle -> server/dist
npm start          # production server on $PORT (default 2567), serving client/dist
```

## Deploy

The production build is one Node process: Colyseus over WebSockets plus the static client on the same origin. `GET /health` returns `{"ok":true}`.

```sh
docker build -t troll-golf .
docker run -p 8080:8080 troll-golf   # then open http://localhost:8080
```

`fly.toml` is set up for the spec's one always-on Fly.io machine (`auto_stop_machines = "off"`, `min_machines_running = 1`). Choose an app name, then `fly launch --no-deploy` and `fly deploy`. It has not been deployed yet.
