# 09: Admin auth, console, Stealth/Loud, Scoreboard Edit

**What to build:** The secret Admin can join any room by entering the admin secret (from a server env var), with at most one Admin per room. They play as an ordinary Player and count in scoring and Standing. Their session gets a separate admin client bundle, which other clients never receive. Pressing backtick opens the admin console. It has hotbar slots 1–9 and a Stealth/Loud toggle on Caps Lock.

The first Admin Power is **Scoreboard Edit**: add or remove Strokes on any Player.
- **Stealth:** nothing is attributed.
- **Loud:** everyone sees the "👑 The Golf Gods have spoken" banner, which never names the Admin.

This ticket also sets up the Admin Power pipeline that later Admin Powers plug into: the admin intent, the server-side check that the session is the Admin, Stealth/Loud handling, and logging every Admin Power use with a timestamp. Follows `docs/adr/0001-secret-admin-with-separate-bundle.md`.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Joining with the correct secret makes that session the Admin; a wrong secret just joins as a normal Player; a second Admin in the same room is refused.
- [ ] Admin intents from non-Admin sessions are rejected.
- [ ] Scoreboard Edit changes the target's Strokes, and the change shows on the scoreboard.
- [ ] **Secrecy test:** across a scripted game using Scoreboard Edit in both modes, no synced state and no event sent to a non-Admin audience contains an admin flag, the Admin's id as the source of an Admin Power, or the Admin's name.
- [ ] A Loud use sends a Golf Gods banner event to everyone; a Stealth use sends no banner.
- [ ] The admin bundle is served only after authentication and isn't referenced by the normal client. Hiding it from DevTools is nice to have.
- [ ] The console, hotbar and Caps Lock toggle work on the Admin's client only.
- [ ] Every Admin Power use is logged server-side with a timestamp, never synced.
