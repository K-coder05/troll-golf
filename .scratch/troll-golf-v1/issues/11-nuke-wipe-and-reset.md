# 11: Nuke: Wipe and Reset

**What to build:** The Admin picks an impact point and launches a Nuke. Everyone gets a 3 s air-raid siren and red flash, then a white-out and screen shake, and every ball is blasted outward from the impact point. Then the chosen mode applies:
- **Wipe** (the default): every ball still on the course goes back to the Tee. Strokes are kept, Players who have Holed Out are untouched, and the Hole timer keeps running.
- **Reset:** everyone replays the Hole, including Players who have Holed Out. That Hole's Strokes are wiped and the timer restarts.

Held Items are kept in both modes. A Nuke is always spectacular, but its banner in Loud mode still never names the Admin.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Wipe moves every ball not Holed Out to the Tee at rest, keeps all Strokes, and leaves the timer unchanged. Tested through the simulation.
- [ ] Reset un-Holes-Out everyone, puts every ball on the Tee, zeroes this Hole's Strokes for everyone and restarts the Hole timer.
- [ ] Wipe is the default when no mode is given.
- [ ] Held Items survive both modes. This can only be checked once Items exist; add the test then.
- [ ] The siren, flash, white-out and shake fx are sent to everyone, with the banner only in Loud.
- [ ] The siren lasts 3 s; balls are only affected when it ends.
