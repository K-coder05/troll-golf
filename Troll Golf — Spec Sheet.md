# Troll Golf — Spec Sheet

Nov 7, 2026 · @Khiem

## Overview

Troll Golf is a browser-based, top-down 2D mini-golf game for 2–8 friends, where players grab Mario Kart-style power-ups off the course and one hidden admin (you) can bend the game however they want.

**Goals**

- Real-time multiplayer: everyone shoots at once, no waiting for turns.
- Power-ups that let players mess with each other (freeze, gun, screen blockers and more).
- An admin toolset that's powerful, fast to trigger in the middle of a game, and invisible to other players unless you want it seen.
- Play from a link and a room code: no installs, no accounts.

**Non-goals (v1)**

- Matchmaking with strangers, ranked play, or anti-cheat for anyone except the admin.
- Mobile-first controls (it should work on mobile, but desktop comes first).
- A public level editor (courses are hand-authored JSON files to start).

**Players:** you and a friend group on desktop browsers, usually on a Discord call at the same time.

## Core gameplay

Everyone plays the same hole at the same time; lowest total strokes over the course wins.

**Controls**

- **Shoot:** click and drag back from your ball like a slingshot, then release. Drag length sets power (capped at a max), and the angle is the opposite of the drag. A dotted aim line shows the first \~2 ball-lengths of the path.
- **Use item:** tap Space (or click the item slot). Targeted items auto-target the Leader; hold Space to open the target picker instead (click a ball, or press 1–8).
- **Camera:** auto-follows your ball; hold Tab to see the whole hole and the scoreboard.
- You can only shoot again once your ball's speed drops below a rest threshold (e.g. 2 px/s for 300 ms).

**Physics**

- 2D rigid bodies: balls are circles; walls are static polygons. Balls collide with each other everywhere except inside the cup's capture radius, so nobody can knock a ball out of the cup.
- Surfaces change linear damping:

| Surface | Behaviour | Rule |
| --- | --- | --- |
| Fairway | Normal roll | Baseline damping |
| Rough | Slows quickly | \~2× damping |
| Sand | Almost stops the ball | \~5× damping, max shot power cut 30% |
| Ice | Barely slows | \~0.2× damping |
| Water | Hazard | +1 stroke, ball returns to last rest spot |
| Void / off-map | Out of bounds | +1 stroke, ball returns to last rest spot |
| Boost pad | Pushes ball in a set direction | Adds a fixed impulse |
| Teleporter | Moves ball to a paired exit | Keeps speed |

- **Cup:** the ball drops in if it's inside the cup radius *and* moving under a capture speed. Too fast and it lips out.

**Hole flow**

1. Countdown 3-2-1, then everyone can shoot.
2. A hole ends when every player has holed out *or* the hole timer runs out (default 90 s).
3. Anyone who hasn't finished takes min(strokes + 2, stroke cap). Stroke cap defaults to par + 4.
4. 8-second scoreboard screen, then the next hole.

**After holing out:** the player spectates for the rest of the hole. They keep their held Item and can still use it, but can't pick up new ones, and their ball can't be targeted.

**Disconnects and late joins**

- If a player disconnects mid-hole, their ball stays where it is, can't be targeted, and has no collisions. They rejoin the same ball. If they're still gone when the hole ends, the normal unfinished rule applies.
- Late joiners start at the next hole. Each hole they missed is scored at its stroke cap.

**Scoring:** strokes per hole + penalties, shown against par. Ties are broken by Item Hits: attack Items that land on an opponent. Shield blocks, misses and Admin Powers don't count.

**Standing:** strokes from earlier holes plus strokes so far on this hole, with distance to the cup breaking ties. Players who have holed out rank by their final strokes for the hole. The **Leader** is the player in first Standing among those who haven't holed out yet.

**Courses:** each course is a JSON file holding a list of holes. Each hole has a tee, a cup, a par, wall polygons, surface zones, hazards, item-box spawn points and moving obstacles (windmills, sliding walls). Holes are drawn in the free Tiled map editor, and a small script converts the Tiled export into course JSON. v1 ships 1 course with 9 holes.

## Tech stack and multiplayer architecture

The whole game is TypeScript: Phaser draws it in the browser, and one Node.js server running Colyseus owns all game state and physics.

&#91;embedded content: architecture · clients, admin client, game server modules\]

Players and the admin run the same client. The admin's extra commands go to a handler that checks the session before anything changes.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript for client, server and shared types | One definition of state and messages on both sides |
| Rendering | Phaser | 2D scenes, sprites, particles, camera, input |
| Physics | Planck.js (a Box2D port), server-side only | Solid circle and polygon collisions; one source of truth so no one desyncs |
| Networking | Colyseus rooms over WebSockets | Room codes, delta state sync and reconnects built in |
| Hosting | One always-on Fly.io machine (about $2–5/month) that also serves the client files | WebSockets need a process that stays up; no cold start when friends click the link |
| Art and sound | Free CC0 asset packs (e.g. Kenney) | Placeholder art and sound so you don't have to draw anything |

**Why the server is in charge:** every troll feature (ball grab, nuke, freeze) is just the server changing state. Clients can't fake positions, and the admin needs no client-side hacks.

**Netcode:** the server steps physics at 60 Hz and sends patches at 20 Hz. Clients render \~100 ms behind and interpolate between patches. Later, if shots feel laggy, predict your own ball locally for the first \~200 ms.

## Admin (troll) powers

The admin is **secret**: they play as a normal player, and nobody else knows who it is until the optional Troll Recap reveal (see `docs/adr/0001-secret-admin-with-separate-bundle.md`). The admin counts in scoring and Standing like everyone else. Every power is a server command that only the admin's authenticated connection can send. Each power has a **Stealth** mode (no attribution, looks like a glitch or bad luck) and a **Loud** mode (big animation plus a "👑 The Golf Gods have spoken" banner). Loud never names the admin.

Admin Powers ignore every player limit: Shields, the 3 s post-hit immunity and the one-disabling-Effect cap.

**Admin console**

- Toggle with a secret hotkey (default: backtick). It only exists on the admin's screen.
- Radial menu on right-click over any ball, cup or patch of terrain, so you can troll in one gesture.
- Hotbar slots 1–9 hold favourite powers. A Stealth/Loud toggle sits on Caps Lock.
- An "x-ray" overlay shows every player's held item, active effects and aim line.

An Admin Power that would duplicate an Item doesn't exist separately: the admin gives themselves the Item through **Give Item**. Ghost Ball and Swap work this way.

| Power | What it does | Targets | Milestone |
| --- | --- | --- | --- |
| Ball Grab | Drag any ball anywhere: into the cup, into water, onto the tee. Release with or without a throw speed | Any ball | M3 |
| Nuke | 3 s air-raid siren and a red flash, then a white-out, screen shake, and every ball blasted outward from the impact point. Modes: **Wipe** (default: every ball still on the course goes back to the tee, strokes kept, players who have holed out are untouched, the hole timer keeps running) and **Reset** (everyone replays the hole, including players who have holed out; strokes for the hole wiped; the hole timer restarts). Held Items are kept in both modes. **Scorched** (walls destroyed, craters turn into sand traps) comes later | Whole map | M3 |
| Move the Cup | Teleport the cup, or set it to slide away when a ball gets close | Cup | M3 |
| Cup Size | Shrink the cup to a pinhole or blow it up to a crater | Cup | M3 |
| Terrain Paint | Paint ice, sand, water or void anywhere with a brush | Terrain | M3 |
| Lip-Out | The next ball to drop in pops back out | Cup, per player | M3 |
| Give Item | Give anyone (or yourself) any item, including admin-only ones | Player | M3 |
| Scoreboard Edit | Add or remove strokes on any player | Player | M3 |
| Rig the Box | Pick what item someone gets from their next box | Player | M4 |
| God Mode | Admin is immune to every Item. In Stealth, a blocked attack looks like a Shield pop; in Loud, an obvious divine block | Self | M4 |
| Magnet / Repel | The cup pulls the admin's ball in and pushes others away | Cup, per player | M5 |
| Spawn Wall | Draw a wall segment; it can be set to vanish after N seconds | Terrain | M5 |
| Invert Controls | Target's drag direction is flipped (silent in Stealth) | Player | M5 |
| Wind / Gravity | Set a global force vector, or tilt the whole map | Whole map | Later |
| Lag Fake | Target's ball visibly jitters and rubber-bands on their screen only | Player | Later |
| Time Control | Slow-mo or freeze the whole world for N seconds | Whole map | Later |
| Fake Announcement | Show a fake system banner, e.g. "Ben has been disqualified for cheating" | All players | Later |

**Hidden-admin rules**

- The admin's UI ships in a separate JS bundle that the server only sends after the admin authenticates. Friends who open DevTools on the normal client won't find admin code.
- Admin auth: the admin enters a secret (from a server environment variable) when joining any room; the server marks that session `isAdmin` and never sends that flag to other clients. At most one admin per room.
- Stealth actions use the same visual effects as natural events (water splash, a normal lip-out), so they're believable.

## Power-up system

Players pick up items by rolling their ball through floating "?" boxes. As in Mario Kart, each player holds one item at a time, and what you get depends on where you're standing in the race.

**Item boxes**

- Placed at spawn points defined in the hole JSON (3–6 per hole), usually off the safe line so grabbing one is a risk-reward choice.
- A box is a sensor: it doesn't change the ball's path. It shatters on contact and respawns after 10 s.
- Holding an item already? You roll through the box without picking anything up.

**Roulette and distribution**

- On pickup, a 1.5 s slot-machine roulette plays in the item slot, then the item locks in. The server decides the result at pickup, so the animation is just for show.
- **Rubber-banding:** the item odds depend on a player's standing (total strokes so far, then distance to the cup on this hole). Leaders mostly get defensive or self-buff items; players in last place get the heavy hitters.

| Standing | Defensive / self | Attack | Chaos (rare) |
| --- | --- | --- | --- |
| 1st | 70% | 28% | 2% |
| Middle | 40% | 55% | 5% |
| Last | 15% | 70% | 15% |

**Using items**

- Tap Space to use the item. Targeted items auto-pick the Leader. Hold Space to open the target picker instead.
- Players who have holed out, and players who can't be hit right now (immune, or already under a disabling Effect), are greyed out in the picker, and tap-Space skips to the next-best Standing. If nobody can be targeted, the Item is kept, not used up.
- Aimed items (Golf Gun) switch the cursor to a crosshair until fired or timed out (10 s).
- Items can be used while your ball is moving, and after holing out.

**Effects engine**

- Each active effect is `{type, sourceId, targetId, startedAt, durationMs, data}` and lives in server state.
- **Immunity window:** after being hit by an attack, a player is immune to further attacks for 3 s, so nobody gets chain-locked.
- **Shield** eats the next incoming attack. Admin powers ignore shields.

## Power-up catalog

v1 ships 9 items: the three you asked for plus six that round out attack, defense and chaos. Ghost Ball and Swap are in v1 because they also replace the admin's versions (through Give Item). The rest come later.

| Item | Class | Effect | Target | Duration | Counter | v1? |
| --- | --- | --- | --- | --- | --- | --- |
| Freeze Ray | Attack | Target's ball is encased in ice: it stops dead and they can't shoot | One opponent (default: leader) | 6 s | Shield; mash click to break out 1 s sooner | Yes |
| Golf Gun | Attack | Crosshair aim; each hit pushes the target ball hard along the line of fire, from the shooter's ball to the target (from the Cup if the shooter has holed out). Knocked into water or void = +1 stroke for them | Aimed | 3 shots or 10 s | Shield blocks one shot | Yes |
| Ink Splat | Attack | Ink blots cover \~60% of the target's screen; they fade over time and the target can wipe them by scrubbing the mouse | One opponent | 6 s | Shield | Yes |
| Fog of War | Attack | Target's view shrinks to a small circle around their ball | One opponent | 8 s | Shield | Later |
| Pop-up Ads | Attack | Fake "YOU WON A FREE IPHONE" windows cover the target's screen; each needs its tiny X clicked | One opponent | Until closed | Shield | Later |
| Shield | Defensive | Bubble that absorbs the next attack | Self | Until used or 30 s | None | Yes |
| Mulligan | Self | Undo your last shot: ball returns to where it was before that shot, and that stroke plus every penalty since are refunded. Can't be used after holing out | Self | Instant | None | Yes |
| Cup Magnet | Self | Your next shot curves toward the cup | Self | Next shot | None | Yes |
| Banana Mine | Attack | Drop a trap where your ball is; the next ball that hits it spins off in a random direction. After holing out, click to place it anywhere except within 3 cup-radii of the Cup | Placed | Until triggered or 45 s | None | Yes |
| Homing Missile | Chaos | Flies to whoever is closest to the cup and blasts their ball away (the blue shell) | Leader | Instant | Shield | Later |
| Swap | Chaos | Swap your ball's position with a random opponent's | Random opponent | Instant | Shield | Yes |
| Earthquake | Chaos | Every opponent's ball gets a random shove | All opponents | Instant | Shield (per player) | Later |
| Reverse | Attack | Target's next shot fires opposite to their drag | One opponent | Next shot | Shield | Later |
| Ghost Ball | Self | Next shot passes through walls (not hazards) | Self | Next shot | None | Yes |

**Adding an item** means writing one server handler (`onUse(state, user, target)`), one client effect renderer, and a weight entry in the distribution table. Items are data-driven, so tuning durations doesn't touch code.

## UI, HUD and feedback

The HUD stays minimal so the screen effects (ink, fog, nukes) are what people notice.

**Screens:** Title → Create/Join room (4-letter code + nickname + ball colour) → Lobby (player list, course pick, chaos settings) → Hole → Hole scoreboard → Final results and Troll Recap.

**In-hole HUD**

- Top-left: hole number, par, your strokes.
- Top-centre: hole timer.
- Bottom-centre: item slot (roulette spins here).
- Right: kill feed, e.g. "Maya sniped Ben into the lake", "Jay got frozen".
- Name tags over every ball; a badge shows active effects (ice, shield).

**Juice (cheap and worth it)**

- Screen shake on hits and nukes, particles for splashes and shattered boxes, a slow-mo zoom on near-misses at the cup.
- Sound for every event: putt, wall clink, splash, freeze crackle, gunshot, siren, cup rattle.
- Emote wheel (Q): laugh, salty, GG, "???". Emotes float over your ball.

**Troll Recap** (end of game, optional): a short replay of the funniest moments. It plays the longest-frozen player, the most-sniped ball and, if the admin turns on reveal, a list of every admin action ("That lip-out on hole 4? That was me.").

## Data model and network messages

The server owns one `RoomState` per game. Clients send *intents* only and never positions, so the only person who can teleport a ball is the admin.

**Room state (synced to clients)**

```
RoomState
  code: string            // "GOLF"
  phase: lobby | countdown | playing | holeEnd | gameEnd
  courseId, holeIndex, holeEndsAt
  settings: { chaosLevel, holeTimerSec, strokeCapOverPar, itemsEnabled }
  players: Map<id, Player>
  boxes: Map<id, { x, y, active, respawnAt }>
  traps: Map<id, { type, x, y, ownerId }>
  cup: { x, y, radius, behaviour }
  terrainEdits: TerrainEdit[]   // admin paint and walls, replayable

Player
  id, name, color, connected
  ball: { x, y, vx, vy, atRest, lastRestX, lastRestY }
  strokes: number[]       // per hole
  holedOut: boolean
  item: ItemType | null
  effects: Effect[]
```

**Server-only state (never synced):** `adminSessionId`, rigged boxes, pending lip-outs, stealth flags, an admin action log for the recap.

| Direction | Message | Payload | Server checks |
| --- | --- | --- | --- |
| C → S | `join` | name, color, room code | Room exists, not full (8) |
| C → S | `shoot` | angle (rad), power (0–1) | Ball at rest, not frozen, playing phase |
| C → S | `useItem` | targetId? / aimX, aimY? | Holds that item, target valid |
| C → S | `emote` | emoteId | Rate limit 1/s |
| C → S | `admin` | action, params | Session is admin |
| S → C | state patch | delta of RoomState | Sent at 20 Hz |
| S → C | `fx` | type, x, y, targetId?, loud | One-shot visuals and sounds |
| S → C | `screenFx` | type, durationMs | Sent only to the target (ink, fog, ads) |
| S → C | `feed` | text | Kill-feed line |
| S → Admin | `xray` | all items, effects, aims | Admin session only |

Screen effects go only to the affected player's connection, so everyone else keeps a clear view and sees only a small badge on that player's ball.

## Fun guardrails and balance

Trolling is funny when the victim laughs. These settings keep it funny and stop friends from quitting.

- **Chaos level (lobby setting):** Chill / Normal / Unhinged. It scales item-box count, attack odds and effect durations (0.6× / 1× / 1.5×).
- **Caps:** no player can be under more than one disabling effect (freeze, ink, fog) at once, and the 3 s post-hit immunity always applies.
- **Hole timer and stroke cap** keep a griefed player from being stuck on one hole forever.
- **Catch-up:** last place gets the best item odds (see the distribution table above).
- **Admin pacing (a suggestion, not enforced):** a single nuke per game hits harder than five. There's an optional "Nuke cooldown" setting if you want the game to hold you back.
- **Reveal option:** the Troll Recap can expose admin actions at the end, so the payoff lands as a joke rather than leaving people feeling cheated.
- **Tuning loop:** log every item use and admin action with timestamps, then check after each session which items got used, what won games, and how long holes took.

## Build plan

The plan is six milestones over about 8 weeks part-time. Each one ends with something you can actually play with friends, so you'll find out early what's fun.

1. **M0: Skeleton (week 1).** Monorepo (`client/`, `server/`, `shared/`), Phaser client, Colyseus server, deployed to one URL.
   - Done when: two browsers join the same room by code and see each other's cursor dots.
2. **M1: Golf that feels good (weeks 1–2).** Server-side physics, slingshot shooting, walls, surfaces, cup capture, 3 holes from JSON, single-player scoring.
   - Done when: a full 3-hole round plays with no stuck balls, and putting feels satisfying.
3. **M2: Multiplayer (weeks 3–4).** Simultaneous play for 2–8 players, 20 Hz state sync with client interpolation, hole timer, scoreboard, reconnects.
   - Done when: 4 friends finish 3 holes on real internet with no visible rubber-banding.
4. **M3: Admin v1 (week 5).** Admin auth and separate bundle, console + radial menu, Ball Grab, Nuke (Wipe and Reset), Move Cup, Cup Size, Terrain Paint, Lip-Out, Give Item, Scoreboard Edit, Stealth/Loud.
   - Done when: a nuke gets a scream and nobody can tell who the admin is. Hiding admin code from DevTools is a nice-to-have, not required.
5. **M4: Power-ups v1 (weeks 6–7).** Item boxes, roulette, rubber-band odds, effects engine with immunity, the 9 v1 items, kill feed, plus the Rig the Box and God Mode Admin Powers.
   - Done when: in a 9-hole game every player uses at least 3 items and no one is frozen or inked for more than \~15 s total per hole.
6. **M5: Polish (week 8).** Sounds, particles, screen shake, emotes, Troll Recap, 9-hole course, chaos-level setting, plus the Magnet/Repel, Spawn Wall and Invert Controls Admin Powers.
   - Done when: a whole friend group plays a full game without you explaining anything.

**After v1:** the "Later" admin powers and items, a simple in-browser level editor (drag walls, save JSON), more courses, and mobile touch controls.

## Resolved questions

- [x] Top-down or side-view? **Top-down.** Item boxes, simultaneous play and Terrain Paint all need a flat plane.
- [x] Known or secret admin? **Secret**, with an optional reveal in the Troll Recap (ADR 0001).
- [x] Nuke default? **Wipe.** v1 ships Wipe and Reset; Scorched is Later.
- [x] Ball-to-ball collisions? **On**, except inside the cup's capture radius.
- [x] Hosting? **One always-on Fly.io machine**, so there's no cold start.

Terms used here are defined in `GLOSSARY.md`.
