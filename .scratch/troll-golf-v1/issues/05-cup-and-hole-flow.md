# 05: Cup and Hole flow: a 3-Hole round

**What to build:** A single Player can play a full 3-Hole round loaded from converted course data. Each Hole goes:
1. A 3-2-1 countdown, then the Player can shoot.
2. The ball Holes Out when it's inside the Cup's capture radius and moving under the capture speed. Too fast and it lips out.
3. The Hole ends when every Player has Holed Out or the Hole timer (90 s by default) runs out. Anyone unfinished scores min(Strokes + 2, stroke cap), with the stroke cap at Par + 4.
4. An 8-second scoreboard shows Strokes against Par.
5. The next Hole starts.

After the last Hole comes a final results screen. The HUD shows Hole number, Par and Strokes top-left and the timer top-centre.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Phases go lobby → countdown → playing → holeEnd → … → gameEnd.
- [ ] Shots are rejected outside the playing phase.
- [ ] A slow ball inside the capture radius Holes Out; a fast one lips out and keeps rolling. Tested through the simulation.
- [ ] The Hole ends early when everyone has Holed Out.
- [ ] When the timer runs out, unfinished Players get min(Strokes + 2, Par + 4).
- [ ] The round loads 3 Holes made with the course converter (sample maps are fine).
- [ ] The client shows the HUD, the scoreboard between Holes and the final results.
