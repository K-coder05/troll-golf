# 21: Magnet/Repel, Spawn Wall, Invert Controls

**What to build:** Three more Admin Powers:
- **Magnet/Repel:** the Cup pulls the Admin's ball in and pushes other balls away. It can be set per Player.
- **Spawn Wall:** the Admin draws a wall segment that balls bounce off, optionally vanishing after N seconds. It's stored as a terrain edit (ticket 13's system), so reconnecting clients see it.
- **Invert Controls:** the target's drag direction is flipped. It's silent in Stealth.

**Blocked by:** 09, 13

**Status:** ready-for-agent

- [ ] With Magnet on, the Admin's rolling ball curves toward the Cup and others curve away; turning it off stops this. Tested through the simulation.
- [ ] A spawned wall deflects balls; a timed one disappears after N seconds; walls reset at the next Hole.
- [ ] Under Invert Controls, the target's shoot intent fires opposite to their drag.
- [ ] Invert Controls is server-only state, and in Stealth it produces no event to anyone but the Admin (secrecy test extended).
- [ ] Loud uses show the Golf Gods banner.
