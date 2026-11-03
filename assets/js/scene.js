/* The background scene: an ink-wash lake drawn behind every page.
 *
 *   far range, horizon, reflections   assets/img/scene/far.jpg   (slowest)
 *   drifting mist                     assets/img/scene/mist.jpg
 *   islet with pavilion and trees     assets/img/scene/mid.jpg
 *   reeds                             assets/img/scene/near.jpg  (fastest)
 *   paper grain                       assets/img/scene/paper.jpg (in style.css)
 *
 * In each .jpg the red channel holds ink and the green channel a cool colour
 * wash (white = bare paper). The layers are composed in WebGL so the water
 * can ripple; boats, birds and the cursor's ink wake are drawn on a 2D canvas
 * above them. The script builds its own elements, so no layout has to
 * include anything but this file.
 *
 * Motion: the layers move at different rates as the page scrolls; mist and
 * boats drift; a flock crosses the sky about once a minute; rain rings
 * appear on the water. The cursor leaves ink over sky and shore and ripples
 * on open water. Touch screens get no cursor effects (a tap on the water
 * makes a ring). With the system's reduced-motion setting everything is
 * still. If WebGL is unavailable the far and middle layers are shown as
 * plain images.
 */
(function () {
  'use strict';

  var DIR = '/assets/img/scene/';
  var scene = document.createElement('div');
  scene.id = 'scene';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML =
    '<img class="fallback" id="fb-far" src="' + DIR + 'far.jpg" alt="">' +
    '<img class="fallback" id="fb-mid" src="' + DIR + 'mid.jpg" alt="">' +
    '<canvas id="water"></canvas><canvas id="wake"></canvas><div class="scene-veil"></div>';
  document.body.insertBefore(scene, document.body.firstChild);

  /* ------------------------------------------------------------------ state */
  // Fixed settings (chosen in the prototype): ink over sky and shore,
  // ripples on water; full strength; rain, colour washes and birds on.
  var S = { cursor: 'ab', quiet: false, rain: true, colour: true, birds: true };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var INK = [0.150, 0.168, 0.188];
  var WASH = [0.36, 0.55, 0.62];      // cool azure-teal for the colour washes
  var INKCSS = 'rgb(' + Math.round(INK[0] * 255) + ',' + Math.round(INK[1] * 255) + ',' + Math.round(INK[2] * 255) + ')';
  var firstFlockAt = Infinity;
  // Source art sizes, in image pixels. The horizon is row 860 of the far
  // layer, row 380 of the mist, and row 0 of the middle layer.
  var ART = { far: { w: 2400, h: 1500, hz: 860 }, mid: { w: 2400, h: 900 },
              mist: { w: 2400, h: 700, hz: 380 }, near: { w: 2400, h: 1000 } };

  var vw = 0, vh = 0, docH = 0, scale = 1, horizon = 0, mistShift = 0;
  var far = { x: 0, y: 0, w: 0, h: 0 }, mid = { x: 0, y: 0, w: 0, h: 0 },
      mist = { x: 0, y: 0, w: 0, h: 0 }, near = { x: 0, y: 0, w: 0, h: 0 };

  function measure() {
    vw = window.innerWidth; vh = window.innerHeight;
    docH = Math.max(document.documentElement.scrollHeight, vh + 1);
  }

  // Four depths, each moving at its own rate:
  //   far range, horizon and reflections  0.12 of scroll (capped)
  //   mist banks                          with the far range, drifting sideways
  //   boat and islet on the water         a little faster, never above the horizon
  //   reeds                               rise into view toward the end of the page
  function layout(now) {
    var sy = reduce ? 0 : window.scrollY;
    var p = Math.min(1, Math.max(0, sy / Math.max(1, docH - vh)));
    var w = Math.max(vw, 1100);
    scale = w / ART.far.w;
    far.w = w; far.h = ART.far.h * scale; far.x = (vw - w) / 2;
    far.y = -Math.min(sy * 0.12, far.h * 0.5);
    horizon = far.y + ART.far.hz * scale;

    mist.w = w; mist.h = ART.mist.h * scale; mist.x = far.x;
    mist.y = horizon - ART.mist.hz * scale - Math.min(sy * 0.03, 50);
    if (!reduce) mistShift = (now / 1000) * 7 * scale;   // slow drift to the left

    var rel = Math.min(sy * 0.07, 60);
    mid.w = w; mid.h = ART.mid.h * scale; mid.x = far.x; mid.y = horizon - rel;

    var wn = vw < 800 ? vw * 1.25 : w;
    var sn = wn / ART.near.w;
    near.w = wn; near.h = ART.near.h * sn; near.x = (vw - wn) / 2;
    near.y = vh - near.h + near.h * 0.85 * Math.pow(1 - p, 1.4);
  }

  /* ------------------------------------------------------------- ripples */
  var MAXR = 24;
  var ripples = [];

  function addRipple(x, y, amp, life, speed) {
    if (y < horizon + 6) return;
    if (ripples.length >= MAXR) ripples.shift();
    ripples.push({ x: x, yd: y - far.y, t0: performance.now() / 1000, amp: amp, life: life, speed: speed });
    wantGL = true;
  }

  /* -------------------------------------------------------------- WebGL */
  var glc = document.getElementById('water');
  var gl = null, prog, uni = {}, glReady = false, wantGL = true;
  var gdpr = Math.min(window.devicePixelRatio || 1, 1.5);

  var VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  var FS = [
    'precision highp float;',
    'uniform vec2 uView; uniform float uDpr;',
    'uniform sampler2D uFar; uniform sampler2D uMid; uniform sampler2D uMist; uniform sampler2D uNear;',
    'uniform vec4 uRectF; uniform vec4 uRectM; uniform vec4 uRectS; uniform vec4 uRectN;',
    'uniform float uMistX; uniform float uHz; uniform float uDens; uniform float uCol; uniform float uTime;',
    'uniform vec3 uInk; uniform vec3 uWash;',
    'uniform vec4 uRip[' + MAXR + ']; uniform vec4 uRip2[' + MAXR + '];',
    'vec4 tex(sampler2D t, vec4 r, vec2 p){',
    '  vec2 uv = (p - r.xy) / r.zw;',
    '  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(1.0);',
    '  return texture2D(t, uv);',
    '}',
    'void lay(inout vec3 c, inout float a, vec3 col, float d){ c = col * d + c * (1.0 - d); a = d + a * (1.0 - d); }',
    'void main(){',
    '  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;',
    '  float water = smoothstep(uHz + 2.0, uHz + 16.0, p.y);',
    '  vec2 disp = vec2(0.0); float sh = 0.0;',
    '  for (int i = 0; i < ' + MAXR + '; i++) {',
    '    vec4 r = uRip[i]; if (r.w <= 0.0) continue;',
    '    vec4 q = uRip2[i];',
    '    vec2 dv = p - r.xy; dv.y *= q.x;',
    '    float d = length(dv);',
    '    float x = d - q.z * r.z;',
    '    float w = 6.0 + r.z * 6.0;',
    '    float life = max(1.0 - r.z / q.y, 0.0);',
    '    float f = r.w * exp(-(x * x) / (w * w)) * life * life * sin(x * 0.34);',
    '    disp += (d > 0.001 ? dv / d : vec2(0.0)) * f;',
    '    sh += f;',
    '  }',
    '  disp *= 7.0 * water; sh *= water;',
    '  vec2 pf = p + disp + vec2(water * 1.1 * sin(p.y * 0.5 + uTime * 1.6), 0.0);',
    '  vec2 ps = p + disp;',
    '  vec2 mu = (ps - uRectS.xy) / uRectS.zw;',
    '  float m = 0.0;',
    '  if (mu.y > 0.0 && mu.y < 1.0) m = 1.0 - texture2D(uMist, vec2(fract(mu.x + uMistX / uRectS.z), mu.y)).r;',
    '  vec3 c = vec3(0.0); float a = 0.0;',
    '  float me = mix(0.92, 0.5, smoothstep(uHz, uHz + 160.0, p.y));',
    '  vec4 f = tex(uFar, uRectF, pf);',
    '  lay(c, a, uWash, (1.0 - f.g) * (1.0 - me * m) * uDens * uCol);',
    '  lay(c, a, uInk, (1.0 - f.r) * (1.0 - me * m) * uDens);',
    '  vec4 g = tex(uMid, uRectM, ps);',
    '  lay(c, a, uWash, (1.0 - g.g) * (1.0 - 0.5 * m) * uDens * uCol);',
    '  lay(c, a, uInk, (1.0 - g.r) * (1.0 - 0.5 * m) * uDens);',
    '  lay(c, a, uInk, max(-sh, 0.0) * 0.20);',
    '  vec4 n = tex(uNear, uRectN, p);',
    '  lay(c, a, uWash, (1.0 - n.g) * uCol * uDens);',
    '  lay(c, a, uInk, (1.0 - n.r) * uDens);',
    '  lay(c, a, vec3(1.0), clamp(max(sh, 0.0) * 0.30, 0.0, 0.5));',
    '  gl_FragColor = vec4(c, a);',
    '}'
  ].join('\n');

  function initGL() {
    try { gl = glc.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }); } catch (e) { gl = null; }
    if (!gl) return false;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) { gl = null; return false; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uView', 'uDpr', 'uFar', 'uMid', 'uMist', 'uNear', 'uRectF', 'uRectM', 'uRectS', 'uRectN', 'uMistX',
     'uHz', 'uDens', 'uCol', 'uTime', 'uInk', 'uWash', 'uRip', 'uRip2'].forEach(function (n) {
      uni[n] = gl.getUniformLocation(prog, n);
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  function loadImg(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
  }
  function texFrom(img, unit) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function sizeGL() {
    glc.width = Math.round(vw * gdpr); glc.height = Math.round(vh * gdpr);
    if (gl) gl.viewport(0, 0, glc.width, glc.height);
  }

  var ripA = new Float32Array(MAXR * 4), ripB = new Float32Array(MAXR * 4);
  function drawGL(now) {
    var t = now / 1000;
    ripA.fill(0); ripB.fill(0);
    var alive = [];
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i], age = t - r.t0;
      if (age > r.life) continue;
      alive.push(r);
      var y = r.yd + far.y;
      var below = Math.max(0, y - horizon);
      var squash = 1.7 + 3.2 * Math.exp(-below / (vh * 0.35));
      var k = (alive.length - 1) * 4;
      ripA[k] = r.x; ripA[k + 1] = y; ripA[k + 2] = age; ripA[k + 3] = r.amp;
      ripB[k] = squash; ripB[k + 1] = r.life; ripB[k + 2] = r.speed;
    }
    ripples = alive;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uni.uView, vw, vh);
    gl.uniform1f(uni.uDpr, gdpr);
    gl.uniform1i(uni.uFar, 0); gl.uniform1i(uni.uMid, 1); gl.uniform1i(uni.uMist, 2); gl.uniform1i(uni.uNear, 3);
    gl.uniform4f(uni.uRectF, far.x, far.y, far.w, far.h);
    gl.uniform4f(uni.uRectM, mid.x, mid.y, mid.w, mid.h);
    gl.uniform4f(uni.uRectS, mist.x, mist.y, mist.w, mist.h);
    gl.uniform4f(uni.uRectN, near.x, near.y, near.w, near.h);
    gl.uniform1f(uni.uMistX, mistShift);
    gl.uniform1f(uni.uHz, horizon);
    gl.uniform1f(uni.uDens, S.quiet ? 0.8 : 1.0);
    gl.uniform1f(uni.uCol, S.colour ? 1.0 : 0.0);
    gl.uniform1f(uni.uTime, reduce ? 0 : t);
    gl.uniform3f(uni.uInk, INK[0], INK[1], INK[2]);
    gl.uniform3f(uni.uWash, WASH[0], WASH[1], WASH[2]);
    gl.uniform4fv(uni.uRip, ripA); gl.uniform4fv(uni.uRip2, ripB);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return ripples.length > 0;
  }

  // Without WebGL: the far and middle layers, multiplied onto the paper.
  var fbF = document.getElementById('fb-far'), fbM = document.getElementById('fb-mid');
  function drawFallback() {
    fbF.style.width = far.w + 'px'; fbF.style.transform = 'translate(' + far.x + 'px,' + far.y + 'px)';
    fbM.style.width = mid.w + 'px'; fbM.style.transform = 'translate(' + mid.x + 'px,' + mid.y + 'px)';
  }

  /* --------------------------------------------- land vs. water (for the cursor) */
  var maps = {};
  function makeMap(img, name, mw, mh) {
    var c = document.createElement('canvas'); c.width = mw; c.height = mh;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0, mw, mh);
    maps[name] = { w: mw, h: mh, d: x.getImageData(0, 0, mw, mh).data };
  }
  function darkAt(name, rect, x, y, thresh) {
    var m = maps[name]; if (!m) return false;
    var u = (x - rect.x) / rect.w, v = (y - rect.y) / rect.h;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    var px = (u * m.w) | 0, py = (v * m.h) | 0, lo = 255;
    for (var j = -3; j <= 3; j++) for (var i = -3; i <= 3; i++) {
      var o = ((Math.min(m.h - 1, Math.max(0, py + j)) * m.w) + Math.min(m.w - 1, Math.max(0, px + i))) * 4;
      lo = Math.min(lo, m.d[o], m.d[o + 1]);
    }
    return lo < thresh;
  }
  function onLand(x, y) {
    return darkAt('near', near, x, y, 215) || darkAt('mid', mid, x, y, 200);
  }

  /* ----------------------------------------------------------- ink wake */
  var wk = document.getElementById('wake');
  var wctx = wk.getContext('2d');
  var blobs = [];
  var sprites = [];

  function makeSprites() {
    for (var n = 0; n < 4; n++) {
      var c = document.createElement('canvas'); c.width = c.height = 96;
      var x = c.getContext('2d'), img = x.createImageData(96, 96), d = img.data;
      var ph = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
      for (var j = 0; j < 96; j++) for (var i = 0; i < 96; i++) {
        var dx = (i - 48) / 48, dy = (j - 48) / 48, r = Math.sqrt(dx * dx + dy * dy), th = Math.atan2(dy, dx);
        var edge = 0.78 + 0.08 * Math.sin(3 * th + ph[0]) + 0.05 * Math.sin(7 * th + ph[1]) + 0.03 * Math.sin(13 * th + ph[2]);
        var v = r / edge;
        var a = v < 1 ? (0.55 + 0.45 * Math.pow(v, 6)) * (1 - Math.pow(v, 12)) : 0;
        var o = (j * 96 + i) * 4;
        d[o] = INK[0] * 255; d[o + 1] = INK[1] * 255; d[o + 2] = INK[2] * 255; d[o + 3] = a * 255;
      }
      x.putImageData(img, 0, 0);
      sprites.push(c);
    }
  }

  function sizeWake() { wk.width = vw; wk.height = vh; }

  function addInk(x, y, speed) {
    var slow = Math.max(0, 1 - speed / 1400);
    var r = 7 + 15 * slow * slow + Math.random() * 3;
    var a = (S.quiet ? 0.035 : 0.06) * (0.5 + 0.5 * slow);
    if (blobs.length > 320) blobs.splice(0, blobs.length - 320);
    blobs.push({ x: x, y: y + window.scrollY, r: r, a: a, t0: performance.now(), s: sprites[(Math.random() * sprites.length) | 0] });
  }

  function drawWake(now) {
    var sy = window.scrollY, keep = [];
    wctx.save();
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i], k = (now - b.t0) / 2800;
      if (k >= 1) continue;
      keep.push(b);
      var y = b.y - sy;
      if (y < -60 || y > vh + 60) continue;
      var rr = b.r * (1 + 0.9 * Math.sqrt(k));
      wctx.globalAlpha = b.a * Math.pow(1 - k, 1.7);
      wctx.drawImage(b.s, b.x - rr, y - rr, rr * 2, rr * 2);
    }
    wctx.restore();
    blobs = keep;
    return blobs.length > 0;
  }

  /* ------------------------------------------------------------- birds */
  // A loose flock crosses the sky now and then. Each bird is two tapered
  // brush strokes and a small body. A bird gives two to four slow beats
  // (a little over one a second) and then glides for several seconds; in a flap the outer wing lags the inner, so the wing bends
  // at the wrist on the way down and straightens on the way up.
  var flock = null, nextFlock = Infinity;

  function newFlock(now, first) {
    var dir = Math.random() < 0.6 ? -1 : 1;
    var n = 6 + ((Math.random() * 4) | 0);
    var birds = [];
    for (var i = 0; i < n; i++) {
      birds.push({
        dx: i * 40 + Math.random() * 50, dy: (Math.random() - 0.5) * 80 + (i % 2 ? 14 : -14),
        size: 19 + Math.random() * 8, depth: 0.55 + Math.random() * 0.45,
        phi: Math.random() * 6.28, f: 1.25 + Math.random() * 0.35,
        mode: Math.random() < 0.35 ? 'flap' : 'glide', until: now + Math.random() * 4000, g: 1,
        sway: Math.random() * 6.28
      });
    }
    var visL = -far.x / scale, visR = visL + vw / scale;
    var lead0 = first ? (dir < 0 ? visR + 15 : visL - 15) : (dir < 0 ? ART.far.w + 300 : -300);
    return { dir: dir, t0: now, speed: 62 + Math.random() * 18, lead0: lead0, row: 170 + Math.random() * 200, birds: birds };
  }

  function wingPath(ctx, bx, by, side, S, th1, th2, reach) {
    var L1 = 0.42 * S * reach, L2 = 0.64 * S * reach;
    var rx = bx + side * 0.07 * S, ry = by;
    var ex = rx + side * L1 * Math.cos(th1), ey = ry - L1 * Math.sin(th1);
    var tx = ex + side * L2 * Math.cos(th2), ty = ey - L2 * Math.sin(th2);
    var w = 0.16 * S;
    ctx.moveTo(rx, ry - w * 0.4);
    ctx.quadraticCurveTo(ex, ey - w, tx, ty);                        // leading edge
    ctx.quadraticCurveTo(ex + side * w * 0.2, ey + w * 0.5, rx, ry + w * 0.6);   // trailing edge
  }

  function drawBird(ctx, b, x, y, S, dir, alpha) {
    var g = b.g;                                    // 0 = flapping, 1 = gliding
    var s1 = Math.sin(b.phi), s2 = Math.sin(b.phi - 1.2);
    var th1 = (0.26 + 0.62 * s1) * (1 - g) + 0.34 * g;
    var th2 = (th1 + 0.5 * s2 - 0.14) * (1 - g) - 0.22 * g;
    y += 0.05 * S * Math.cos(b.phi) * (1 - g);     // the body rises on the downstroke
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    wingPath(ctx, x, y, -1, S, th1, th2, dir < 0 ? 0.86 : 1.0);   // the far wing reads a little shorter
    wingPath(ctx, x, y, 1, S, th1, th2, dir < 0 ? 1.0 : 0.86);
    ctx.fill();
    ctx.beginPath();                               // body, head toward the direction of flight
    ctx.ellipse(x, y + 0.02 * S, 0.2 * S, 0.06 * S, 0, 0, Math.PI * 2);
    ctx.arc(x + dir * 0.2 * S, y - 0.01 * S, 0.055 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  function stepBird(b, now, dt) {
    if (b.mode === 'flap') {
      b.phi += 6.2832 * b.f * dt;
      b.g = Math.max(0, b.g - dt * 3);
      if (now > b.until && Math.sin(b.phi) > 0.2 && Math.cos(b.phi) < 0) {   // leave a flap near the top of the stroke
        b.mode = 'glide'; b.until = now + 3500 + Math.random() * 4000;
      }
    } else {
      b.g = Math.min(1, b.g + dt * 2.5);
      b.phi += 6.2832 * 0.15 * dt;
      if (now > b.until) { b.mode = 'flap'; b.until = now + (2 + Math.random() * 2) / b.f * 1000; }
    }
  }

  function drawBirds(ctx, now, dt) {
    if (!S.birds || reduce) { flock = null; return false; }
    if (!flock && now > nextFlock) flock = newFlock(now, nextFlock === firstFlockAt);
    if (!flock) return false;
    var lead = flock.lead0 + flock.dir * flock.speed * (now - flock.t0) / 1000;
    var gone = flock.dir < 0 ? lead < -far.x / scale - 600 : lead > -far.x / scale + vw / scale + 600;
    if (gone) { flock = null; nextFlock = now + 25000 + Math.random() * 30000; return false; }
    ctx.fillStyle = INKCSS;
    for (var i = 0; i < flock.birds.length; i++) {
      var b = flock.birds[i];
      stepBird(b, now, dt);
      var bx = far.x + (lead - flock.dir * b.dx) * scale;
      var by = far.y + (flock.row + b.dy + 7 * Math.sin(now / 2100 + b.sway)) * scale;
      if (bx < -40 || bx > vw + 40 || by < -40 || by > vh) continue;
      var sz = Math.max(11, b.size * scale);
      drawBird(ctx, b, bx, by, sz, flock.dir, (S.quiet ? 0.5 : 0.78) * b.depth);
    }
    ctx.globalAlpha = 1;
    return true;
  }

  /* ------------------------------------------------------------- boats */
  // Both boats are drawn live so they can move. The near one is poled
  // slowly to the right, about a fifth of the birds' speed; the far one
  // drifts left along the horizon. Their crossing times differ from the
  // birds', and each waits a random while before coming back, so the
  // three never fall into step.
  var boats = [
    { x: 430, row: 380, on: 'mid', speed: 15, dir: 1, k: 1.0, alpha: 0.92, pole: true, wait: 0, lastPush: 0 },
    { x: 860, row: 24, on: 'horizon', speed: 4, dir: -1, k: 0.34, alpha: 0.5, pole: false, wait: 0 }
  ];
  var boatCanvas = document.createElement('canvas'), bctx = boatCanvas.getContext('2d');

  // Local units: hull about 156 long, waterline at y = 9.
  function paintBoat(c, pole, t) {
    c.beginPath();                                  // hull
    c.moveTo(-74, -5); c.quadraticCurveTo(-62, 8, -42, 9); c.lineTo(52, 9);
    c.quadraticCurveTo(72, 6, 84, -9); c.quadraticCurveTo(62, -2, 44, -1); c.lineTo(-42, -1);
    c.quadraticCurveTo(-62, -1, -74, -5); c.fill();
    // seated figure with a broad hat
    c.beginPath(); c.moveTo(-31, -1); c.quadraticCurveTo(-31, -18, -24, -22); c.quadraticCurveTo(-15, -22, -12, -1); c.fill();
    c.beginPath(); c.arc(-21, -26, 4.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-33, -28); c.quadraticCurveTo(-21, -36, -9, -28); c.quadraticCurveTo(-21, -30, -33, -28); c.fill();
    if (!pole) return;
    // standing figure leaning into the pole
    var lean = 3 * Math.sin(t);
    c.beginPath(); c.moveTo(30, -1); c.lineTo(31 + lean * 0.5, -34); c.quadraticCurveTo(36 + lean, -40, 41 + lean, -34); c.lineTo(41, -1); c.fill();
    c.beginPath(); c.arc(36 + lean, -45, 4.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(23 + lean, -47); c.quadraticCurveTo(36 + lean, -59, 49 + lean, -47); c.quadraticCurveTo(36 + lean, -50, 23 + lean, -47); c.fill();
    // the pole: pushed back along the bottom, then swung forward
    var th = 0.18 + 0.42 * Math.sin(t);
    var hx = 42 + lean, hy = -30;
    c.save(); c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.rect(-100, -80, 200, 89); c.clip();          // nothing below the waterline
    c.beginPath(); c.moveTo(hx + 22 * Math.sin(th), hy - 22 * Math.cos(th)); c.lineTo(hx - 70 * Math.sin(th), hy + 70 * Math.cos(th)); c.stroke();
    c.restore();
  }

  function stepBoats(now, dt) {
    for (var i = 0; i < boats.length; i++) {
      var b = boats[i];
      if (reduce) continue;
      if (b.wait > 0) { b.wait -= dt; if (b.wait <= 0) b.x = b.dir > 0 ? -160 : ART.far.w + 160; continue; }
      b.x += b.dir * b.speed * dt;
      if ((b.dir > 0 && b.x > ART.far.w + 160) || (b.dir < 0 && b.x < -160)) b.wait = 8 + Math.random() * 22;
    }
  }

  function drawBoats(ctx, now) {
    var t = now / 1000;
    for (var i = 0; i < boats.length; i++) {
      var b = boats[i];
      if (b.wait > 0) continue;
      var k = scale * b.k;
      var X = far.x + b.x * scale;
      var Y = (b.on === 'mid' ? mid.y : horizon) + b.row * scale;
      if (X < -120 * k || X > vw + 120 * k || Y < -60 || Y > vh + 60) continue;
      var bw = Math.ceil(200 * k), bh = Math.ceil(92 * k);
      if (boatCanvas.width < bw || boatCanvas.height < bh) { boatCanvas.width = bw; boatCanvas.height = bh; }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, boatCanvas.width, boatCanvas.height);
      bctx.setTransform(k, 0, 0, k, 100 * k, 80 * k);
      bctx.fillStyle = INKCSS; bctx.strokeStyle = INKCSS;
      var poleT = t * 1.65 + i;
      paintBoat(bctx, b.pole, poleT);
      var wl = 89 * k;                                               // waterline row in the sprite
      // reflection: the sprite mirrored, in thin wavering slices, fading down
      var depthR = Math.min(70 * k, wl);
      for (var d = 0; d < depthR; d += 2) {
        if (((d / k + t * 6) % 11) < 1.6) continue;                  // lines of light on the water
        var wob = 1.6 * Math.sin(d * 0.35 + t * 2.1);
        ctx.globalAlpha = b.alpha * 0.34 * (1 - d / depthR);
        ctx.drawImage(boatCanvas, 0, wl - d - 2, bw, 2, X - 100 * k + wob, Y + 9 * k + d, bw, 2);
      }
      ctx.globalAlpha = b.alpha;
      ctx.drawImage(boatCanvas, 0, 0, bw, bh, X - 100 * k, Y - 80 * k, bw, bh);
      // a faint wake fanning out behind the stern
      if (!reduce && b.speed > 0) {
        var sx = X - b.dir * 70 * k, sy = Y + 9 * k, len = 90 * k;
        var grad = ctx.createLinearGradient(sx, sy, sx - b.dir * len, sy);
        grad.addColorStop(0, 'rgba(38,43,48,' + (0.22 * b.alpha) + ')');
        grad.addColorStop(1, 'rgba(38,43,48,0)');
        ctx.strokeStyle = grad; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx - b.dir * len * 0.5, sy - 1 * k, sx - b.dir * len, sy - 3 * k);
        ctx.moveTo(sx, sy + 2 * k); ctx.quadraticCurveTo(sx - b.dir * len * 0.5, sy + 4 * k, sx - b.dir * len * 0.85, sy + 9 * k);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // each push of the pole leaves a small ring in the water
      if (b.pole && !reduce) {
        var push = Math.sin(poleT);
        if (push > 0.97 && t - b.lastPush > 2) {
          b.lastPush = t;
          var th = 0.18 + 0.42 * push;
          addRipple(X + (42 - 70 * Math.sin(th) * 0.55) * k, Y + 10 * k, 0.45, 3.2, 30);
        }
      }
    }
  }

  /* -------------------------------------------------------------- input */
  var last = null, lastRip = null, inkAcc = 0;
  function onMove(e) {
    if (reduce || e.pointerType === 'touch' || S.cursor === 'off') return;
    var now = performance.now(), x = e.clientX, y = e.clientY;
    var speed = 0;
    if (last) speed = Math.hypot(x - last.x, y - last.y) / Math.max(1, now - last.t) * 1000;
    var onWater = y > horizon + 6 && !onLand(x, y);
    var inkHere = S.cursor === 'a' || (S.cursor === 'ab' && !onWater);
    var rippleHere = (S.cursor === 'ab' || S.cursor === 'b') && onWater;

    if (inkHere && last) {
      var dx = x - last.x, dy = y - last.y, dd = Math.hypot(dx, dy);
      inkAcc += dd;
      var n = 0;
      while (inkAcc >= 6 && n < 16) {
        inkAcc -= 6; n++;
        var f = dd > 0 ? 1 - inkAcc / dd : 1;
        addInk(last.x + dx * f, last.y + dy * f, speed);
      }
    }
    if (rippleHere) {
      if (!lastRip || Math.hypot(x - lastRip.x, y - lastRip.y) > 38 || (now - lastRip.t > 260 && speed > 30)) {
        var amp = Math.min(1.3, Math.max(0.65, speed / 700)) * (S.quiet ? 0.6 : 1);
        addRipple(x, y, amp, 3.4, 52);
        lastRip = { x: x, y: y, t: now };
      }
    }
    last = { x: x, y: y, t: now };
    kick();
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', function (e) {
    if (reduce || S.cursor === 'off' || S.cursor === 'a') return;
    if (e.target.closest('a, button, input, label, summary, select, textarea, audio, video, .inkling')) return;
    if (onLand(e.clientX, e.clientY)) return;
    addRipple(e.clientX, e.clientY, S.quiet ? 0.8 : 1.4, 4.0, 46);
    kick();
  }, { passive: true });

  /* --------------------------------------------------------------- rain */
  var nextRain = 0;
  function rainTick(now) {
    if (!S.rain || reduce || document.hidden || horizon > vh - 20) return;
    if (now < nextRain) return;
    nextRain = now + (S.quiet ? 3000 + Math.random() * 5000 : 1300 + Math.random() * 3200);
    var top = Math.max(horizon + 14, 0);
    var y = top + Math.pow(Math.random(), 0.8) * (vh - top);
    var rx = Math.random() * vw;
    if (!onLand(rx, y)) addRipple(rx, y, (S.quiet ? 0.35 : 0.55) + Math.random() * 0.3, 4.6, 24);
  }

  /* -------------------------------------------------------------- loop */
  // Full frame rate while something is happening (scrolling, ripples, ink,
  // birds); otherwise about 20 frames a second, which is plenty for the
  // slow drift of mist and boats and kinder to batteries.
  var running = false, dirty = true, lastDraw = 0;
  function kick() { dirty = true; if (!running) { running = true; requestAnimationFrame(frame); } }
  function frame(now) {
    var active = dirty || ripples.length > 0 || blobs.length > 0 || !!flock;
    if (active || now - lastDraw > 48) {
      var dt = lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0;
      lastDraw = now; dirty = false;
      layout(now);
      rainTick(now);
      if (glReady) drawGL(now); else drawFallback();
      wctx.clearRect(0, 0, vw, vh);
      stepBoats(now, dt);
      drawBoats(wctx, now);
      drawWake(now);
      drawBirds(wctx, now, dt);
    }
    if (!reduce && !document.hidden) requestAnimationFrame(frame);
    else if (ripples.length || blobs.length) requestAnimationFrame(frame);
    else running = false;
  }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { measure(); sizeGL(); sizeWake(); kick(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { running = false; kick(); } });

  measure(); layout(performance.now()); makeSprites(); sizeWake();
  var imgs = Promise.all(['far.jpg', 'mid.jpg', 'mist.jpg', 'near.jpg'].map(function (f) { return loadImg(DIR + f); }));
  imgs.then(function (I) {
    makeMap(I[1], 'mid', 480, 180);
    makeMap(I[3], 'near', 480, 200);
  });
  if (initGL()) {
    sizeGL();
    imgs.then(function (I) {
      for (var i = 0; i < 4; i++) texFrom(I[i], i);
      glReady = true;
      firstFlockAt = nextFlock = performance.now() + 1000;
      kick();
    }).catch(function () { document.documentElement.classList.add('no-gl'); firstFlockAt = nextFlock = performance.now() + 1000; kick(); });
  } else {
    document.documentElement.classList.add('no-gl');
    firstFlockAt = nextFlock = performance.now() + 1000;
  }
  kick();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); kick(); });
  window.addEventListener('load', function () { measure(); kick(); });
})();
