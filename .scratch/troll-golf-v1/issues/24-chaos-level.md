# 24: Chaos level

**What to build:** In the lobby, the room creator picks Chill, Normal or Unhinged. The chaos level scales the number of active Item Boxes per Hole, the attack odds in the distribution table, and Item Effect durations: 0.6× for Chill, 1× for Normal, 1.5× for Unhinged. Admin Powers aren't affected.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] At Unhinged, a Freeze lasts 9 s; at Chill, 3.6 s. Tested through the simulation.
- [ ] The number of active Item Boxes and the attack odds change with the chaos level, and the odds rows still add up to 100%.
- [ ] Admin Power behaviour is the same at every chaos level.
- [ ] The setting is in the lobby and shown in synced settings.
