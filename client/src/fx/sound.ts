/**
 * The sound bank: every effect is synthesised with WebAudio, so there are no
 * audio files to license (see CREDITS.md). Nothing plays until the player has
 * pressed a key or clicked, because browsers refuse audio before a gesture.
 * Sounds only ever follow public fx, so they can't give anything away.
 */

export type SoundName =
  | "putt"
  | "clink"
  | "splash"
  | "crackle"
  | "gunshot"
  | "rattle"
  | "holeOut"
  | "glass"
  | "pop"
  | "boom"
  | "whoosh"
  | "zap"
  | "blip"
  | "emote";

const MUTE_KEY = "troll-golf:muted";
/** Sounds still ringing at once are capped; extra ones are dropped. */
const MAX_VOICES = 14;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let voices = 0;
let muted = readMuted();
const muteListeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The shared context, or null before the first gesture / without WebAudio. */
export function audioContext(): AudioContext | null {
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked: the choice just doesn't survive a reload.
  }
  if (master) master.gain.value = value ? 0 : 0.8;
  for (const listener of muteListeners) listener(value);
}

export function onMuteChange(listener: (muted: boolean) => void): void {
  muteListeners.add(listener);
}

/** Create / resume the context. Called from a user gesture (and safe to call any time). */
function unlock(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/** Start listening for the first gesture. Call once at startup. */
export function installSoundUnlock(): void {
  for (const type of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(type, unlock, { passive: true });
  }
}

/** The sound output for other modules (the siren): the master gain once unlocked. */
export function soundOutput(): { ctx: AudioContext; out: AudioNode } | null {
  return ctx && master ? { ctx, out: master } : null;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

interface Tone {
  at?: number;
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

interface Burst {
  at?: number;
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

function voice(c: AudioContext, end: number): boolean {
  if (voices >= MAX_VOICES) return false;
  voices++;
  setTimeout(() => voices--, Math.max(0, (end - c.currentTime) * 1000) + 50);
  return true;
}

function tone(c: AudioContext, t: Tone): void {
  const start = c.currentTime + (t.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = t.type ?? "sine";
  osc.frequency.setValueAtTime(t.freq, start);
  if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
  const peak = t.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + t.dur + 0.02);
}

function burst(c: AudioContext, b: Burst): void {
  const start = c.currentTime + (b.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = b.filter ?? "lowpass";
  filter.frequency.setValueAtTime(b.freq ?? 2000, start);
  if (b.to) filter.frequency.exponentialRampToValueAtTime(b.to, start + b.dur);
  filter.Q.value = b.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(b.gain ?? 0.3, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + b.dur);
  src.connect(filter).connect(g).connect(master!);
  src.start(start, Math.random() * 0.5);
  src.stop(start + b.dur + 0.02);
}

/** How long each sound rings, for the voice cap. */
const LENGTH: Record<SoundName, number> = {
  putt: 0.15, clink: 0.2, splash: 0.5, crackle: 0.6, gunshot: 0.4, rattle: 0.7, holeOut: 0.8,
  glass: 0.5, pop: 0.2, boom: 1.4, whoosh: 0.4, zap: 0.35, blip: 0.15, emote: 0.3,
};

/** Play a sound. `intensity` (0..1) scales loudness and pitch where it makes sense. Silent before the first gesture. */
export function playSound(name: SoundName, intensity = 0.7): void {
  if (muted || !ctx || !master || ctx.state !== "running") return;
  const c = ctx;
  if (!voice(c, c.currentTime + LENGTH[name])) return;
  const k = Math.min(1, Math.max(0.15, intensity));
  switch (name) {
    case "putt":
      tone(c, { freq: 180 + 120 * k, to: 70, dur: 0.1, gain: 0.25 + 0.3 * k });
      burst(c, { dur: 0.04, freq: 3000, gain: 0.15 * k + 0.05 });
      break;
    case "clink":
      tone(c, { freq: 1500 + Math.random() * 500, dur: 0.12, type: "triangle", gain: 0.06 + 0.2 * k });
      tone(c, { freq: 2300 + Math.random() * 500, dur: 0.08, type: "sine", gain: 0.04 + 0.1 * k });
      break;
    case "splash":
      burst(c, { dur: 0.45, freq: 2500, to: 300, gain: 0.35 });
      tone(c, { freq: 500, to: 160, dur: 0.18, gain: 0.15 });
      break;
    case "crackle":
      for (let i = 0; i < 9; i++) {
        burst(c, { at: Math.random() * 0.45, dur: 0.025, filter: "highpass", freq: 3500 + Math.random() * 3000, gain: 0.25 });
      }
      tone(c, { freq: 2600, to: 1200, dur: 0.3, type: "triangle", gain: 0.06 });
      break;
    case "gunshot":
      burst(c, { dur: 0.3, freq: 5000, to: 200, gain: 0.7 });
      tone(c, { freq: 160, to: 40, dur: 0.25, gain: 0.5 });
      break;
    case "rattle": {
      // A ball circling the rim: clicks that speed up and fade.
      let t = 0;
      for (let i = 0; i < 7; i++) {
        tone(c, { at: t, freq: 900 + Math.random() * 300, dur: 0.05, type: "square", gain: 0.1 * (1 - i / 9) });
        t += 0.2 / (1 + i * 0.5);
      }
      break;
    }
    case "holeOut":
      tone(c, { freq: 140, to: 60, dur: 0.12, gain: 0.4 });
      tone(c, { at: 0.12, freq: 784, dur: 0.25, gain: 0.2 });
      tone(c, { at: 0.24, freq: 1175, dur: 0.4, gain: 0.2 });
      break;
    case "glass":
      for (let i = 0; i < 6; i++) {
        tone(c, { at: i * 0.04, freq: 2500 + Math.random() * 2500, dur: 0.1, type: "triangle", gain: 0.12 });
      }
      burst(c, { dur: 0.2, filter: "highpass", freq: 4000, gain: 0.2 });
      break;
    case "pop":
      tone(c, { freq: 700, to: 200, dur: 0.1, gain: 0.3 });
      break;
    case "boom":
      burst(c, { dur: 1.2, freq: 1500, to: 60, gain: 0.9 });
      tone(c, { freq: 90, to: 25, dur: 1.2, gain: 0.7 });
      break;
    case "whoosh":
      burst(c, { dur: 0.35, filter: "bandpass", freq: 500, to: 3000, gain: 0.25, q: 2 });
      break;
    case "zap":
      tone(c, { freq: 1800, to: 300, dur: 0.3, type: "sawtooth", gain: 0.12 });
      break;
    case "blip":
      tone(c, { freq: 660, to: 880, dur: 0.1, type: "triangle", gain: 0.2 });
      break;
    case "emote":
      tone(c, { freq: 520, to: 780, dur: 0.12, type: "triangle", gain: 0.18 });
      break;
  }
}
