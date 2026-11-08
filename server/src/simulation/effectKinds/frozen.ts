import { everyone } from "../events";
import type { EffectDefinition } from "../effects";

/**
 * Frozen (Freeze Ray): the ball stops dead in a block of ice (pinned: other
 * balls bounce off it, nothing pushes it) and its Player can't shoot. Each
 * mash click takes `mashSavesMs / mashClicks` off, up to `mashSavesMs` in all
 * (data from the Freeze Ray catalogue entry). Disabling (EFFECT_INFO).
 */
export const frozen: EffectDefinition<"frozen"> = {
  kind: "frozen",
  visible: true,
  blocksShot: "frozen",
  onStart(ctx, effect) {
    ctx.balls.pin(effect.targetId, true);
  },
  onStep(ctx, effect) {
    // A ball that got a new body meanwhile (reconnect, a Nuke Wipe, a Mulligan) is pinned again.
    ctx.balls.pin(effect.targetId, true);
  },
  onEnd(ctx, effect) {
    ctx.balls.pin(effect.targetId, false);
    const ball = ctx.state.players[effect.targetId]?.ball;
    if (ball) ctx.emit({ type: "fx", payload: { kind: "thaw", x: ball.x, y: ball.y, targetId: effect.targetId }, audience: everyone });
  },
  onMash(ctx, effect) {
    const cap = effect.data.mashSavesMs ?? 0;
    const clicks = Math.max(1, effect.data.mashClicks ?? 1);
    const saved = effect.data.savedMs ?? 0;
    if (saved >= cap) return;
    const step = Math.min(cap / clicks, cap - saved);
    effect.data.savedMs = saved + step;
    ctx.setEndsAt(effect, effect.endsAt - step);
  },
};
