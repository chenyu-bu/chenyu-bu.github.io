/* Inklings on Comings & Goings: a photograph or other image tied to a phrase
 * in an entry. Clicking the phrase prints the image into the empty margin
 * beside the text as if in ink on the paper: it spreads from one point
 * outward, light areas staying bare paper and dark areas becoming ink.
 * On narrow screens it opens over the page instead. Esc, a second click,
 * or (on a phone) Close dismisses it.
 *
 * The images come from _data/news.yml through _layouts/news.html, which
 * renders each one as a <figure class="inkling-source" id="inkling-KEY">
 * under its entry. Without JavaScript those figures simply show there.
 */
(function () {
  'use strict';

  var INKLINGS = {};

  var column = document.querySelector('.news-list');
  if (!column) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INK = [0.150, 0.168, 0.188];

  document.querySelectorAll('figure.inkling-source').forEach(function (f) {
    var img = f.querySelector('img'), cap = f.querySelector('figcaption');
    if (!img) return;
    var seed = (f.getAttribute('data-seed') || '0.5,0.4').split(',').map(Number);
    INKLINGS[f.id.slice('inkling-'.length)] = {
      src: img.getAttribute('src'),
      alt: img.getAttribute('alt') || '',
      caption: cap ? cap.innerHTML : '',
      seed: seed
    };
  });
  document.documentElement.classList.add('has-inklings');

  /* ------------------------------------------------------------ inklings */
  var cache = {};
  function valueNoise(w, h, cell, rnd) {
    var gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh), out = new Float32Array(w * h);
    for (var i = 0; i < g.length; i++) g[i] = rnd();
    for (var y = 0; y < h; y++) {
      var fy = y / cell, iy = fy | 0, ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
      for (var x = 0; x < w; x++) {
        var fx = x / cell, ix = fx | 0, tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
        var a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
        out[y * w + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
      }
    }
    return out;
  }

  // Turn a photograph into ink on paper: light areas become bare paper,
  // dark areas ink, with a trace of the original colour kept.
  function prepare(key, cssW) {
    var spec = INKLINGS[key];
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var W = Math.round(cssW * 1.5), H = Math.round(W * img.naturalHeight / img.naturalWidth);
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
        var src = x.getImageData(0, 0, W, H).data, N = W * H;
        var dens = new Float32Array(N), col = new Uint8ClampedArray(N * 3), order = new Float32Array(N), feather = new Float32Array(N);
        var n1 = valueNoise(W, H, 26, Math.random), n2 = valueNoise(W, H, 7, Math.random), n3 = valueNoise(W, H, 40, Math.random);
        var sx = spec.seed[0] * W, sy = spec.seed[1] * H, maxd = Math.hypot(Math.max(sx, W - sx), Math.max(sy, H - sy)), md = Math.min(W, H);
        for (var i = 0; i < N; i++) {
          var r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
          var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          dens[i] = Math.min(1, Math.pow(Math.max(0, 1 - lum), 0.85) * 0.95);
          var k = 0.16;
          col[i * 3] = INK[0] * 255 * (1 - k) + r * k;
          col[i * 3 + 1] = INK[1] * 255 * (1 - k) + g * k;
          col[i * 3 + 2] = INK[2] * 255 * (1 - k) + b * k;
          var px = i % W, py = (i / W) | 0;
          var nn = 0.65 * n1[i] + 0.35 * n2[i];
          order[i] = 0.62 * (Math.hypot(px - sx, py - sy) / maxd) + 0.38 * nn;
          var e = Math.min(px, W - 1 - px, py, H - 1 - py) / md;
          var lim = 0.06 + 0.09 * n3[i];
          var f = Math.min(1, e / lim); feather[i] = f * f * (3 - 2 * f);
        }
        res({ W: W, H: H, dens: dens, col: col, order: order, feather: feather });
      };
      img.src = spec.src;
    });
  }

  function animateInk(canvas, data, dur, done) {
    var x = canvas.getContext('2d'), out = x.createImageData(data.W, data.H), o = out.data;
    var N = data.W * data.H, t0 = performance.now();
    function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var t = -0.05 + 1.2 * (1 - Math.pow(1 - k, 2.2));
      for (var i = 0; i < N; i++) {
        var v = data.order[i];
        var m = (t - v) / 0.09; m = m < 0 ? 0 : m > 1 ? 1 : m; m = m * m * (3 - 2 * m);
        var dv = (v - t) / 0.028, rim = (1 - k) * 0.22 * Math.exp(-dv * dv);
        var a = data.feather[i] * (data.dens[i] * m + rim * (0.25 + data.dens[i]));
        o[i * 4] = data.col[i * 3]; o[i * 4 + 1] = data.col[i * 3 + 1]; o[i * 4 + 2] = data.col[i * 3 + 2];
        o[i * 4 + 3] = a > 1 ? 255 : a * 255;
      }
      x.putImageData(out, 0, 0);
      if (k < 1 && canvas.isConnected) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }

  var open = null;   // {key, fig, btn, veil, pinned}
  var hideTimer = null, showTimer = null;

  function place(fig, btn) {
    var vw = window.innerWidth;
    var col = column.getBoundingClientRect();
    var room = vw - col.right - 56;
    if (room >= 170) {
      fig.classList.remove('overlay');
      var w = Math.min(300, room);
      fig.style.width = w + 'px';
      fig.style.left = (col.right + 34 + window.scrollX) + 'px';
      fig.style.top = (btn.getBoundingClientRect().top + window.scrollY - 12) + 'px';
      return { w: w, overlay: false };
    }
    fig.classList.add('overlay');
    fig.style.left = ''; fig.style.top = ''; fig.style.width = '';
    return { w: Math.min(vw * 0.82, 380), overlay: true };
  }

  function show(btn, pinned) {
    var key = btn.getAttribute('data-inkling');
    if (open && open.key === key) { if (pinned) open.pinned = true; return; }
    hide(true);
    var fig = document.createElement('figure');
    fig.className = 'inkling';
    fig.id = 'inkling-' + key;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', INKLINGS[key].alt);
    var cap = document.createElement('figcaption');
    cap.innerHTML = INKLINGS[key].caption;
    var close = document.createElement('button');
    close.className = 'close'; close.type = 'button'; close.textContent = 'Close';
    close.addEventListener('click', function () { hide(); btn.focus(); });
    fig.appendChild(close); fig.appendChild(canvas); fig.appendChild(cap);
    var pos = place(fig, btn);
    var veil = null;
    if (pos.overlay) {
      veil = document.createElement('div'); veil.className = 'inkling-veil';
      veil.addEventListener('click', function () { hide(); });
      document.body.appendChild(veil);
      requestAnimationFrame(function () { veil.classList.add('shown'); });
    }
    document.body.appendChild(fig);
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', fig.id);
    open = { key: key, fig: fig, btn: btn, veil: veil, pinned: !!pinned || pos.overlay };
    fig.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    fig.addEventListener('mouseleave', function () { if (open && !open.pinned) hideTimer = setTimeout(hide, 600); });

    var cssW = pos.w;
    var ck = key + ':' + Math.round(cssW);
    (cache[ck] ? Promise.resolve(cache[ck]) : prepare(key, cssW)).then(function (data) {
      cache[ck] = data;
      canvas.width = data.W; canvas.height = data.H;
      if (pos.overlay) close.focus();
      if (reduce) { animateInk(canvas, data, 1, null); fig.classList.add('shown'); return; }
      animateInk(canvas, data, 1700, null);
      requestAnimationFrame(function () { fig.classList.add('shown'); });
    });
  }

  function hide(immediate) {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (!open) return;
    var o = open; open = null;
    o.btn.setAttribute('aria-expanded', 'false');
    if (o.veil) { o.veil.classList.remove('shown'); setTimeout(function () { o.veil.remove(); }, 500); }
    if (immediate) { o.fig.remove(); return; }
    o.fig.classList.add('leaving');
    setTimeout(function () { o.fig.remove(); }, 720);
  }

  // Wire up every link of the form [phrase](#inkling-key) in the entries.
  document.querySelectorAll('.news-body a[href^="#inkling-"]').forEach(function (btn) {
    var key = btn.getAttribute('href').slice('#inkling-'.length);
    if (!INKLINGS[key]) return;
    btn.classList.add('inkling-trigger');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-inkling', key);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (open && open.key === key && open.pinned) { hide(); return; }
      show(btn, true);
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { var b = open.btn; hide(); b.focus(); } });
  window.addEventListener('resize', function () { if (open) hide(true); });
})();
