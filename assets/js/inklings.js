/* Inklings on Comings & Goings: a photograph tied to a phrase in an entry.
 * Clicking the phrase opens the photograph in the middle of the screen,
 * over a veil of mist, in its own colours: the only thing done to it is a
 * soft, uneven edge (a mask in style.css). It is uncovered from one point
 * outward, like ink spreading, and the caption follows. Close, a click outside, or Esc dismisses it.
 *
 * The images come from _data/news.yml through _layouts/news.html, which
 * renders each one as a <figure class="inkling-source" id="inkling-KEY">
 * under its entry. Without JavaScript those figures simply show there.
 */
(function () {
  'use strict';

  var column = document.querySelector('.news-list');
  if (!column) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INKLINGS = {};

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

  var open = null;   // {key, fig, veil, btn}

  // Uncover the photograph from its seed point outward by animating the
  // --ink radius that the .inkling img.spreading mask in style.css reads.
  // The mask is removed when the spread is complete.
  function spread(img, seed) {
    if (reduce) return;
    var w = img.clientWidth, h = img.clientHeight;
    var sx = seed[0] * w, sy = seed[1] * h;
    var maxR = Math.max(Math.hypot(sx, sy), Math.hypot(w - sx, sy),
                        Math.hypot(sx, h - sy), Math.hypot(w - sx, h - sy)) + 120;
    img.style.setProperty('--sx', sx + 'px');
    img.style.setProperty('--sy', sy + 'px');
    img.style.setProperty('--ink', '0px');
    img.classList.add('spreading');
    var t0 = null, dur = 1300;
    function step(now) {
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 2.2);
      img.style.setProperty('--ink', (e * maxR).toFixed(1) + 'px');
      if (k < 1 && img.isConnected) requestAnimationFrame(step);
      else img.classList.remove('spreading');
    }
    requestAnimationFrame(step);
  }

  function show(btn) {
    var key = btn.getAttribute('data-inkling');
    var spec = INKLINGS[key];
    hide(true);

    var veil = document.createElement('div');
    veil.className = 'inkling-veil';
    veil.addEventListener('click', function () { hide(); btn.focus(); });

    var fig = document.createElement('figure');
    fig.className = 'inkling';
    fig.id = 'inkling-open-' + key;
    fig.setAttribute('role', 'dialog');
    fig.setAttribute('aria-modal', 'true');
    fig.setAttribute('aria-label', spec.alt);

    var close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', function () { hide(); btn.focus(); });

    var img = document.createElement('img');
    img.alt = spec.alt;
    img.src = spec.src;

    var cap = document.createElement('figcaption');
    cap.innerHTML = spec.caption;

    fig.appendChild(close);
    fig.appendChild(img);
    fig.appendChild(cap);
    document.body.appendChild(veil);
    document.body.appendChild(fig);

    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', fig.id);
    open = { key: key, fig: fig, veil: veil, btn: btn };

    function reveal() {
      spread(img, spec.seed);
      requestAnimationFrame(function () { veil.classList.add('shown'); fig.classList.add('shown'); });
      close.focus();
    }
    if (img.complete && img.naturalWidth) reveal();
    else { img.addEventListener('load', reveal); img.addEventListener('error', reveal); }
  }

  function hide(immediate) {
    if (!open) return;
    var o = open;
    open = null;
    o.btn.setAttribute('aria-expanded', 'false');
    if (immediate) { o.fig.remove(); o.veil.remove(); return; }
    o.fig.classList.remove('shown');
    o.fig.classList.add('leaving');
    o.veil.classList.remove('shown');
    setTimeout(function () { o.fig.remove(); o.veil.remove(); }, 600);
  }

  // Wire up every link of the form [phrase](#inkling-key) in the entries.
  document.querySelectorAll('.news-body a[href^="#inkling-"]').forEach(function (btn) {
    var key = btn.getAttribute('href').slice('#inkling-'.length);
    if (!INKLINGS[key]) return;
    btn.classList.add('inkling-trigger');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-inkling', key);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (open && open.key === key) { hide(); return; }
      show(btn);
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open) { var b = open.btn; hide(); b.focus(); }
  });
})();
