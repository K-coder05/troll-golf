# 19: Cup Magnet, Ghost Ball, Swap

**What to build:** Three more Items:
- **Cup Magnet** (self): your next shot curves toward the Cup.
- **Ghost Ball** (self): your next shot passes through walls but not hazards.
- **Swap** (chaos): your ball trades positions with a random opponent who can be targeted. A Shield blocks it.

These are the only form of Ghost Ball and Swap. The Admin gets them through Give Item (ticket 20).

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] After Cup Magnet, the next shot ends closer to the Cup than the same shot without it; the Effect clears after that shot. Tested through the simulation.
- [ ] After Ghost Ball, the next shot passes through a wall but still takes a Water penalty; the Effect clears when the ball comes to rest.
- [ ] Swap trades the positions of the user's ball and a seeded-random opponent who can be targeted. It skips Players who have Holed Out, are disconnected or are immune, and is blocked by a Shield.
- [ ] Swap can't be used after Holing Out.
- [ ] Badges and fx show on the client.
