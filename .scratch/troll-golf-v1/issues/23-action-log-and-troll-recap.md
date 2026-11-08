# 23: Action log and Troll Recap

**What to build:** At the end of a game, the final results screen offers a Troll Recap of the funniest moments: the longest-frozen Player, the most-sniped ball and other highlights drawn from the logged Item uses. The Admin can turn on **reveal**, which adds a list of every Admin Power they used, e.g. "That lip-out on hole 4? That was me." Without reveal, the Recap gives nothing about the Admin away. The timestamped Item and Admin Power log is also downloadable or saved server-side, for balance tuning after each session.

**Blocked by:** 09, 15

**Status:** ready-for-agent

- [ ] The Recap is computed from the log: the longest total Freeze time per Player and the Player with the most Item Hits taken. Tested through the simulation with a scripted game.
- [ ] With reveal off, the Recap sent to non-Admins has no Admin Power entries and doesn't name the Admin (secrecy test extended).
- [ ] With reveal on, the Recap lists every Admin Power use with its Hole number and target.
- [ ] The full log for each session is saved for later analysis.
- [ ] The client shows the Recap after final results.
