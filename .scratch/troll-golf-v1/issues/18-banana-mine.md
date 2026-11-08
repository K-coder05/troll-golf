# 18: Banana Mine

**What to build:** A Player uses Banana Mine to drop a trap where their ball is. The next ball that touches it, including the owner's, spins off in a random direction. The trap lasts until it's triggered or 45 s pass. A Player who has Holed Out clicks to place it anywhere on the Hole except within 3 cup-radii of the Cup. Triggering it counts as an Item Hit for the owner when another Player's ball sets it off.

**Blocked by:** 15

**Status:** ready-for-agent

- [ ] Using Banana Mine adds a trap at the ball's position; the next ball to touch it gets a random-direction push (deterministic with a seeded random number generator), and the trap disappears. Tested through the simulation.
- [ ] An untriggered trap disappears after 45 s.
- [ ] A holed-out Player's placement inside 3 cup-radii is rejected and the Item is kept; a placement outside is accepted.
- [ ] An opponent setting it off counts as an Item Hit for the owner and shows in the kill feed.
- [ ] Traps show on every client.
