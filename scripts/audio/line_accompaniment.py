"""Accompaniment for a short sung line in ITS OWN key: tanpura drone (Sa–Pa) and an open-fifth pad
on the line's home note (no third, so it suits a free, untempered melody), tuned to the singer's
pitch, with a bell at the start and a soft sparkle at the end."""
import sys
import numpy as np, soundfile as sf, pyworld as pw

src, dst, tonic_pc, cents = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
fs = 44100
rng = np.random.default_rng(5)
hz = lambda m: 440 * 2 ** ((m + cents / 100 - 69) / 12)

def pluck(f, dur, damp=0.9995, bright=0.35):
    n = int(dur * fs); L = max(2, int(fs / f)); buf = rng.uniform(-1, 1, L)
    for _ in range(2): buf[1:] = buf[1:] * bright + buf[:-1] * (1 - bright)
    out = np.zeros(n); i = 0
    for k in range(n):
        j = (i + 1) % L; v = buf[i]; buf[i] = damp * 0.5 * (v + buf[j]); out[k] = v; i = j
    return out

def pad(freqs, dur, a=1.0, r=1.2):
    n = int(dur * fs); t = np.arange(n) / fs; y = np.zeros(n)
    for f in freqs:
        for d in (0.997, 1.003):
            ph = rng.random() * 6.28
            y += np.sin(2 * np.pi * f * d * t + ph) + 0.18 * np.sin(4 * np.pi * f * d * t + ph)
    return y / (2 * len(freqs)) * np.clip(np.minimum(t / a, (dur - t) / r), 0, 1)

def bell(f, dur, decay=0.6):
    n = int(dur * fs); t = np.arange(n) / fs; y = np.zeros(n)
    for ratio, amp in [(1, 1), (2.76, 0.35), (5.4, 0.15)]:
        y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay / ratio ** 0.5)) * np.minimum(1, t / 0.003)
    return y

def add(dst_, src_, at, g=1.0):
    s = int(at * fs); e = min(len(dst_), s + len(src_)); dst_[s:e] += src_[:e - s] * g

voc, vfs = sf.read(src); assert vfs == fs
f0, t = pw.harvest(voc.astype(np.float64), fs, f0_floor=150, f0_ceil=1000, frame_period=10)
v = np.where(f0 > 0)[0]; start, end = t[v[0]], t[v[-1]]
sa = 48 + tonic_pc          # Sa around C3–B3
pa_low = sa - 5             # Pa below
VL = len(voc) / fs; TOTAL = VL + 1.4
music = np.zeros(int(TOTAL * fs))
t0 = 0.0
while t0 < TOTAL - 0.8:
    for m, off in [(pa_low + 12, 0.0), (sa + 12, 0.8), (sa + 12, 1.6), (sa, 2.4)]:
        add(music, pluck(hz(m), 4.0), t0 + off, 0.22)
    t0 += 3.2
add(music, pad([hz(sa + 12), hz(sa + 19), hz(sa + 24)], TOTAL, a=0.8, r=1.2), 0.0, 0.5)
add(music, bell(hz(sa + 31), 1.4), max(0, start - 0.02), 0.12)
for i, m in enumerate([sa + 24, sa + 31, sa + 36]):
    add(music, bell(hz(m), 1.2, 0.5), end + 0.1 + i * 0.12, 0.09)
n = len(music); tt = np.arange(n) / fs
music *= np.clip(np.minimum(tt / 0.4, (TOTAL - tt) / 1.0), 0, 1)
vv = np.zeros(n); vv[:len(voc)] = voc
vv /= np.sqrt(np.mean(vv[np.abs(vv) > 0.01] ** 2)); music /= np.sqrt(np.mean(music ** 2))
mix = vv + music * 10 ** (-13 / 20)
sf.write(dst, mix / np.max(np.abs(mix)) * 0.9, fs)
