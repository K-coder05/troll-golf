# 08: Disconnects, reconnects, late joins

**What to build:** Connection problems and late arrivals don't break the game.

- **Disconnects:** if a Player drops mid-Hole, their ball stays where it is, can't be targeted and has no collisions.
- **Reconnects:** when they come back, they get the same ball, Strokes and held Item.
- **Still gone at Hole end:** the normal unfinished-Hole rule applies.
- **Late joins:** a friend who joins a game in progress waits as a spectator until the next Hole, then plays. Each Hole they missed is scored at its stroke cap.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] A disconnected Player's ball doesn't collide with other balls and stays put. Tested through the simulation.
- [ ] Reconnecting within the session restores the same Player (ball, Strokes, held Item).
- [ ] A Player still disconnected at Hole end gets min(Strokes + 2, stroke cap).
- [ ] A disconnected Player doesn't hold up the "everyone Holed Out" check.
- [ ] A late joiner starts at the next Hole, with each missed Hole scored at Par + 4.
- [ ] The client shows a disconnected badge on the ball and a spectator view for late joiners.
