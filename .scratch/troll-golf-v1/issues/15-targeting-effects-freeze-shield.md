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

**Status:** ready-for-agent

- [ ] Tap targeting picks the Leader; when the Leader can't be targeted it picks the next-best Standing; with no valid target the Item stays held. Tested through the simulation.
- [ ] Freeze stops the ball, rejects shots for 6 s, and mashing shortens it by 1 s.
- [ ] After an attack lands, the target is immune to attacks for 3 s.
- [ ] A Player under Freeze can't receive another disabling Effect.
- [ ] Shield absorbs exactly one attack and then disappears; it expires after 30 s.
- [ ] A blocked attack doesn't count as an Item Hit; a landed one does. Ties in final results go to more Item Hits.
- [ ] Freeze and Shield badges show on the ball, and the kill feed shows hits and blocks.
- [ ] Freezing a ball before a Nuke and checking the held Item is kept closes the open check from ticket 11, if 11 is done.
