/* ==========================================================
   Rakieta — trójwymiarowa rakieta z 20 części, rysowana na <canvas>.
   Bez bibliotek: mały własny silnik 3D (obrót, perspektywa,
   rysowanie trójkątów od najdalszego do najbliższego, proste światło).

   Rocket.add(i)       — dokłada część nr i (spada z góry i podskakuje)
   Rocket.blastOff(cb) — odliczanie 3-2-1 i start w kosmos
   Rocket.crash(cb)    — rakieta nie daje rady, przewraca się i płonie
   Rocket.reset()      — pusta wyrzutnia, nowa gra
   ========================================================== */
(function () {
  "use strict";

  var SEG = 22;                         // ile ścianek ma każdy walec
  var DIST = 30;                        // odległość kamery
  var TY = 5.6;                         // kamera patrzy na tę wysokość
  var PITCH = 0.2, CP = Math.cos(PITCH), SP = Math.sin(PITCH);
  var PIV = 5;                          // wokół tej wysokości rakieta się przewraca
  var LIGHT = norm([-0.45, 0.6, 0.66]);
  var HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

  var WHITE = [238, 242, 248], RED = [236, 72, 72], BLUE = [28, 176, 246],
      STEEL = [150, 160, 176], DARK = [80, 90, 108], ORANGE = [255, 163, 58],
      GLASS = [120, 205, 255], YELLOW = [255, 206, 40], CHAR = [46, 36, 32];

  /* ---------- odrobina matematyki ---------- */
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mul(A, B) {
    var r = new Array(9);
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
      }
    }
    return r;
  }
  function apply(M, x, y, z) {
    return [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- bryły ---------- */
  // bryła obrotowa: profil [[promień, wysokość], ...] obrócony wokół osi Y
  function lathe(profile) {
    var v = [], f = [], k, i;
    for (k = 0; k < profile.length; k++) {
      for (i = 0; i < SEG; i++) {
        var a = i / SEG * Math.PI * 2;
        v.push([Math.cos(a) * profile[k][0], profile[k][1], Math.sin(a) * profile[k][0]]);
      }
    }
    for (k = 0; k < profile.length - 1; k++) {
      for (i = 0; i < SEG; i++) {
        var i2 = (i + 1) % SEG;
        var A = k * SEG + i, B = k * SEG + i2, C = (k + 1) * SEG + i2, D = (k + 1) * SEG + i;
        f.push([A, B, C], [A, C, D]);
      }
    }
    return { v: v, f: f };
  }

  function mapV(g, fn) { g.v = g.v.map(fn); return g; }

  // Każdą ściankę obracamy „na zewnątrz” bryły (od jej środka),
  // żeby potem łatwo pomijać ścianki odwrócone tyłem do kamery.
  function solid(g, color) {
    var v = g.v, cx = 0, cy = 0, cz = 0;
    v.forEach(function (p) { cx += p[0]; cy += p[1]; cz += p[2]; });
    cx /= v.length; cy /= v.length; cz /= v.length;
    g.f = g.f.filter(function (t) {
      var a = v[t[0]], b = v[t[1]], c = v[t[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (Math.hypot(nx, ny, nz) < 1e-9) return false;          // zdegenerowany trójkąt
      var mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) { var s = t[1]; t[1] = t[2]; t[2] = s; }
      return true;
    });
    g.color = color;
    return g;
  }

  function cyl(r, y0, y1, color) {
    return solid(lathe([[0, y0], [r, y0], [r, y1], [0, y1]]), color);
  }

  function sphere(r, cy, color) {
    var pr = [];
    for (var j = 0; j <= 8; j++) {
      var a = -Math.PI / 2 + Math.PI * j / 8;
      pr.push([r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return solid(lathe(pr), color);
  }

  // płaska lotka: wielokąt [[odległość od osi, wysokość], ...] o grubości th
  function fin(shape, th, ang, color) {
    var v = [], f = [], n = shape.length, R = rotY(ang), i;
    shape.forEach(function (p) {
      v.push(apply(R, p[0], p[1], -th / 2), apply(R, p[0], p[1], th / 2));
    });
    for (i = 1; i < n - 1; i++) {
      f.push([0, 2 * i, 2 * i + 2], [1, 2 * i + 1, 2 * i + 3]);
    }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      f.push([2 * i, 2 * j, 2 * j + 1], [2 * i, 2 * j + 1, 2 * i + 1]);
    }
    return solid({ v: v, f: f }, color);
  }

  function booster(x) {
    var g = lathe([[0, 0], [0.3, 0], [0.42, 0.35], [0.42, 3.7], [0.3, 4.25], [0, 4.6]]);
    return solid(mapV(g, function (p) { return [p[0] + x, p[1], p[2]]; }), ORANGE);
  }

  // okrągłe okienko na boku rakiety, zwrócone w stronę kąta phi
  function porthole(y, phi) {
    var M = mul(rotY(-phi), rotZ(-Math.PI / 2));
    function place(g) {
      return mapV(g, function (p) { var q = apply(M, p[0], p[1], p[2]); return [q[0], q[1] + y, q[2]]; });
    }
    return [
      solid(place(lathe([[0, 0.85], [0.48, 0.85], [0.48, 1.07], [0, 1.07]])), STEEL),
      solid(place(lathe([[0, 0.85], [0.34, 0.85], [0.34, 1.11], [0, 1.11]])), GLASS)
    ];
  }

  /* 20 części, od dołu do góry — w tej kolejności dziecko je dostaje */
  function buildParts() {
    var P = [];
    P.push([solid(lathe([[0, 0.05], [0.78, 0.05], [0.6, 0.45], [0.46, 0.95], [0, 0.95]]), STEEL)]); // 1 dysza
    P.push([cyl(0.95, 0.9, 1.5, DARK)]);                                                          // 2 silnik
    P.push([cyl(1, 1.5, 3.3, WHITE)]);                                                            // 3 zbiornik
    P.push([cyl(1.05, 3.3, 3.7, RED)]);                                                           // 4 czerwony pasek
    for (var k = 0; k < 4; k++) {                                                                 // 5-8 lotki
      P.push([fin([[0.95, 1.0], [1.95, 0.15], [1.95, 0.8], [0.95, 3.1]], 0.16, Math.PI / 4 + k * Math.PI / 2, RED)]);
    }
    P.push([cyl(1, 3.7, 5.5, WHITE)]);                                                            // 9 zbiornik
    P.push([booster(-1.5)]);                                                                      // 10 rakieta boczna
    P.push([booster(1.5)]);                                                                       // 11 rakieta boczna
    P.push(porthole(4.6, Math.PI / 2));                                                           // 12 okienko
    P.push([cyl(1.05, 5.5, 5.9, BLUE)]);                                                          // 13 niebieski pasek
    P.push([cyl(1, 5.9, 7.6, WHITE)]);                                                            // 14 zbiornik
    P.push(porthole(6.8, Math.PI / 2));                                                           // 15 okienko
    P.push([solid(lathe([[0, 7.6], [1, 7.6], [0.66, 8.8], [0, 8.8]]), RED)]);                     // 16 kabina
    P.push([cyl(0.72, 8.75, 8.97, YELLOW)]);                                                      // 17 żółty pierścień
    P.push([solid(lathe([[0, 8.95], [0.66, 8.95], [0.45, 9.6], [0.2, 10.05], [0, 10.2]]), WHITE)]); // 18 czubek
    P.push([cyl(0.06, 10.1, 11.0, STEEL)]);                                                       // 19 antena
    P.push([sphere(0.2, 11.15, YELLOW)]);                                                         // 20 światełko
    return P.map(makePart);
  }

  function makePart(prims) {
    var pos = [], tris = [];
    prims.forEach(function (g) {
      var off = pos.length / 3;
      g.v.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
      g.f.forEach(function (t) { tris.push([t[0] + off, t[1] + off, t[2] + off, g.color]); });
    });
    var n = pos.length / 3, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, d;
    for (i = 0; i < n; i++) {
      for (d = 0; d < 3; d++) {
        lo[d] = Math.min(lo[d], pos[i * 3 + d]);
        hi[d] = Math.max(hi[d], pos[i * 3 + d]);
      }
    }
    var pivot = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    return {
      pos: Float64Array.from(pos), n: n, tris: tris, pivot: pivot,
      radius: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2,
      vv: new Float64Array(n * 3), sv: new Float64Array(n * 2),
      present: false, dropT: -1, landed: true, exploded: false,
      R: null, t: null, v: null, w: null, minY: 0
    };
  }

  // skąd bucha ogień: dysza główna i dwie rakiety boczne
  var EMITTERS = [
    { part: 0, p: [0, 0.05, 0], size: 1 },
    { part: 9, p: [-1.5, 0, 0], size: 0.7 },
    { part: 10, p: [1.5, 0, 0], size: 0.7 }
  ];

  /* ---------- stan ---------- */
  var stage, canvas, ctx, countEl;
  var onEvent = function () {};   // wibracje: "land", "tick", "ignite", "sputter", "boom"
  var parts = [], particles = [], stars = [];
  var T = 0, last = 0;
  var mode = "build";          // "build" | "win" | "crash"
  var seqT = 0, doneCb = null, doneCalled = false;
  var yaw = 0, tilt = 0, rx = 0, ry = 0, jx = 0, shake = 0, shakePx = 0;
  var exploded = false, impactT = 0, gone = false;
  var label = "", labelT = 0, nightA = 0;

  // obracanie palcem / myszą
  var AUTO_SPIN = 0.55;          // samo się kręci z tą prędkością (rad/s)
  var IDLE = 3;                  // po tylu sekundach bez dotyku wraca samo kręcenie
  var spinVel = AUTO_SPIN;       // bieżąca prędkość obrotu
  var userT = -1e9;              // kiedy dziecko ostatnio dotknęło rakiety
  var drag = null;               // { id, x, t, moved } w trakcie przeciągania

  // kamera (liczona na nowo w każdej klatce)
  var W = 1, Hh = 1, S = 1, F = 1, cx = 0, cy = 0, groundY = 0, dpr = 1;

  function count() {
    var c = 0;
    parts.forEach(function (p) { if (p.present) c++; });
    return c;
  }

  function updateCount() {
    countEl.textContent = "🚀 " + count() + " / " + parts.length;
    countEl.classList.remove("bump");
    void countEl.offsetWidth;
    countEl.classList.add("bump");
  }

  /* ---------- kamera i rzutowanie ---------- */
  function camera() {
    var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    W = w; Hh = h;
    var full = stage.classList.contains("full");
    S = full ? Math.min(Hh * 0.5 / 11.5, W * 0.8 / 12) : Math.min(Hh * 0.8 / 11.8, W * 0.85 / 4.4);
    F = S * DIST;
    groundY = Hh * (full ? 0.82 : 0.9);
    var sx = shakePx ? rnd(-shakePx, shakePx) : 0, sy = shakePx ? rnd(-shakePx, shakePx) : 0;
    cx = W / 2 + sx;
    cy = groundY - TY * CP * F / (DIST + TY * SP) + sy;
  }

  function project(x, y, z) {
    var yy = y - TY, vy = yy * CP - z * SP, vz = yy * SP + z * CP, d = Math.max(1, DIST - vz);
    return [cx + x * F / d, cy - vy * F / d];
  }

  function rocketMatrix() { return mul(rotZ(tilt), rotY(yaw)); }

  function rocketPoint(R, x, y, z) {
    var q = apply(R, x, y - PIV, z);
    return [q[0] + rx + jx, q[1] + PIV + ry, q[2]];
  }

  function dropOffset(p) {
    if (p.dropT < 0) return 0;
    var u = (T - p.dropT) / 0.55;
    return u >= 1 ? 0 : (1 - bounce(u)) * 5;
  }

  function bounce(x) {
    var n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
    if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
    x -= 2.625 / d1; return n1 * x * x + 0.984375;
  }

  // ustawia część w świecie i liczy jej punkty na ekranie
  function place(p, Rr) {
    var R, t;
    if (p.exploded) {
      R = p.R; t = p.t;
    } else {
      R = Rr;
      t = rocketPoint(Rr, p.pivot[0], p.pivot[1] + dropOffset(p), p.pivot[2]);
    }
    var src = p.pos, v = p.vv, s = p.sv, px = p.pivot[0], py = p.pivot[1], pz = p.pivot[2], minY = 1e9;
    for (var i = 0, j = 0, k = 0; i < p.n; i++, j += 3, k += 2) {
      var x = src[j] - px, y = src[j + 1] - py, z = src[j + 2] - pz;
      var wx = R[0] * x + R[1] * y + R[2] * z + t[0];
      var wy = R[3] * x + R[4] * y + R[5] * z + t[1];
      var wz = R[6] * x + R[7] * y + R[8] * z + t[2];
      if (wy < minY) minY = wy;
      var yy = wy - TY, vy = yy * CP - wz * SP, vz = yy * SP + wz * CP;
      var d = Math.max(1, DIST - vz);
      v[j] = wx; v[j + 1] = vy; v[j + 2] = vz;
      s[k] = cx + wx * F / d; s[k + 1] = cy - vy * F / d;
    }
    p.minY = minY;
  }

  // trójkąty zwrócone do kamery: albo do listy (z kolorem), albo do sylwetki
  function collect(p, list, charA) {
    var v = p.vv, s = p.sv, tris = p.tris;
    for (var i = 0; i < tris.length; i++) {
      var tr = tris[i], a = tr[0] * 3, b = tr[1] * 3, c = tr[2] * 3;
      var ax = v[a], ay = v[a + 1], az = v[a + 2];
      var ux = v[b] - ax, uy = v[b + 1] - ay, uz = v[b + 2] - az;
      var wx = v[c] - ax, wy = v[c + 1] - ay, wz = v[c + 2] - az;
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nx * ax + ny * ay + nz * (az - DIST) >= 0) continue;     // tyłem do kamery
      var sa = tr[0] * 2, sb = tr[1] * 2, sc = tr[2] * 2;
      if (!list) {                                                  // sylwetka brakującej części
        ctx.moveTo(s[sa], s[sa + 1]); ctx.lineTo(s[sb], s[sb + 1]); ctx.lineTo(s[sc], s[sc + 1]);
        ctx.closePath();
        continue;
      }
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l; ny /= l; nz /= l;
      var diff = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      if (diff < 0) diff = 0;
      var sp = nx * HALF[0] + ny * HALF[1] + nz * HALF[2];
      sp = sp > 0 ? Math.pow(sp, 30) * 0.45 : 0;
      var kk = 0.6 + 0.48 * diff, col = tr[3];
      var r = col[0] + (CHAR[0] - col[0]) * charA;
      var g = col[1] + (CHAR[1] - col[1]) * charA;
      var bb = col[2] + (CHAR[2] - col[2]) * charA;
      sp *= 1 - charA;
      list.push({
        x0: s[sa], y0: s[sa + 1], x1: s[sb], y1: s[sb + 1], x2: s[sc], y2: s[sc + 1],
        d: DIST - (az + v[b + 2] + v[c + 2]) / 3,
        c: "rgb(" + Math.min(255, r * kk + 255 * sp | 0) + "," + Math.min(255, g * kk + 255 * sp | 0) + "," +
           Math.min(255, bb * kk + 255 * sp | 0) + ")"
      });
    }
  }

  /* ---------- cząsteczki: ogień, dym, iskierki ---------- */
  function emit(k, x, y, vx, vy, size, life) {
    if (particles.length > 900) return;
    particles.push({ k: k, x: x, y: y, vx: vx, vy: vy, size: size, life: life, max: life });
  }

  function engines(power, dt) {
    if (power <= 0) return;
    var Rr = rocketMatrix(), up = apply(Rr, 0, 1, 0);
    EMITTERS.forEach(function (e) {
      if (!parts[e.part].present && e.part !== 0) return;
      var w = rocketPoint(Rr, e.p[0], e.p[1], e.p[2]);
      var p0 = project(w[0], w[1], w[2]);
      var p1 = project(w[0] - up[0], w[1] - up[1], w[2] - up[2]);
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      var n = Math.round(90 * e.size * power * dt + Math.random() * 0.6);
      for (var i = 0; i < n; i++) {
        var sp = rnd(9, 15) * S, side = rnd(-1.4, 1.4) * S;
        emit("fire", p0[0] + rnd(-0.2, 0.2) * S, p0[1], dx * sp - dy * side, dy * sp + dx * side,
             rnd(0.35, 0.6) * S * e.size, rnd(0.35, 0.6));
      }
    });
  }

  function padSmoke(rate, dt) {
    var n = Math.round(rate * dt + Math.random() * 0.6);
    var base = project(rx, 0, 0);
    for (var i = 0; i < n; i++) {
      var dir = Math.random() < 0.5 ? -1 : 1;
      emit("smoke", base[0] + rnd(-1.5, 1.5) * S, groundY - rnd(0, 0.6) * S,
           dir * rnd(3, 10) * S, -rnd(0.3, 1.6) * S, rnd(0.6, 1.1) * S, rnd(1.4, 2.6));
    }
  }

  function fireball(x, y, n, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = rnd(2, 12) * S * power;
      emit("fire", x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.7 - 3 * S, rnd(0.6, 1.4) * S * power, rnd(0.6, 1.2));
    }
    for (i = 0; i < n / 3; i++) {
      a = Math.random() * Math.PI * 2; sp = rnd(1, 5) * S * power;
      emit("smoke", x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.5 - 2 * S, rnd(0.8, 1.4) * S * power, rnd(1.5, 3));
    }
  }

  function sparkle(x, y) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2, sp = rnd(3, 7) * S;
      emit("spark", x, y, Math.cos(a) * sp, Math.sin(a) * sp - 3 * S, rnd(0.12, 0.22) * S, rnd(0.4, 0.7));
    }
  }

  function stepParticles(dt) {
    var j = 0;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === "fire") {
        p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.8 * dt;
        if (p.vy > 0 && p.y > groundY) {           // ogień uderza w ziemię i rozlewa się na boki
          p.y = groundY; p.vy *= -0.15; p.vx += rnd(-8, 8) * S;
        }
      } else if (p.k === "smoke") {
        p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 1.2 * dt; p.size += dt * S * 1.1;
      } else {
        p.vy += 18 * S * dt;
      }
      particles[j++] = p;
    }
    particles.length = j;
  }

  function drawParticles() {
    var i, p, a;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (p.k !== "smoke") continue;
      ctx.globalAlpha = (exploded ? 0.3 : 0.42) * p.life / p.max;
      ctx.fillStyle = exploded ? "#8a817c" : "#dfe3ea";
      circle(p.x, p.y, p.size);
    }
    ctx.globalCompositeOperation = nightA > 0.5 ? "lighter" : "source-over";
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (p.k !== "fire") continue;
      a = 1 - p.life / p.max;
      ctx.globalAlpha = 0.9 * (1 - a * a);
      ctx.fillStyle = a < 0.2 ? "#ffe45c" : a < 0.5 ? "#ff9a1f" : "#e8461e";
      circle(p.x, p.y, p.size * (1 - 0.45 * a));
    }
    ctx.globalCompositeOperation = "source-over";
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (p.k !== "spark") continue;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = "#ffd21f";
      circle(p.x, p.y, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- przebieg ---------- */
  function update(dt) {
    var tt = T - seqT, i, p;
    jx = shake ? rnd(-shake, shake) : 0;
    shakePx = Math.max(0, shakePx - dt * 14);

    parts.forEach(function (p) {
      if (!p.landed && p.present && (T - p.dropT) / 0.55 >= 0.36) {
        p.landed = true;
        var w = rocketPoint(rocketMatrix(), p.pivot[0], p.pivot[1], p.pivot[2]);
        var q = project(w[0], w[1], w[2]);
        sparkle(q[0], q[1]);
        onEvent("land");
      }
    });

    if (mode === "build") {
      if (!drag) {
        if (T - userT > IDLE) {
          spinVel += (AUTO_SPIN - spinVel) * Math.min(1, dt * 1.5);   // łagodny powrót
        } else {
          spinVel *= Math.max(0, 1 - dt * 1.2);                       // bezwładność gaśnie
        }
        yaw += spinVel * dt;
      }
    } else if (mode === "win") {
      yaw += dt * 0.55;
      nightA = Math.min(1, tt / 2.5);
      setLabel(tt < 0.6 ? "3" : tt < 1.2 ? "2" : tt < 1.8 ? "1" : tt < 2.8 ? "Start!" : "");
      if (tt > 1.2 && tt < 1.8) padSmoke(12, dt);
      if (tt >= 1.8 && !gone) {
        engines(1, dt);
        if (ry < 4) padSmoke(55, dt);
        shake = tt < 2.4 ? 0.07 : Math.max(0, 0.07 - (tt - 2.4) * 0.03);
      }
      if (tt > 2.4) ry = 2 * (tt - 2.4) * (tt - 2.4);
      var bottom = project(rx, ry, 0)[1];
      if (bottom < -Hh * 0.4) gone = true;
      if (!doneCalled && (bottom < -30 || tt > 9)) finish(500);
    } else if (mode === "crash") {
      if (!exploded) {
        yaw += dt * 0.55;
        if (tt < 1.0) {                                    // silnik krztusi się
          if (Math.sin(tt * 30) > 0.2) engines(0.6, dt);
          padSmoke(15, dt);
          shake = 0.05;
        } else if (tt < 2.1) {                             // podskok i chwianie
          var u = (tt - 1) / 1.1;
          ry = 2.6 * u * u * (3 - 2 * u);
          tilt = Math.sin(tt * 9) * 0.12 * u;
          if (Math.random() < 0.5) engines(0.8, dt);
          shake = 0.03;
        } else {                                           // przewraca się
          var v = Math.min(1, (tt - 2.1) / 0.9), v2 = v * v;
          ry = 2.6 * (1 - v2) - 4 * v2;
          tilt = Math.sin(2.1 * 9) * 0.12 + (1.5 - Math.sin(2.1 * 9) * 0.12) * v2;
          shake = 0;
          if (v >= 1) explode(tt);
        }
      } else {
        physics(dt);
        burn(dt);
      }
      if (exploded && !doneCalled && tt - impactT > 1.8) finish(0);
    }
    stepParticles(dt);
  }

  function boom(q, power) {
    stage.classList.add("burn");
    fireball(q[0], q[1], Math.round(130 * power), power);
    shakePx = 12 * power;
    onEvent("boom");
  }

  function explode(tt) {
    exploded = true;
    impactT = tt;
    var Rr = rocketMatrix(), c = [rx, ry + PIV, 0];
    parts.forEach(function (p) {
      if (!p.present) return;
      var t = rocketPoint(Rr, p.pivot[0], p.pivot[1], p.pivot[2]);
      var dx = t[0] - c[0], dz = t[2] - c[2], l = Math.hypot(dx, dz) || 1;
      p.exploded = true;
      p.R = Rr.slice();
      p.t = t;
      p.v = [dx / l * rnd(3, 7) + rnd(-2, 2), rnd(5, 12), Math.max(-3, Math.min(3, dz / l * rnd(2, 4)))];
      p.w = [rnd(-5, 5), rnd(-5, 5), rnd(-5, 5)];
    });
    boom(project(c[0], c[1], c[2]), 1);
  }

  function physics(dt) {
    parts.forEach(function (p) {
      if (!p.exploded) return;
      p.v[1] -= 22 * dt;
      p.t[0] += p.v[0] * dt; p.t[1] += p.v[1] * dt; p.t[2] += p.v[2] * dt;
      p.R = mul(rotX(p.w[0] * dt), mul(rotY(p.w[1] * dt), mul(rotZ(p.w[2] * dt), p.R)));
      if (p.minY < 0) {                       // dotknął ziemi
        p.t[1] -= p.minY;
        p.minY = 0;
        if (p.v[1] < 0) p.v[1] *= -0.3;
        if (Math.abs(p.v[1]) < 1.2) p.v[1] = 0;
        var k = Math.max(0, 1 - 4 * dt);
        p.v[0] *= k; p.v[2] *= k;
        p.w[0] *= k; p.w[1] *= k; p.w[2] *= k;
      }
    });
  }

  // każda część, która odpadła, płonie
  function burn(dt) {
    parts.forEach(function (p) {
      if (!p.exploded) return;
      var q = project(p.t[0], p.t[1], p.t[2]), r = Math.min(1.4, Math.max(0.6, p.radius * 0.6));
      if (Math.random() < dt * 20) {
        emit("fire", q[0] + rnd(-0.5, 0.5) * r * S, q[1] + rnd(-0.3, 0.3) * r * S,
             rnd(-0.6, 0.6) * S, -rnd(2.5, 5) * S, rnd(0.35, 0.75) * S * r, rnd(0.5, 1));
      }
      if (Math.random() < dt * 1.5) {
        emit("smoke", q[0], q[1] - 0.5 * S, rnd(-0.5, 0.5) * S, -rnd(1, 2.2) * S, rnd(0.5, 0.9) * S, rnd(1.8, 3));
      }
    });
    // i sama wyrzutnia też
    if (Math.random() < dt * 8) {
      var b = project(rnd(-1.5, 1.5), 0, rnd(-1, 1));
      emit("fire", b[0], b[1], rnd(-0.5, 0.5) * S, -rnd(2, 4) * S, rnd(0.4, 0.8) * S, rnd(0.5, 1));
    }
  }

  function finish(delay) {
    doneCalled = true;
    var cb = doneCb;
    doneCb = null;
    if (cb) setTimeout(cb, delay);
  }

  function setLabel(txt) {
    if (txt === label) return;
    label = txt;
    labelT = T;
    if (txt === "3" || txt === "2" || txt === "1") onEvent("tick");
    else if (txt === "Start!") onEvent("ignite");
  }

  /* ---------- rysowanie ---------- */
  function draw() {
    camera();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    if (nightA > 0) drawStars();
    drawGround();

    var Rr = rocketMatrix(), list = [], charA = exploded ? Math.min(0.8, (T - seqT - impactT) / 2.5) : 0;

    if (mode === "build") {
      // sylwetka całej rakiety: widać, ile części jeszcze brakuje
      ctx.beginPath();
      parts.forEach(function (p) {
        if (p.present) return;
        place(p, Rr);
        collect(p, null, 0);
      });
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fill();
    }

    parts.forEach(function (p) {
      if (!p.present) return;
      place(p, Rr);
      collect(p, list, p.exploded ? charA : 0);
    });
    list.sort(function (a, b) { return b.d - a.d; });
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = t.c;
      ctx.fill();
      ctx.stroke();
    }

    drawParticles();
    drawLabel();
  }

  function drawStars() {
    stars.forEach(function (s) {
      ctx.globalAlpha = nightA * (0.45 + 0.55 * Math.sin(T * 2 + s.ph) * Math.sin(T * 2 + s.ph));
      ctx.fillStyle = "#fff";
      circle(s.x * W, s.y * groundY, s.r);
    });
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    var o = project(0, 0, 0), prx = 2.7 * S, pry = prx * SP * 1.25;
    ctx.fillStyle = nightA > 0.5 ? "#3d6b45" : "#8fd46b";
    ctx.fillRect(0, groundY - pry * 0.4, W, Hh);
    ctx.fillStyle = nightA > 0.5 ? "#335c3b" : "#7cc15a";
    ctx.fillRect(0, groundY - pry * 0.4, W, Math.max(2, S * 0.12));
    // wyrzutnia
    ctx.fillStyle = "#7d8899";
    ctx.beginPath(); ctx.ellipse(o[0], groundY + pry * 0.35, prx, pry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = exploded ? "#5d5652" : "#c3ccd8";
    ctx.beginPath(); ctx.ellipse(o[0], groundY, prx, pry, 0, 0, Math.PI * 2); ctx.fill();
    // cień rakiety
    if (!exploded && count() > 0) {
      ctx.fillStyle = "rgba(20,40,60," + (0.22 * Math.max(0, 1 - ry / 8)) + ")";
      ctx.beginPath(); ctx.ellipse(o[0] + rx * S, groundY, 1.5 * S, 1.5 * S * SP * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawLabel() {
    if (!label) return;
    var pop = 1 + 0.35 * Math.max(0, 1 - (T - labelT) * 5);
    var size = Math.round(Math.min(W, Hh) * (label.length > 1 ? 0.13 : 0.22) * pop);
    ctx.font = "bold " + size + "px Verdana, Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(4, size * 0.08);
    ctx.strokeStyle = "#0f5f9e";
    ctx.strokeText(label, W / 2, Hh * 0.28);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, W / 2, Hh * 0.28);
  }

  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    T += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ---------- obracanie rakiety ----------
     Przeciągnięcie obraca rakietę, a szybkie pociągnięcie ją rozkręca.
     Samo dotknięcie kręci nią w stronę dotkniętej połowy. */
  var PX_TO_RAD = 0.012;

  function bindSpin() {
    canvas.addEventListener("pointerdown", function (e) {
      if (mode !== "build" || drag) return;
      drag = { id: e.pointerId, x: e.clientX, t: performance.now(), moved: 0 };
      spinVel = 0;
      userT = T;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var now = performance.now(), dx = e.clientX - drag.x, dts = Math.max(0.008, (now - drag.t) / 1000);
      yaw += dx * PX_TO_RAD;
      spinVel = spinVel * 0.6 + (dx * PX_TO_RAD / dts) * 0.4;
      drag.x = e.clientX; drag.t = now; drag.moved += Math.abs(dx);
      userT = T;
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved < 6) {
        // dotknięcie: zakręć w stronę tej połowy, którą dotknięto
        var r = canvas.getBoundingClientRect();
        spinVel = e.clientX < r.left + r.width / 2 ? -7 : 7;
        onEvent("key");
      } else if (performance.now() - drag.t > 120) {
        spinVel = 0;                   // palec się zatrzymał przed puszczeniem
      }
      spinVel = Math.max(-12, Math.min(12, spinVel));
      drag = null;
      userT = T;
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  /* ---------- na zewnątrz ---------- */
  window.Rocket = {
    init: function (stageEl, countNode, events) {
      if (events) onEvent = events;
      stage = stageEl;
      canvas = stage.querySelector("canvas");
      ctx = canvas.getContext("2d");
      countEl = countNode;
      parts = buildParts();
      for (var i = 0; i < 110; i++) {
        stars.push({ x: Math.random(), y: Math.random() * 0.95, r: rnd(0.6, 1.8), ph: Math.random() * 6 });
      }
      this.reset();
      bindSpin();
      requestAnimationFrame(function (now) { last = now; requestAnimationFrame(loop); });
    },
    total: function () { return parts.length; },
    add: function (i) {
      var p = parts[i];
      if (!p || p.present) return;
      p.present = true;
      p.dropT = T;
      p.landed = false;
      updateCount();
    },
    reset: function () {
      parts.forEach(function (p) {
        p.present = false; p.exploded = false; p.dropT = -1; p.landed = true;
      });
      particles.length = 0;
      mode = "build"; exploded = false; gone = false;
      drag = null; spinVel = AUTO_SPIN; userT = -1e9;
      tilt = 0; rx = 0; ry = 0; jx = 0; shake = 0; shakePx = 0; nightA = 0;
      doneCb = null; doneCalled = false;
      setLabel("");
      stage.classList.remove("full", "night", "burn");
      updateCount();
    },
    blastOff: function (cb) {
      mode = "win"; seqT = T; doneCb = cb; doneCalled = false;
      stage.classList.add("full", "night");
    },
    crash: function (cb) {
      // Pusta wyrzutnia: nie ma czego rozbić, więc nic nie wybucha.
      if (count() === 0) {
        if (cb) setTimeout(cb, 400);
        return;
      }
      mode = "crash"; seqT = T; doneCb = cb; doneCalled = false;
      stage.classList.add("full");
      onEvent("sputter");
    }
  };
})();
