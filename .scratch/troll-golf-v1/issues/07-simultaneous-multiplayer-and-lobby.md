# 07: Simultaneous multiplayer and lobby

**What to build:** 2–8 friends play the same Hole at the same time.

The screen flow is Title → Create/Join (4-letter code, nickname, ball colour) → Lobby (Player list; the room creator picks the Course and starts the game).

During play:
- The server syncs state at 20 Hz, and clients render about 100 ms behind with interpolation so balls move smoothly.
- Balls collide with each other, except inside the Cup's capture radius, where nobody can be knocked out.
- Name tags float over every ball.
- The scoreboard shows every Player's Strokes and their **Standing**: Strokes from earlier Holes plus Strokes so far on this Hole, with distance to the Cup breaking ties. Holed-out Players rank by their final Strokes for the Hole.
- Players who have Holed Out stay in the room and spectate.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Two balls that collide on the course both change course. Two balls inside the capture radius don't collide. Tested through the simulation.
- [ ] Standing matches the spec's example: Ben (10 earlier + 2 this Hole, 20 px away) ranks above Maya (9 + 4, 300 px away).
- [ ] The Leader is the first in Standing among Players who haven't Holed Out.
- [ ] The Hole ends only when every connected Player has Holed Out, or when the timer runs out.
- [ ] Create/Join and Lobby screens work, including nickname and colour.
- [ ] Remote balls move smoothly with no visible rubber-banding on a real internet connection with 4 Players. This is the M2 playtest.
