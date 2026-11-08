# 14: Item Boxes, roulette, rubber-band odds, Mulligan

**What to build:** Each Hole has Item Boxes at its spawn points. A ball rolling through one gets an Item. The box is a sensor that doesn't change the ball's path; it shatters and respawns after 10 s. A Player already holding an Item rolls through without picking anything up.

**Roulette and odds:**
- On pickup, the server decides the Item right away using rubber-band odds by Standing (defensive/self, attack, chaos):
  - 1st: 70 / 28 / 2
  - middle: 40 / 55 / 5
  - last: 15 / 70 / 15
- The item slot (bottom-centre) plays a 1.5 s roulette, then shows the result.
- Tap Space or click the slot to use it.

**Items are data-driven:** class, duration, targeting kind, counters, weights. A registry maps each Item to one server-side use handler and one client renderer.

**First Item, Mulligan:** sends your ball back to where it was before your last shot and refunds that Stroke plus every penalty since. It can't be used after Holing Out.

**Players who have Holed Out** keep and can use their held Item but can't pick up new ones. Items can be used while the ball is moving. Every Item use is logged with a timestamp.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Rolling through an active Item Box with an empty slot gives an Item; the box deactivates and respawns after 10 s. Tested through the simulation.
- [ ] The ball's path is unchanged by the box; a Player holding an Item doesn't pick up.
- [ ] With a seeded random number generator, the Item class follows the right odds row for 1st, middle and last Standing (statistical test over many draws).
- [ ] The Item is decided at pickup; the roulette is client-side display only.
- [ ] Mulligan after a shot that went into Water restores the ball's position from before that shot and refunds 2 Strokes (the shot and the penalty).
- [ ] Mulligan is rejected after Holing Out.
- [ ] A holed-out Player can't pick up but can still use their held Item.
- [ ] Item definitions are data; changing a duration or weight needs no code change.
