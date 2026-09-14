/* Two independent behaviours:
 *
 * 1. Expandable panels (abstracts, BibTeX, course descriptions, synopses).
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

  function openPanel(panel, btn) {
    panel.style.maxHeight = panel.scrollHeight + 'px';
    panel.classList.add('open');
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
