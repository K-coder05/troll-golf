# 16: Ink Splat

**What to build:** A Player uses Ink Splat on an opponent. Ink blots cover about 60% of the victim's screen for 6 s and fade over time, and the victim can scrub the mouse to wipe them away faster. Only the victim sees the ink; everyone else sees just a small ink badge on that ball. Ink is a disabling Effect, so the one-at-a-time limit and immunity apply, and a Shield blocks it.

**Blocked by:** 15

**Status:** resolved

- [x] Using Ink Splat sends a screen effect only to the target's connection; no other Player gets it. Tested through drained event audiences.
- [x] A Player who is already Frozen can't be Inked, and a Shield blocks Ink.
- [x] A landed Ink Splat counts as an Item Hit and shows in the kill feed.
- [x] The client draws the ink blots, fades them over 6 s and lets the victim scrub them away.
- [x] Other clients show an ink badge on the victim's ball.

## Comments

**Implementation note (ticket 16).**

Built: `inked` Effect (`shared/src/effects.ts`, `server/src/simulation/effectKinds/inked.ts`; disabling, visible, display-only so it does NOT block shooting) and the Ink Splat handler (`server/src/simulation/itemHandlers/inkSplat.ts`, Freeze Ray's shape via `ctx.hit`, duration from the catalogue through the Effects engine's scaled start so ticket 24 scales it). New fx kind `inkScreen` (with `durationMs`, `coverage`) is emitted inside `land` with `toPlayer(target.id)` only; the feed says "Jay got inked". Registered in `ITEM_HANDLERS`, so box draws now include Ink Splat (it was already in `ITEM_CATALOGUE`). Client: `client/src/items/inkSplat.ts` draws a full-window canvas of blots (about 60%), fades linearly over the duration, and mouse movement scrubs it (destination-out); pointer events pass through. The ball badge reuses the existing `EFFECT_INFO` badge system (🦑). Tests: 4 new in `server/test/simulation/effects.test.ts` (269 total): victim-only audience, 6 s badge and shooting still allowed, Frozen blocks Ink, Shield blocks Ink without an Item Hit, Item Hit counted.

Not browser-tested: the overlay and badge are typechecked/built only. Note: the overlay is not cleared if the Hole ends early (it just fades out by 6 s).
