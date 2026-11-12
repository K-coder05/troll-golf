# 20: Give Item, Rig the Box, God Mode, x-ray

**What to build:** Admin Powers that work with Items:
- **Give Item:** put any Item in any Player's slot, the Admin's included.
- **Rig the Box:** choose the Item a Player gets from their next Item Box. The roulette plays as usual and lands on it.
- **God Mode:** the Admin is immune to every Item. In Stealth, a blocked attack looks exactly like a Shield pop. In Loud, it shows an obvious divine block.
- **X-ray overlay:** on the Admin's client only, it shows every Player's held Item, active Effects and aim line.

Admin Powers ignore Shields, the immunity window and the one-disabling-Effect cap.

**Blocked by:** 09, 15

**Status:** resolved

- [x] Give Item fills the target's slot, replacing any held Item. Tested through the simulation.
- [x] Rig the Box makes the target's next pickup give exactly the chosen Item, then clears. Rigged boxes are server-only.
- [x] With God Mode on, attack Items on the Admin don't land and don't count as Item Hits. In Stealth, the events other Players get match a natural Shield pop exactly (secrecy test extended).
- [x] Admin Powers on a Shielded, immune or already-disabled Player still take effect.
- [x] X-ray data is sent only to the Admin's connection; non-Admin audiences never receive it.
- [x] The x-ray overlay shows on the Admin's client.

## Comments

**Implementation note (ticket 20).**

Built:
- **Powers** `giveItem {targetId, item}`, `rigBox {targetId, item}`, `godMode {enabled}` (shared `AdminPowerParams`; handlers `server/src/simulation/powers/{giveItem,rigBox,godMode}.ts`; panels `client/src/admin/powers/`; phases countdown/playing/holeEnd, God Mode also gameEnd). `AdminPowerContext.items: AdminItemControl {give, rig, setGodMode}` wraps the Item system's hooks. None go through `applyItemHit`, so Shields, immunity and the disabling cap never apply (tested on a Shielded/Frozen/immune target). Ticket 21's Invert Controls must likewise call `effects.start(..., {scaled:false})` directly.
- **Give Item**: replaces the slot, no roulette, only the recipient gets the `item` message. Loud feed line does not name the Item.
- **Rig the Box**: the draw still runs (same Rng rolls) and only its result is replaced, so a rigged pickup has identical events and leaves the Rng stream untouched (tested against an unrigged run). Pickup log keeps `rigged: true` (server-only).
- **God Mode**: checked inside `applyItemHit` after targetability and before the Shield (a real Shield is kept). Blocked = no Effect, no immunity, no Item Hit; log `blocked` with `by: "god"`. Stealth emits exactly the Shield-pop fx + feed ("<Admin>'s Shield ate a Freeze Ray"), tested equal to a real Shield pop. Known limit: a keen observer can see the Admin has no Shield badge. Loud: new fx `divineBlock`, feed "The Golf Gods turned away a X", banner. The fx sits on the Admin's ball, so Loud inevitably shows where it happened. Mode is chosen by the message that toggles it. Cleared when the Admin leaves.
- **X-ray**: new client message `aim {angle, power, active}` (HoleScene sends at 10 Hz while dragging; adapter throttles to 20 Hz; intent `aim`, stored server-side, stale after 1.5 s, cleared on shot). Server emits `xray {at, players:[{id, item, effects[{kind,endsAt,sourceId,visible}], aim}]}` every 200 ms with audience `admin` (never in state). Overlay: `client/src/admin/xray.ts`, toggled with Alt+X (off by default); `AdminView.screenAt` added for world -> screen.
- Tests: `server/test/simulation/adminItems.test.ts` (new) and `secrecy.test.ts` extended (give/rig/godMode in both modes, x-ray only on admin audience). 319 tests in total.

Not ticked: the x-ray overlay and panels were never clicked through in a real browser.

**Browser check (e2e, 2026-11-08).** `e2e/admin.spec.ts`: Alt+X shows the Admin's overlay canvas and it draws a label per ball ("no item", "🧊 Frozen by Kim", checked on screenshot and by drawn-pixel count). A second Alt+X hides it, and on non-Admin pages Alt+X adds nothing. The Give Item panel was used for real. Not checked in the browser: the aim line (needs another Player mid-drag), and the Rig the Box and God Mode panels.
