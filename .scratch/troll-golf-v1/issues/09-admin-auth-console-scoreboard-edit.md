# 09: Admin auth, console, Stealth/Loud, Scoreboard Edit

**What to build:** The secret Admin can join any room by entering the admin secret (from a server env var), with at most one Admin per room. They play as an ordinary Player and count in scoring and Standing. Their session gets a separate admin client bundle, which other clients never receive. Pressing backtick opens the admin console. It has hotbar slots 1–9 and a Stealth/Loud toggle on Caps Lock.

The first Admin Power is **Scoreboard Edit**: add or remove Strokes on any Player.
- **Stealth:** nothing is attributed.
- **Loud:** everyone sees the "👑 The Golf Gods have spoken" banner, which never names the Admin.

This ticket also sets up the Admin Power pipeline that later Admin Powers plug into: the admin intent, the server-side check that the session is the Admin, Stealth/Loud handling, and logging every Admin Power use with a timestamp. Follows `docs/adr/0001-secret-admin-with-separate-bundle.md`.

**Blocked by:** 07

**Status:** resolved

- [x] Joining with the correct secret makes that session the Admin; a wrong secret just joins as a normal Player; a second Admin in the same room is refused.
- [x] Admin intents from non-Admin sessions are rejected.
- [x] Scoreboard Edit changes the target's Strokes, and the change shows on the scoreboard.
- [x] **Secrecy test:** across a scripted game using Scoreboard Edit in both modes, no synced state and no event sent to a non-Admin audience contains an admin flag, the Admin's id as the source of an Admin Power, or the Admin's name.
- [x] A Loud use sends a Golf Gods banner event to everyone; a Stealth use sends no banner.
- [x] The admin bundle is served only after authentication and isn't referenced by the normal client. Hiding it from DevTools is nice to have.
- [x] The console, hotbar and Caps Lock toggle work on the Admin's client only.
- [x] Every Admin Power use is logged server-side with a timestamp, never synced.

## Comments

**Implementation note (ticket 09).**

Built:
- **Auth** (adapter): `server/src/admin/auth.ts` `isAdminSecret(given, process.env.ADMIN_SECRET)` (constant-time; unset secret = nobody is Admin). `GolfRoom.onJoin` passes `admin: true` on the `join` intent only for the right secret; a wrong one joins silently as a normal Player. The simulation refuses a second Admin with `admin_taken` (join refused; the client says "That passphrase is already in use"). The Admin role survives disconnect/reconnect (same session id) and is freed when the Admin leaves for good. Client: pressing backtick on the Create/Join screen reveals an unlabeled passphrase field (`JoinOptions.adminSecret`).
- **Pipeline** (`server/src/simulation/admin.ts`, `createAdminPowers`): server-only `adminId`, `claim/release/isAdmin`, and `use(playerId, intent)`: not the Admin → `not_admin` with **no events at all**; then known power (`unknown_power`), mode `stealth|loud`, `handler.parse(params)` (`invalid_payload`), `handler.phases` (`wrong_phase`), `handler.use(ctx, params, mode)`; on success an `AdminLogEntry` `{ at, phase, holeIndex, adminId, power, mode, targetId?, summary, params }` is appended, Loud emits `banner` `{ text: GOLF_GODS_BANNER, detail? }` to everyone, and the Admin alone gets `adminResult`. Failures after the Admin check also go to the Admin only. `Game.getAdminId()` / `Game.getAdminLog()` are server-only accessors (not in RoomState). The adapter routes `admin`-audience events to the Admin's connection and prints each new log entry as an `[admin-log]` JSON line.
- **Adding a power** = params type in `shared/src/admin.ts` `AdminPowerParams` (the `AdminMessage` union and `AdminPowerId` follow), a handler `AdminPowerHandler<"id">` in `server/src/simulation/powers/<id>.ts` registered in `powers/index.ts` (`ADMIN_POWERS` is typed so a missing handler is a compile error), and a console panel `AdminPowerPanel` in `client/src/admin/powers/` registered in `ADMIN_POWER_PANELS` (gets a hotbar slot and the console list automatically; `appliesTo: ball|cup|terrain` is for ticket 10's radial menu). The handler's `AdminPowerContext` (state, adminId, now, emit, updateStandings) is built in `admin.ts` from options passed by `game.ts`; extend it there with what a power needs (physics, surfaces, Cup...). Handlers do their own Stealth/Loud visuals; the pipeline adds the banner. `summary` is the Admin-facing text for the console and ticket 23's reveal; `bannerDetail` must not name the Admin.
- **Scoreboard Edit** (`powers/scoreboardEdit.ts`): `{ targetId, delta (non-zero int, |delta| ≤ 20), holeIndex? (≤ current, default current) }`, any Player incl. the Admin, disconnected or late joiners; Strokes floor at 0; Standing recomputed immediately; phases countdown/playing/holeEnd/gameEnd (not lobby, since start resets Strokes). Stealth: nothing emitted. Loud: feed "👑 The Golf Gods gave Ben +2 Strokes" + banner (detail "Ben: +2 Strokes").
- **Admin bundle**: `client/src/admin/` (console, hotbar, Caps Lock toggle, power panels), built by `client/build-admin.mjs` (esbuild) to `client/dist-admin/admin.js`, outside the statically served `client/dist`. On an Admin join (and on every Admin reconnect) the room sends that session alone `adminBundle { path: "/admin-bundle/<48-hex one-time token>.js" }`; `server/src/admin/bundle.ts` issues tokens (60 s TTL, single use) and the route in `app.ts` serves the bundle (404 otherwise). In dev/test (`NODE_ENV !== "production"`) the bundle is built from source on demand with esbuild; production reads the prebuilt file (Dockerfile copies `client/dist-admin`). The public client only has a generic loader (`main.ts` `loadAdminBundle`, once per page) and the type-only seam `client/src/adminHost.ts` (`AdminHost { room }`; ticket 10 should add what the radial menu needs, e.g. world point under the pointer). Verified after `npm run build`: the public `client/dist` contains no console code (only the `adminBundle` message name); `client/src/adminBoundary.test.ts` checks imports and, when `dist` exists, the built output.
- **Console** (admin client only): backtick toggles it (Esc closes); hidden when closed so a screen share shows nothing. Keys 1–9 pick hotbar slots only while it's open (so they don't clash with ticket 15's 1–8 target picker); slot assignment per power, saved in localStorage. Caps Lock on = Loud, read from `getModifierState` on every key event; a badge shows the mode. The last 5 `adminResult`s are listed.
- **Public client**: the Golf Gods banner (`#gods-banner`, 3 s).
- Tests: `server/test/simulation/admin.test.ts` (16: auth, second Admin refused, reconnect keeps Admin, leave frees it, non-Admin rejection with no events, validation errors only to the Admin, timestamped log not in state, Scoreboard Edit cases, Stealth emits nothing, Loud banner+feed), `server/test/simulation/secrecy.test.ts` (the same scripted game played with Maya as Admin and with Ben as Admin, Scoreboard Edit in both modes on others and on the Admin: every state snapshot and every non-Admin event is identical between the two runs; no admin/stealth/loud/power/source keys; power-caused events never name the Admin; Loud = exactly one banner to everyone, Stealth = nothing), `server/test/adminAccess.test.ts` (secret check, token one-time/expiry), e2e (secret over the network, wrong secret, `admin_taken`, bundle fetched once then 404, Ben's admin intent ignored, Maya's Loud edit reaches Ben with the banner, Ben never gets admin messages). 156 tests in total.

Not ticked:
- "The console, hotbar and Caps Lock toggle work on the Admin's client only": built and only ever loaded on the Admin's session, but only typechecked/built, never clicked through in a real browser.

Notes for later tickets:
- 10–13, 20, 21: extend `useAdminPowers` in `secrecy.test.ts` with each new power so the Maya-vs-Ben indistinguishability check covers it. Powers needing a target should reject `unknown_target`. Admin Powers ignore Shields/immunity, so don't route them through `isTargetable`.
- 20: x-ray goes out as an `admin`-audience event (already routed only to the Admin's connection).
- 23: `getAdminLog()` has everything the reveal needs (hole, power, mode, target, summary, timestamp); the Recap sent to non-Admins with reveal off must not include it.

**Browser check (e2e, 2026-11-08).** `e2e/admin.spec.ts`: the Admin joins through the hidden passphrase field (backtick on Create/Join) and only that page fetches `/admin-bundle/<token>.js`. A wrong passphrase joins as a normal Player who never requests anything admin. Backtick opens and closes the console; it has 9 hotbar slots, and Digit3/Digit1 pick Nuke/Scoreboard Edit. Caps Lock on shows "👑 LOUD" with the gold border, and off shows "🥷 STEALTH". On non-Admin pages backtick, Caps Lock and digits show nothing and no `.tga-*` element exists (also checked on the plain production build in `prod.two-browsers.spec.ts`). Caveat: Playwright's keyboard doesn't latch Caps Lock, so the spec sends a key event with `modifierCapsLock` set; the real key wasn't pressed.
