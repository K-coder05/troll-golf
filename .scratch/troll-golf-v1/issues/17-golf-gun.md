# 17: Golf Gun

**What to build:** A Player uses the Golf Gun and the cursor becomes a crosshair. They get 3 shots, until they're used or 10 s pass. Each shot that hits a ball pushes it hard along the line of fire, from the shooter's ball to the target. If the shooter has Holed Out, shots come from the Cup instead. A ball knocked into Water or Void takes the normal +1 Stroke and Rest Spot return. A Shield blocks one shot. Each landed shot counts as an Item Hit and goes in the kill feed, e.g. "Maya sniped Ben into the lake".

**Blocked by:** 15

**Status:** resolved

- [x] Each landed shot pushes the target directly away from the shooter's ball; for a holed-out shooter, away from the Cup. Tested through the simulation.
- [x] After 3 shots or 10 s, the Item is used up and crosshair mode ends.
- [x] A Shield absorbs one shot, and the following shots land.
- [x] Immunity applies between shots: after a landed shot, later shots on the same target within 3 s don't land.
- [x] Knocking a target into Water gives them +1 Stroke and the Rest Spot return, with a "sniped into the lake" feed line.
- [x] The client shows the crosshair, gunshot fx and screen shake on a hit.

## Comments

**Implementation note (ticket 17).**

Built: Golf Gun handler `server/src/simulation/itemHandlers/golfGun.ts`. First `useItem {}` arms it (the Item stays held, `keep: true`); later `useItem {point}` (or `{targetId}`) are shots. Arming state is generic: `ItemContext.active` / `setActive({until, shotsLeft})` kept on the held slot in `items.ts`; `items.expireActive()` (called every `Game.step`) uses the Item up after 10 s or when the Hole is no longer `playing`; the last shot spends it. The `item` slot message gained optional `active {shotsLeft, endsAt}` (holder-only, resent on reconnect). Shots hit-test opponents in play within `params.aimTolerance` (32 px) + ball radius; a miss still spends a shot; shots at immune targets are spent without landing. Landed shots go through `ctx.hit` (Shield eats one shot, 3 s immunity, Item Hit, log) and push via new `ItemBallControl.push` (`params.pushSpeed` 700, away from the shooter's ball, or from `cupPosition()` once Holed Out). Feed: "Maya shot Ben", and `game.ts` credits the last sniper for 5 s so a Water/Void sink reads "Maya sniped Ben into the lake (+1)" / "...into the void (+1)". FxMessage gained `fromX/fromY/hit`.
Client: `client/src/items/golfGun.ts` (renderer: muzzle flash, tracer, hit burst + camera shake; `crosshair.armed` flag), `itemSlot.ts` shows "N shots · Ns", crosshair cursor via `body.crosshair`, HoleScene turns clicks into shots while armed (Space/slot click are ignored while armed). Typechecked/built only, not browser-tested.
Tests: `server/test/simulation/golfGun.test.ts` (9). 278 total.
Later tickets: Give Item (20) of the Golf Gun just works through `items.give`; `ctx.active` is available to any Item that needs a timed in-use state.
