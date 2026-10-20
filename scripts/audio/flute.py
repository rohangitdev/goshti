"""A soft bansuri-style flute, synthesised from scratch (no samples, no recordings).

Breathy, hollow tone; vibrato that grows on long notes; a slide (meend) between notes where asked,
a soft finger-change dip elsewhere; air at the start of each breath; a small room.
Used for GOSHTI's original waiting-song flute part (scripts/audio/waiting_flute.py).

A part is a list of notes: (midi, beats) or (midi, beats, 'slide'). midi None = a breath (rest).
"""
import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

FS = 44100


def _band(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype='band', fs=FS, output='sos'), x)


def _low(x, hi):
    return sosfilt(butter(2, hi, btype='low', fs=FS, output='sos'), x)


def _smooth_gate(gate, attack=0.035, release=0.11):
    """Breath envelope from an on/off gate: quick to speak, gentle to fade."""
    a, r = np.exp(-1 / (attack * FS)), np.exp(-1 / (release * FS))
    out = np.empty_like(gate)
    y = 0.0
    for i, g in enumerate(gate):
        k = a if g > y else r
        y = k * y + (1 - k) * g
        out[i] = y
    return out


def render(notes, beat=0.8, level=1.0, seed=3, room=0.24, tail=1.6):
    """Renders a flute part → mono float array at FS (length = notes + tail)."""
    rng = np.random.default_rng(seed)

    # --- timeline -------------------------------------------------------------------------
    events, t = [], 0.0
    for n in notes:
        midi, beats = n[0], n[1]
        events.append((midi, t, beats * beat, len(n) > 2 and n[2] == 'slide'))
        t += beats * beat
    N = int((t + tail) * FS)
    tt = np.arange(N) / FS

    pitch = np.full(N, np.nan)
    gate = np.zeros(N)
    vib_depth = np.zeros(N)
    dips = np.ones(N)
    onsets = []  # starts of each breath (for the puff of air)
    prev = None  # (midi, end time) of the previous sounding note
    for midi, s, d, slide in events:
        if midi is None:
            prev = None
            continue
        a, b = int(s * FS), int((s + d) * FS)
        pitch[a:b] = midi
        gate[a:b] = 1.0
        held = (np.arange(b - a) / FS)
        if d >= 0.5:  # vibrato only on held notes, growing after ~0.3 s
            vib_depth[a:b] = np.clip((held - 0.3) / 0.5, 0, 1) * 0.2
        if prev is not None and abs(prev[1] - s) < 1e-6:
            g = 0.18 if slide else 0.035
            ga, gb = max(0, a - int(g * FS / 2)), min(N, a + int(g * FS / 2))
            w = (1 - np.cos(np.linspace(0, np.pi, gb - ga))) / 2
            pitch[ga:gb] = prev[0] + (midi - prev[0]) * w
            if not slide:
                k = np.arange(gb - ga) - (gb - ga) / 2
                dips[ga:gb] = 1 - 0.3 * np.exp(-np.abs(k) / (0.01 * FS))
        else:
            onsets.append(a)
        prev = (midi, s + d)

    known = np.where(~np.isnan(pitch))[0]
    if len(known) == 0:
        return np.zeros(N)
    pitch = np.interp(np.arange(N), known, pitch[known])

    env = _smooth_gate(gate) * dips
    # each breath swells a little in the middle and relaxes at the end
    env *= 1 + 0.12 * np.sin(np.pi * np.clip(tt / max(0.5, t), 0, 1))
    env = _low(env, 60)

    # --- pitch: vibrato (~5 Hz, wandering) and a slow human drift ---------------------------
    rate = 5.0 + 0.35 * np.sin(2 * np.pi * 0.21 * tt + rng.random() * 6)
    vib = vib_depth * np.sin(2 * np.pi * np.cumsum(rate) / FS)
    drift = _low(rng.normal(0, 1, N), 2.5) * 0.08
    f0 = 440 * 2 ** ((pitch + vib + drift - 69) / 12)
    ph = 2 * np.pi * np.cumsum(f0) / FS

    # --- tone: strong fundamental, a little 2nd/3rd, a touch brighter when louder ----------
    loud = np.clip(env, 0, 1.2)
    tone = (np.sin(ph) + 0.28 * loud * np.sin(2 * ph + 0.4) + 0.10 * loud ** 1.5 * np.sin(3 * ph + 1.1)
            + 0.035 * loud ** 2 * np.sin(4 * ph + 2.0))
    air = _band(rng.normal(0, 1, N), 1800, 7500)
    breath = air * (0.5 + 0.5 * np.sin(ph)) * 0.045 + air * 0.015  # airy, but no hiss on phone speakers
    puff = np.zeros(N)
    for a in onsets:
        n = min(N - a, int(0.07 * FS))
        puff[a:a + n] = np.exp(-np.arange(n) / (0.018 * FS)) * 0.22
    y = (tone * 0.55 + breath) * env + _band(rng.normal(0, 1, N), 2500, 9000) * puff

    # --- small room -------------------------------------------------------------------------
    if room > 0:
        L = int(1.5 * FS)
        ir = _low(rng.normal(0, 1, L) * np.exp(-np.arange(L) / (0.32 * FS)), 4500)
        ir[:int(0.015 * FS)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        y = y * (1 - room) + fftconvolve(y, ir)[:N] * room * 1.5
    return y * level


def midi(name):
    """'Eb5' → 75."""
    names = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
    pc, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + names[pc]
