# 12: Cup powers: Move the Cup, Cup Size, Lip-Out

**What to build:** Three Admin Powers that target the Cup:
- **Move the Cup:** teleport the Cup, or set it to slide away when a ball gets close.
- **Cup Size:** shrink the Cup to a pinhole or blow it up to a crater. This changes the capture radius.
- **Lip-Out:** the chosen Player's next ball that would drop in pops back out.

In Stealth these look natural: an ordinary lip-out, the Cup simply being somewhere else. In Loud they come with the Golf Gods banner.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Teleporting the Cup changes where balls can Hole Out. Tested through the simulation.
- [ ] A sliding Cup moves away when a ball comes within its trigger distance.
- [ ] Cup Size changes the capture radius both ways, and the no-collision zone around the Cup scales with it.
- [ ] Lip-Out makes the targeted Player's next capture-worthy ball lip out exactly once, then clears. Other Players aren't affected.
- [ ] Pending Lip-Outs are server-only state. The Stealth lip-out fx is the same as a natural lip-out (secrecy test extended).
