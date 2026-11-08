# 22: Juice and emotes

**What to build:** The game feels juicy:
- screen shake on hits and Nukes;
- particles for splashes and shattered Item Boxes;
- a slow-mo zoom on near-misses at the Cup;
- a sound for every event (putt, wall clink, splash, freeze crackle, gunshot, siren, cup rattle), using CC0 assets such as Kenney.

Players can press Q to open an emote wheel (laugh, salty, GG, "???"). Emotes float over their ball for everyone to see, limited to 1 per second.

**Blocked by:** 07

**Status:** resolved

- [x] An emote intent sends a visible emote event to everyone; a second one within 1 s is rejected. Tested through the simulation.
- [x] The simulation emits a near-miss fx when a ball passes within a set distance of the Cup without Holing Out.
- [x] Every listed event has a sound and its visual fx on the client.
- [x] All art and sound assets are CC0, with their sources credited in the repo.

## Comments

Built:
- Simulation: `emote {kind}` intent (validated against `EMOTE_KINDS`, 1 per second per Player via the injected Clock, `rate_limited` / `invalid_payload` rejections) broadcast as an `emote {playerId, kind}` event. New fx kinds: `putt` (shot power), `wallHit` (throttled: >= 80 px/s, 120 ms per ball, intensity 0..1) from a Planck `begin-contact` listener in `PhysicsWorld.takeWallHits()`, and `nearMiss` (with `targetId`) when a moving ball gets within `NEAR_MISS_MARGIN` (36 px) of the Cup edge and leaves or stops without reaching it (lip-outs and drops are their own fx). Tests: `server/test/simulation/juice.test.ts`. Existing cupPowers/secrecy tests now ignore the ambient putt/wallHit/nearMiss fx.
- Client: `fx/sound.ts` procedural WebAudio sound bank (audio unlocks on first gesture, mute button bottom-left remembered in localStorage, 14-voice cap); the siren now plays through it. `fx/particles.ts` capped (160) particle pool used for splashes, shattered Item Boxes, shards and wall sparks. Screen shake on hard wall hits, Item Hits, Shield pops, Golf Gun hits and Nukes. Near-miss: slow-mo (tween time scale 0.4) zoom onto the Cup, only for whoever is watching that ball. Q opens the emote wheel (click or 1-4), emotes float over the ball for 2.2 s.
- Sounds follow only public fx, so Stealth admin actions stay silent; Loud/other effects reuse the existing public fx.
- Assets: none bundled (all synthesised / drawn in code); `CREDITS.md` says so and sets the CC0 rule for future additions.
- Not unit tested (client rendering/audio): sound, particles, zoom and the wheel were verified to typecheck and build only.
