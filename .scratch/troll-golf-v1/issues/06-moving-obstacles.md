# 06: Moving obstacles

**What to build:** Holes can include windmills (rotating blades) and sliding walls that move on a path in a loop. The ball bounces off them the same way it does off static walls, and their motion is synced so every client sees them in the same place.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] A windmill rotates at its configured speed, and a sliding wall follows its path with its configured period. Tested by stepping time.
- [ ] A ball hitting a moving obstacle is deflected and picks up the obstacle's motion.
- [ ] A ball can't get stuck inside or pushed through a wall by a moving obstacle.
- [ ] A Hole with obstacles converted from Tiled plays correctly.
- [ ] Obstacles are drawn on the client and stay in sync with the server.
