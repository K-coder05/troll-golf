# Troll Golf

A top-down, real-time multiplayer mini-golf game where friends sabotage each other with Items while a secret Admin bends the game.

## Players and roles

**Player**:
Anyone in a Room with a ball on the course, including the Admin.
_Avoid_: User, client, golfer

**Admin**:
The one secret Player who can use Admin Powers. Other Players don't know who it is during play.
_Avoid_: Host, GM, Golf God (that's the public face, not the role)

**Room creator**:
The Player who created the Room. They run the lobby: pick the Course (and later the chaos level) and start the game. If they leave, the Player who has been in the Room longest takes over. It is public and has nothing to do with the Admin.
_Avoid_: Host, owner

**Golf Gods**:
The anonymous name the game shows when an Admin Power is used Loud. It never says who the Admin is.
_Avoid_: Admin (in any player-facing text)

## Play

**Course**:
An ordered set of Holes played in one game.

**Hole**:
One map with a Tee, a Cup and a Par, which every Player plays at the same time.

**Stroke**:
One shot, or one penalty added to a Player's score on a Hole.

**Hole Out**:
When a Player's ball drops into the Cup. That Player is done with the Hole but stays in the Room as a spectator.
_Avoid_: Finish, sink

**Capture radius**:
How close to the centre of the Cup a ball must be to drop in. It must also be slower than the capture speed; a faster ball **lips out** and rolls on.
_Avoid_: Cup size (that's the Admin Power that changes it)

**Stroke cap**:
The most Strokes a Player who hasn't Holed Out can score on a Hole when the timer runs out: Par + 4 by default. They score min(Strokes + 2, stroke cap).

**Rest Spot**:
Where a ball last came to rest. It goes back there after a Water or Void penalty.
_Avoid_: Checkpoint, last position

**Standing**:
A Player's rank in the current game: Strokes from earlier Holes plus Strokes so far on this Hole, with distance to the Cup breaking ties. It sets their Item odds.
_Avoid_: Place, position, rank

**Leader**:
The Player in first Standing among those who haven't holed out yet.

## Items

**Item**:
A one-use ability a Player gets from an Item Box, holds (one at a time) and then uses.
_Avoid_: Power-up, pickup, powerup

**Item Box**:
A floating "?" on the course. A ball that rolls through it gives that Player an Item.
_Avoid_: Mystery box, crate

**Item Hit**:
An attack Item landing on an opponent. Shield blocks, misses and Admin Powers don't count. It breaks score ties.
_Avoid_: Power-up hit, kill

**Effect**:
An ongoing state on a Player or their ball, such as Frozen, Shielded or Inked, caused by an Item or an Admin Power.
_Avoid_: Buff, debuff, status

## Admin Powers

**Admin Power**:
An ability only the Admin can use. Shields never block it.
_Avoid_: Troll power, cheat, admin command

**Stealth**:
Using an Admin Power so that it looks like a natural event or bad luck.

**Loud**:
Using an Admin Power with full spectacle and a Golf Gods banner.

**Nuke**:
The Admin Power that blasts every ball on the course. **Wipe** sends every ball back to the Tee and keeps Strokes. **Reset** replays the Hole and wipes its Strokes.
