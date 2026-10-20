"""GOSHTI waiting song + an ORIGINAL bansuri-style flute part, and a new flute waiting loop.

    python3 scripts/audio/waiting_flute.py song.wav OUT_DIR

song.wav = the current waiting song (Rohan's sung song with its accompaniment, E-flat), mono 44.1 kHz.
Writes OUT_DIR/waiting-song-flute.wav (a 3.2 s flute opening, a reply after line 1, a rising
counter-melody under line 3, a lifting ending) and OUT_DIR/waiting-loop-flute.wav (8 bars,
I–IV–V–I twice, seamless). Every melody here is written for GOSHTI — nothing is taken from
existing music.
"""
import sys

import numpy as np
import soundfile as sf

from flute import FS, midi as M, render

rng = np.random.default_rng(11)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
Eb, Bb, Ab = 51, 46, 56  # Eb3, Bb2, Ab3
BEAT = 0.8               # one tanpura stroke; 4 beats = one 3.2 s cycle


def pluck(f, dur, damp=0.9995, bright=0.35):
    n = int(dur * FS); L = max(2, int(FS / f)); buf = rng.uniform(-1, 1, L)
    for _ in range(2):
        buf[1:] = buf[1:] * bright + buf[:-1] * (1 - bright)
    out = np.zeros(n); i = 0
    for k in range(n):
        j = (i + 1) % L; v = buf[i]; buf[i] = damp * 0.5 * (v + buf[j]); out[k] = v; i = j
    return out


def pad(freqs, dur, a=1.2, r=1.5):
    n = int(dur * FS); t = np.arange(n) / FS; y = np.zeros(n)
    for f in freqs:
        for d in (0.997, 1.003):
            ph = rng.random() * 6.28
            y += np.sin(2 * np.pi * f * d * t + ph) + 0.15 * np.sin(4 * np.pi * f * d * t + ph)
    return y / (2 * len(freqs)) * np.clip(np.minimum(t / a, (dur - t) / r), 0, 1)


def add(dst, src, at, g=1.0):
    s = int(at * FS); e = min(len(dst), s + len(src)); dst[s:e] += src[:e - s] * g


def tanpura(dst, start, end):
    t0 = start
    while t0 < end:
        for m, off in [(Bb + 12, 0.0), (Eb + 12, 0.8), (Eb + 12, 1.6), (Eb, 2.4)]:
            add(dst, pluck(hz(m), 4.0), t0 + off, 0.22)
        t0 += 4 * BEAT


def rms(x):
    x = x[np.abs(x) > 1e-4]
    return np.sqrt(np.mean(x ** 2)) if len(x) else 1.0


n = lambda name, beats, *how: (M(name), beats, *how)

# ---------------------------------------------------------------------------------------------
# 1. The song with flute
# ---------------------------------------------------------------------------------------------
INTRO = 4 * BEAT  # 3.2 s
song, fs = sf.read(sys.argv[1])
assert fs == FS
if song.ndim > 1:
    song = song.mean(axis=1)
total = INTRO + len(song) / FS + 1.0
mix = np.zeros(int(total * FS))
add(mix, song, INTRO)

# a quiet bed under the opening, fading as the song's own music comes in
bed = np.zeros(int((INTRO + 1.6) * FS))
tanpura(bed, 0.0, INTRO)
add(bed, pad([hz(m) for m in (Eb + 12, Eb + 16, Eb + 19)], INTRO + 1.4, a=1.0, r=1.2), 0.0, 0.5)
fade = np.clip((INTRO + 1.2 - np.arange(len(bed)) / FS) / 1.2, 0, 1)
bed *= fade
vocal_level = rms(song)
add(mix, bed / rms(bed) * vocal_level * 10 ** (-10 / 20), 0.0)

# flute phrases: (time in the SONG, notes, beat length, loudness vs the singing in dB)
parts = [
    # opening, before the first line; slides down to Eb and holds it until the girl starts singing
    (-INTRO + 0.15, [n('G5', 1), n('Bb5', 0.5), n('Ab5', 0.5), n('G5', 1), n('Eb5', 1.3, 'slide')], BEAT, -4),
    # a small reply after line 1, landing on F as the chord moves to B-flat
    (4.6, [n('Bb5', 0.25), n('Ab5', 0.2), n('G5', 0.2), n('F5', 0.6, 'slide')], 1.0, -7),
    # line 3: a slow rising counter-melody above the held G, then a run down into line 4
    (10.25, [n('Eb5', 0.8), n('F5', 0.4), n('G5', 0.8), n('Bb5', 0.8, 'slide'), n('C6', 0.9), n('Bb5', 0.55),
             n('G5', 0.2), n('F5', 0.2), n('Eb5', 0.2), n('D5', 0.7, 'slide')], 1.0, -9),
    # the ending lifts: up to the high Eb and rests there
    (20.55, [n('G5', 0.4), n('Bb5', 0.4), n('Eb6', 1.9, 'slide')], 1.0, -5),
]
for i, (at, notes, beat, db) in enumerate(parts):
    f = render(notes, beat=beat, seed=20 + i)
    add(mix, f / rms(f) * vocal_level * 10 ** (db / 20), INTRO + at)

mix /= np.max(np.abs(mix)) / 0.9
out_dir = sys.argv[2]
sf.write(f'{out_dir}/waiting-song-flute.wav', mix, FS)
print(f'song with flute: {len(mix) / FS:.1f}s')

# ---------------------------------------------------------------------------------------------
# 2. The waiting loop: tanpura + chords (Eb | Ab | Bb | Eb, twice) + an 8-bar flute melody
# ---------------------------------------------------------------------------------------------
BAR = 4 * BEAT
LOOP = 8 * BAR  # 25.6 s
XF = 2.0
melody = [
    # bars 1–4: rise, answer, fall home — then a breath
    n('Eb5', .5), n('G5', .5), n('Bb5', 1), n('Ab5', .5), n('G5', .5), n('F5', .5), n('G5', .5),
    n('Ab5', .5), n('C6', .5), n('Eb6', 1.5, 'slide'), n('D6', .5), n('C6', 1),
    n('Bb5', 1.5), n('Ab5', .5), n('G5', .5), n('F5', .5), n('D5', 1),
    n('Eb5', 2.5, 'slide'), (None, 1.5),
    # bars 5–8: the same idea, a little higher, ending softly at home
    n('G5', .5), n('Bb5', .5), n('C6', 1, 'slide'), n('Bb5', .5), n('G5', .5), n('Bb5', 1),
    n('C6', 1), n('Ab5', .5), n('Bb5', .5), n('C6', .5), n('Eb6', 1.5, 'slide'),
    n('D6', 1), n('C6', .5), n('Bb5', .5), n('Ab5', .5), n('F5', .5), n('G5', .5), n('Ab5', .5),
    n('G5', 1), n('F5', .5), n('Eb5', 1.5, 'slide'), (None, 1),
]
assert abs(sum(x[1] for x in melody) - 32) < 1e-9, 'melody must fill 8 bars'

length = LOOP + XF + 4.0
y = np.zeros(int(length * FS))
tanpura(y, 0.0, length - 1)
chords = [[Eb + 12, Eb + 16, Eb + 19], [Ab + 12, Ab + 16, Ab + 7], [Bb + 12, Bb + 16, Bb + 19], [Eb + 12, Eb + 16, Eb + 19]]
k, t0 = 0, 0.0
while t0 < length - 1:
    add(y, pad([hz(m) for m in chords[k % 4]], BAR + 1.6), t0 - 0.8 if t0 > 0 else 0, 0.5)
    t0 += BAR; k += 1
bed_level = rms(y)
flute = render(melody, beat=BEAT, seed=7)
for start in (0.0, LOOP):  # second copy so the loop point crossfades into the same notes
    add(y, flute / rms(flute) * bed_level * 10 ** (4 / 20), start)

N, X = int(LOOP * FS), int(XF * FS)
loop = y[:N].copy()
w = np.linspace(0, 1, X)
loop[:X] = y[:X] * w + y[N:N + X] * (1 - w)
loop /= np.max(np.abs(loop)) / 0.8
sf.write(f'{out_dir}/waiting-loop-flute.wav', loop, FS, subtype='PCM_16')
print(f'flute loop: {LOOP:.1f}s')
