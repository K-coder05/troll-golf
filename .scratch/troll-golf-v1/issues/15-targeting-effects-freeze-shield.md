# 15: Targeting, Effects engine, Freeze Ray, Shield, kill feed

**What to build:** Players can attack each other with Items.

**Targeting:** tap Space to aim a targeted Item at the Leader; hold Space to open the target picker (click a ball, or press 1–8). Players who can't be targeted are greyed out in the picker, and tap-Space skips to the next-best Standing. Untargetable means:
- Holed Out;
- disconnected;
- inside their 3 s post-hit immunity window;
- (for disabling Items) already under a disabling Effect.

If nobody can be targeted, the Item is kept, not used up.

**Effects engine:** Effects are records of type, source, target, start, duration and data, held in room state. Ball badges show active Effects.

**Freeze Ray:** the target's ball stops dead in ice for 6 s and they can't shoot. Mashing click breaks out 1 s sooner. It's a disabling Effect, and a Player can be under at most one at a time.

**Shield:** a bubble that absorbs the next attack, for up to 30 s.

**Item Hits:** an attack Item that lands on an opponent (not blocked, not missed) counts as an Item Hit for its user. Item Hits break ties in final results.

**Kill feed** (right side): lines like "Jay got frozen" and "Maya's Shield ate a Freeze Ray".

**Blocked by:** 14

**Status:** resolved

- [x] Tap targeting picks the Leader; when the Leader can't be targeted it picks the next-best Standing; with no valid target the Item stays held. Tested through the simulation.
- [x] Freeze stops the ball, rejects shots for 6 s, and mashing shortens it by 1 s.
- [x] After an attack lands, the target is immune to attacks for 3 s.
- [x] A Player under Freeze can't receive another disabling Effect.
- [x] Shield absorbs exactly one attack and then disappears; it expires after 30 s.
- [x] A blocked attack doesn't count as an Item Hit; a landed one does. Ties in final results go to more Item Hits.
- [ ] Freeze and Shield badges show on the ball, and the kill feed shows hits and blocks.
- [x] Freezing a ball before a Nuke and checking the held Item is kept closes the open check from ticket 11, if 11 is done.

## Comments

**Implementation note (ticket 15).**

Built:
- **Shared** (`shared/src/effects.ts`): `EffectKind` (`frozen | shielded`; 16-21 add theirs), `EFFECT_INFO` (name, icon, `disabling`), public `EffectState {id, kind, startedAt, endsAt}`, `IMMUNITY_MS` 3000, and `canBeTargeted(player, {now, disabling})`, the one targetability rule used by both the server and the client picker. `PlayerState` gains `effects: EffectState[]`, `immuneUntil` and `itemHits` (synced via `EffectSchema` in schema.ts/syncState.ts). Messages: client `mash`; fx `shieldPop` and `thaw`; `FxMessage.targetId`. Freeze Ray params: `mashSavesMs` 1000, `mashClicks` 10.
- **Effects engine** (`server/src/simulation/effects.ts`, `createEffectSystem`): server-side records `{id, kind, sourceId, targetId, startedAt, durationMs, endsAt, data}`; a visible kind is mirrored into `PlayerState.effects` WITHOUT its source (an Admin-caused Effect can't name the Admin); `visible: false` kinds stay server-only (for Stealth Invert Controls, 21). Registry `EFFECT_DEFINITIONS` (`server/src/simulation/effectKinds/`, complete map, so a missing kind is a compile error): `{kind, visible, blocksShot?, onStart, onStep (every physics step), onEnd(why), onMash}`. API: `start(kind, {sourceId, targetId, durationMs, data, scaled})` (one Effect per kind per Player: a new one `replaced`s the old), `end(id, why)`, `find`, `on`, `isDisabled`, `isImmune`, `grantImmunity`, `shotBlocker`, `mash`, `step`, `expire`, `clearAll`, `forget`, and a server-only `log` of starts/ends with `lastedMs` (`Game.getEffectLog()`; ticket 23's longest-frozen = sum of `lastedMs` of `frozen` ends). **Ticket 24:** `createEffectSystem({ durationScale })` multiplies every `scaled` start (Items default to scaled; Admin Powers should pass `scaled: false`); game.ts doesn't pass it yet (defaults to 1).
- **The single attack path** (`items.ts` `applyItemHit(attackerId, targetId, item, land)`, also `ctx.hit(targetId, land)` inside handlers): targetable for this Item (`canTarget`: in play, not immune, not disabled if the Item is disabling, incl. hidden disabling Effects) -> **(ticket 20: God Mode goes right here, before the Shield check, and must emit exactly the Shield-pop events)** -> Shield eats it (`shieldPop` fx + feed "Maya's Shield ate a Freeze Ray", log `blocked`, no immunity, no Item Hit) -> `land()` -> 3 s immunity -> Item Hit counted (server-only map) + log `hit`. Returns `{result: landed | blocked | missed(reason)}`; a handler returns `{ok:false, reason}` on `missed` so the Item is kept. Admin Powers must call `effects.start` directly (ignoring Shields, immunity and the cap).
- **Targeting** (in the Item pipeline, for `targeting: "opponent"`): `useItem {targetId}` must name an opponent who can be targeted now (`unknown_target` / `untargetable`, Item kept); a tap takes the best Standing (ascending `standing`) among opponents who can be targeted, so a disconnected/immune/disabled Leader is skipped and the user is never their own target; nobody -> `no_target`, Item kept. Handlers get `ctx.target`, and `ctx.targets()` (targetable opponents by Standing, for Swap in 19). `isTargetable(player, {now, disabling}?)` moved to effects.ts (still exported from the simulation; without the 2nd arg it is the old presence rule).
- **Freeze Ray** (`itemHandlers/freezeRay.ts`, Effect `effectKinds/frozen.ts`): fx `itemUse` at the target, then `ctx.hit`; landed -> Frozen for 6 s + feed "Jay got frozen". Frozen pins the ball via the new `PhysicsWorld.setPinned` (Planck static body: stops dead, other balls bounce off, Nuke blasts don't move it, no Cup capture/pads/teleporters while pinned); `onStep` re-pins a ball that got a new body (reconnect, Wipe, Mulligan, Ball Grab release). Shots rejected `frozen`. Each `mash` intent takes 100 ms off, at most 1 s. On end: unpinned, fx `thaw`.
- **Shield** (`itemHandlers/shield.ts`): Shielded for 30 s (fx `itemUse`, feed "Maya raised a Shield"); a second Shield refreshes it; refused after Holing Out or while spectating (Item kept).
- **Effects lifetime decision:** every Effect and immunity window is cleared when a Hole ends (and on a new Hole / Course change); they survive disconnects and Nukes.
- **Item Hits and the tiebreak:** counts stay server-only during play; `endGame` copies them into `PlayerState.itemHits`, and in `gameEnd` Standing = total Strokes, then more Item Hits, then join order (distance no longer counts). A new game resets them.
- **Draws** now include Freeze Ray and Shield naturally (Items with handlers); `items.test.ts` restricts itself to Mulligan by default (`MULLIGAN_ONLY`) since it tests box/slot mechanics; the nuke held-Item test does the same.
- **Client**: kill feed (`client/src/ui/killFeed.ts`, right side under the Standings, 6 lines, fade after 6 s); target picker (`client/src/ui/targetPicker.ts`): tap Space = use (opponent Items hit the Leader / next-best), hold Space ≥ 220 ms with an opponent Item = picker while held, opponents by Standing numbered 1-8, greyed with a reason via `canBeTargeted` (needs the `time` offset), pick by click on a row, click on a ball (HoleScene, gold/grey rings around balls) or 1-8; releasing Space closes it. Effects on balls (HoleScene): ice block, pulsing Shield bubble, emoji badges from `EFFECT_INFO`; Frozen Players can't aim, every click sends `mash`, with a "Mash click to break free" hint. Renderers for Freeze Ray/Shield use; `shieldPop`/`thaw` shards. Final scoreboard shows a Hits column and only shares places on equal total AND Hits. Typechecked/built only, not clicked through in a browser.
- Tests: `server/test/simulation/effects.test.ts` (20: tap -> Leader, disconnected Leader skipped to next-best, immune+Frozen Leader skipped and picking them refused with the Item kept, no target keeps the Item, Holed-Out/self/unknown picks refused, `isTargetable` rules, Freeze stops a rolling ball and rejects shots for 6 s then thaws, ice block isn't pushed, mashing saves exactly 1 s, the disabling cap after immunity ends, Holed-Out user can Freeze, 3 s immunity with a non-disabling stand-in attack, Shield eats exactly one attack (no hit, no immunity, then the next lands), Shield expires at 30 s, Shield refused after Holing Out, Item Hits hidden then revealed and breaking a final tie, Effects public without sources, cleared at Hole end, durations from data, Frozen Player's held Item survives a Nuke and the ice block doesn't fly). 265 tests in total.

Not ticked:
- "Freeze and Shield badges show on the ball, and the kill feed shows hits and blocks": the server side (public Effects, feed lines for hits and blocks) is tested; the badges, ice block, bubble, kill feed and picker are built but only typechecked/built, never seen in a real browser.

Notes for later tickets:
- 16 (Ink): add `inked` to `EffectKind`/`EFFECT_INFO` (disabling: true) and `effectKinds/`; the handler is Freeze Ray's shape; send the screen effect with `toPlayer(target.id)` inside `land`.
- 17 (Golf Gun): `keep: true` per shot; call `ctx.hit(targetId, push)` per shot; immunity and one-shot Shield blocks then work as tested here with the stand-in.
- 18 (Banana Mine): call `items.applyItemHit(ownerId, victimId, "bananaMine", land)` from the physics step for opponents; decide whether the owner's own trigger bypasses it (it must, since self isn't a valid target).
- 19: Cup Magnet / Ghost Ball as hidden-or-visible self Effects consumed on the next shot (`effects.end(id, "consumed")` from game.ts `shoot`/rest); Swap picks from `ctx.targets()` with the Rng and goes through `ctx.hit`.
- 20: God Mode check inside `applyItemHit`; x-ray can read `effects.on(id)` (with sources) and `items.held`; Admin Powers apply Effects with `effects.start(..., { scaled: false })`.
- 23: `getEffectLog()` and the `hit`/`blocked` entries of `getItemLog()` have what the Recap needs (Item Hits taken = `hit` entries by `targetId`).
- 24: pass `durationScale` into `createEffectSystem` from `state.settings.chaosLevel`.

