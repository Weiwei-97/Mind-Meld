// Lightweight Web Audio synth. No assets, so page loads instantly.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  ensure();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.35;
}

export function isMuted() {
  return muted;
}

function tone(freq: number, dur = 0.22, type: OscillatorType = 'sine', gain = 0.4, detune = 0) {
  const c = ensure();
  if (!c || !master || muted) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  const now = c.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

// Notes for each orb (pentatonic-ish, always harmonious)
const NOTES = [329.63, 392.0, 493.88, 587.33, 659.25, 783.99]; // E4 G4 B4 D5 E5 G5

export function playOrb(index: number) {
  const f = NOTES[index % NOTES.length];
  tone(f, 0.35, 'triangle', 0.45);
  tone(f * 2, 0.25, 'sine', 0.12);
}

export function playError() {
  const c = ensure();
  if (!c || !master || muted) return;
  tone(180, 0.35, 'sawtooth', 0.28);
  setTimeout(() => tone(140, 0.5, 'sawtooth', 0.24), 80);
}

export function playSuccess() {
  const seq = [523.25, 659.25, 783.99, 1046.5];
  seq.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.35), i * 70));
}

export function playCombo() {
  tone(880, 0.12, 'square', 0.2);
  setTimeout(() => tone(1320, 0.15, 'square', 0.18), 60);
}

export function playClick() {
  tone(660, 0.06, 'square', 0.15);
}

export function playStart() {
  const seq = [392, 523.25, 659.25];
  seq.forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.35), i * 90));
}

export function playGameOver() {
  const seq = [440, 392, 349.23, 293.66];
  seq.forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sawtooth', 0.3), i * 140));
}
