# 17: Golf Gun

**What to build:** A Player uses the Golf Gun and the cursor becomes a crosshair. They get 3 shots, until they're used or 10 s pass. Each shot that hits a ball pushes it hard along the line of fire, from the shooter's ball to the target. If the shooter has Holed Out, shots come from the Cup instead. A ball knocked into Water or Void takes the normal +1 Stroke and Rest Spot return. A Shield blocks one shot. Each landed shot counts as an Item Hit and goes in the kill feed, e.g. "Maya sniped Ben into the lake".

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] Each landed shot pushes the target directly away from the shooter's ball; for a holed-out shooter, away from the Cup. Tested through the simulation.
- [ ] After 3 shots or 10 s, the Item is used up and crosshair mode ends.
- [ ] A Shield absorbs one shot, and the following shots land.
- [ ] Immunity applies between shots: after a landed shot, later shots on the same target within 3 s don't land.
- [ ] Knocking a target into Water gives them +1 Stroke and the Rest Spot return, with a "sniped into the lake" feed line.
- [ ] The client shows the crosshair, gunshot fx and screen shake on a hit.
