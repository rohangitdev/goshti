"""Soft instrumental loop (no voice) in E-flat that follows the waiting song until the story is ready.
Seamless: renders one extra cycle and crossfades it into the start."""
import sys

import numpy as np
import soundfile as sf

fs = 22050
rng = np.random.default_rng(11)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
CYCLE = 3.2           # one tanpura round
LOOP = CYCLE * 4      # 12.8 s, four chords
XF = 2.0              # crossfade length


def pluck(f, dur, damp=0.9995, bright=0.35):
    n = int(dur * fs); L = max(2, int(fs / f)); buf = rng.uniform(-1, 1, L)
    for _ in range(2):
        buf[1:] = buf[1:] * bright + buf[:-1] * (1 - bright)
    out = np.zeros(n); i = 0
    for k in range(n):
        j = (i + 1) % L; v = buf[i]; buf[i] = damp * 0.5 * (v + buf[j]); out[k] = v; i = j
    return out


def pad(freqs, dur, a=1.4, r=1.6):
    n = int(dur * fs); t = np.arange(n) / fs; y = np.zeros(n)
    for f in freqs:
        for d in (0.997, 1.003):
            ph = rng.random() * 6.28
            y += np.sin(2 * np.pi * f * d * t + ph) + 0.15 * np.sin(4 * np.pi * f * d * t + ph)
    e = np.clip(np.minimum(t / a, (dur - t) / r), 0, 1)
    return y / (2 * len(freqs)) * e


def add(dst, src, at, g=1.0):
    s = int(at * fs); e = min(len(dst), s + len(src)); dst[s:e] += src[:e - s] * g


total = LOOP + XF + 4.0
y = np.zeros(int(total * fs))
Eb, Bb = 51, 46
t0 = 0.0
while t0 < total - 1:
    for f, off in [(hz(Bb + 12), 0.0), (hz(Eb + 12), 0.8), (hz(Eb + 12), 1.6), (hz(Eb), 2.4)]:
        add(y, pluck(f, 4.0), t0 + off, 0.22)
    t0 += CYCLE
chords = [[Eb + 12, Eb + 16, Eb + 19], [56 + 12, 60 + 12, 63 + 12 - 12], [Bb + 12, Bb + 16, Bb + 19], [Eb + 12, Eb + 16, Eb + 19]]
t0 = 0.0
k = 0
while t0 < total - 1:
    add(y, pad([hz(m) for m in chords[k % 4]], CYCLE + 1.6), t0 - 0.8 if t0 > 0 else 0, 0.5)
    t0 += CYCLE; k += 1
n, x = int(LOOP * fs), int(XF * fs)
out = y[:n].copy()
w = np.linspace(0, 1, x)
out[:x] = y[:x] * w + y[n:n + x] * (1 - w)
out /= np.max(np.abs(out)) / 0.8
sf.write(sys.argv[1] if len(sys.argv) > 1 else 'goshti-waiting-loop.wav', out, fs, subtype='PCM_16')
print(f'{LOOP:.1f}s loop')
