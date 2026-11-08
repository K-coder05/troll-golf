# 10: Ball Grab and radial menu

**What to build:** The Admin right-clicks any ball, the Cup or terrain to open a radial menu showing the Admin Powers that apply to it. **Ball Grab** lets the Admin drag any ball anywhere (into the Cup, the Water or back to the Tee) and release it either at rest or with a throw speed. Once released, the ball follows normal rules: dropping into the Cup Holes Out, landing in Water costs the usual penalty.
- **Stealth:** the move shows as an ordinary moving ball.
- **Loud:** it adds the Golf Gods banner and a grab effect.

**Blocked by:** 09

**Status:** resolved

- [x] A grabbed ball follows the Admin's drag positions and can't be shot while held. Tested through the simulation.
- [x] Releasing with a throw speed gives the ball that velocity; releasing without one leaves it at rest.
- [x] Releasing into Water applies +1 Stroke and the Rest Spot return; releasing in the Cup at low speed Holes Out.
- [ ] The radial menu opens on right-click over a ball, the Cup or terrain, and lists only the Admin Powers that apply.
- [x] Secrecy test extended: a Stealth Ball Grab produces no event that identifies it as an Admin Power.

## Comments

**Implementation note (ticket 10).**

Built:
- **Ball Grab power** (`shared/src/admin.ts` `ballGrab` params: `grab {targetId}` / `move {x,y}` / `release {x,y,vx?,vy?}`; handler `server/src/simulation/powers/ballGrab.ts`). Phase: playing only. Only `grab` is a logged, bannered, confirmed use; `move` and `release` return `quiet: true` (new field on `AdminPowerOutcome`: no log entry, no banner, no `adminResult`). New rejections `not_in_play`, `not_holding` (Admin only).
- **Hook into physics**: `AdminPowerContext.balls: AdminBallControl` (`admin.ts`), implemented by `ballControl()` in `game.ts`. A held ball is removed from the physics world (nothing touches it, no rest/Cup/hazard checks), flagged `atRest = false` so it can't be shot (`shoot` also checks `held`) and reads as an ordinary moving ball (velocity = drag velocity). Positions are kept inside the Hole (BALL_RADIUS margin) and out of static walls; an illegal drag target is ignored (ball stays at the last legal spot). One ball held at a time; grabbing another puts the first down at rest.
- **Release** (`putDown`): body re-added; velocity (speed capped at `MAX_THROW_SPEED` 1500 px/s) or at rest (below REST_SPEED). Then checked at once: Cup (`checkCup`: slow = Holes Out, fast = lips out) and hazards (`sinkBall`: +1 Stroke, back to the old Rest Spot; Water/Void spots never become the Rest Spot). A ball released at rest elsewhere gets that spot as its Rest Spot.
- **Decisions**: only balls in play can be grabbed (Holed-Out, disconnected, spectating balls have no body: `not_in_play`). The held ball is put down where it is, at rest, when the Admin disconnects or leaves, when the Hole ends, or (frozen, no body) when its owner disconnects/leaves. A new Hole clears the hold.
- **Stealth/Loud**: Stealth emits nothing (the ball's synced position just moves). Loud: banner (pipeline) + new `grab` fx on pick-up and put-down (`FxMessage.kind`). The mode is chosen per message by the client; the fx on release follows the mode used at grab time.
- **Client, public**: only generic geometry via `AdminHost.view()` -> `AdminView { canvas, worldAt, hitTest, holdCamera }` (`adminHost.ts`, implemented by `HoleScene.adminView()`); `main.ts` hands it to `mount`. Plays the `grab` fx.
- **Client, admin bundle**: `client/src/admin/radialMenu.ts` (right-click on a ball / the Cup / terrain opens a ring of the powers whose `appliesTo` includes that target; choosing runs the panel's new optional `onRadial`, else opens the console panel with that Player preselected), `grab.ts` (ball follows the pointer at ~30 Hz; click puts it down, a flick as you click throws it with the pointer velocity; Esc or right-click drops at rest; mouse events swallowed meanwhile so no shot starts; camera held still), `powers/ballGrab.ts` panel. Terrain currently has no applicable power, so its menu says "nothing applies" until tickets 12/13 add some.
- Tests: `server/test/simulation/ballGrab.test.ts` (14), and `secrecy.test.ts` extended with Ball Grab in both modes on others and on the Admin's own ball (Maya-vs-Ben indistinguishability, Stealth emits nothing, Loud one banner). 171 tests in total.

Not ticked:
- "The radial menu opens on right-click ... lists only the Admin Powers that apply": built and typechecked/built, never clicked through in a real browser.

Notes for later tickets:
- New powers: set `appliesTo` (and optionally `onRadial`) on the panel and the radial menu picks them up. `AdminPowerContext.balls` is the way to move a ball (Swap, Nuke pushes should still use `physics` directly).
- Powers that need continuation messages can use `quiet: true`.
