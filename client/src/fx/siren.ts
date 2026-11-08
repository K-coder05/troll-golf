/**
 * An air-raid siren for the Nuke: a sweeping tone for `durationMs`. Returns a
 * function that stops it early. Silent if the browser has no WebAudio or
 * blocks it (no user gesture yet); the visuals carry the warning anyway.
 */
export function startSiren(durationMs: number): () => void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return () => {};
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    const end = ctx.currentTime + durationMs / 1000;
    // Rise and fall twice a second.
    for (let t = 0; t < durationMs / 1000; t += 1) {
      osc.frequency.setValueAtTime(500, ctx.currentTime + t);
      osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + t + 0.5);
      osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + t + 1);
    }
    osc.start();
    osc.stop(end);
    osc.onended = () => void ctx.close().catch(() => {});
    return () => {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    };
  } catch {
    return () => {};
  }
}
