"""Paper grain, drifting mist and foreground reeds for the background scene.

    python3 _tools/scene/paper_mist_reeds.py assets/img/scene

writes, into the folder given:
  paper.jpg  paper grain, tiled across the page by style.css
  mist.jpg   mist banks; tiles left to right; the horizon is row 380
  near.jpg   reeds; red channel = ink, green channel = colour wash

White means bare paper, darker means more pigment. Every random choice is
seeded, so the same script gives the same images.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)


def fnoise2(h, w, scale, aniso=1.0, seed=0):
    r = np.random.default_rng(seed)
    n = r.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt((fx * aniso) ** 2 + (fy / aniso) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(n) * np.exp(-(f * scale) ** 2)))
    return out / (np.abs(out).max() + 1e-9)


def fractal1d(n, base=0.004, octaves=6, seed=0):
    r = np.random.default_rng(seed)
    x = np.arange(n)
    y = np.zeros(n)
    amp, fr = 1.0, base
    for _ in range(octaves):
        p = r.uniform(0, 6.28, 2)
        y += amp * (0.6 * np.sin(x * fr * 6.283 + p[0]) + 0.4 * np.sin(x * fr * 1.7 * 6.283 + p[1]))
        amp *= 0.5
        fr *= 2.1
    return y / np.abs(y).max()


def blur(a, r):
    if r <= 0:
        return a
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(float) / 255


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def over(a, b):
    """combine two densities like layered washes"""
    return 1 - (1 - a) * (1 - b)


def save_grey(d, path, q=80):
    Image.fromarray(np.clip(255 * (1 - np.clip(d, 0, 1)), 0, 255).astype(np.uint8), "L").save(
        path, quality=q, optimize=True, progressive=True)


# ------------------------------------------------------------------ paper
T = 512
p = 0.55 * fnoise2(T, T, 60, seed=1) + 0.3 * fnoise2(T, T, 12, seed=2) + 0.15 * fnoise2(T, T, 3, seed=3)
paper = 0.035 + 0.03 * p
im = Image.new("L", (T * 3, T * 3), 0)
dr = ImageDraw.Draw(im)
for _ in range(240):
    x, y = rng.uniform(T, 2 * T, 2)
    a = rng.uniform(0, np.pi)
    L = rng.uniform(8, 36)
    for ox in (-T, 0, T):
        for oy in (-T, 0, T):
            dr.line([(x + ox, y + oy), (x + ox + L * np.cos(a), y + oy + L * np.sin(a))], fill=int(rng.uniform(5, 14)))
fib = np.asarray(im.filter(ImageFilter.GaussianBlur(0.6))).astype(float)[T:2 * T, T:2 * T] / 255
save_grey(np.clip(paper + fib, 0, 1), f"{OUT}/paper.jpg", 82)

# ------------------------------------------------------------------ mist (tiles horizontally)
W3, H3 = 2400, 700
m = np.clip(fnoise2(H3, W3, 55, aniso=6, seed=91) * 1.5 + 0.15, 0, 1)
m2 = np.clip(fnoise2(H3, W3, 30, aniso=8, seed=92) * 1.6, 0, 1)
Y3 = np.arange(H3)[:, None].astype(float)
# horizon sits at row 380 of this layer: a thick bank there, a thinner wisp higher up
mist = m * np.exp(-((Y3 - 370) / 85) ** 2) + 0.7 * m2 * np.exp(-((Y3 - 160) / 45) ** 2)
mist = blur(np.clip(mist, 0, 1), 6)
save_grey(mist, f"{OUT}/mist.jpg", 80)

# ------------------------------------------------------------------ near layer: reeds
W4, H4, S4 = 2400, 1000, 2
tiers = []


def new():
    return Image.new("L", (W4 * S4, H4 * S4), 0)


def bez(p0, p1, p2, n=30):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(p1) + t ** 2 * np.array(p2)


def stroke(dr, pts, w0, w1, fill):
    """tapered stroke along a polyline"""
    pts = np.asarray(pts)
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        nrm = np.array([-a[1], a[0]]) / (np.hypot(*a) + 1e-9)
        t = i / (n - 1)
        w = w0 + (w1 - w0) * t
        left.append(tuple((pts[i] + nrm * w) * S4))
        right.append(tuple((pts[i] - nrm * w) * S4))
    dr.polygon(left + right[::-1], fill=fill)


def leaf_width(t):
    return 0.2 + 8.0 * np.sin(np.pi * np.clip(t * 1.15, 0, 1)) ** 0.7 * (1 - t) ** 0.6


def leaf(dr, p0, direction, L, droop, fill, scale):
    d = np.array(direction) / np.hypot(*direction)
    p1 = np.array(p0) + d * L * 0.55 + np.array([0, -L * 0.25])
    p2 = np.array(p0) + d * L + np.array([0, L * droop])
    pts = bez(p0, p1, p2, 26)
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        nrm = np.array([-a[1], a[0]]) / (np.hypot(*a) + 1e-9)
        w = leaf_width(i / (n - 1)) * scale
        left.append(tuple((pts[i] + nrm * w) * S4))
        right.append(tuple((pts[i] - nrm * w * 0.4) * S4))
    dr.polygon(left + right[::-1], fill=fill)


def plume(dr, tip, lean, L, fill, r):
    """a drooping, feathered seed head"""
    axis = bez(tip, (tip[0] + lean * L * 0.5, tip[1] - L * 0.25), (tip[0] + lean * L, tip[1] + L * 0.35), 40)
    for i, q in enumerate(axis):
        t = i / (len(axis) - 1)
        spread = np.sin(np.pi * min(1, t * 1.3)) * (1 - 0.4 * t)
        for _ in range(5):
            side = r.choice([-1, 1])
            ang = np.arctan2(axis[min(i + 1, len(axis) - 1)][1] - q[1], axis[min(i + 1, len(axis) - 1)][0] - q[0]) \
                + side * r.uniform(0.35, 1.0)
            l = r.uniform(10, 34) * spread + 3
            e = (q[0] + l * np.cos(ang), q[1] + l * np.sin(ang) + l * 0.25)
            dr.line([(q[0] * S4, q[1] * S4), (e[0] * S4, e[1] * S4)], fill=int(fill * r.uniform(0.35, 0.8)), width=2)
    stroke(dr, axis, 1.6, 0.4, fill)


def reed(ink_dr, och_dr, x0, h, lean, r, ink_fill, och_fill, scale):
    tip = (x0 + lean, H4 - h)
    stem = bez((x0, H4 + 5), (x0 + lean * 0.15, H4 - h * 0.5), tip, 40)
    stroke(ink_dr, stem, 2.6 * scale, 0.7 * scale, ink_fill)
    for _ in range(r.integers(3, 7)):
        t = r.uniform(0.08, 0.6)
        i = int(t * 39)
        side = r.choice([-1, 1])
        L = r.uniform(110, 280) * scale
        dirn = (side * r.uniform(0.5, 1.0), -r.uniform(0.6, 1.4))
        leaf(ink_dr, tuple(stem[i]), dirn, L, r.uniform(0.25, 0.75), int(ink_fill * r.uniform(0.7, 1.0)), scale)
        leaf(och_dr, tuple(stem[i]), dirn, L, r.uniform(0.25, 0.75), och_fill, scale * 1.15)
    if r.random() < 0.8:
        pl = r.uniform(95, 175) * scale
        plume(ink_dr, tip, np.sign(lean + 1e-3) * r.uniform(0.2, 0.7), pl, int(ink_fill * 0.75), r)
        plume(och_dr, tip, np.sign(lean + 1e-3) * r.uniform(0.2, 0.7), pl * 1.1, och_fill, r)


ink_total = np.zeros((H4, W4))
och_total = np.zeros((H4, W4))
YY4, XX4 = np.mgrid[0:H4, 0:W4].astype(float)
for (count, hmin, hmax, inkf, ochf, bl, scale, seed) in [
        (64, 320, 740, 0.16, 0.42, 3.4, 0.85, 101),     # back: pale, soft
        (30, 260, 660, 0.40, 0.32, 1.5, 1.0, 102),      # middle
        (10, 220, 580, 0.82, 0.14, 0.5, 1.15, 103)]:      # front: crisp, dark
    r = np.random.default_rng(seed)
    ii, oo = new(), new()
    di_, do_ = ImageDraw.Draw(ii), ImageDraw.Draw(oo)
    for k in range(count):
        right = r.random() < 0.7
        if right:
            x0 = r.normal(2170, 150)
            lean = -r.uniform(30, 220)
        else:
            x0 = r.normal(190, 110)
            lean = r.uniform(20, 180)
        h = r.uniform(hmin, hmax) * (1.0 if right else 0.75)
        reed(di_, do_, x0, h, lean, r, int(inkf * 255), int(ochf * 255), scale)
    ia = np.asarray(ii.resize((W4, H4), Image.LANCZOS)).astype(float) / 255
    oa = np.asarray(oo.resize((W4, H4), Image.LANCZOS)).astype(float) / 255
    ia, oa = blur(ia, bl), blur(oa, bl * 1.6 + 1)
    ink_total = over(ink_total, ia)
    och_total = over(och_total, oa)

# a wet dark mass where the reeds meet the water, and a little dry-brush break-up
for (cx, sp, a) in ((2170, 230, 0.5), (190, 140, 0.35)):
    base = a * np.exp(-((XX4 - cx) / sp) ** 2) * np.exp(-((H4 - YY4) / 60) ** 2)
    base *= 0.6 + 0.6 * np.clip(0.5 + 0.5 * fnoise2(H4, W4, 6, seed=111), 0, 1)
    ink_total = over(ink_total, blur(base, 8))
dry = np.clip(0.55 + 0.9 * (0.5 + 0.5 * fnoise2(H4, W4, 1.2, aniso=0.3, seed=121)), 0, 1)
ink_total *= dry
och_total *= 0.8 + 0.2 * dry

rgb = np.zeros((H4, W4, 3), np.uint8)
rgb[..., 0] = np.clip(255 * (1 - ink_total), 0, 255)
rgb[..., 1] = np.clip(255 * (1 - och_total), 0, 255)
rgb[..., 2] = 255
Image.fromarray(rgb, "RGB").save(f"{OUT}/near.png", optimize=True)
Image.fromarray(rgb, "RGB").save(f"{OUT}/near.jpg", quality=86, subsampling=0, optimize=True, progressive=True)

for f in ("paper.jpg", "mist.jpg", "near.jpg"):
    print(f, os.path.getsize(f"{OUT}/{f}") // 1024, "KB")
