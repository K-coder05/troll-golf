# 16: Ink Splat

**What to build:** A Player uses Ink Splat on an opponent. Ink blots cover about 60% of the victim's screen for 6 s and fade over time, and the victim can scrub the mouse to wipe them away faster. Only the victim sees the ink; everyone else sees just a small ink badge on that ball. Ink is a disabling Effect, so the one-at-a-time limit and immunity apply, and a Shield blocks it.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] Using Ink Splat sends a screen effect only to the target's connection; no other Player gets it. Tested through drained event audiences.
- [ ] A Player who is already Frozen can't be Inked, and a Shield blocks Ink.
- [ ] A landed Ink Splat counts as an Item Hit and shows in the kill feed.
- [ ] The client draws the ink blots, fades them over 6 s and lets the victim scrub them away.
- [ ] Other clients show an ink badge on the victim's ball.
