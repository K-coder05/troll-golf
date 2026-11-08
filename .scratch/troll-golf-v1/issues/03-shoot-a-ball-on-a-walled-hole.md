# 03: Shoot a ball on a walled Hole

**What to build:** A Player in a room sees their ball on the Tee of a simple walled Hole. They click and drag back from the ball and release to shoot it. Drag length sets power up to a maximum, and the angle is opposite the drag. A dotted aim line shows about the first 2 ball-lengths. The ball rolls with baseline damping, bounces off walls and comes to rest. The Player can shoot again only once the ball is at rest (speed under the rest threshold for 300 ms). The camera follows the ball, and holding Tab shows the whole Hole. Physics (Planck.js) runs only in the Game simulation at 60 Hz. The client sends a shoot intent (angle, power 0–1) and renders the synced state.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A shoot intent with a given angle and power moves the ball in that direction, and stepping time brings it to rest. Tested through the simulation.
- [ ] A shoot intent sent while the ball is moving is rejected.
- [ ] A ball shot at a wall bounces off and stays inside the Hole.
- [ ] Each shot adds 1 Stroke.
- [ ] The Rest Spot updates whenever the ball comes to rest.
- [ ] The client has the slingshot input with the aim line and power cap, camera follow and the Tab overview.
- [ ] A hand-written Hole fixture in the course data shape is enough for this ticket; the converter isn't needed.
