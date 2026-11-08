# 01: Skeleton: two browsers in one room

**What to build:** A deployed Troll Golf URL where two browsers can create and join the same room by a 4-letter code and see each other's cursor dots move in real time. This sets up the whole architecture from the spec:
- a monorepo with client, server and shared packages, all TypeScript;
- the Game simulation as a framework-free module with its public interface (create from course data and settings with an injected random number generator and clock, handle intent, step, read state, drain events tagged by audience);
- a thin Colyseus room adapter that only translates between the network and the simulation;
- a Phaser client.

See `.scratch/troll-golf-v1/spec.md` (Architecture, Modules, Testing Decisions).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The client, server and shared packages build. Shared holds the state and message types used by both sides.
- [ ] The Game simulation has no Colyseus or Phaser imports and exposes create / handle / step / state / drainEvents.
- [ ] A test harness can create a Game with a seeded random number generator and a controlled clock, send intents, step time, and assert on state and drained events. At least one passing test uses it (e.g. two Players join and both appear in state).
- [ ] Events drained from the simulation carry an audience (everyone, one Player, Admin only), and the adapter routes them by audience.
- [ ] Creating a room returns a 4-letter code; joining with a wrong code fails; a 9th join is refused.
- [ ] Two browsers on the deployed URL see each other's cursor dots.
- [ ] Deployed to one always-on Fly.io machine that also serves the client files.
