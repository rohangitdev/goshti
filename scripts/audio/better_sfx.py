"""Better placeholder sounds, synthesized from models (no samples, no downloads):
  - water: Van den Doel's bubble model (a water sound is mostly many tiny resonating bubbles)
  - animals: source-filter synthesis (a pitched voice through moving vocal-tract resonances)
Run from the repo root:  python3 scripts/audio/better_sfx.py
"""
import numpy as np
import soundfile as sf

FS = 22050
rng = np.random.default_rng(2026)
OUT = 'assets/audio'


def write(path, y, peak=0.7, fade_in=0.005, fade_out=0.05, loop=False):
    y = np.asarray(y, dtype=np.float64)
    y = y / (np.max(np.abs(y)) + 1e-9) * peak
    if not loop:
        a, b = int(fade_in * FS), int(fade_out * FS)
        y[:a] *= np.linspace(0, 1, a)
        y[-b:] *= np.linspace(1, 0, b)
    sf.write(f'{OUT}/{path}', y, FS, subtype='PCM_16')
    print(f'{path:34} {len(y)/FS:4.1f}s')


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / FS); y = np.zeros_like(x); s = 0.0
    for i, v in enumerate(x):
        s = (1 - a) * v + a * s; y[i] = s
    return y


def highpass(x, fc):
    return x - onepole_lp(x, fc)


def make_loop(render, seconds, xfade=1.0):
    full = render(seconds + xfade)
    n, x = int(seconds * FS), int(xfade * FS)
    out = full[:n].copy(); w = np.linspace(0, 1, x)
    out[:x] = full[:x] * w + full[n:n + x] * (1 - w)
    return out


# ---------------------------------------------------------------------------
# Water — bubble model
# ---------------------------------------------------------------------------

def bubble(radius_mm, rise=0.1):
    f0 = 3.0 / (radius_mm / 1000.0)                    # Minnaert: ~3 kHz for a 1 mm bubble
    d = 0.043 * f0 + 0.0014 * f0 ** 1.5                 # damping
    n = int(min(0.25, 6.9 / d) * FS)
    t = np.arange(n) / FS
    f = f0 * (1 + rise * d * t)                          # pitch rises as the bubble surfaces
    phase = 2 * np.pi * np.cumsum(f) / FS
    return np.sin(phase) * np.exp(-d * t) * (radius_mm ** 1.2)


def sprinkle(y, rate, rmin, rmax, gain=1.0, start=0.0, end=None, shape=None):
    end = len(y) / FS if end is None else end
    count = rng.poisson(rate * (end - start))
    for _ in range(count):
        at = rng.uniform(start, end)
        if shape is not None and rng.random() > shape(at):
            continue
        r = rmin * (rmax / rmin) ** (rng.random() ** 1.8)  # many small, few large
        b = bubble(r) * gain * rng.uniform(0.3, 1.0)
        s = int(at * FS); e = min(len(y), s + len(b)); y[s:e] += b[:e - s]
    return y


def noise(seconds):
    return rng.standard_normal(int(seconds * FS))


def water_stream(sec):
    y = np.zeros(int(sec * FS))
    sprinkle(y, 70, 0.6, 4.0, 1.0)
    bed = highpass(onepole_lp(noise(sec), 1800), 250)
    t = np.arange(len(y)) / FS
    bed *= 0.5 + 0.25 * np.sin(2 * np.pi * 0.7 * t) + 0.15 * np.sin(2 * np.pi * 1.9 * t)
    return y / np.max(np.abs(y)) + 0.25 * bed / np.max(np.abs(bed))


def rain(sec, rate, hiss):
    y = np.zeros(int(sec * FS))
    sprinkle(y, rate * 0.6, 0.5, 2.0, 0.8)
    for _ in range(rng.poisson(rate * sec)):                      # drop impacts
        s = int(rng.uniform(0, sec) * FS); n = int(0.003 * FS)
        if s + n < len(y): y[s:s + n] += highpass(noise(0.003), 2500) * rng.uniform(0.05, 0.4)
    bed = highpass(noise(sec), 3000)
    return y / np.max(np.abs(y)) + hiss * bed / np.max(np.abs(bed))


def waves(sec, period=6.0):
    t = np.arange(int(sec * FS)) / FS
    swell = np.sin(np.pi * t / period) ** 2
    surge = onepole_lp(onepole_lp(noise(sec), 500), 700) * (0.2 + 0.8 * swell)
    foam = np.zeros_like(t)
    sprinkle(foam, 160, 0.4, 1.2, 1.0, shape=lambda at: np.sin(np.pi * at / period) ** 6)
    return surge / np.max(np.abs(surge)) + 0.35 * foam / (np.max(np.abs(foam)) + 1e-9)


def splash():
    sec = 1.6
    y = np.zeros(int(sec * FS)); t = np.arange(len(y)) / FS
    burst = onepole_lp(noise(sec), 3500) * np.exp(-t / 0.18) * np.minimum(1, t / 0.004)
    y += burst / np.max(np.abs(burst))
    b = np.zeros_like(y); sprinkle(b, 260, 1.0, 6.0, 1.0, 0.0, 0.45); sprinkle(b, 12, 1.5, 4.0, 0.8, 0.5, 1.4)
    return y * 0.6 + b / np.max(np.abs(b))


# ---------------------------------------------------------------------------
# Animals — source-filter
# ---------------------------------------------------------------------------

def interp(points, n):
    xs, vs = zip(*points)
    return np.interp(np.linspace(0, 1, n), xs, vs)


def source(f0, rolloff=1.2, jitter=0.0, noise_mix=0.0):
    n = len(f0)
    if jitter:
        f0 = f0 * (1 + jitter * onepole_lp(rng.standard_normal(n), 60) * 4)
    phase = 2 * np.pi * np.cumsum(f0) / FS
    y = np.zeros(n)
    for k in range(1, 40):
        lim = (k * f0) < FS / 2.2
        y += np.where(lim, np.sin(k * phase) / k ** rolloff, 0)
    if noise_mix:
        y = y / np.max(np.abs(y)) + noise_mix * noise(n / FS)
    return y


def formants(x, tracks, bws):
    """Parallel time-varying two-pole resonators. tracks: list of arrays (Hz) per formant."""
    out = np.zeros_like(x)
    for F, bw, g in zip(tracks, bws, (1.0, 0.7, 0.35, 0.2)):
        r = np.exp(-np.pi * bw / FS)
        y1 = y2 = 0.0; y = np.zeros_like(x)
        for i in range(len(x)):
            th = 2 * np.pi * F[i] / FS
            v = (1 - r) * x[i] + 2 * r * np.cos(th) * y1 - r * r * y2
            y2, y1 = y1, v; y[i] = v
        out += g * y / (np.max(np.abs(y)) + 1e-9)
    return out


def env(n, attack, release):
    t = np.arange(n) / FS; d = n / FS
    return np.clip(np.minimum(t / attack, (d - t) / release), 0, 1)


def cat_meow():
    n = int(0.8 * FS); t = np.arange(n) / FS
    f0 = interp([(0, 620), (0.3, 880), (0.65, 760), (1, 520)], n) * (1 + 0.015 * np.sin(2 * np.pi * 6 * t))
    F1 = interp([(0, 700), (0.35, 1150), (1, 650)], n)
    F2 = interp([(0, 2100), (0.35, 1750), (1, 1050)], n)
    F3 = interp([(0, 3000), (1, 2700)], n)
    y = formants(source(f0, 1.1, noise_mix=0.04), [F1, F2, F3], [120, 160, 250])
    return y * env(n, 0.05, 0.18)


def dog_bark():
    out = np.zeros(int(0.75 * FS))
    for at, base in [(0.0, 470), (0.32, 420)]:
        n = int(0.17 * FS)
        f0 = interp([(0, base), (0.2, base * 1.05), (1, base * 0.62)], n)
        F1 = interp([(0, 600), (0.3, 750), (1, 550)], n)
        F2 = np.full(n, 1350.0); F3 = np.full(n, 2600.0)
        y = formants(source(f0, 1.0, jitter=0.06, noise_mix=0.35), [F1, F2, F3], [180, 220, 320])
        t = np.arange(n) / FS
        y *= np.minimum(1, t / 0.006) * np.exp(-t / 0.07)
        s = int(at * FS); out[s:s + n] += y
    return out


def elephant():
    n = int(1.2 * FS); t = np.arange(n) / FS
    f0 = interp([(0, 340), (0.22, 540), (0.75, 520), (1, 460)], n) * (1 + 0.03 * np.sin(2 * np.pi * 7 * t))
    src = source(f0, 0.8, jitter=0.01, noise_mix=0.1) * (1 + 0.2 * np.sin(2 * np.pi * 34 * t))
    F1 = np.full(n, 720.0); F2 = interp([(0, 1500), (1, 1700)], n); F3 = np.full(n, 2600.0)
    return formants(src, [F1, F2, F3], [110, 140, 200]) * env(n, 0.08, 0.25)


def lion_gentle():
    n = int(1.3 * FS); t = np.arange(n) / FS
    f0 = interp([(0, 95), (0.4, 125), (1, 88)], n)
    src = source(f0, 0.9, jitter=0.08, noise_mix=0.3) * (0.55 + 0.45 * np.sin(2 * np.pi * 24 * t))
    F1 = interp([(0, 420), (0.4, 620), (1, 400)], n); F2 = interp([(0, 900), (0.4, 1100), (1, 850)], n)
    F3 = np.full(n, 2200.0)
    y = formants(src, [F1, F2, F3], [160, 200, 300]) * env(n, 0.22, 0.45)
    return onepole_lp(y, 2500)


if __name__ == '__main__':
    write('sfx/cat_meow.wav', cat_meow())
    write('sfx/dog_bark.wav', dog_bark())
    write('sfx/elephant.wav', elephant())
    write('sfx/lion.wav', lion_gentle(), peak=0.55)
    write('sfx/splash.wav', splash())
    write('sfx/rain_heavy.wav', rain(4.0, 140, 0.5), fade_in=0.4, fade_out=0.8)
    write('ambience/water_stream.wav', make_loop(water_stream, 6.0), peak=0.6, loop=True)
    write('ambience/rain_light.wav', make_loop(lambda s: rain(s, 30, 0.25), 6.0), peak=0.6, loop=True)
    write('ambience/waves.wav', make_loop(waves, 6.0), peak=0.6, loop=True)
