/** Tiny synthesized sound bank — no audio files, everything is WebAudio oscillators and
 *  filtered noise. Browsers block audio until the first user gesture, so the context is
 *  created lazily on the first play() call (which is always a click). */

export type Cue =
  | 'move'
  | 'capture'
  | 'illegal'
  | 'shieldBreak'
  | 'power'
  | 'check'
  | 'promote'
  | 'gameEnd'
  | 'drink'
  | 'select';

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(next: boolean): void {
  muted = next;
}

export function isMuted(): boolean {
  return muted;
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  return buffer;
}

/** Wooden knock: filtered noise burst — the tavern-table thunk of a piece being set down. */
function knock(ac: AudioContext, gain: number, cutoff: number, seconds = 0.09): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, seconds);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  filter.Q.value = 1.6;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, ac.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + seconds);
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start();
}

function tone(
  ac: AudioContext,
  freq: number,
  seconds: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay = 0,
  bendTo?: number,
): void {
  const osc = ac.createOscillator();
  osc.type = type;
  const t0 = ac.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (bendTo) osc.frequency.exponentialRampToValueAtTime(bendTo, t0 + seconds);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.02);
}

export function play(cue: Cue): void {
  const ac = audio();
  if (!ac) return;

  switch (cue) {
    case 'select':
      tone(ac, 660, 0.05, 0.03, 'sine');
      break;
    case 'move':
      knock(ac, 0.32, 900);
      break;
    case 'capture':
      knock(ac, 0.5, 520, 0.14);
      tone(ac, 150, 0.16, 0.09, 'triangle', 0, 90);
      break;
    case 'illegal':
      // Dull denied buzz — low sawtooth double-thud, no melody.
      tone(ac, 92, 0.14, 0.1, 'sawtooth', 0, 66);
      tone(ac, 78, 0.12, 0.07, 'square', 0.09, 58);
      break;
    case 'shieldBreak':
      // Metal cracking: bright noise plus a ringing shard that falls away.
      knock(ac, 0.42, 6500, 0.2);
      tone(ac, 1720, 0.28, 0.07, 'triangle', 0, 640);
      tone(ac, 2480, 0.18, 0.04, 'sine', 0.05, 900);
      break;
    case 'power':
      // Rising arcane shimmer.
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, 0.34, 0.055, 'sine', i * 0.055));
      break;
    case 'promote':
      [392, 523, 659, 880].forEach((f, i) => tone(ac, f, 0.4, 0.06, 'triangle', i * 0.07));
      break;
    case 'check':
      tone(ac, 220, 0.32, 0.09, 'sawtooth', 0, 180);
      tone(ac, 110, 0.4, 0.07, 'sine');
      break;
    case 'drink':
      // A long swallow: filtered noise with a rising gulp underneath.
      knock(ac, 0.26, 700, 0.34);
      tone(ac, 120, 0.2, 0.05, 'sine', 0.05, 190);
      tone(ac, 96, 0.16, 0.04, 'sine', 0.26, 150);
      break;
    case 'gameEnd':
      [330, 262, 196].forEach((f, i) => tone(ac, f, 0.7, 0.08, 'triangle', i * 0.16));
      break;
  }
}
