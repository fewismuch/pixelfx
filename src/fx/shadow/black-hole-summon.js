// Same black hole as `shadow/black-hole`, with spawn in and dissipate out (`spawn`, `dissipate`, `fade_in`, `fade_out`).
// Disk math adapted from Sprite Fusion's black-hole, MIT License, Copyright (c) 2026 Hugo Duprez.
import { cycle, fit, clamp, smooth, ease, rng, TAU, WHITE, hex, mix } from "../../core/index.js";
import { VOID, halo, ringLight, ringFast, unlight } from "./_lib.js";

const FIN0 = 0.6, FOUT0 = 0.6;

export const meta = {
  name: "Black hole summon",
  desc: "Like black hole: floor rubble and violet streaks collapse in, the accretion disk opens, debris spirals; then motes and rock blow out as it shuts (`fade_in`, `fade_out`, `cycle`).",
  tags: ["shadow", "black-hole", "void", "summon", "gravity", "dark", "magic", "loop"],
  size: [184, 132],
  origin: [92, 124],
  duration: FIN0 + 4 + FOUT0,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: VOID,
    rock: ["#120d1c", "#2e2440", "#544468", "#857399"],
    seed: 4,
    spawn: true,
    dissipate: true,
    fade_in: FIN0,
    fade_out: FOUT0,
    cycle: 4,
  },
};

const Y = -70, RS = 13.5, E = 17.5, SI = 0.25, SI_ARCH = 0.46, TILT = -0.14, D = 4;
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const BANDS = [
  { r0: 18, r1: 24, n: 5, hot: 1.35, k: 0.3 },
  { r0: 26, r1: 34, n: 3, hot: 0.92, k: 1.9 },
  { r0: 35.5, r1: 46, n: 2, hot: 0.64, k: 3.7 },
  { r0: 47.5, r1: 60, n: 1, hot: 0.42, k: 5.2 },
];
const ROUT = 60;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const ICE = hex("#e4f7ff");

function finLen(o) {
  return o.spawn !== false ? clamp(o.fade_in ?? FIN0, 0.15, 1) : 0;
}

function foutLen(o) {
  return o.dissipate !== false ? clamp(o.fade_out ?? FOUT0, 0.15, 1) : 0;
}

function cycleLen(o) {
  return clamp(o.cycle ?? D, 2, 8);
}

function periodOf(o) {
  return finLen(o) + cycleLen(o) + foutLen(o);
}

function lifecycle(tm, o) {
  const fin = finLen(o), fout = foutLen(o), cyl = cycleLen(o);
  if (o.spawn !== false && fin > 0 && tm < fin) {
    const u = tm / fin;
    return { phase: "in", tc: 0, u, k: ease.outCubic(u), sc: 0.05 + 0.95 * ease.outCubic(u), spawn: true, dissipate: false, cyl };
  }
  const hold = tm - fin;
  if (o.dissipate !== false && fout > 0 && hold >= cyl) {
    const u = (hold - cyl) / fout;
    return { phase: "out", tc: cyl, u, k: 1 - ease.inCubic(u), sc: 0.05 + 0.95 * (1 - ease.inCubic(u)), spawn: false, dissipate: true, cyl };
  }
  return { phase: "hold", tc: hold, u: 0, k: 1, sc: 1, spawn: false, dissipate: false, cyl };
}

function disk(X, Z, t, sc = 1) {
  const rho = Math.sqrt(X * X + Z * Z);
  for (const b of BANDS) {
    const r0 = b.r0 * sc, r1 = b.r1 * sc;
    if (rho < r0 || rho > r1) continue;
    const w = (rho - r0) / (r1 - r0), ph = Math.atan2(Z, X) - (TAU * b.n * t) / D;
    const streak = 0.62 + 0.22 * Math.cos(7 * ph + rho * 0.8 + b.k) + 0.16 * Math.cos(13 * ph - rho * 1.6 + b.k * 2);
    const lane = 0.72 + 0.28 * Math.cos(rho * 2.3 + b.k);
    const edge = smooth(0, 0.18, w) * (1 - smooth(0.78, 1, w));
    return { I: b.hot * streak * lane * (0.35 + 0.65 * edge) * sc, dop: rho > 0.2 ? -X / rho : 0 };
  }
  return null;
}

function hole(p, C, t, pulse, sc = 1) {
  const rs = RS * sc, e = E * sc, rout = ROUT * sc;
  const RAMP = [C[1], C[2], C[3], C[4], C[5], C[6], C[7], WHITE], n = RAMP.length;
  const W = rout + 2, H = 42 * sc;
  p.shade(-W, Y - H, W, Y + H, (x, y, out) => {
    const dx = x, dy = y - Y, u = dx * CT + dy * ST, v = -dx * ST + dy * CT, r = Math.sqrt(u * u + v * v);
    let s = null;
    if (v > 0) s = disk(u, -v / SI, t, sc);
    if (!s && r > rs) {
      const k = 1 - (e * e) / (r * r), bu = u * k, bv = v * k, si = k > 0 ? SI_ARCH : SI;
      if (-bv / si > 0) s = disk(bu, -bv / si, t, sc);
    }
    if (!s || s.I < 0.06) {
      if (r < rs - 0.4) return C[0];
      if (r < rs + 0.7) {
        const a = Math.atan2(v, u), f = 0.5 + 0.5 * Math.cos(3 * a + (TAU * 2 * t) / D) + pulse * 0.4;
        out.k = 0.3 * sc;
        return f > 0.55 ? WHITE : C[7];
      }
      return;
    }
    const I = s.I * 1.3 * (1 + 0.55 * s.dop) * (1 + 0.25 * pulse), f = clamp(I) * (n - 1);
    let i = Math.floor(f);
    if (f - i > BAYER[((Math.floor(y) & 3) << 2) | (Math.floor(x) & 3)]) i = Math.min(n - 1, i + 1);
    if (i === 0 && I < 0.12) return;
    let c = RAMP[i];
    if (s.dop > 0.35 && i >= n - 3) c = mix(c, ICE, Math.min(1, (s.dop - 0.35) * 2));
    if (s.dop < -0.4 && i >= 2 && i < n - 2) c = mix(c, C[3], 0.35);
    if (i >= n - 4 && ((Math.floor(x) + Math.floor(y)) & 1) === 0) out.k = 0.3 * Math.min(1, I - 0.35);
    return c;
  });
}

function spawnIn(p, lc, C, K, seed) {
  const { u, k, sc } = lc, rn = rng(seed, Math.floor(u * 30), 4);
  const rs = RS * sc, pull = ease.inCubic(u);
  for (let i = 0; i < 12; i++) {
    const x0 = rn.range(-60, 60);
    const tx = Math.sign(x0 || 1) * rn.range(8, 22) * sc;
    const x = x0 + (tx - x0) * pull, y = -1 + (Y + rn.range(2, 10) - (-1)) * pull - Math.sin(Math.PI * pull) * 8;
    p.px(x, y, pull > 0.5 ? K[3] : K[2]);
    if (pull < 0.35) p.disc(x0, -1.5, 2 + pull * 10, K[2], 0.4 * (1 - pull / 0.35));
  }
  for (let i = 0; i < 10; i++) {
    const th = rn.range(-Math.PI * 0.92, -Math.PI * 0.08);
    const d = (1 - ease.outCubic(u) * 0.86) * rn.range(52, 82) * sc;
    const x = Math.cos(th) * d * 1.12, y = Y + Math.sin(th) * d * 0.72;
    p.dot(x, y, u > 0.7 ? WHITE : C[6], 0.35 + 0.65 * k);
    if (u > 0.1) p.line(x * (0.45 + 0.18 * u), Y + (y - Y) * (0.45 + 0.18 * u), x, y, C[4], 0.35 * k);
  }
  const ringR = (ROUT * 0.48 + rs) * (1 - ease.outQuad(u) * 0.52);
  ringFast(p, 0, Y, ringR, 1.2, C[4], 0.38 * k);
  ringLight(p, 0, Y, ringR, 3, C[5], 0.26 * k * (1 - u * 0.35));
  if (u > 0.5) {
    p.px(0, Y, WHITE);
    p.glow(0, Y, 4 + 18 * (u - 0.5), C[6], 0.32 * k);
  }
  p.glow(0, Y, 12 + 60 * ease.outCubic(u), C[4], 0.14 * k);
}

function dissipateOut(p, lc, C, K, seed) {
  const { u, k, sc } = lc, rn = rng(seed, Math.floor(u * 32), 11);
  const rs = RS * sc, blow = ease.outQuad(u);
  const ringR = rs + 4 + ROUT * 0.52 * ease.outCubic(u);
  ringFast(p, 0, Y, ringR, 1.2, C[4], 0.42 * k * (1 - u * 0.4));
  ringLight(p, 0, Y, ringR, 3, C[5], 0.24 * k);
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * TAU + u * 2.2 + rn.range(-0.1, 0.1);
    const d = (rs + 3 + blow * rn.range(26, 62)) * Math.max(0.35, sc);
    const x = Math.cos(th) * d * 1.12, y = Y + Math.sin(th) * d * 0.72;
    p.dot(x, y, u < 0.32 ? WHITE : C[6], k);
    if (u < 0.62) p.line(x, y, Math.cos(th) * (d + blow * rn.range(8, 22)) * 1.12, Y + Math.sin(th) * (d + blow * rn.range(8, 22)) * 0.72, C[4], 0.42 * k);
  }
  for (let i = 0; i < 10; i++) {
    const x0 = rn.range(-50, 50), yf = -1 - rn.range(0, 2);
    const x = x0 + rn.range(-12, 12) * u;
    const y0 = Y + rn.range(-8, 12) * sc, y = y0 + (yf - y0) * ease.inQuad(u) + u * rn.range(6, 22);
    p.px(x, y, mix(K[3], K[1], u));
    if (u > 0.2) p.disc(x, yf, 1.5 + u * 3, K[2], 0.28 * k * u);
  }
  if (u > 0.38 && u < 0.76) {
    p.glow(0, Y, 12 * (1 - Math.abs(u - 0.56) / 0.2), C[6], 0.38 * k);
  }
  p.glow(0, Y, 38 * sc * k, C[4], 0.15 * k * (1 - u * 0.65));
}

function holdDraw(p, t, o, lc) {
  const C = fit(o.palette, 8), K = fit(o.rock, 4), S = o.seed, pulse = Math.max(0, Math.cos((TAU * 2 * t) / D)) ** 12;
  cycle(t, D, 10, S + 3, (r) => r.range(1.6, 2.6), (age, L, r) => {
    const x0 = r.range(-60, 60), u = Math.pow(age / L, 1.5), tx = Math.sign(x0 || 1) * r.range(40, 56), ty = Y + r.range(4, 9);
    const x = x0 + (tx - x0) * u, y = -1 + (ty + 1) * u - Math.sin(Math.PI * u) * 10;
    p.px(x, y, u > 0.6 ? K[3] : K[2]);
    if (age < 0.25) p.disc(x0, -1.5, 2 + age * 8, K[2], 0.4 * (1 - age / 0.25));
  });
  hole(p, C, t, pulse, lc.sc);
  cycle(t, D, 40, S + 7, (r) => r.range(0.5, 0.9), (age, L, r) => {
    const a0 = r.range(0, TAU), d0 = r.range(48, 76), q = Math.pow(age / L, 1.6), d = RS + 2 + (d0 - RS - 2) * (1 - q), a = a0 + 0.9 * q;
    const x = Math.cos(a) * d * 1.15, y = Y + Math.sin(a) * d * 0.75, q2 = Math.pow(Math.max(0, age - 0.09) / L, 1.6), d2 = RS + 2 + (d0 - RS - 2) * (1 - q2), a2 = a0 + 0.9 * q2;
    if (d < RS + 3 || y > -3 || y < -120 || Y + Math.sin(a2) * d2 * 0.75 < -120 || Math.abs(x) > 90) return;
    const col = r.pick([WHITE, C[7], C[6], C[5]]);
    p.line(Math.cos(a2) * d2 * 1.15, Y + Math.sin(a2) * d2 * 0.75, x, y, (u) => (u > 0.6 ? col : C[4]), Math.min(1, age * 6));
    p.glow(x, y, 3, col, 0.3);
  });
  cycle(t, D, 22, S, (r) => r.range(1.4, 2.4), (age, L, r) => {
    const ph0 = r.range(0, TAU), rho0 = r.range(58, 80), hgt = r.range(-8, 8), size = r.range(1.6, 2.8);
    const at = (aa) => {
      const q = clamp(aa / L), rho = RS + 1 + (rho0 - RS - 1) * (1 - Math.pow(q, 1.5)), ph = ph0 + 2.4 * Math.pow(q, 1.6) * (1 + 1.5 * q);
      const X = Math.cos(ph) * rho, Z = Math.sin(ph) * rho, sx = X, sy = -Z * SI + hgt * (1 - q);
      return { x: sx * CT - sy * ST, y: Y + sx * ST + sy * CT, Z, rho };
    };
    const a = at(age), b = at(age - 0.04), hidden = a.Z > 0 && Math.hypot(a.x, a.y - Y) < RS + 1;
    if (hidden) return;
    if (a.rho < RS + 3) {
      p.px(a.x, a.y, WHITE);
      p.glow(a.x, a.y, 6, C[6], 0.6);
      return;
    }
    const heat = 1 - smooth(16, 34, a.rho), len = 1 + heat * 7;
    if (heat > 0.05) {
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
      p.line(a.x - (dx / l) * len, a.y - (dy / l) * len, a.x, a.y, (u) => (u > 0.7 ? WHITE : u > 0.35 ? C[6] : C[4]));
      p.glow(a.x, a.y, 4, C[6], 0.4 * heat);
    } else {
      const lx = -a.x / (Math.hypot(a.x, a.y - Y) || 1), ly = -(a.y - Y) / (Math.hypot(a.x, a.y - Y) || 1);
      const c = at(age - 0.09), d = at(age - 0.15);
      p.px(b.x, b.y, C[3]);
      p.dot(c.x, c.y, C[3], 0.7);
      p.dot(d.x, d.y, C[2], 0.5);
      const s2 = size > 2.2;
      p.px(a.x, a.y, K[2]);
      p.px(a.x + 1, a.y, K[1]);
      p.px(a.x, a.y + 1, K[1]);
      if (s2) (p.px(a.x + 1, a.y + 1, K[0]), p.px(a.x - 1, a.y, K[1]), p.px(a.x, a.y - 1, K[2]));
      p.px(a.x + Math.round(lx * 1.4), a.y + Math.round(ly * 1.4), s2 ? C[6] : C[5]);
      p.glow(a.x, a.y, 4, C[5], 0.15);
    }
  });
  halo(p, 0, Y, RS - 0.4, RS + 4, C[6], (0.35 + 0.3 * pulse) * lc.k);
  unlight(p, -RS, Y - RS, RS, Y + RS, (x, y) => {
    const dx = x, dy = y - Y, v = -dx * ST + dy * CT, u = dx * CT + dy * ST;
    return u * u + v * v < (RS - 0.6) ** 2 && !(v > 0 && disk(u, -v / SI, t, lc.sc));
  });
}

function drawScene(p, tm, o, layer) {
  const lc = lifecycle(tm, o), C = fit(o.palette, 8), K = fit(o.rock, 4), fade = p.fade;
  p.fade = fade * lc.k;
  if (lc.k < 0.012) {
    p.fade = fade;
    return;
  }
  const pulse = lc.phase === "hold" ? Math.max(0, Math.cos((TAU * 2 * lc.tc) / D)) ** 12 : 0;
  if (lc.spawn) spawnIn(p, lc, C, K, o.seed);
  if (lc.dissipate) dissipateOut(p, lc, C, K, o.seed);
  if (layer === "back") {
    p.glow(0, -1, 44 * lc.sc, C[4], 0.12 * lc.k);
    p.glow(0, Y, 80 * lc.sc, C[4], 0.32 * lc.k);
    p.glow(0, Y, 46 * lc.sc, mix(C[6], C[5], 0.5), 0.45 * lc.k);
    p.fade = fade;
    return;
  }
  if (lc.phase !== "hold") {
    hole(p, C, lc.tc, pulse * 0.5, lc.sc);
    if (lc.sc > 0.15) halo(p, 0, Y, RS * lc.sc - 0.4, RS * lc.sc + 4, C[6], 0.3 * lc.k);
    const rs = RS * lc.sc;
    unlight(p, -rs, Y - rs, rs, Y + rs, (x, y) => {
      const dx = x, dy = y - Y, v = -dx * ST + dy * CT, u = dx * CT + dy * ST;
      return u * u + v * v < (rs - 0.6) ** 2;
    });
    p.fade = fade;
    return;
  }
  holdDraw(p, lc.tc, o, lc);
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
