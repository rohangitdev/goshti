"""Turn an adult recording into a young child's voice (pitch up + shorter vocal tract) with WORLD."""
import argparse

import numpy as np
import pyworld as pw
import soundfile as sf

ap_ = argparse.ArgumentParser()
ap_.add_argument('src'); ap_.add_argument('dst')
ap_.add_argument('--pitch-hz', type=float, default=360, help='target median pitch (5–6 y girl ≈ 330–360)')
ap_.add_argument('--formant', type=float, default=1.52, help='spectral envelope stretch (child ≈ 1.45–1.55)')
args = ap_.parse_args()

x, fs = sf.read(args.src)
x = x.astype(np.float64)
f0, t = pw.harvest(x, fs, f0_floor=60, f0_ceil=800, frame_period=5)
sp = pw.cheaptrick(x, f0, t, fs)
ap = pw.d4c(x, f0, t, fs)


def warp(sp, alpha):
    n = sp.shape[1]
    src = np.clip(np.arange(n) / alpha, 0, n - 1)
    lo = np.floor(src).astype(int)
    hi = np.minimum(lo + 1, n - 1)
    w = src - lo
    return sp[:, lo] * (1 - w) + sp[:, hi] * w


def smooth(f0, k=6):  # an adult's pitch wobble sounds shaky when raised this far
    out = f0.copy()
    for i in np.where(f0 > 0)[0]:
        seg = f0[max(0, i - k):i + k + 1]
        out[i] = np.median(seg[seg > 0])
    return out


ratio = args.pitch_hz / np.median(f0[f0 > 0])
y = pw.synthesize(np.ascontiguousarray(smooth(f0) * ratio), np.ascontiguousarray(warp(sp, args.formant)), np.ascontiguousarray(ap), fs, frame_period=5)
sf.write(args.dst, y / np.max(np.abs(y)) * 0.9, fs)
