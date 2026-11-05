"""The soft, irregular edge laid over every inkling photograph.

    python3 _tools/scene/inkling_edge.py assets/img/scene

writes edge.png: white, with transparency that fades in from each border
over a band of uneven width, like the edge of a wash on paper. style.css
uses it as a mask on the photograph, stretched to the photograph's shape,
so it changes how much of each pixel shows at the edges and nothing else:
the colours are the photograph's own. Seeded, so it redraws identically.
"""
import os, sys
import numpy as np
from PIL import Image

OUT = sys.argv[1]
N = 600


def fnoise2(h, w, scale, seed):
    r = np.random.default_rng(seed)
    n = r.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(n) * np.exp(-(f * scale) ** 2)))
    return out / (np.abs(out).max() + 1e-9)


yy, xx = np.mgrid[0:N, 0:N].astype(float)
e = np.minimum(np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy)) / N   # distance to the nearest border
broad = 0.5 + 0.5 * fnoise2(N, N, 40, 1)     # slow swells in the width of the band
fine = fnoise2(N, N, 4, 2)                   # a ragged, fibrous fringe
band = 0.045 + 0.075 * broad + 0.012 * fine
t = np.clip(e / band, 0, 1)
alpha = t * t * (3 - 2 * t)
rgba = np.zeros((N, N, 4), np.uint8)
rgba[..., :3] = 255
rgba[..., 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
Image.fromarray(rgba, "RGBA").save(f"{OUT}/edge.png", optimize=True)
print("edge.png", os.path.getsize(f"{OUT}/edge.png") // 1024, "KB")
