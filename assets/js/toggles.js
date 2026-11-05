/* Two independent behaviours:
 *
 * 1. Expandable panels (abstracts, BibTeX, course descriptions, synopses).
 *    Opening, the text spreads in like ink; closing, it fades back.
 *
 *      <div class="entry">
 *        <button class="toggle" data-panel="abstract" aria-expanded="false">…</button>
 *        <div class="panel" data-panel="abstract">…</div>
 *      </div>
 *
 *    Only one panel is open per entry, so opening BibTeX replaces a displayed
 *    abstract rather than stacking below it. The panel opens to a height
 *    measured from its own content and then drops the cap entirely, so a long
 *    abstract cannot be clipped by anything that reflows later.
 *
 * 2. Show more / show less on Comings & Goings, where entries longer than two
 *    lines are clamped. The button is only added to entries that actually
 *    overflow, so short entries carry no control at all.
 */
(function () {
  'use strict';

  /* ---- 1. panels ---- */

  function buttonFor(entry, name) {
    return entry.querySelector('.toggle[data-panel="' + name + '"]');
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The text spreads in like ink from the top left corner (near the button)
  // and comes into focus, by animating the --ink radii that the
  // .panel-inner.inking mask in style.css reads.
  function inkIn(inner) {
    if (!inner || reduceMotion) return;
    var maxR = Math.sqrt(inner.offsetWidth * inner.offsetWidth +
                         inner.scrollHeight * inner.scrollHeight) + 140;
    var t0 = null, dur = 1100;
    inner.classList.add('inking');
    inner.style.setProperty('--ink', '0px');
    inner.style.setProperty('--ink2', '0px');
    function step(now) {
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 2.4);
      inner.style.setProperty('--ink', (e * maxR).toFixed(1) + 'px');
      inner.style.setProperty('--ink2', (Math.max(0, e * 1.1 - 0.1) * maxR).toFixed(1) + 'px');
      inner.style.filter = 'blur(' + (1.4 * (1 - e)).toFixed(2) + 'px)';
      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        inner.classList.remove('inking');
        inner.style.filter = '';
      }
    }
    requestAnimationFrame(step);
  }

  function openPanel(panel, btn) {
    panel.style.maxHeight = panel.scrollHeight + 'px';
    panel.classList.add('open');
    inkIn(panel.querySelector('.panel-inner'));
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closePanel(panel, btn) {
    // Coming back from the uncapped state needs a concrete starting height,
    // and a reflow between the two values, or the transition has nothing to
    // animate from.
    if (panel.style.maxHeight === 'none' || panel.style.maxHeight === '') {
      panel.style.maxHeight = panel.scrollHeight + 'px';
      void panel.offsetHeight;
    }
    panel.style.maxHeight = '0px';
    panel.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function closeAll(entry) {
    entry.querySelectorAll('.panel').forEach(function (p) {
      if (p.classList.contains('open')) {
        closePanel(p, buttonFor(entry, p.getAttribute('data-panel')));
      }
    });
  }

  function handlePanel(btn) {
    var entry = btn.closest('.entry');
    if (!entry) return;

    var name = btn.getAttribute('data-panel');
    var panel = entry.querySelector('.panel[data-panel="' + name + '"]');
    if (!panel) return;

    var wasOpen = panel.classList.contains('open');
    closeAll(entry);
    if (!wasOpen) openPanel(panel, btn);
  }

  // Once open, let the panel size itself freely.
  document.addEventListener('transitionend', function (e) {
    if (e.propertyName !== 'max-height') return;
    var panel = e.target;
    if (panel.classList && panel.classList.contains('panel') &&
        panel.classList.contains('open')) {
      panel.style.maxHeight = 'none';
    }
  });

  /* ---- 2. show more / show less ---- */

  function handleNewsMore(btn) {
    var body = btn.previousElementSibling;
    if (!body || !body.classList.contains('news-body')) return;

    var clamped = body.classList.toggle('clamped');
    btn.setAttribute('aria-expanded', clamped ? 'false' : 'true');
    btn.textContent = clamped ? 'Show more' : 'Show less';
  }

  function setUpNews() {
    document.querySelectorAll('.news-body').forEach(function (body) {
      body.classList.add('clamped');

      // Nothing to reveal if the entry already fits inside the clamp.
      if (body.scrollHeight <= body.clientHeight + 1) {
        body.classList.remove('clamped');
        return;
      }

      var btn = document.createElement('button');
      btn.className = 'toggle news-more';
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'Show more';

      // If the clamp hides a phrase that opens an inkling, mark the button
      // with the same small ink dot, so the image can still be found.
      var bottom = body.getBoundingClientRect().bottom;
      var hidden = Array.prototype.some.call(
        body.querySelectorAll('a[href^="#inkling-"]'),
        function (a) { return a.getBoundingClientRect().top >= bottom - 2; });
      if (hidden) btn.classList.add('hides-inkling');

      body.insertAdjacentElement('afterend', btn);
    });
  }

  /* ---- wiring ---- */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.toggle');
    if (!btn) return;
    e.preventDefault();

    if (btn.classList.contains('news-more')) {
      handleNewsMore(btn);
    } else if (btn.hasAttribute('data-panel')) {
      handlePanel(btn);
    }
  });

  // Clamping depends on measured text height, so wait for webfonts to land.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(setUpNews);
  } else {
    window.addEventListener('load', setUpNews);
  }
})();
