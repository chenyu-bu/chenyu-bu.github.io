"""Mountains, lake and islet for the background scene.

    python3 _tools/scene/mountains_islet.py assets/img/scene

writes, into the folder given:
  far.jpg  sky and sun, karst ranges in four planes of depth, horizon (row
           860), reflections and the lake's cool sheen
  mid.jpg  the islet with pine, smaller trees, shrub and pavilion, and its
           reflection; row 0 is the horizon

In both files the red channel holds ink and the green channel the cool
colour wash; white means bare paper. The boats and birds are not here:
assets/js/scene.js draws them live so they can move. Every random choice
is seeded, so the same script gives the same images.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(5)


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
        y += amp * (0.6 * np.sin(x * fr * 6.283 + p[0]) + 0.4 * np.sin(x * fr * 1.73 * 6.283 + p[1]))
        amp *= 0.55
        fr *= 2.07
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
    return 1 - (1 - a) * (1 - b)


def save_rgb(ink, col, path, q=86):
    rgb = np.zeros(ink.shape + (3,), np.uint8)
    rgb[..., 0] = np.clip(255 * (1 - np.clip(ink, 0, 1)), 0, 255)
    rgb[..., 1] = np.clip(255 * (1 - np.clip(col, 0, 1)), 0, 255)
    rgb[..., 2] = 255
    Image.fromarray(rgb, "RGB").save(path, quality=q, subsampling=0, optimize=True, progressive=True)


# =========================================================================== far
W, H, HZ = 2400, 1500, 860
yy, xx = np.mgrid[0:H, 0:W].astype(float)
INK = np.zeros((H, W))
COL = np.zeros((H, W))
grain = 0.5 + 0.5 * fnoise2(H, W, 1.0, seed=9)
streak = 0.5 + 0.5 * fnoise2(H, W, 1.4, aniso=0.2, seed=8)
fleck = 0.5 + 0.5 * fnoise2(H, W, 0.7, seed=10)

# sky: faint grey wash with a paler sun, soft cloud, a breath of cool colour
sx, sy, sr = 1730, 300, 62
wash = 0.05 * np.exp(-((yy - 330) / 260) ** 2) * (0.7 + 0.3 * fnoise2(H, W, 120, aniso=3, seed=5))
sun = ss(sr + 30, sr - 2, np.hypot(xx - sx, yy - sy))
INK = over(INK, wash * (1 - 0.95 * sun))
cl = np.clip(fnoise2(H, W, 110, aniso=2.6, seed=6) * 1.5 - 0.3, 0, 1)
INK = over(INK, 0.04 * cl * np.exp(-((yy - 200) / 170) ** 2))
COL = over(COL, 0.05 * np.exp(-((yy - 120) / 260) ** 2) * (1 - sun))

DOTS = Image.new("L", (W * 2, H * 2), 0)
dd = ImageDraw.Draw(DOTS)


def dab(x, y, w, h, v):
    dd.ellipse([((x - w) * 2, (y - h) * 2), ((x + w) * 2, (y + h) * 2)], fill=int(v))


def tiny_tree(x, y, hgt, r, v):
    lean = r.uniform(-0.3, 0.3)
    tx, ty = x + lean * hgt, y - hgt
    dd.line([(x * 2, y * 2), (tx * 2, ty * 2)], fill=int(v), width=2)
    for _ in range(r.integers(5, 10)):
        fx = tx + r.normal(0, hgt * 0.22)
        fy = ty + r.normal(0, hgt * 0.14) + hgt * 0.1
        dab(fx, fy, r.uniform(1.5, 3.5), r.uniform(0.8, 1.6), v * r.uniform(0.6, 1.0))


def massif(cx, base, w, h, tone, seed, detail, humps, steep=0.0, band=None, dots=0, trees=0,
           wash=0.0, softness=1.2):
    """Paint one mountain mass into INK / COL."""
    global INK, COL
    r = np.random.default_rng(seed)
    x0, x1 = int(max(0, cx - w)), int(min(W, cx + w))
    xs = np.arange(x0, x1).astype(float)
    t = (xs - cx) / (w / 2)
    t = t * (1 + steep * np.sign(t))
    prof = np.zeros_like(t)
    for (o, hh, ww) in humps:
        u = (t - o) / ww
        pe, qe = r.uniform(2.3, 3.6), r.uniform(0.32, 0.52)
        prof = np.maximum(prof, hh * np.clip(1 - np.abs(u) ** pe, 0, 1) ** qe)
    prof *= 1 + 0.045 * fractal1d(len(xs), 0.011, 4, seed) + 0.012 * fractal1d(len(xs), 0.045, 3, seed + 3)
    valid = prof > 0.02
    if not valid.any():
        return
    top = base - h * prof
    ys0, ys1 = int(max(0, top[valid].min() - 3)), int(min(H, base + 4))
    Y = np.arange(ys0, ys1)[:, None].astype(float)
    X = xs[None, :]
    TT = top[None, :]
    inside = (Y > TT) & valid[None, :]
    dtop = np.maximum(Y - TT, 0)
    rel = np.clip(dtop / h, 0, 1)

    # texture: soft facets fanning down from the summit, boneless dark washes
    # on the shaded side, and short dry-brush marks near the ridge
    i_s = int(np.argmin(np.where(valid, top, 1e9)))
    xs_, ys_ = xs[i_s], top[i_s]
    A = (X - xs_) / (Y - ys_ + h * 0.25)
    A = A + 0.025 * fnoise2(len(Y), len(xs), 40, seed=seed + 11)
    grid = np.linspace(-5, 5, 4000)
    vals = fractal1d(4000, r.uniform(2.0, 3.2) / 400, 3, seed + 7)
    dv = np.gradient(vals)
    dv /= np.abs(dv).max()
    facet = blur(np.clip(np.interp(A, grid, dv) * 1.8, 0, 1), 2.5)
    side = 0.7 + 0.42 * np.clip(A * 1.3, -1, 1)          # light from the left
    blot = np.clip(fnoise2(len(Y), len(xs), 22, seed=seed + 19) * 1.8 - 0.1, 0, 1)
    blot = blot * np.clip(A * 1.5 + 0.4, 0, 1) * np.exp(-rel * 1.2)
    sb = streak[ys0:ys1, x0:x1]
    fine = np.clip(sb * 2.2 - 1.15, 0, 1) * np.exp(-rel * 3.2)
    body = 0.32 + 0.68 * np.exp(-rel * 2.2)
    rim = np.exp(-dtop / (4 + 6 * (1 - detail))) * (0.5 + 0.5 * fleck[ys0:ys1, x0:x1])
    d = tone * (0.55 * body * side + detail * (0.55 * facet * side + 0.6 * blot + 0.7 * fine) + 0.6 * rim)
    d *= 0.84 + 0.32 * grain[ys0:ys1, x0:x1]

    fade = ss(base, base - h * 0.62, Y)                  # base dissolves in mist
    if band is not None:                                  # a cloud wrapping the middle
        by, bw = band
        cy = base - h * by + 10 * fnoise2(1, len(xs), 25, seed=seed + 13)[0][None, :]
        bm = np.exp(-((Y - cy) / (h * bw)) ** 2) * (0.6 + 0.4 * (0.5 + 0.5 * fnoise2(len(Y), len(xs), 20, aniso=3, seed=seed + 17)))
        fade = fade * (1 - 0.9 * bm)
    d = np.where(inside, d * fade, 0)
    d = blur(np.clip(d, 0, 1), softness)
    c = np.where(inside, wash * (0.35 + 0.65 * rel) * (0.8 + 0.4 * np.clip(A, -1, 1)) * fade, 0)
    c = blur(np.clip(c, 0, 1), softness * 3)
    INK[ys0:ys1, x0:x1] = over(INK[ys0:ys1, x0:x1], d)
    COL[ys0:ys1, x0:x1] = over(COL[ys0:ys1, x0:x1], c)

    # moss dots along gentle stretches of the ridge, and a few small trees
    if dots or trees:
        slope = np.abs(np.gradient(top))
        cand = np.where(valid & (slope < 1.2))[0]
        if len(cand):
            for _ in range(dots):
                j = r.choice(cand)
                x, y = xs[j], top[j] + r.uniform(1, 10)
                dab(x + r.normal(0, 9), y + r.uniform(0, 1) ** 2 * 26, r.uniform(1.0, 2.6), r.uniform(0.5, 1.0), 255 * min(1, tone * r.uniform(1.0, 1.6)))
            for _ in range(trees):
                j = r.choice(cand)
                tiny_tree(xs[j], top[j] + 3, r.uniform(10, 22), r, 255 * min(1, tone * 1.6))


# plane 0: very far, flat pale washes
u = np.arange(W) / W
ridge = HZ - 70 - 190 * (0.55 + 0.45 * fractal1d(W, 0.0028, 5, seed=7)) * (0.45 + 0.55 * np.abs(u - 0.5) * 2)
ins = yy > ridge[None, :]
dep = np.where(ins, yy - ridge[None, :], 0)
INK = over(INK, blur(np.where(ins, 0.065 * (0.5 + 0.5 * np.exp(-dep / 40)), 0) * ss(HZ, HZ - 160, yy), 2.5))
COL = over(COL, blur(np.where(ins, 0.09, 0) * ss(HZ, HZ - 200, yy), 6))
for (cx, w, h, sd) in [(780, 420, 440, 201), (1560, 460, 480, 202)]:
    massif(cx, HZ - 60, w, h, 0.07, sd, 0.15, [(0, 1, 1), (0.5, 0.7, 0.6)], wash=0.08, softness=2.6)

# plane 1: far
for (cx, w, h, tone, sd, humps, st, band) in [
        (300, 400, 430, 0.15, 211, [(0, 1, 0.8), (-0.55, 0.72, 0.5), (0.5, 0.6, 0.45)], 0.1, (0.55, 0.08)),
        (640, 260, 300, 0.14, 212, [(0, 1, 0.9), (0.4, 0.75, 0.5)], -0.1, None),
        (1180, 320, 250, 0.11, 213, [(0, 1, 1.0), (-0.45, 0.8, 0.55)], 0.0, (0.5, 0.1)),
        (1710, 300, 390, 0.15, 214, [(0, 1, 0.75), (0.5, 0.65, 0.45)], 0.15, (0.6, 0.07)),
        (2060, 300, 440, 0.16, 215, [(0, 1, 0.8), (-0.5, 0.7, 0.5)], -0.1, None)]:
    massif(cx, HZ - 25, w, h, tone, sd, 0.45, humps, steep=st, band=band, wash=0.10, softness=1.6)

# plane 2: middle distance
for (cx, w, h, tone, sd, humps, st, band, dots) in [
        (150, 320, 490, 0.33, 221, [(0, 1, 0.75), (0.55, 0.62, 0.4)], 0.2, (0.42, 0.07), 0),
        (480, 210, 270, 0.30, 222, [(0, 1, 0.9)], -0.15, None, 0),
        (1880, 230, 340, 0.31, 223, [(0, 1, 0.8), (-0.5, 0.6, 0.4)], 0.1, (0.48, 0.08), 0),
        (2240, 330, 480, 0.34, 224, [(0, 1, 0.7), (-0.6, 0.7, 0.45), (0.55, 0.55, 0.35)], -0.1, (0.4, 0.07), 0)]:
    massif(cx, HZ - 4, w, h, tone, sd, 0.75, humps, steep=st, band=band, dots=dots, wash=0.12, softness=1.1)

# plane 3: nearest cliffs at the edges, and low rocks at the waterline
massif(30, HZ + 10, 380, 610, 0.62, 231, 1.0, [(0, 1, 0.65), (0.6, 0.7, 0.35)], steep=0.35, band=(0.32, 0.06),
       dots=40, trees=5, wash=0.10, softness=0.7)
massif(2380, HZ + 10, 340, 570, 0.6, 232, 1.0, [(0, 1, 0.7), (-0.6, 0.65, 0.4)], steep=-0.3, band=(0.36, 0.06),
       dots=36, trees=4, wash=0.10, softness=0.7)
for (cx, w, h, sd) in []:
    massif(cx, HZ + 6, w, h, 0.36, sd, 0.8, [(0, 1, 0.8), (0.45, 0.6, 0.5)], wash=0.06, softness=0.9)

dots = np.asarray(DOTS.resize((W, H), Image.LANCZOS)).astype(float) / 255
INK = over(INK, blur(dots, 0.5))

# horizon hairline
INK = over(INK, 0.05 * np.exp(-((yy - HZ) / 1.5) ** 2) * np.clip(0.4 + fnoise2(H, W, 30, aniso=6, seed=41), 0, 1))

# reflections: stronger than before, cool-tinted, wavering, broken by light lines
RH = int(HZ * 0.66)


def reflect(src):
    ab = src[:HZ][::-1]
    rf = np.asarray(Image.fromarray((np.clip(ab, 0, 1) * 255).astype(np.uint8)).resize((W, RH))).astype(float) / 255
    for i in range(RH):
        rf[i] = np.roll(rf[i], int(4 * np.sin(i * 0.23) + 3 * np.sin(i * 0.061 + 1.3)))
    return blur(rf, 1.8)


breaks = 0.45 + 0.55 * np.clip(0.6 + 0.9 * fnoise2(RH, W, 3.5, aniso=16, seed=51), 0, 1)
fadeR = (0.25 + 0.75 * np.exp(-np.arange(RH) / (RH * 0.5)))[:, None] * ss(RH, RH * 0.55, np.arange(RH))[:, None]
INK[HZ:HZ + RH] = over(INK[HZ:HZ + RH], 0.78 * reflect(INK) * breaks * fadeR)
COL[HZ:HZ + RH] = over(COL[HZ:HZ + RH], 0.9 * reflect(COL) * breaks * fadeR)
# the lake itself: a faint cool sheen near the horizon
COL = over(COL, 0.07 * np.exp(-np.clip(yy - HZ, 0, None) / 300) * (yy > HZ))

INK *= ss(H, H - 200, yy)
COL *= ss(H, H - 200, yy)
save_rgb(INK, COL, f"{OUT}/far.jpg", 84)

# =========================================================================== mid (row 0 = horizon)
W2, H2, SS = 2400, 900, 3
Y2, X2 = np.mgrid[0:H2, 0:W2].astype(float)
ink_im = Image.new("L", (W2 * SS, H2 * SS), 0)
col_im = Image.new("L", (W2 * SS, H2 * SS), 0)
di, dcl = ImageDraw.Draw(ink_im), ImageDraw.Draw(col_im)


def P(pts):
    return [(x * SS, y * SS) for x, y in pts]


ix, iy = 2050, 250
r = np.random.default_rng(301)

# rocks: an uneven low mass, higher on the left where the trees stand
pts = [(ix - 200, iy + 4)]
for k in range(1, 24):
    x = ix - 200 + k * 400 / 24
    s = k / 24
    hgt = 46 * np.sin(np.pi * s) ** 1.1 * (0.85 + 0.25 * np.sin(s * 19 + 1.2)) + 26 * np.exp(-((s - 0.32) / 0.12) ** 2)
    pts.append((x, iy - hgt))
pts.append((ix + 200, iy + 4))
di.polygon(P(pts), fill=210)
dcl.polygon(P(pts), fill=60)
rock = np.asarray(ink_im.resize((W2, H2), Image.LANCZOS)).astype(float) / 255
rtex = 0.5 + 0.5 * fnoise2(H2, W2, 1.6, aniso=0.35, seed=311)
rock *= (0.4 + 0.75 * rtex) * ss(iy + 6, iy - 30, Y2)
ink_im = Image.new("L", (W2 * SS, H2 * SS), 0)
di = ImageDraw.Draw(ink_im)


def needle_pad(cx, cy, w, h, v, rr):
    """a horizontal pad of pine needles: a soft wash with radiating ticks"""
    dcl.ellipse(P([(cx - w * 1.1, cy - h * 1.2), (cx + w * 1.1, cy + h * 1.0)]), fill=110)
    for _ in range(int(w * 1.6)):
        a = rr.uniform(0, np.pi)
        px, py = cx + rr.normal(0, w * 0.45), cy + rr.normal(0, h * 0.3)
        L = rr.uniform(3, 7)
        di.line(P([(px, py), (px + L * np.cos(a), py - L * np.sin(a) * 0.6)]), fill=int(v * rr.uniform(0.6, 1)), width=SS)
    di.line(P([(cx - w, cy + h * 0.5), (cx + w, cy + h * 0.4)]), fill=int(v), width=SS)


# a leaning pine on the left of the islet
tx, ty = ix - 95, iy - 52
trunk = [(tx, ty)]
for k in range(1, 12):
    s = k / 11
    trunk.append((tx - 55 * s ** 1.4 + 3 * np.sin(s * 3.2), ty - 150 * s))
for k in range(len(trunk) - 1):
    di.line(P([trunk[k], trunk[k + 1]]), fill=225, width=int((4.5 - 3.2 * k / 11) * SS))
for (k, w, side) in [(4, 30, 1), (6, 36, -1), (8, 28, 1), (10, 22, -1), (11, 16, 0)]:
    bx, by = trunk[k]
    ex = bx + side * w * 0.9
    di.line(P([(bx, by), (ex, by - 6)]), fill=200, width=2 * SS)
    needle_pad(ex, by - 8, w, 7, 220, r)


def branch(x, y, ang, L, wdt, depth, rr, v):
    x2, y2 = x + L * np.cos(ang), y - L * np.sin(ang)
    di.line(P([(x, y), (x2, y2)]), fill=v, width=max(1, int(wdt * SS)))
    if depth == 0 or L < 8:
        for _ in range(7):
            fx, fy = x2 + rr.normal(0, 9), y2 + rr.normal(0, 5)
            rad = rr.uniform(1.5, 3.8)
            di.ellipse(P([(fx - rad * 2.0, fy - rad * 0.7), (fx + rad * 2.0, fy + rad * 0.7)]), fill=int(v * rr.uniform(0.45, 0.85)))
            dcl.ellipse(P([(fx - rad * 3, fy - rad * 1.6), (fx + rad * 3, fy + rad * 1.6)]), fill=90)
        return
    for da in (rr.uniform(0.25, 0.55), -rr.uniform(0.25, 0.55)):
        branch(x2, y2, ang + da, L * rr.uniform(0.62, 0.76), wdt * 0.66, depth - 1, rr, v)


branch(ix + 95, iy - 26, np.pi / 2 - 0.15, 44, 4.5, 4, np.random.default_rng(321), 190)   # smaller tree, right
branch(ix - 150, iy - 14, np.pi / 2 + 0.3, 26, 3, 3, np.random.default_rng(322), 150)    # a shrub, left, paler

# an open pavilion between the trees, double-eaved: a stone plinth, a low
# railing, four posts (the back two paler), two roofs with lifted corners,
# and a finial
px, py = ix + 26, iy - 38


def roof(cx, by, hw, ht, lift, v, cv):
    """a hipped roof seen from the front: concave slopes, eaves curling up at the corners"""
    n = 24
    pts = []
    for k in range(n + 1):                                   # underside of the eave, left to right
        s_ = k / n
        x = cx - hw + 2 * hw * s_
        y = by - lift * (abs(2 * s_ - 1) ** 3.2)
        pts.append((x, y))
    for k in range(n + 1):                                   # the slopes back up to the ridge
        s_ = k / n
        x = cx + hw - 2 * hw * s_
        e = abs(2 * s_ - 1)
        y = by - lift - (ht - lift) * (1 - e ** 0.55) - 2.5 * (1 - e)
        pts.append((x * 0.82 + cx * 0.18 if e < 0.999 else x, y))
    di.polygon(P(pts), fill=v)
    dcl.polygon(P(pts), fill=cv)
    for k in range(-4, 5):                                   # tile lines on the lower slope
        x = cx + k * hw * 0.17
        di.line(P([(x, by - 2.5), (x + k * 0.6, by - ht * 0.55)]), fill=int(v * 0.55), width=SS)
    di.line(P([(cx - hw * 0.94, by - lift * 0.55), (cx + hw * 0.94, by - lift * 0.55)]), fill=int(v * 1.0), width=SS)


# plinth
di.polygon(P([(px - 40, py), (px + 40, py), (px + 45, py + 8), (px - 45, py + 8)]), fill=150)
dcl.polygon(P([(px - 40, py), (px + 40, py), (px + 45, py + 8), (px - 45, py + 8)]), fill=40)
for k in range(-3, 4):                                       # stone joints
    di.line(P([(px + k * 12, py + 1), (px + k * 13, py + 7)]), fill=90, width=SS)
di.polygon(P([(px - 10, py + 8), (px + 10, py + 8), (px + 13, py + 13), (px - 13, py + 13)]), fill=130)   # step
# back posts, paler, then front posts
for ox in (-15, 15):
    di.line(P([(px + ox, py), (px + ox, py - 31)]), fill=120, width=int(1.4 * SS))
for ox in (-30, 30):
    di.line(P([(px + ox, py), (px + ox, py - 32)]), fill=215, width=int(2.4 * SS))
# railing between the front posts, with balusters
di.line(P([(px - 30, py - 9), (px + 30, py - 9)]), fill=190, width=int(1.6 * SS))
di.line(P([(px - 30, py - 2), (px + 30, py - 2)]), fill=170, width=SS)
for k in range(-4, 5):
    if k == 0:
        continue                                             # an opening at the front
    x = px + k * 6.5
    di.line(P([(x, py - 9), (x, py - 2)]), fill=160, width=SS)
# lintel and brackets under the lower eave
di.line(P([(px - 33, py - 32), (px + 33, py - 32)]), fill=210, width=int(2 * SS))
for ox in (-30, 30):
    di.line(P([(px + ox, py - 28), (px + ox + (6 if ox > 0 else -6), py - 33)]), fill=200, width=SS)
roof(px, py - 32, 50, 17, 8, 225, 85)                        # lower roof
# drum between the two roofs
di.polygon(P([(px - 16, py - 48), (px + 16, py - 48), (px + 16, py - 54), (px - 16, py - 54)]), fill=170)
for ox in (-12, -4, 4, 12):
    di.line(P([(px + ox, py - 48), (px + ox, py - 54)]), fill=230, width=SS)
roof(px, py - 54, 32, 15, 6, 230, 90)                        # upper roof
# finial
di.line(P([(px, py - 69), (px, py - 77)]), fill=220, width=int(1.6 * SS))
di.ellipse(P([(px - 2.6, py - 81), (px + 2.6, py - 76)]), fill=220)

trees = np.asarray(ink_im.resize((W2, H2), Image.LANCZOS)).astype(float) / 255
trees = blur(trees, 0.7)
grass = Image.new("L", (W2 * SS, H2 * SS), 0)
dg = ImageDraw.Draw(grass)
for _ in range(22):
    gx = ix + r.uniform(-185, 185)
    gh = r.uniform(8, 26)
    dg.line(P([(gx, iy - 4), (gx + r.uniform(-10, 14), iy - 4 - gh)]), fill=int(r.uniform(110, 190)), width=SS)
grass = np.asarray(grass.resize((W2, H2), Image.LANCZOS)).astype(float) / 255
mink = over(over(rock * 0.6, trees * 0.85), grass * 0.55)
mcol = blur(np.asarray(col_im.resize((W2, H2), Image.LANCZOS)).astype(float) / 255, 4) * 0.55

# reflection of the islet
top, bot = iy - 200, iy + 6
for arr, k in ((mink, 0.45), (mcol, 0.6)):
    src = arr[top:bot][::-1].copy()
    n = src.shape[0]
    for i in range(n):
        src[i] = np.roll(src[i], int(3 * np.sin(i * 0.45)))
    seg = blur(src, 1.5) * k * np.exp(-np.arange(n) / (n * 0.6))[:, None]
    seg *= 0.4 + 0.6 * np.clip(0.55 + 0.9 * fnoise2(n, W2, 2.5, aniso=14, seed=331), 0, 1)
    arr[bot + 2:bot + 2 + n] = over(arr[bot + 2:bot + 2 + n], seg)

save_rgb(mink, mcol, f"{OUT}/mid.jpg", 88)

for f in ("far.jpg", "mid.jpg"):
    print(f, os.path.getsize(f"{OUT}/{f}") // 1024, "KB")
