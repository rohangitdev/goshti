"""Soft accompaniment (tanpura-style drone, chord pads, bells) in E-flat, timed to the waiting song."""
import numpy as np, soundfile as sf
rng = np.random.default_rng(7)
fs = 44100
import sys
voc, vfs = sf.read(sys.argv[1]); assert vfs == fs
VL = len(voc) / fs
TOTAL = VL + 1.8
N = int(TOTAL * fs)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
def env_ar(n, a, r):
    t = np.arange(n) / fs; e = np.minimum(1, t / a) * np.minimum(1, (n / fs - t) / r); return np.clip(e, 0, 1)
def pad(freqs, dur, a=1.2, r=1.5, lvl=1.0):
    n = int(dur * fs); t = np.arange(n) / fs; y = np.zeros(n)
    for f in freqs:
        for d in (0.997, 1.003):
            ph = rng.random() * 6.28
            y += np.sin(2 * np.pi * f * d * t + ph) + 0.18 * np.sin(4 * np.pi * f * d * t + ph)
    return y / (2 * len(freqs)) * env_ar(n, a, r) * lvl
def pluck(f, dur, damp=0.998, bright=0.5):
    n = int(dur * fs); L = max(2, int(fs / f)); buf = rng.uniform(-1, 1, L)
    for _ in range(2): buf[1:] = buf[1:] * bright + buf[:-1] * (1 - bright)
    out = np.zeros(n); i = 0
    for k in range(n):
        j = (i + 1) % L; v = buf[i]; buf[i] = damp * 0.5 * (v + buf[j]); out[k] = v; i = j
    return out
def bell(f, dur, decay=0.8):
    n = int(dur * fs); t = np.arange(n) / fs; y = np.zeros(n)
    for ratio, amp in [(1, 1), (2.76, 0.35), (5.4, 0.15)]:
        y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay / ratio ** 0.5)) * np.minimum(1, t / 0.003)
    return y
def add(dst, src, at, g=1.0):
    s = int(at * fs); e = min(len(dst), s + len(src)); dst[s:e] += src[:e - s] * g

music = np.zeros(N)
Eb, Bb = 51, 46  # Eb3, Bb2 — Sa and low Pa
# tanpura-style drone: Pa Sa Sa Sa(low), repeating ~every 3.2 s, soft and long
cycle = [(hz(Bb + 12), 0.0), (hz(Eb + 12), 0.8), (hz(Eb + 12), 1.6), (hz(Eb), 2.4)]
t0 = 0.0
while t0 < TOTAL - 1.0:
    for f, off in cycle:
        add(music, pluck(f, 4.0, damp=0.9995, bright=0.35), t0 + off, 0.22)
    t0 += 3.2
# soft chord pads following the sung phrases: Eb | Bb | Eb | Bb → Eb (end)
chords = [(0.0, 5.4, [Eb + 12, Eb + 16, Eb + 19]), (5.2, 5.2, [Bb + 12, Bb + 16, Bb + 19]),
          (10.1, 5.0, [Eb + 12, Eb + 16, Eb + 19]), (14.8, VL - 14.8 + 0.3, [Bb + 12, Bb + 16, Bb + 19]),
          (VL - 0.4, 2.2, [Eb + 12, Eb + 16, Eb + 19, Eb + 24])]
for at, dur, notes in chords:
    add(music, pad([hz(m) for m in notes], dur, a=0.9, r=1.2), at, 0.55)
# small bells at each phrase start and a closing sparkle
for at, m in [(0.05, 82), (5.25, 77), (10.15, 82), (14.85, 77)]:
    add(music, bell(hz(m), 1.5, 0.6), at, 0.12)
for i, m in enumerate([75, 79, 82, 87]):
    add(music, bell(hz(m), 1.4, 0.5), VL + 0.05 + i * 0.12, 0.10)
# fade the whole bed in/out
music *= env_ar(N, 0.6, 1.2)

v = np.zeros(N); v[:len(voc)] = voc
v /= np.sqrt(np.mean(v[np.abs(v) > 0.01] ** 2))
music /= np.sqrt(np.mean(music ** 2))
mix = v + music * 10 ** (-13 / 20)   # music sits ~13 dB under the singing
mix /= np.max(np.abs(mix)) / 0.9
sf.write(sys.argv[2], mix, fs)
print(f'{TOTAL:.1f}s written')
