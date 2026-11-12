import { isMuted, soundOutput } from "./sound";

/**
 * An air-raid siren for the Nuke: a sweeping tone for `durationMs`. Returns a
 * function that stops it early. Silent if the browser has no WebAudio, the
 * player muted sound or no user gesture has happened yet; the visuals carry the warning anyway.
 */
export function startSiren(durationMs: number): () => void {
  try {
    const output = soundOutput();
    if (!output || isMuted() || output.ctx.state !== "running") return () => {};
    const { ctx, out } = output;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0.12;
    osc.connect(gain).connect(out);
    const end = ctx.currentTime + durationMs / 1000;
    // Rise and fall twice a second.
    for (let t = 0; t < durationMs / 1000; t += 1) {
      osc.frequency.setValueAtTime(500, ctx.currentTime + t);
      osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + t + 0.5);
      osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + t + 1);
    }
    osc.start();
    osc.stop(end);
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
