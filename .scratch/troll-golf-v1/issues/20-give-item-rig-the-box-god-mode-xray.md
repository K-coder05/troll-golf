# 20: Give Item, Rig the Box, God Mode, x-ray

**What to build:** Admin Powers that work with Items:
- **Give Item:** put any Item in any Player's slot, the Admin's included.
- **Rig the Box:** choose the Item a Player gets from their next Item Box. The roulette plays as usual and lands on it.
- **God Mode:** the Admin is immune to every Item. In Stealth, a blocked attack looks exactly like a Shield pop. In Loud, it shows an obvious divine block.
- **X-ray overlay:** on the Admin's client only, it shows every Player's held Item, active Effects and aim line.

Admin Powers ignore Shields, the immunity window and the one-disabling-Effect cap.

**Blocked by:** 09, 15

**Status:** ready-for-agent

- [ ] Give Item fills the target's slot, replacing any held Item. Tested through the simulation.
- [ ] Rig the Box makes the target's next pickup give exactly the chosen Item, then clears. Rigged boxes are server-only.
- [ ] With God Mode on, attack Items on the Admin don't land and don't count as Item Hits. In Stealth, the events other Players get match a natural Shield pop exactly (secrecy test extended).
- [ ] Admin Powers on a Shielded, immune or already-disabled Player still take effect.
- [ ] X-ray data is sent only to the Admin's connection; non-Admin audiences never receive it.
- [ ] The x-ray overlay shows on the Admin's client.
