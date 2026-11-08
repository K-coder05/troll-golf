# 11: Nuke: Wipe and Reset

**What to build:** The Admin picks an impact point and launches a Nuke. Everyone gets a 3 s air-raid siren and red flash, then a white-out and screen shake, and every ball is blasted outward from the impact point. Then the chosen mode applies:
- **Wipe** (the default): every ball still on the course goes back to the Tee. Strokes are kept, Players who have Holed Out are untouched, and the Hole timer keeps running.
- **Reset:** everyone replays the Hole, including Players who have Holed Out. That Hole's Strokes are wiped and the timer restarts.

Held Items are kept in both modes. A Nuke is always spectacular, but its banner in Loud mode still never names the Admin.

**Blocked by:** 09

**Status:** resolved

- [x] Wipe moves every ball not Holed Out to the Tee at rest, keeps all Strokes, and leaves the timer unchanged. Tested through the simulation.
- [x] Reset un-Holes-Out everyone, puts every ball on the Tee, zeroes this Hole's Strokes for everyone and restarts the Hole timer.
- [x] Wipe is the default when no mode is given.
- [ ] Held Items survive both modes. This can only be checked once Items exist; add the test then.
- [x] The siren, flash, white-out and shake fx are sent to everyone, with the banner only in Loud.
- [x] The siren lasts 3 s; balls are only affected when it ends.

## Comments

**Implementation note (ticket 11).**

Built:
- Params `nuke { x, y, aftermath?: "wipe" | "reset" }` (`shared/src/admin.ts`, plus `NUKE_SIREN_MS` 3000, `NUKE_BLAST_MS` 1500, blast speed constants). Handler `server/src/simulation/powers/nuke.ts`; the timed sequence lives in `game.ts` (`nukeControl`, `advanceNuke`, `blastBalls`, `wipeBalls`, `resetHole`), driven by the injected Clock from `advancePhase` while `playing`. New `AdminPowerContext.nukes`, new rejection `nuke_pending`.
- Sequence: launch -> fx `nukeSiren` (everyone, Stealth and Loud) -> 3 s, no ball touched -> fx `nukeBlast` and every ball with a body gets an outward velocity (1200 px/s at the point, falling to 500 at 700 px+; direction from the Rng if exactly on the point) -> 1.5 s of flying -> Wipe or Reset. Loud adds the usual banner (detail "A nuke is incoming"). No event names the Admin.
- Decisions: playing phase only; one Nuke pending at a time (`nuke_pending`); impact must be inside the Hole. If the Hole ends first (timer or everyone Holed Out) the Nuke is cancelled (fx `nukeAbort`); a new Hole drops it. A held (Ball Grab) ball is put down at rest at the blast and again before the aftermath. Holed-Out, disconnected and spectating balls have no body, so the blast doesn't move them. A blasted ball still obeys normal rules in flight (Water/Void +1 Stroke, may Hole Out; a Hole Out stays Holed Out through Wipe).
- Wipe: every non-Holed-Out, non-spectating ball (disconnected ones too, as state only) to the Tee at rest on fresh bodies, spread over Tee slots; Strokes and timer untouched. Reset: also Holed-Out Players; this Hole's Strokes zeroed for everyone not spectating; `holeEndsAt`/`phaseEndsAt` restarted. Waiting late joiners keep their capped score and keep spectating. The physics world is NOT rebuilt (obstacle time keeps running, Cup stays where it is).
- Held Items: nothing touches per-Player item state; the test can only be added with ticket 14 (box left unticked).
- Client: public `HoleScene.playNukeFx` + `client/src/fx/siren.ts` (WebAudio siren, pulsing red overlay for 3 s, then white-out, camera shake, shockwave ring). Admin bundle: `client/src/admin/powers/nuke.ts` panel (Wipe/Reset select, "Pick impact point" click, radial `onRadial` on terrain/ball/Cup launches at the right-click point). Not clicked through in a browser.
- Tests: `server/test/simulation/nuke.test.ts` (12), and Nuke added to `secrecy.test.ts` `useAdminPowers` (Stealth Nuke fx-only to everyone, Loud one banner). 183 tests total.
