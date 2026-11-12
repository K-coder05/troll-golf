# Troll Golf v1

Status: ready-for-agent

## Problem Statement

I want a game to play with my friends on Discord calls that's built around messing with each other, and secretly around me messing with all of them. Normal online mini-golf is turn-based and polite. There's no way for players to sabotage each other, and certainly no way for one person to quietly bend the game (grab balls, move the Cup, nuke the map) without everyone knowing who's doing it. It also has to be zero-friction: a link and a room code, no installs, no accounts.

## Solution

Troll Golf is a browser-based, top-down, real-time mini-golf game for 2–8 Players. Everyone plays the same Hole at once. Players roll through Item Boxes to get Items in the style of Mario Kart: Freeze Ray, Golf Gun, Ink Splat, Shield, Mulligan, Cup Magnet, Banana Mine, Ghost Ball and Swap. Rubber-banded odds give whoever is behind the nastiest ones.

One Player is the secret Admin. They play normally but have a console of Admin Powers: Ball Grab, Nuke, Move the Cup, Cup Size, Terrain Paint, Lip-Out, Give Item, Scoreboard Edit, Rig the Box, God Mode, Magnet/Repel, Spawn Wall and Invert Controls. Each one can be used **Stealth** (it looks like bad luck) or **Loud** (spectacle plus an anonymous "Golf Gods" banner). Nobody learns who the Admin is unless the Admin turns on the reveal in the end-of-game Troll Recap.

The server is authoritative for all physics and game state, so every troll is just the server changing state. Clients send only intents.

Terms follow `GLOSSARY.md`. The secret-admin design follows `docs/adr/0001-secret-admin-with-separate-bundle.md`. The original design document is `Troll Golf — Spec Sheet.md` at the repo root.

## User Stories

### Joining and lobby

1. As a Player, I want to join a game from a link and a 4-letter room code, so that my friends and I can start playing in seconds with no installs or accounts.
2. As a Player, I want to choose a nickname and a ball colour when I join, so that my friends can tell which ball is mine.
3. As a Player, I want to see a lobby with everyone who has joined, so that we know when the group is ready.
4. As a Player, I want the room creator to pick the Course and the chaos level (Chill / Normal / Unhinged) in the lobby, so that the group can set how wild the game gets.
5. As a Player, I want a room to hold at most 8 Players and refuse further joins, so that games stay playable.
6. As a Player who shows up late, I want to join a game already in progress and start at the next Hole, so that I don't have to wait for a whole new game.
7. As a late-joining Player, I want each Hole I missed to be scored at that Hole's stroke cap, so that joining late is fair to everyone else.
8. As a Player, I want the first join to be fast with no cold start, so that the group isn't waiting on the server while on a call.

### Shooting and physics

9. As a Player, I want to click and drag back from my ball and release to shoot, with drag length setting power up to a maximum, so that shooting feels like a slingshot.
10. As a Player, I want a dotted aim line showing roughly the first 2 ball-lengths of my shot, so that I can aim without the game playing itself.
11. As a Player, I want to be able to shoot only once my ball has come to rest, so that I can't spam shots.
12. As a Player, I want the camera to follow my ball, and to see the whole Hole and the scoreboard while holding Tab, so that I can plan my shot.
13. As a Player, I want walls to bounce my ball off solidly, so that bank shots are possible and predictable.
14. As a Player, I want Fairway, Rough, Sand, Ice, Boost Pads and Teleporters to change how my ball moves, so that Holes have variety and risk.
15. As a Player, I want Sand to cut my maximum shot power, so that landing in a bunker has a real cost.
16. As a Player, I want my ball to return to its Rest Spot with a +1 Stroke penalty when it goes into Water or the Void, so that hazards matter but don't end my Hole.
17. As a Player, I want my ball to drop into the Cup only if it's inside the capture radius and moving slowly enough, and to lip out otherwise, so that putting takes skill.
18. As a Player, I want balls to collide with each other, so that bumping a friend's ball is part of the game.
19. As a Player whose ball is in or entering the Cup, I want other balls not to collide with mine inside the capture radius, so that nobody can knock me out of the Cup.
20. As a Player, I want moving obstacles such as windmills and sliding walls, so that Holes have timing challenges.

### Hole flow and scoring

21. As a Player, I want a 3-2-1 countdown before each Hole, so that everyone starts at the same time.
22. As a Player, I want everyone to play the Hole at the same time, so that there's no waiting for turns.
23. As a Player, I want a visible Hole timer (90 s by default), so that a Hole can't drag on forever.
24. As a Player who hasn't holed out when the timer ends, I want to be scored min(Strokes + 2, stroke cap), with the stroke cap defaulting to Par + 4, so that a griefed Player can't sink their whole game on one Hole.
25. As a Player, I want the Hole to end as soon as everyone has holed out, so that we don't wait on the timer for nothing.
26. As a Player, I want an 8-second scoreboard between Holes, showing Strokes against Par, so that we can see who's winning.
27. As a Player, I want the lowest total Strokes to win, with ties broken by Item Hits, so that trolling is rewarded.
28. As a Player who has holed out, I want to keep spectating the Hole, and to keep and use the Item I'm holding, so that finishing early becomes a chance to troll instead of waiting.
29. As a Player who has holed out, I want to be unable to pick up new Items, so that finishing early doesn't turn into an Item farm.
30. As a Player who has holed out, I want my ball to be untargetable, so that I can't be hit after I've finished.
31. As a Player, I want my Standing to be my Strokes from earlier Holes plus my Strokes so far on this Hole, with distance to the Cup breaking ties, so that the Leader is whoever is really ahead right now.

### Disconnects

32. As a Player whose connection drops mid-Hole, I want my ball to stay where it is, untargetable and with no collisions, so that nobody can grief it and it doesn't block anyone.
33. As a reconnecting Player, I want to get my same ball, Strokes and held Item back, so that a Wi-Fi blip doesn't wreck my game.
34. As a Player who is still disconnected when the Hole ends, I want the normal unfinished-Hole rule applied, so that the scoring stays consistent.

### Item Boxes and Items

35. As a Player, I want 3–6 Item Boxes per Hole, placed off the safe line, so that getting an Item is a risk-reward choice.
36. As a Player, I want an Item Box to be a sensor that doesn't change my ball's path, shatters on contact and respawns after 10 s, so that grabbing one feels clean.
37. As a Player already holding an Item, I want to roll through Item Boxes without picking anything up, so that I hold only one Item at a time.
38. As a Player, I want a 1.5 s slot-machine roulette in my item slot when I pick up an Item, so that getting an Item feels exciting.
39. As a Player in last place, I want much better odds of attack and chaos Items, and as the Leader mostly defensive ones, so that the game stays close.
40. As a Player, I want to tap Space to use my Item, with targeted Items automatically hitting the Leader, so that the most common action is the fastest.
41. As a Player, I want to hold Space to open a target picker (click a ball, or press 1–8), so that I can pick my victim on purpose.
42. As a Player, I want Players I can't hit right now (holed out, in their 3 s immunity window, or already under a disabling Effect) greyed out in the picker, and tap-Space to skip to the next-best Standing, so that I don't waste an Item.
43. As a Player, I want to keep my Item when nobody can be targeted, so that invisible rules never eat my Item.
44. As a Player, I want to be able to use Items while my ball is moving, so that I can react in the moment.
45. As a Player, I want to use **Freeze Ray** to encase an opponent's ball in ice for 6 s, so that it stops dead and they can't shoot.
46. As a Frozen Player, I want to mash click to break out 1 s sooner, so that I have something to do while Frozen.
47. As a Player, I want to use **Golf Gun** to aim a crosshair and fire up to 3 shots within 10 s, each pushing the target hard along the line of fire, so that I can snipe balls into hazards.
48. As a Player who has holed out, I want my Golf Gun shots to fire from the Cup, so that the Golf Gun still works after I finish.
49. As a Player knocked into Water or the Void by any Item, I want the normal +1 Stroke penalty and a return to my Rest Spot, so that hazards stay consistent.
50. As a Player, I want to use **Ink Splat** to cover about 60% of an opponent's screen with ink for 6 s, so that they have to putt half-blind.
51. As an Inked Player, I want to scrub with the mouse to wipe the ink away, so that I can fight back.
52. As a Player, I want to use **Shield** to wrap my ball in a bubble that absorbs the next attack (up to 30 s), so that I can protect a lead.
53. As a Player, I want to use **Mulligan** to send my ball back to where it was before my last shot and get back that Stroke plus every penalty since, so that one bad shot, or a snipe after it, doesn't ruin my Hole.
54. As a Player, I want Mulligan to be unusable after I've holed out, so that a finished Hole stays finished.
55. As a Player, I want to use **Cup Magnet** to make my next shot curve toward the Cup, so that I can catch up.
56. As a Player, I want to use **Banana Mine** to drop a trap where my ball is that sends the next ball that hits it spinning off randomly (it lasts up to 45 s), so that I can booby-trap a line.
57. As a Player who has holed out, I want to click to place a Banana Mine anywhere except within 3 cup-radii of the Cup, so that I can still use it without blocking the Cup.
58. As a Player, I want to use **Ghost Ball** so that my next shot passes through walls (but not hazards), so that I can take impossible lines.
59. As a Player, I want to use **Swap** to trade my ball's position with a random opponent's, so that I can steal a great lie.
60. As a Player, I want a 3 s immunity window after any attack hits me, so that I can't be chain-locked.
61. As a Player, I want to be under at most one disabling Effect (Freeze or Ink) at a time, so that being trolled stays funny.
62. As a Player, I want a small badge on each ball showing its active Effects (ice, shield and so on), so that I know who is under what.
63. As a Player, I want screen Effects such as Ink to appear only on the victim's screen, so that everyone else keeps a clear view.

### Admin: access and secrecy

64. As the Admin, I want to authenticate in any room by entering a secret when I join, so that I don't have to be the one creating rooms, which would be a clue.
65. As the Admin, I want only one Admin per room, so that the role stays unique.
66. As the Admin, I want my admin status never sent to other clients, so that nobody can find out from the network traffic.
67. As the Admin, I want the admin UI shipped as a separate bundle that only reaches my authenticated session, so that friends poking at the normal client find nothing (nice-to-have).
68. As the Admin, I want to count in scoring and Standing like any other Player, so that leaving me out doesn't give me away.
69. As the Admin, I want to open the admin console with a secret hotkey (default: backtick), so that I can troll mid-game.
70. As the Admin, I want a radial menu when I right-click any ball, the Cup or terrain, so that I can troll in one gesture.
71. As the Admin, I want hotbar slots 1–9 for my favourite Admin Powers, and a Stealth/Loud toggle on Caps Lock, so that I can act fast.
72. As the Admin, I want an x-ray overlay of every Player's held Item, active Effects and aim line, so that I can time my trolls.
73. As the Admin, I want every Admin Power to have a Stealth form that uses the same visuals as natural events (splash, normal lip-out), so that it looks like bad luck.
74. As the Admin, I want every Admin Power to have a Loud form with a "👑 The Golf Gods have spoken" banner that never names me, so that I get spectacle without being exposed.
75. As the Admin, I want Admin Powers to ignore Shields, the immunity window and the one-disabling-Effect cap, so that I decide when it stops being funny.

### Admin Powers

76. As the Admin, I want **Ball Grab** to drag any ball anywhere and release it with or without a throw, so that I can put balls in the Cup, in the Water or back on the Tee.
77. As the Admin, I want **Nuke** to play a 3 s siren and red flash, then a white-out, screen shake and every ball blasted outward, so that it gets a scream.
78. As the Admin, I want **Nuke: Wipe** (the default) to send every ball still on the course back to the Tee, keep Strokes, leave Players who have holed out untouched and keep the Hole timer running, so that it punishes whoever is still playing.
79. As the Admin, I want **Nuke: Reset** to make everyone replay the Hole, including Players who have holed out, with that Hole's Strokes wiped and the timer restarted, so that nobody is safe.
80. As any Player, I want my held Item kept through a Nuke, so that a Nuke doesn't feel like it robbed me.
81. As the Admin, I want **Move the Cup** to teleport the Cup or set it to slide away when a ball gets close, so that I can deny a sure putt.
82. As the Admin, I want **Cup Size** to shrink the Cup to a pinhole or blow it up to a crater, so that I can make putting impossible or trivial.
83. As the Admin, I want **Terrain Paint** to brush Ice, Sand, Water or Void anywhere, so that I can reshape the Hole live.
84. As the Admin, I want **Lip-Out** to make a chosen Player's next ball that drops in pop back out, so that I can deny a putt believably.
85. As the Admin, I want **Give Item** to give any Player, including myself, any Item, so that I can arm my friends or myself. Ghost Ball and Swap come through this.
86. As the Admin, I want **Scoreboard Edit** to add or remove Strokes on any Player, so that I can fix or wreck the scores.
87. As the Admin, I want **Rig the Box** to pick what Item a chosen Player gets from their next Item Box, so that I can set up perfect moments.
88. As the Admin, I want **God Mode** to make me immune to every Item, with blocked attacks looking like a Shield pop in Stealth and an obvious divine block in Loud, so that I can't be trolled back without being found out.
89. As the Admin, I want **Magnet/Repel** to make the Cup pull my ball in and push others away, so that I can quietly cheat.
90. As the Admin, I want **Spawn Wall** to draw a wall segment that can vanish after N seconds, so that I can block a line.
91. As the Admin, I want **Invert Controls** to flip a Player's drag direction (silently in Stealth), so that their shots go backwards.

### Feedback and end of game

92. As a Player, I want a HUD with Hole number, Par and my Strokes (top-left), the timer (top-centre), my item slot (bottom-centre) and a kill feed (right), so that the screen stays readable under all the chaos.
93. As a Player, I want kill-feed lines such as "Maya sniped Ben into the lake" and "Jay got frozen", so that everyone sees the trolling.
94. As a Player, I want name tags over every ball, so that I know whose ball is whose.
95. As a Player, I want screen shake, particles and a sound for every event (putt, wall clink, splash, freeze crackle, gunshot, siren, cup rattle), so that the game feels juicy.
96. As a Player, I want a slow-mo zoom on near-misses at the Cup, so that close calls feel dramatic.
97. As a Player, I want an emote wheel on Q (laugh, salty, GG, "???") with emotes floating over my ball, limited to 1 per second, so that I can react.
98. As a Player, I want a final results screen and a Troll Recap of the funniest moments (longest-frozen Player, most-sniped ball), so that the game ends on a laugh.
99. As the Admin, I want to choose whether the Troll Recap reveals every Admin Power I used ("That lip-out on hole 4? That was me."), so that the payoff lands as a joke.
100. As the room creator, I want the chaos level to scale Item Box count, attack odds and Effect durations (0.6× / 1× / 1.5×), so that the group can tune how wild it gets.

### Courses and operations

101. As the course author, I want to draw Holes in the Tiled map editor and convert them into course data with a script, so that making 9 Holes doesn't mean hand-writing polygons.
102. As the course author, I want the converter to reject a map that is missing a Tee, Cup or Par, or has bad geometry, with a clear error, so that broken Holes never reach a game.
103. As the developer, I want every Item use and Admin Power use logged with timestamps, so that I can tune balance after each session.

## Implementation Decisions

### Architecture

- Monorepo with three packages: client, server and shared. Everything is in TypeScript, and the shared package holds the state and message types.
- Rendering uses Phaser in the browser. The client only renders interpolated state, sends intents and plays fx. It never simulates authoritative physics.
- Networking uses Colyseus rooms over WebSockets, with room codes, delta state sync and reconnects.
- Physics uses Planck.js, server-side only.
- The server steps at 60 Hz and sends patches at 20 Hz. Clients render about 100 ms behind and interpolate. Local prediction of your own ball is deferred unless shots feel laggy.
- Hosting is a single always-on Fly.io machine that also serves the client files.

### Modules

- **Game simulation (the core, deep module).** It is a deterministic, framework-free module that owns every rule: physics, surfaces, Hole flow, Standing, Item Boxes, the roulette and distribution, Items, the Effects engine, Admin Powers, Stealth/Loud, scoring, disconnects and late joins.
  - Interface: create a game from course data and settings, with an injected random number generator and clock. Pass in an intent from a session (join, leave or reconnect, shoot, useItem, emote, admin action). Step it forward by a time delta. Read the current room state. Drain outbound events, each tagged with its audience: everyone, one target Player, or the Admin only.
  - No Colyseus or Phaser imports.
- **Colyseus room adapter (thin).** It turns network messages into intents, runs the 60 Hz loop that calls step, copies game state into the synced schema, and routes drained events to the right connections. That means fx to everyone, screenFx only to the target, xray only to the Admin's session, and the feed to everyone. It also handles admin authentication by comparing the secret at join against an env var. No game rules live here.
- **Item and Admin Power registry.** Items are data-driven: class, duration, targeting kind (self, single opponent, aimed, placed, random opponent), counters and distribution weights. Each Item has one server-side use handler in the simulation and one client effect renderer. Changing a duration means changing data, not code.
- **Course converter.** A pure function from a Tiled map export to course data: Tee, Cup, Par, wall polygons, surface zones, hazards, Item Box spawn points and moving obstacles. It validates its input and reports clear errors.
- **Client.** Phaser scenes for Title, Create/Join, Lobby, Hole, Hole scoreboard, and Final results with the Troll Recap. It also holds the HUD, the slingshot input, the target picker, the crosshair mode, screen-effect overlays and emotes.
- **Admin client bundle.** A separate build, served only to an authenticated Admin session. It contains the console, radial menu, hotbar, Stealth/Loud toggle and x-ray overlay.

### State and messages

- Synced room state includes:
  - code, phase (lobby, countdown, playing, holeEnd, gameEnd), courseId, holeIndex and holeEndsAt;
  - settings (chaosLevel, holeTimerSec, strokeCapOverPar, itemsEnabled);
  - Players, each with id, name, color, connected, ball position/velocity/atRest/Rest Spot, Strokes per Hole, holedOut, item and Effects;
  - Item Boxes, traps, the Cup (position, radius, behaviour) and replayable terrain edits.
- Server-only state, never synced: the Admin session id, rigged Item Boxes, pending lip-outs, God Mode, Invert Controls, Stealth flags, per-Player Item Hit counts until the game ends, and the admin action log for the Recap.
- Client-to-server intents:
  - join (name, color, code, optional admin secret);
  - shoot (angle, power 0–1);
  - useItem (optional targetId, or aim point, or placement point);
  - emote (emoteId);
  - admin (action, params).
- Server-to-client: state patches, fx (type, position, optional target, loud), screenFx (only to the target), feed lines, and xray (only to the Admin).
- An Effect is a record of type, sourceId, targetId, startedAt, durationMs and data.

### Rules settled in design (see GLOSSARY.md and ADR 0001)

- **Standing:** Strokes from earlier Holes plus Strokes so far on this Hole, with distance to the Cup breaking ties. Holed-out Players rank by their final Strokes for the Hole. The **Leader** is first in Standing among Players who haven't holed out.
- **Distribution table** by Standing (defensive/self, attack, chaos):
  - 1st: 70 / 28 / 2
  - middle: 40 / 55 / 5
  - last: 15 / 70 / 15
  - The chaos level scales attack odds.
- **Targeting:**
  - Tap targets the Leader, hold opens the picker.
  - A Player can't be targeted while holed out, disconnected, inside their 3 s immunity window, or (for disabling Items) already disabled.
  - The Item is not used up if there's no valid target.
- **Shields** absorb the next attack. Admin Powers ignore Shields, immunity and the disabling cap.
- **Golf Gun** pushes along the line from the shooter's ball (or the Cup if holed out) to the target.
- **Banana Mine** for a holed-out Player: placed by clicking, at least 3 cup-radii from the Cup.
- **Mulligan** restores the ball's position from before the last shot and refunds that Stroke plus every penalty since. It can't be used after holing out.
- **Collisions** between balls are on, except inside the Cup's capture radius. Disconnected balls have no collisions.
- **Nuke Wipe** (default) affects only balls still on the course and keeps the timer. **Reset** affects everyone and restarts the timer. Held Items survive both. Scorched is out of scope.
- **Ghost Ball and Swap** exist only as Items. The Admin gets them through Give Item.
- **God Mode** in Stealth looks like a Shield pop.
- **Admin authentication** works in any room, with at most one Admin per room. The Admin is an ordinary Player in scoring and Standing.
- **Item Hits** count only when an attack Item lands on an opponent. They break ties.
- **Late joiners** start at the next Hole, with missed Holes scored at the stroke cap.
- **Disconnected balls** stay frozen in place, untargetable and with no collisions. The unfinished-Hole rule applies at Hole end.

### Milestones

1. **M0, skeleton.** Two browsers join the same room by code and see each other's cursor dots, on the deployed URL.
2. **M1, golf.** Server physics, slingshot shooting, walls, surfaces, Cup capture, 3 Holes from course data, and single-player scoring.
3. **M2, multiplayer.** 2–8 Players playing at once, interpolation, the Hole timer, the scoreboard, reconnects and late joins.
4. **M3, Admin v1.** Admin authentication and the separate bundle, console and radial menu, Ball Grab, Nuke (Wipe and Reset), Move the Cup, Cup Size, Terrain Paint, Lip-Out, Give Item, Scoreboard Edit, and Stealth/Loud.
5. **M4, Items v1.** Item Boxes, roulette, rubber-band odds, the Effects engine with immunity, all 9 Items, the kill feed, Rig the Box and God Mode.
6. **M5, polish.** Sounds, particles, screen shake, emotes, the Troll Recap, the 9-Hole Course, the chaos level, Magnet/Repel, Spawn Wall and Invert Controls.

## Testing Decisions

- **What makes a good test:**
  - It drives the system only through its public interface and asserts on behaviour the Players would see: synced state and events to each audience.
  - It never reaches into internal data structures or physics bodies.
  - Tests are deterministic: they inject a seeded random number generator and a controlled clock, and advance time with step.
  - A test reads like a game scenario, e.g. "Maya fires the Golf Gun at Ben, who is next to the Water; Ben ends at his Rest Spot with +1 Stroke and the feed reports the snipe."
- **Seam 1 is the Game simulation**, the primary seam. Through it, test:
  - shooting and rest detection;
  - each surface's effect, hazards and Rest Spot returns;
  - Cup capture vs. lip-out;
  - the no-collision rule inside the Cup's capture radius;
  - Hole flow, the timer, the unfinished-Hole scoring rule and the stroke cap;
  - Standing and Leader selection, including the Ben vs. Maya example;
  - Item Box pickup, respawn and the one-Item limit;
  - the roulette result following the distribution for each Standing under a seeded random number generator;
  - each of the 9 Items, including its counters;
  - targeting rules (greyed-out cases, skipping, the Item being kept);
  - immunity and the disabling cap;
  - Players who have holed out using Items;
  - Mulligan refunds;
  - each Admin Power and its Stealth vs. Loud events;
  - Admin Powers skipping every limit;
  - God Mode's fake Shield pop;
  - Nuke Wipe vs. Reset, including holed-out Players and the timer;
  - disconnects, reconnects and late joins;
  - Item Hit counting and the tiebreak;
  - **secrecy:** no admin flag or admin attribution in synced state or in any event sent to a non-Admin audience, and in Stealth the events are indistinguishable from the natural ones.
- **Seam 2 is the Course converter.** It is tested with small fixture Tiled exports, checking that converting one gives the expected course data, and that maps with a missing Tee, Cup or Par, or bad polygons, are rejected with clear errors.
- **Not tested automatically:** the Colyseus adapter, the Phaser client and the admin bundle. They are covered by each milestone's "done when" playtest with friends.
- **Prior art:** none. The repo has no code yet, so these tests set the pattern.

## Out of Scope

- Matchmaking with strangers, ranked play, accounts, and anti-cheat for anyone except the Admin.
- Mobile-first or touch controls. The game should work on mobile, but desktop comes first.
- An in-browser level editor, and Courses beyond the single 9-Hole v1 Course.
- Side-view golf.
- The Nuke's Scorched mode (destructible walls, craters turning into Sand).
- The "Later" Admin Powers: Wind/Gravity, Lag Fake, Time Control, Fake Announcement.
- The "Later" Items: Fog of War, Pop-up Ads, Homing Missile, Earthquake, Reverse.
- Local prediction of your own ball, unless M2 playtests show shots feel laggy.
- Guaranteed hiding of admin code from DevTools. It's a nice-to-have, not a requirement.
- Enforced limits on the Admin, such as a Nuke cooldown. That stays an optional setting.

## Further Notes

- The original design document is `Troll Golf — Spec Sheet.md`. Vocabulary is in `GLOSSARY.md`. The secret-admin rationale and its consequences are in `docs/adr/0001-secret-admin-with-separate-bundle.md`. Any new Admin Power must have a believable Stealth form.
- Art and sound come from free CC0 packs (for example, Kenney).
- After each session, use the action log to check which Items were used, what won games and how long Holes took, then tune the data-driven durations and weights.
- This spec covers all of v1. It should be split into per-milestone implementation issues under this directory's issues folder.
