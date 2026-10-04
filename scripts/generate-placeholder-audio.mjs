#!/usr/bin/env node
/**
 * Generates GOSHTI's PLACEHOLDER sounds from code (no samples, no downloads):
 *   assets/audio/{ui,signature,sfx,ambience,music}/*.wav
 *
 * Every sound here is synthesized from scratch (sine tones, plucked strings, filtered noise),
 * so it is original and free of third-party rights. They are stand-ins: replace them with
 * professionally designed / properly licensed audio before launch, keeping the same file names.
 *
 *   node scripts/generate-placeholder-audio.mjs
 *
 * Output is deterministic (seeded random), so re-running produces identical files.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');

// ---------------------------------------------------------------------------
// DSP helpers
// ---------------------------------------------------------------------------

let seed = 20261005;
function rand() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rand() * 2 - 1;
const TAU = Math.PI * 2;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

function buffer(sr, seconds) {
  return new Float32Array(Math.ceil(sr * seconds));
}

/** RBJ biquad, applied in place. */
function biquad(buf, sr, type, freq, q = 0.707) {
  const w = (TAU * freq) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha]; // bandpass (constant peak gain)
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

/** Adds `src` into `dst` at time `at` (seconds) with gain. */
function mix(dst, sr, src, at = 0, gain = 1) {
  const start = Math.round(at * sr);
  for (let i = 0; i < src.length && start + i < dst.length; i++) if (start + i >= 0) dst[start + i] += src[i] * gain;
  return dst;
}

function tone(sr, freq, seconds, { attack = 0.005, decay = 0.3, vibrato = 0, type = 'sine' } = {}) {
  const out = buffer(sr, seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = freq * (1 + vibrato * Math.sin(TAU * 5 * t));
    phase += (TAU * f) / sr;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    const s = type === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
    out[i] = s * env;
  }
  return out;
}

/** Soft bell: inharmonic partials with exponential decay. */
function bell(sr, freq, seconds, decay = 0.6) {
  const out = buffer(sr, seconds);
  const partials = [[1, 1], [2.76, 0.4], [5.4, 0.2], [8.93, 0.08]];
  for (const [ratio, amp] of partials) mix(out, sr, tone(sr, freq * ratio, seconds, { attack: 0.002, decay: decay / ratio ** 0.5 }), 0, amp);
  return out;
}

/** Karplus–Strong plucked string — a warm, santoor-like tone. */
function pluck(sr, freq, seconds, { damping = 0.996, bright = 0.5 } = {}) {
  const out = buffer(sr, seconds);
  const n = Math.max(2, Math.round(sr / freq));
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = noise();
  // soften the excitation
  for (let k = 0; k < 2; k++) for (let i = 1; i < n; i++) line[i] = line[i] * bright + line[i - 1] * (1 - bright);
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const next = (idx + 1) % n;
    const v = line[idx];
    line[idx] = damping * 0.5 * (v + line[next]);
    out[i] = v;
    idx = next;
  }
  return out;
}

/** Slow-attack pad from a few detuned sines. */
function pad(sr, freqs, seconds, { attack = 0.8, release = 1.2 } = {}) {
  const out = buffer(sr, seconds);
  for (const f of freqs) {
    for (const d of [0.998, 1.002]) {
      let phase = rand() * TAU;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        phase += (TAU * f * d) / sr;
        const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release);
        out[i] += Math.sin(phase) * Math.max(0, env) * 0.25;
      }
    }
  }
  return out;
}

function noiseBurst(sr, seconds, { attack = 0.002, decay = 0.05, filter, freq = 1000, q = 0.7 } = {}) {
  const out = buffer(sr, seconds);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] = noise() * Math.min(1, t / attack) * Math.exp(-t / decay);
  }
  if (filter) biquad(out, sr, filter, freq, q);
  return out;
}

function chirp(sr, from, to, seconds) {
  const out = buffer(sr, seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = from + (to - from) * (t / seconds);
    phase += (TAU * f) / sr;
    out[i] = Math.sin(phase) * Math.sin((Math.PI * t) / seconds);
  }
  return out;
}

function filteredNoise(sr, seconds, steps) {
  const out = buffer(sr, seconds);
  for (let i = 0; i < out.length; i++) out[i] = noise();
  for (const [type, f, q] of steps) biquad(out, sr, type, f, q);
  return out;
}

function shape(buf, sr, fn) {
  for (let i = 0; i < buf.length; i++) buf[i] *= fn(i / sr);
  return buf;
}

/** Makes a seamless loop: renders `seconds + xfade`, then crossfades the tail into the head. */
function makeLoop(sr, seconds, xfade, render) {
  const full = render(seconds + xfade);
  const out = full.slice(0, Math.round(seconds * sr));
  const n = Math.round(xfade * sr);
  const L = out.length;
  for (let i = 0; i < n; i++) {
    const a = i / n;
    out[i] = full[i] * a + full[L + i] * (1 - a);
  }
  return out;
}

function normalise(buf, peak) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? peak / max : 0;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

function edgeFade(buf, sr, inS = 0.004, outS = 0.03) {
  const a = Math.round(inS * sr);
  const b = Math.round(outS * sr);
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < buf.length; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

function writeWav(rel, sr, buf, peak = 0.7, { loop = false } = {}) {
  normalise(buf, peak);
  if (!loop) edgeFade(buf, sr);
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(sr, 24);
  head.writeUInt32LE(sr * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([head, data]));
  console.log(`${rel.padEnd(36)} ${(buf.length / sr).toFixed(2)} s  ${Math.round((44 + data.length) / 1024)} KB`);
}

// ---------------------------------------------------------------------------
// UI sounds (short, soft, never startling)
// ---------------------------------------------------------------------------

const UI = 22050;
{
  const b = buffer(UI, 0.18);
  mix(b, UI, noiseBurst(UI, 0.08, { decay: 0.012, filter: 'bandpass', freq: 1300, q: 6 }), 0, 0.8);
  mix(b, UI, tone(UI, 784, 0.18, { decay: 0.05 }), 0, 0.5);
  writeWav('ui/category-selected.wav', UI, b, 0.45);
}
{
  const b = buffer(UI, 0.8);
  [88, 91, 93, 96, 100].forEach((n, i) => mix(b, UI, bell(UI, note(n), 0.5, 0.18), i * 0.06, 1 - i * 0.12));
  writeWav('ui/aaji-chooses-story.wav', UI, b, 0.4);
}
{
  const b = buffer(UI, 1.3);
  mix(b, UI, pad(UI, [note(50), note(57)], 1.3, { attack: 0.2, release: 0.6 }), 0, 0.5);
  [62, 66, 69].forEach((n, i) => mix(b, UI, pluck(UI, note(n), 1.1 - i * 0.15), i * 0.16, 0.8));
  writeWav('ui/story-ready.wav', UI, b, 0.5);
}
{
  const b = bell(UI, note(91), 0.8, 0.35);
  writeWav('ui/favourite-saved.wav', UI, b, 0.4);
}
{
  const b = buffer(UI, 1.8);
  [69, 66, 62].forEach((n, i) => mix(b, UI, pluck(UI, note(n), 1.2), i * 0.22, 0.8));
  mix(b, UI, pad(UI, [note(50), note(54), note(57)], 1.6, { attack: 0.4, release: 0.9 }), 0.4, 0.6);
  writeWav('ui/story-complete.wav', UI, b, 0.5);
}
{
  const b = buffer(UI, 0.36);
  mix(b, UI, tone(UI, 392, 0.16, { attack: 0.01, decay: 0.08 }), 0, 1);
  mix(b, UI, tone(UI, 330, 0.2, { attack: 0.01, decay: 0.1 }), 0.14, 1);
  writeWav('ui/button-error.wav', UI, b, 0.3);
}

// ---------------------------------------------------------------------------
// GOSHTI signature (original 2.6 s placeholder motif)
// ---------------------------------------------------------------------------
{
  const b = buffer(UI, 2.7);
  mix(b, UI, pad(UI, [note(50), note(57)], 2.7, { attack: 0.6, release: 1.0 }), 0, 0.7);
  const melody = [[62, 0.0], [64, 0.18], [66, 0.36], [69, 0.54], [71, 0.9], [69, 1.08], [74, 1.3]];
  for (const [n, at] of melody) mix(b, UI, pluck(UI, note(n), 1.4, { damping: 0.997 }), at, 0.7);
  mix(b, UI, bell(UI, note(86), 1.2, 0.5), 1.32, 0.25);
  writeWav('signature/goshti-signature.wav', UI, b, 0.6);
}

// ---------------------------------------------------------------------------
// One-shot SFX (approved ids only; animals, laughter etc. need real licensed recordings)
// ---------------------------------------------------------------------------

const FX = 22050;
const sfx = {
  MAGIC_SPARKLE() {
    const b = buffer(FX, 1.3);
    for (let i = 0; i < 12; i++) mix(b, FX, bell(FX, 2000 + rand() * 3500, 0.5, 0.15), i * 0.07, 1 - i * 0.06);
    mix(b, FX, shape(filteredNoise(FX, 1.3, [['highpass', 6000, 0.7]]), FX, (t) => 0.15 * Math.exp(-t / 0.5)), 0);
    return b;
  },
  BELL: () => bell(FX, note(76), 2.2, 0.9),
  CLOCK_TICK() {
    const b = buffer(FX, 2.0);
    for (let i = 0; i < 4; i++) mix(b, FX, noiseBurst(FX, 0.03, { decay: 0.004, filter: 'bandpass', freq: i % 2 ? 1700 : 2200, q: 8 }), i * 0.5);
    return b;
  },
  DOOR_KNOCK() {
    const b = buffer(FX, 0.8);
    for (const at of [0, 0.2, 0.4]) {
      mix(b, FX, noiseBurst(FX, 0.12, { decay: 0.025, filter: 'lowpass', freq: 500 }), at, 1);
      mix(b, FX, tone(FX, 150, 0.12, { decay: 0.03 }), at, 0.6);
    }
    return b;
  },
  FOOTSTEPS: () => steps(4, 0.45),
  FOOTSTEPS_RUNNING: () => steps(8, 0.2),
  WHOOSH_SOFT() {
    const d = 0.9;
    const b = filteredNoise(FX, d, []);
    const out = buffer(FX, d);
    // moving band: render 3 bands and crossfade along the sweep
    const bands = [400, 1200, 2400].map((f) => biquad(b.slice(), FX, 'bandpass', f, 1.2));
    for (let i = 0; i < out.length; i++) {
      const t = i / FX / d;
      const pos = Math.sin(Math.PI * t) * 2; // 0 → 2 → 0
      const lo = Math.floor(Math.min(1.999, pos));
      const frac = Math.min(1.999, pos) - lo;
      out[i] = (bands[lo][i] * (1 - frac) + bands[lo + 1][i] * frac) * Math.sin(Math.PI * t) ** 2;
    }
    return out;
  },
  OBJECT_DROP() {
    const b = buffer(FX, 0.6);
    for (const [at, g] of [[0, 1], [0.22, 0.4], [0.34, 0.15]]) {
      mix(b, FX, tone(FX, 110, 0.2, { decay: 0.05 }), at, g);
      mix(b, FX, noiseBurst(FX, 0.1, { decay: 0.02, filter: 'lowpass', freq: 900 }), at, g * 0.7);
    }
    return b;
  },
  SPLASH() {
    const b = buffer(FX, 1.0);
    mix(b, FX, noiseBurst(FX, 0.8, { attack: 0.005, decay: 0.18, filter: 'highpass', freq: 600 }), 0, 1);
    for (let i = 0; i < 8; i++) mix(b, FX, chirp(FX, 500 + rand() * 400, 1100 + rand() * 600, 0.04), 0.1 + rand() * 0.6, 0.25);
    return b;
  },
  CLAP() {
    const b = buffer(FX, 1.3);
    for (let i = 0; i < 4; i++) mix(b, FX, noiseBurst(FX, 0.1, { decay: 0.018, filter: 'bandpass', freq: 1400, q: 1.2 }), i * 0.32);
    return b;
  },
  BRANCH_SNAP() {
    const b = buffer(FX, 0.5);
    mix(b, FX, noiseBurst(FX, 0.06, { decay: 0.008, filter: 'bandpass', freq: 2600, q: 2 }), 0, 1);
    for (let i = 0; i < 5; i++) mix(b, FX, noiseBurst(FX, 0.03, { decay: 0.004, filter: 'bandpass', freq: 1800 + rand() * 1500, q: 3 }), 0.03 + rand() * 0.2, 0.4);
    return b;
  },
  THUNDER_GENTLE() {
    const d = 3.0;
    const b = filteredNoise(FX, d, [['lowpass', 160, 0.7], ['lowpass', 220, 0.7]]);
    return shape(b, FX, (t) => Math.min(1, t / 0.4) * Math.exp(-t / 1.1) * (0.8 + 0.2 * Math.sin(TAU * 3 * t)));
  },
  WIND() {
    const d = 3.2;
    const b = filteredNoise(FX, d, [['bandpass', 500, 0.6], ['lowpass', 1200, 0.7]]);
    return shape(b, FX, (t) => Math.sin((Math.PI * t) / d) * (0.7 + 0.3 * Math.sin(TAU * 0.6 * t)));
  },
  BIRDS() {
    const b = buffer(FX, 2.2);
    let at = 0.05;
    for (let g = 0; g < 4; g++) {
      for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
        mix(b, FX, chirp(FX, 2800 + rand() * 600, 4200 + rand() * 800, 0.06), at, 0.8);
        at += 0.09;
      }
      at += 0.25 + rand() * 0.2;
    }
    return b;
  },
  OWL() {
    const b = buffer(FX, 2.0);
    for (const [at, len] of [[0, 0.45], [0.75, 0.25], [1.1, 0.6]]) {
      mix(b, FX, tone(FX, 380, len + 0.2, { attack: 0.08, decay: len, vibrato: 0.01 }), at, 1);
      mix(b, FX, noiseBurst(FX, len, { attack: 0.08, decay: len, filter: 'bandpass', freq: 380, q: 4 }), at, 0.3);
    }
    return b;
  },
  TRAIN() {
    const d = 2.6;
    const b = buffer(FX, d);
    for (let i = 0; i * 0.16 < d - 0.2; i++) mix(b, FX, noiseBurst(FX, 0.14, { decay: 0.04, filter: 'bandpass', freq: 700, q: 0.8 }), i * 0.16, i % 4 === 0 ? 1 : 0.55);
    const whistle = buffer(FX, 0.9);
    mix(whistle, FX, tone(FX, 620, 0.9, { attack: 0.05, decay: 2 }), 0, 0.5);
    mix(whistle, FX, tone(FX, 780, 0.9, { attack: 0.05, decay: 2 }), 0, 0.4);
    shape(whistle, FX, (t) => Math.min(1, (0.9 - t) / 0.2));
    mix(b, FX, whistle, 1.4, 0.6);
    return b;
  },
  DOOR_OPEN() {
    // creak: an irregular low-rate pulse train through a resonant band
    const d = 1.4;
    const b = buffer(FX, d);
    let next = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / FX;
      if (i >= next) {
        b[i] = 1;
        const rate = 35 + 25 * Math.sin(TAU * 0.7 * t) + rand() * 6;
        next = i + Math.round(FX / rate);
      }
    }
    biquad(b, FX, 'bandpass', 1100, 6);
    biquad(b, FX, 'bandpass', 700, 3);
    return shape(b, FX, (t) => Math.sin((Math.PI * t) / d));
  },
};

function steps(n, gap) {
  const b = buffer(FX, n * gap + 0.2);
  for (let i = 0; i < n; i++) {
    mix(b, FX, noiseBurst(FX, 0.12, { decay: 0.03, filter: 'lowpass', freq: 450 }), i * gap, 1);
    mix(b, FX, noiseBurst(FX, 0.06, { decay: 0.01, filter: 'bandpass', freq: 2200, q: 1 }), i * gap + 0.01, 0.2);
  }
  return b;
}

for (const [id, render] of Object.entries(sfx)) writeWav(`sfx/${id.toLowerCase()}.wav`, FX, render(), 0.7);

// ---------------------------------------------------------------------------
// Ambience beds (seamless loops; mixed very low under narration)
// ---------------------------------------------------------------------------

const AMB = 16000;
const LOOP = 6;
const XF = 1;
const ambience = {
  FOREST_AMBIENCE: (d) => {
    const b = filteredNoise(AMB, d, [['lowpass', 1400, 0.7]]);
    shape(b, AMB, (t) => 0.25 * (0.8 + 0.2 * Math.sin(TAU * 0.3 * t)));
    for (const at of [0.8, 2.6, 4.1]) mix(b, AMB, chirp(AMB, 3000, 4300, 0.07), at, 0.35), mix(b, AMB, chirp(AMB, 3200, 4500, 0.06), at + 0.1, 0.3);
    return b;
  },
  NIGHT_AMBIENCE: (d) => {
    const b = shape(filteredNoise(AMB, d, [['lowpass', 500, 0.7]]), AMB, () => 0.12);
    for (const [f, offset, period] of [[4200, 0, 0.62], [3900, 0.31, 0.75]]) {
      for (let at = offset; at < d; at += period) {
        const c = shape(tone(AMB, f, 0.16, { attack: 0.01, decay: 1 }), AMB, (t) => 0.5 + 0.5 * Math.sin(TAU * 32 * t));
        mix(b, AMB, c, at, 0.25);
      }
    }
    return b;
  },
  VILLAGE_AMBIENCE: (d) => {
    const b = filteredNoise(AMB, d, [['lowpass', 800, 0.7]]);
    shape(b, AMB, (t) => 0.3 * (0.75 + 0.25 * Math.sin(TAU * 0.17 * t)));
    for (const at of [0.5, 1.9, 3.7, 5.2]) mix(b, AMB, chirp(AMB, 2600 + rand() * 500, 3600 + rand() * 600, 0.08), at, 0.3);
    return b;
  },
  CITY_AMBIENCE: (d) => {
    const b = filteredNoise(AMB, d, [['lowpass', 220, 0.7]]);
    mix(b, AMB, shape(filteredNoise(AMB, d, [['bandpass', 500, 0.8]]), AMB, (t) => 0.3 + 0.2 * Math.sin(TAU * 0.25 * t)), 0, 0.6);
    const horn = buffer(AMB, 0.35);
    mix(horn, AMB, tone(AMB, 440, 0.35, { attack: 0.03, decay: 1 }), 0, 0.5);
    mix(horn, AMB, tone(AMB, 554, 0.35, { attack: 0.03, decay: 1 }), 0, 0.4);
    mix(b, AMB, shape(horn, AMB, (t) => Math.min(1, (0.35 - t) / 0.1)), 3.2, 0.08);
    return b;
  },
  RAIN_LIGHT: (d) => {
    const b = shape(filteredNoise(AMB, d, [['highpass', 900, 0.7], ['lowpass', 5500, 0.7]]), AMB, () => 0.35);
    for (let i = 0; i < d * 25; i++) mix(b, AMB, noiseBurst(AMB, 0.015, { decay: 0.003, filter: 'bandpass', freq: 2000 + rand() * 2500, q: 4 }), rand() * d, 0.4);
    return b;
  },
  WAVES: (d) => {
    // swell period = loop length so the loop stays seamless
    const b = filteredNoise(AMB, d, [['lowpass', 900, 0.7]]);
    shape(b, AMB, (t) => 0.15 + 0.85 * Math.sin((Math.PI * t) / (LOOP / 1)) ** 2);
    mix(b, AMB, shape(filteredNoise(AMB, d, [['highpass', 2500, 0.7]]), AMB, (t) => 0.15 * Math.max(0, Math.sin((Math.PI * t) / LOOP)) ** 6), 0);
    return b;
  },
  WATER_STREAM: (d) => {
    const b = filteredNoise(AMB, d, [['bandpass', 1500, 0.7]]);
    shape(b, AMB, (t) => 0.6 + 0.15 * Math.sin(TAU * 3.1 * t) + 0.1 * Math.sin(TAU * 5.3 * t) + 0.1 * Math.sin(TAU * 8.7 * t));
    for (let i = 0; i < d * 6; i++) mix(b, AMB, chirp(AMB, 700 + rand() * 500, 1300 + rand() * 600, 0.03), rand() * d, 0.3);
    return b;
  },
};

for (const [id, render] of Object.entries(ambience)) {
  writeWav(`ambience/${id.toLowerCase()}.wav`, AMB, makeLoop(AMB, LOOP, XF, render), 0.6, { loop: true });
}

// ---------------------------------------------------------------------------
// Music moods (short, quiet, occasional — never a constant bed)
// ---------------------------------------------------------------------------

const MUS = 16000;
function phrase(seconds, { notes, step, padNotes, damping = 0.997, drum = 0, shimmer = false, tremolo = 0 }) {
  const b = buffer(MUS, seconds);
  mix(b, MUS, pad(MUS, padNotes.map(note), seconds, { attack: 1.0, release: 2.0 }), 0, 0.6);
  notes.forEach((n, i) => {
    if (n != null) mix(b, MUS, pluck(MUS, note(n), Math.min(2.5, seconds - i * step), { damping }), 0.3 + i * step, 0.7);
  });
  if (drum) for (let at = 0.3; at < seconds - 1; at += drum) mix(b, MUS, tone(MUS, 70, 0.3, { decay: 0.08 }), at, 0.5);
  if (shimmer) notes.forEach((n, i) => n != null && i % 2 === 0 && mix(b, MUS, bell(MUS, note(n + 24), 0.6, 0.25), 0.3 + i * step, 0.12));
  if (tremolo) shape(b, MUS, (t) => 1 - tremolo + tremolo * Math.sin(TAU * 0.8 * t));
  return shape(b, MUS, (t) => Math.min(1, (seconds - t) / 1.5));
}

const music = {
  GENTLE: () => phrase(7, { notes: [62, 66, 69, 71, 69, 66, 64, 62], step: 0.55, padNotes: [50, 57] }),
  PLAYFUL: () => phrase(6, { notes: [67, 71, 74, 71, 76, 74, 71, null, 67, 69, 71, 74], step: 0.22, padNotes: [55, 62], damping: 0.99, drum: 0.44 }),
  ADVENTURE: () => phrase(6.5, { notes: [50, 57, 62, 64, 65, 67, 69, 72, 74], step: 0.3, padNotes: [38, 45, 50], drum: 0.3 }),
  MYSTERY: () => phrase(7, { notes: [57, null, 60, 64, null, 63, null, 57], step: 0.7, padNotes: [45, 52], tremolo: 0.25 }),
  MAGICAL: () => phrase(6, { notes: [76, 80, 83, 88, 83, 80, 76, 80, 83, 88], step: 0.18, padNotes: [52, 59, 64], shimmer: true }),
  EMOTIONAL: () => phrase(7.5, { notes: [62, 65, 67, 69, 67, 65, 62], step: 0.85, padNotes: [50, 53, 57] }),
  VICTORY: () => phrase(4.5, { notes: [62, 66, 69, 74, null, 74], step: 0.2, padNotes: [50, 54, 57, 62] }),
  BEDTIME: () => phrase(8, { notes: [57, 62, 61, 57, null, 55, 57, 54, 50], step: 0.7, padNotes: [45, 50], damping: 0.998 }),
};

for (const [mood, render] of Object.entries(music)) writeWav(`music/${mood.toLowerCase()}.wav`, MUS, render(), 0.6);
