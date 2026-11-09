// Same void well as `shadow/void-orb`, but each loop spawns in and dissipates out (`spawn`, `dissipate`, `fade_in`, `fade_out`).
import { cycle, fit, clamp, smooth, ease, fbm, rng, TAU, WHITE, mix } from "../../core/index.js";
import { VOID, halo, ringLight, ringFast, unlight } from "./_lib.js";

const FIN0 = 0.55, FOUT0 = 0.55;

export const meta = {
  name: "Void orb summon",
  desc: "Void orb with spawn and dissipate: dust collapses in to open the sphere, the vortex runs, then streaks and dust blow out as it closes (`fade_in`, `fade_out`, `cycle`).",
  tags: ["shadow", "void", "orb", "vortex", "summon", "dark", "magic", "loop"],
  size: [168, 160],
  origin: [84, 150],
  duration: FIN0 + 3.2 + FOUT0,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: VOID, seed: 5, spawn: true, dissipate: true, fade_in: FIN0, fade_out: FOUT0, cycle: 3.2 },
};

const Y = -62, R = 12, VR = 48, GAP = R + 9, E = R + 4.5, D = 3.2, ARMS = 3, K = 7, WIND = (TAU * 2) / D;
const GULPS = [0.2, 0.68];
const wrap = (x) => x - Math.floor(x);
const gulp = (t) => GULPS.reduce((s, g) => s + Math.exp(-((((wrap(t / D - g + 0.5) - 0.5) * D) / 0.07) ** 2)), 0);

function finLen(o) {
  return o.spawn !== false ? clamp(o.fade_in ?? FIN0, 0.15, 1) : 0;
}

function foutLen(o) {
  return o.dissipate !== false ? clamp(o.fade_out ?? FOUT0, 0.15, 1) : 0;
}

function cycleLen(o) {
  return clamp(o.cycle ?? D, 1.5, 6);
}

function periodOf(o) {
  return finLen(o) + cycleLen(o) + foutLen(o);
}

/** spawn in, steady vortex cycle, dissipate out. */
function lifecycle(tm, o) {
  const fin = finLen(o), fout = foutLen(o), cyl = cycleLen(o), period = fin + cyl + fout;
  if (o.spawn !== false && fin > 0 && tm < fin) {
    const u = tm / fin;
    return { phase: "in", tc: 0, u, k: ease.outCubic(u), sc: 0.06 + 0.94 * ease.outCubic(u), spawn: true, dissipate: false, cyl, period };
  }
  const hold = tm - fin;
  if (o.dissipate !== false && fout > 0 && hold >= cyl) {
    const u = (hold - cyl) / fout;
    return { phase: "out", tc: cyl, u, k: 1 - ease.inCubic(u), sc: 0.06 + 0.94 * (1 - ease.inCubic(u)), spawn: false, dissipate: true, cyl, period };
  }
  return { phase: "hold", tc: hold, u: 0, k: 1, sc: 1, spawn: false, dissipate: false, cyl, period };
}

const SOURCES = [
  { cx: 0, cy: 0, rho: 6, n: 1, ph: 0, s: 2.6, sy: 0.75 },
  { cx: 1, cy: -1, rho: 8, n: -1, ph: 2.2, s: 2, sy: 0.6 },
  { cx: 18, cy: -6, rho: 24, n: 1, ph: 0.4, s: 2.4, sy: 0.7 },
  { cx: -26, cy: 10, rho: 30, n: 1, ph: 2.6, s: 2, sy: 0.55 },
  { cx: 8, cy: 22, rho: 20, n: 2, ph: 4.1, s: 1.6, sy: 0.8 },
  { cx: -12, cy: -26, rho: 34, n: 1, ph: 5.3, s: 1.8, sy: 0.6 },
  { cx: 34, cy: 18, rho: 16, n: 2, ph: 1.2, s: 1.4, sy: 0.9 },
];

let TAB = null;
function tables() {
  if (TAB) return TAB;
  const n = VR * 2, N = n * n, r = new Float32Array(N), th = new Float32Array(N), ln = new Float32Array(N), nz = new Float32Array(N);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = i - VR + 0.5, y = j - VR + 0.5, k = j * n + i, a = Math.atan2(y, x), d = Math.hypot(x, y), l = Math.log(Math.max(1, d));
      r[k] = d;
      th[k] = a;
      ln[k] = l;
      nz[k] = fbm(Math.cos(a) * 2.5 + l * 2.4, Math.sin(a) * 2.5 + l * 2.4, 17, 3);
    }
  return (TAB = { n, r, th, ln, nz });
}

function spawnIn(p, lc, C, seed) {
  const { u, k, sc } = lc, rn = rng(seed, Math.floor(u * 30), 9);
  const rs = R * sc, pull = ease.inCubic(u);
  for (let i = 0; i < 14; i++) {
    const x0 = rn.range(-52, 52);
    const x = x0 * (1 - pull * 0.92), y = -1 + (Y - (-1)) * pull * rn.range(0.22, 0.42);
    p.disc(x, y, 0.7 + rn.range(0, 1.1), mix(C[2], C[5], u), 0.07 * k + 0.04);
    if (pull > 0.15) p.dot(x, y, u > 0.55 ? C[6] : C[5], k * Math.min(1, pull * 3));
  }
  for (let i = 0; i < 10; i++) {
    const th = rn.range(-Math.PI * 0.92, -Math.PI * 0.08);
    const r0 = (1 - ease.outCubic(u) * 0.88) * rn.range(48, 76) * sc;
    const x = Math.cos(th) * r0, y = Y + Math.sin(th) * r0 * 0.52;
    p.dot(x, y, u > 0.72 ? WHITE : C[6], 0.35 + 0.65 * k);
    if (u > 0.12) {
      const x1 = x * (0.42 + 0.2 * u), y1 = Y + (y - Y) * (0.42 + 0.2 * u);
      p.line(x, y, x1, y1, C[4], 0.35 * k);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x0 = rn.range(-40, 40), y0 = -1 - rn.range(0, 2);
    p.disc(x0, y0, 1.2 + u * 5, C[3], 0.35 * (1 - u));
    const x = x0 * (1 - pull), y = y0 + (Y - y0) * pull * 0.5;
    p.dot(x, y, C[5], 0.5 * k);
  }
  const ringR = (VR * 0.55 + rs) * (1 - ease.outQuad(u) * 0.55);
  ringFast(p, 0, Y, ringR, 1.2, C[4], 0.4 * k);
  ringLight(p, 0, Y, ringR, 3, C[5], 0.28 * k * (1 - u * 0.4));
  if (u > 0.55) {
    p.px(0, Y, WHITE);
    p.glow(0, Y, 4 + 16 * (u - 0.55), C[6], 0.35 * k);
  }
  if (rs > 0.5) unlight(p, -rs, Y - rs, rs, Y + rs, (x, y) => x * x + (y - Y) ** 2 < (rs - 0.5) ** 2);
  p.glow(0, Y, 10 + 52 * ease.outCubic(u), C[4], 0.16 * k);
}

// the void closes: a shock ring, streaks thrown off, dust falling back to the floor
function dissipateOut(p, lc, C, seed) {
  const { u, k, sc } = lc, rn = rng(seed, Math.floor(u * 32), 11);
  const rs = R * sc, blow = ease.outQuad(u);
  const ringR = rs + 4 + VR * 0.85 * ease.outCubic(u);
  ringFast(p, 0, Y, ringR, 1.5, C[4], 0.48 * k * (1 - u * 0.45));
  ringLight(p, 0, Y, ringR, 5, C[5], 0.32 * k);
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * TAU + u * 2.4 + rn.range(-0.12, 0.12);
    const r0 = (rs + 2 + blow * rn.range(24, 58)) * Math.max(0.4, sc);
    const x = Math.cos(th) * r0, y = Y + Math.sin(th) * r0 * 0.52;
    p.dot(x, y, u < 0.3 ? WHITE : C[6], k);
    if (u < 0.65) {
      const r1 = r0 + blow * rn.range(10, 26);
      p.line(x, y, Math.cos(th) * r1, Y + Math.sin(th) * r1 * 0.52, C[4], 0.45 * k);
    }
  }
  for (let i = 0; i < 11; i++) {
    const th = rn.range(-Math.PI * 0.8, Math.PI * 0.8);
    const start = blow * rn.range(8, 28) * sc;
    const x0 = Math.cos(th) * start, y0 = Y + Math.sin(th) * start * 0.38;
    const x = x0 + rn.range(-14, 14) * u, y = y0 + u * rn.range(12, 42);
    const yf = -1 - rn.range(0, 2);
    p.dot(x, Math.min(y, y0 + (yf - y0) * ease.inQuad(u)), mix(C[5], C[3], u), 0.55 * k);
    if (u > 0.25) p.disc(x, yf, 1 + u * 3.5, C[3], 0.22 * k * u);
  }
  if (u > 0.4 && u < 0.78) {
    p.px(0, Y, WHITE);
    p.glow(0, Y, 10 * (1 - Math.abs(u - 0.58) / 0.2), C[6], 0.42 * k);
  }
  if (rs > 0.45) unlight(p, -rs, Y - rs, rs, Y + rs, (x, y) => x * x + (y - Y) ** 2 < (rs - 0.45) ** 2);
  p.glow(0, Y, 44 * sc * k, C[4], 0.2 * k * (1 - u * 0.7));
}

function vortex(p, C, t, g, sc = 1) {
  const T = tables(), n = T.n, wf = (TAU * 12) / D, gap = GAP * sc, vr = VR * sc;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i, r = T.r[k], rw = r * sc;
      if (rw < gap || r > vr) continue;
      const env = smooth(vr, vr * 0.42, rw) * smooth(gap, gap + 4 * sc, rw);
      const ph = ARMS * T.th[k] + K * T.ln[k] + WIND * t + T.nz[k] * 2.6, cs = Math.cos(ph);
      const A = (0.5 + 0.5 * cs) * env * (1 + 0.4 * g);
      if (A < 0.16) continue;
      const x = (i - VR + 0.5) * sc, y = Y + (j - VR + 0.5) * sc, hot = 1 - smooth(gap, gap + 16 * sc, rw);
      const fil = Math.cos(12 * T.th[k] + 28 * T.ln[k] + wf * t + T.nz[k] * 1.6);
      const dash = Math.cos(9 * T.ln[k] * 2.2 + 2.2 * T.th[k] + wf * 0.75 * t);
      if (fil > 0.86 && A > 0.3 && dash > -0.55) {
        const c = hot > 0.6 ? C[7] : (hot > 0.25 || fil > 0.97) && dash > 0 ? C[6] : C[5];
        p.px(x, y, c);
        p.light(x, y, c, 0.1 + 0.2 * hot);
        continue;
      }
      if (A > 0.36 && A < 0.46 && Math.sin(ph) > 0) {
        p.px(x, y, hot > 0.4 ? C[6] : C[4]);
        continue;
      }
      p.blend(x, y, A > 0.6 ? C[3] : C[2], Math.min(0.75, (A - 0.16) * 1.4));
    }
}

function lensing(p, C, t, g, sc = 1) {
  const rs = R * sc, e = E * sc;
  for (let a = 0, st = 0.7 / e; a < TAU; a += st) {
    const f = 0.5 + 0.5 * Math.cos(5 * a - (TAU * 2 * t) / D) + 0.5 * g;
    p.px(Math.cos(a) * e, Y + Math.sin(a) * e, f > 0.85 ? C[5] : f > 0.45 ? C[4] : C[3]);
  }
  for (const s of SOURCES) {
    const q = (TAU * s.n * t) / D + s.ph, sx = s.cx + s.rho * Math.cos(q), sy = s.cy + s.rho * Math.sin(q) * s.sy;
    const b = Math.max(0.3, Math.hypot(sx, sy)), al = Math.atan2(sy, sx), root = Math.sqrt(b * b + 4 * e * e);
    const images = [[(b + root) / 2, al, 1], [(root - b) / 2, al + Math.PI, 0.55]];
    for (const [r, a0, w] of images) {
      if (r < rs + 1.5) continue;
      const mag = (r / b) * w, hw = Math.min(Math.PI, (s.s * 1.6) / (2 * b)), step = 0.6 / r;
      for (let a = a0 - hw; a <= a0 + hw + 1e-6; a += step) {
        const u = hw > 0 ? Math.abs(a - a0) / hw : 0, x = Math.cos(a) * r, y = Y + Math.sin(a) * r;
        p.dot(x, y, u < 0.3 && mag > 0.8 ? WHITE : u < 0.65 ? C[7] : C[5], Math.min(1, mag * 1.4) * (1.15 - u));
        if (mag > 1.2 && u < 0.6) p.dot(x + Math.cos(a), y + Math.sin(a), C[6], 0.8);
      }
      p.glow(Math.cos(a0) * r, Y + Math.sin(a0) * r, 4 + Math.min(10, hw * r), C[6], Math.min(0.5, 0.18 * mag));
    }
  }
}

function orb(p, C, t, g, sc = 1) {
  const rs = R * sc;
  p.shade(-rs - 1, Y - rs - 1, rs + 1, Y + rs + 1, (x, y) => {
    const dx = x, dy = y - Y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > rs + 0.5) return;
    const a = Math.atan2(dy, dx);
    if (d > rs - 0.6) {
      const f = 0.5 * Math.cos(3 * a - (TAU * 2 * t) / D) + 0.3 * Math.cos(7 * a + (TAU * 3 * t) / D + 1) + 0.25 * Math.cos(13 * a - (TAU * 5 * t) / D + 2) + g;
      return f > 0.5 ? WHITE : f > 0.05 ? C[6] : f > -0.4 ? C[5] : C[4];
    }
    if (rs - d < 1.4 * sc && Math.cos(a - 0.8) > 0.6) return C[2];
    if ((dx + rs * 0.42) ** 2 + (dy + rs * 0.45) ** 2 < 1.6 * sc * sc) return C[3];
    return C[0];
  });
}

function drawScene(p, tm, o, layer) {
  const lc = lifecycle(tm, o), C = fit(o.palette, 8), fade = p.fade;
  p.fade = fade * lc.k;
  if (lc.k < 0.012) {
    p.fade = fade;
    return;
  }
  const { tc, sc, phase } = lc, rs = R * sc, g = gulp(tc), S = o.seed;
  if (lc.spawn) spawnIn(p, lc, C, S);
  if (lc.dissipate) dissipateOut(p, lc, C, S);
  if (layer === "back") {
    p.glow(0, -1, 52 * sc, C[4], (0.22 + 0.1 * g) * lc.k);
    vortex(p, C, tc, g * (phase === "hold" ? 1 : 0.55), sc);
    lensing(p, C, tc, g * (phase === "hold" ? 1 : 0.7), sc);
    p.fade = fade;
    return;
  }
  if (phase !== "hold") {
    orb(p, C, tc, g, sc);
    if (sc > 0.2) {
      halo(p, 0, Y, rs - 0.5, rs + 7, C[6], 0.45 * lc.k);
      unlight(p, -rs, Y - rs, rs, Y + rs, (x, y) => x * x + (y - Y) ** 2 < (rs - 0.6) ** 2);
    }
    p.fade = fade;
    return;
  }
  cycle(tc, D, 14, S + 2, (r) => r.range(1.6, 2.4), (age, L, r) => {
    const x0 = r.range(-44, 44), u = Math.pow(age / L, 1.7), side = Math.sign(x0) || 1, ea = Math.PI / 2 + side * r.range(0.3, 1);
    const ex = Math.cos(ea) * rs, ey = Y + Math.sin(ea) * rs, mx = x0 * 0.2, my = -18 - r.range(0, 12);
    const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * ex, y = (1 - u) * (1 - u) * -1 + 2 * (1 - u) * u * my + u * u * ey;
    if (age < 0.5) p.disc(x0, -1.5, 2 + age * 6, C[3], 0.4 * (1 - age / 0.5));
    p.dot(x, y, u > 0.6 ? C[7] : u > 0.25 ? C[6] : C[5], Math.min(1, age * 4));
    if (u > 0.3) p.glow(x, y, 3, C[5], 0.25);
  });
  cycle(tc, D, 30, S, (r) => r.range(1.1, 1.8), (age, L, r) => {
    let th0 = r.range(0, TAU);
    if (Math.sin(th0) > 0.75) th0 = -th0;
    const r0 = r.range(30, 64) * sc, sw = r.range(1.4, 2.6), col = r.pick([WHITE, C[7], C[6], C[6], C[5]]);
    const pos = (aa) => {
      const u = clamp(aa / L), k = Math.pow(u, 1.8), rr = rs + 1 + (r0 - rs - 1) * (1 - k), th = th0 - sw * (k + 0.5 * u);
      return [Math.cos(th) * rr, Y + Math.sin(th) * rr, rr];
    };
    const [x, y, rr] = pos(age), [tx, ty] = pos(age - 0.05), a = Math.min(1, age * 5);
    if (rr < rs + 3) {
      p.px(x, y, WHITE);
      p.glow(x, y, 5, C[6], 0.5);
      return;
    }
    p.line(tx, ty, (tx + x) / 2, (ty + y) / 2, C[4], a * 0.8);
    p.line((tx + x) / 2, (ty + y) / 2, x, y, col, a);
    p.glow(x, y, 3, col, 0.3 * a);
  });
  cycle(tc, D, 9, S + 1, 0.42, (age, L, r) => {
    let th = r.range(0, TAU);
    if (Math.sin(th) > 0.45) th = -th;
    const r0 = r.range(56, 74) * sc, u = age / L, k = (Math.exp(3 * u) - 1) / (Math.exp(3) - 1), rr = r0 - (r0 - rs - 1) * k;
    const len = 2 + 10 * k, ca = Math.cos(th), sa = Math.sin(th);
    for (let d = 0; d <= len; d += 0.5) p.dot(ca * (rr + d), Y + sa * (rr + d), d < 1 ? WHITE : d < len * 0.5 ? C[6] : C[4], d < len * 0.5 ? 1 : 1.2 - d / len);
    p.glow(ca * rr, Y + sa * rr, 4, C[6], 0.4);
  });
  for (const gp of GULPS) {
    const u = wrap(tc / D - gp) / (0.4 / D);
    if (u >= 1) continue;
    const rr = rs + 2 + (VR * sc - rs) * (1 - ease.inQuad(u));
    ringFast(p, 0, Y, rr, 1, C[4], 0.35 * (1 - u));
    ringLight(p, 0, Y, rr, 4, C[5], 0.3 * (1 - u));
  }
  orb(p, C, tc, g, sc);
  halo(p, 0, Y, rs - 0.5, rs + 7, C[6], (0.6 + 0.3 * g) * lc.k);
  halo(p, 0, Y, rs - 0.5, rs + 46 * sc, C[4], (0.38 + 0.15 * g) * lc.k);
  unlight(p, -rs, Y - rs, rs, Y + rs, (x, y) => x * x + (y - Y) ** 2 < (rs - 0.6) ** 2);
  p.fade = fade;
}

export function recordDuration(o) {
  return periodOf(o);
}

export function create(o) {
  let t = 0;
  const tm = () => {
    const P = periodOf(o);
    return ((t % P) + P) % P;
  };
  return {
    update(dt) {
      t += dt;
    },
    drawBack(p) {
      drawScene(p, tm(), o, "back");
    },
    draw(p) {
      drawScene(p, tm(), o, "front");
    },
  };
}
