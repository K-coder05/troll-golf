# 04: Surfaces and hazards

**What to build:** The surface zones in a Hole change how the ball moves. Fairway is baseline, Rough has about 2× damping, Sand about 5× damping and cuts max shot power by 30% when shooting from it, and Ice about 0.2× damping. A Boost Pad adds a fixed impulse in its direction. A Teleporter moves the ball to its paired exit and keeps its speed. Water and Void are hazards: +1 Stroke and the ball returns to its Rest Spot. The client draws each surface so it's clearly recognisable.

**Blocked by:** 03

**Status:** resolved

- [x] The same shot travels measurably less far on Rough and Sand and further on Ice than on Fairway. Tested through the simulation.
- [x] A max-power shot from Sand is 30% weaker than from Fairway.
- [x] A ball entering Water or Void gets +1 Stroke and ends at its Rest Spot, at rest.
- [x] A Boost Pad adds speed in its set direction.
- [x] A Teleporter puts the ball at its paired exit with the same speed.
- [x] Surfaces are drawn on the client, with a splash fx on Water.

## Comments

**Implementation note (ticket 04).**

Built:
- `server/src/simulation/surfaces.ts`: `SurfaceMap { at(point) }`, `courseSurfaces(hole)` (no zone = Fairway, later zones win), `SURFACE_DAMPING` (rough 2, sand 5, ice 0.2), `shotPowerFactor` (sand 0.7), `isHazard`, `pointInPolygon`. Ticket 13's terrain paint should wrap/replace the `surfaces` value in `createGame`.
- `game.ts`: `dampingScale` plugs the lookup into `PhysicsWorld`; `shoot` applies the Sand cut from the ball's position; `physicsStep` sinks balls in Water/Void (+1 Stroke, teleport to `restSpot`, at rest; only moving balls are checked so a resting ball on a hazard isn't charged repeatedly), fires Boost Pads once per entry (`BOOST_IMPULSE` 500 px/s x strength, via `addVelocity`), and Teleporters (keep velocity; locked until the ball leaves portal radius, so no ping-pong; either end is an entrance).
- New server message `fx` (`splash | void | boost | teleport`, x, y) in `shared/src/messages.ts`, broadcast to everyone. Also a feed line on hazards.
- Placeholder Hole has one of every surface, a Boost Pad and a Teleporter in the corners, off the Tee-to-Cup line and not under a straight-down shot from the Tee.
- Client: `HoleScene` draws each surface with distinct colour and texture, Boost Pad chevrons, portals, and ring/droplet fx (splash on Water). Not exercised in a browser.
- Tests: `server/test/simulation/surfaces.test.ts`.

Notes: resting balls are not teleported/boosted (only moving ones). The e2e client doesn't register an `fx` handler (harmless Colyseus warning).
