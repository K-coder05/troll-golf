# 22: Juice and emotes

**What to build:** The game feels juicy:
- screen shake on hits and Nukes;
- particles for splashes and shattered Item Boxes;
- a slow-mo zoom on near-misses at the Cup;
- a sound for every event (putt, wall clink, splash, freeze crackle, gunshot, siren, cup rattle), using CC0 assets such as Kenney.

Players can press Q to open an emote wheel (laugh, salty, GG, "???"). Emotes float over their ball for everyone to see, limited to 1 per second.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] An emote intent sends a visible emote event to everyone; a second one within 1 s is rejected. Tested through the simulation.
- [ ] The simulation emits a near-miss fx when a ball passes within a set distance of the Cup without Holing Out.
- [ ] Every listed event has a sound and its visual fx on the client.
- [ ] All art and sound assets are CC0, with their sources credited in the repo.
