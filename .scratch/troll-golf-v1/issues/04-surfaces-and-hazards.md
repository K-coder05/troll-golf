# 04: Surfaces and hazards

**What to build:** The surface zones in a Hole change how the ball moves. Fairway is baseline, Rough has about 2× damping, Sand about 5× damping and cuts max shot power by 30% when shooting from it, and Ice about 0.2× damping. A Boost Pad adds a fixed impulse in its direction. A Teleporter moves the ball to its paired exit and keeps its speed. Water and Void are hazards: +1 Stroke and the ball returns to its Rest Spot. The client draws each surface so it's clearly recognisable.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The same shot travels measurably less far on Rough and Sand and further on Ice than on Fairway. Tested through the simulation.
- [ ] A max-power shot from Sand is 30% weaker than from Fairway.
- [ ] A ball entering Water or Void gets +1 Stroke and ends at its Rest Spot, at rest.
- [ ] A Boost Pad adds speed in its set direction.
- [ ] A Teleporter puts the ball at its paired exit with the same speed.
- [ ] Surfaces are drawn on the client, with a splash fx on Water.
