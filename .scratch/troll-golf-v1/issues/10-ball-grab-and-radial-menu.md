# 10: Ball Grab and radial menu

**What to build:** The Admin right-clicks any ball, the Cup or terrain to open a radial menu showing the Admin Powers that apply to it. **Ball Grab** lets the Admin drag any ball anywhere (into the Cup, the Water or back to the Tee) and release it either at rest or with a throw speed. Once released, the ball follows normal rules: dropping into the Cup Holes Out, landing in Water costs the usual penalty.
- **Stealth:** the move shows as an ordinary moving ball.
- **Loud:** it adds the Golf Gods banner and a grab effect.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] A grabbed ball follows the Admin's drag positions and can't be shot while held. Tested through the simulation.
- [ ] Releasing with a throw speed gives the ball that velocity; releasing without one leaves it at rest.
- [ ] Releasing into Water applies +1 Stroke and the Rest Spot return; releasing in the Cup at low speed Holes Out.
- [ ] The radial menu opens on right-click over a ball, the Cup or terrain, and lists only the Admin Powers that apply.
- [ ] Secrecy test extended: a Stealth Ball Grab produces no event that identifies it as an Admin Power.
