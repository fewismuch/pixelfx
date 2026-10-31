// The plasma ball (a lit rim, filaments from a white-hot heart, motes riding round it, zaps that spark where
// they land) follows Sprite Fusion's open-source energy orb (https://www.spritefusion.com/pixel-art-vfx/energy),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { P, Rng, fit, bolt, forks, tileFbm, clamp, smooth, lerp, ease, rand, rng, mix, TAU, WHITE } from "../../core/index.js";
import { Ghosts, since, strokeArc } from "./_lib.js";

const CORE = 2.4, FIN0 = 0.45, FOUT0 = 0.45;

export const meta = {
  name: "Energy core",
  desc: "A plasma core in a steel cage: it beats, shock rings, arcs to the bars. Spawns from vapor and dissipates again each loop; cage off hides the housing.",
  tags: ["scifi", "reactor", "core", "power", "plasma", "machine", "prop", "ground", "loop"],
  size: [112, 100],
  origin: [56, 88],
  duration: CORE + FIN0 + FOUT0,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#1a0516", "#3d0a33", "#701560", "#b0228f", "#f53cd1", "#ff86e6", "#ffd2f6", "#ffffff"],
    metal: ["#0e0d14", "#1e1c27", "#312e3e", "#4b4759", "#6f6a82", "#9d98b0"],
    seed: 35,
    cage: true,
    spawn: true,
    dissipate: true,
    fade_in: FIN0,
    fade_out: FOUT0,
  },
};

const CY = -36, R0 = 11, RC = 24, TOPY = -64, BOTY = -9, SLOT = 0.1, NS = Math.round(CORE / SLOT);
const BEATS = [[0.05, 1, true], [0.25, 0.5, false], [1.25, 1, true], [1.45, 0.5, false]];
const env = (a) => (a < 0.03 ? a / 0.03 : Math.exp(-(a - 0.03) / 0.12));
const pulseAt = (tc) => BEATS.reduce((m, [b, k]) => Math.max(m, k * env(since(tc, b, CORE))), 0);

const BARS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * TAU + Math.PI / 6;
  return { x: RC * Math.sin(a), z: Math.cos(a) };
});

function ringPt(r, tilt, spin, a) {
  const x = r * Math.cos(a), z0 = r * Math.sin(a), y = -z0 * Math.sin(tilt), z = z0 * Math.cos(tilt);
  return [x * Math.cos(spin) + z * Math.sin(spin), CY - y, -x * Math.sin(spin) + z * Math.cos(spin)];
}
const RINGS = [
  { r: 17, tilt: 1.15, spin: (t) => TAU * (t / CORE) },
  { r: 19, tilt: -0.9, spin: (t) => -TAU * 2 * (t / CORE) + 1 },
];

function phases(o) {
  const fin = o.spawn !== false ? clamp(o.fade_in ?? FIN0, 0.15, 1) : 0;
  const fout = o.dissipate !== false ? clamp(o.fade_out ?? FOUT0, 0.15, 1) : 0;
  return { fin, fout, D: CORE + fin + fout };
}

/** Loop time: spawn in, steady core, dissipate out; k is master opacity for the whole prop. */
function lifecycle(t, o) {
  const { fin, fout, D } = phases(o);
  if (o.spawn !== false && fin > 0 && t < fin) {
    const u = t / fin;
    return { k: ease.outCubic(u), tc: 0, u, phase: "in", fin, fout, D };
  }
  const tc = t - fin;
  if (o.dissipate !== false && fout > 0 && tc >= CORE) {
    const u = (tc - CORE) / fout;
    return { k: 1 - ease.inCubic(u), tc: CORE, u, phase: "out", fin, fout, D };
  }
  return { k: 1, tc, u: 0, phase: "hold", fin, fout, D };
}

const cache = new Map();
function setup(o) {
  const cageOn = o.cage !== false;
  const { fin, D } = phases(o);
  const key = `${o.seed}:${o.palette.join()}:${cageOn}:${fin}:${phases(o).fout}`;
  if (cache.has(key)) return cache.get(key);
  const C = fit(o.palette, 8), rn = new Rng(o.seed);
  const g = new Ghosts(D, { ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]], haze: C[5], box: [-54, -98, 54, 11] });
  const arcs = [];
  if (cageOn) {
    for (let s = 0; s < NS; s++) {
      const ts = fin + s * SLOT, hot = BEATS.some(([b, , strong]) => strong && since(s * SLOT, b, CORE) < 0.16);
      for (let n = 0; n < (hot ? 2 : 1); n++) {
        if (!hot && !rn.chance(0.4)) continue;
        const bar = rn.pick(BARS.filter((b) => b.z > -0.2)), ty = rn.range(TOPY + 8, BOTY - 6), ang = Math.atan2(ty - CY, bar.x);
        const sx = Math.cos(ang) * R0, sy = CY + Math.sin(ang) * R0, path = bolt(rn, sx, sy, bar.x - Math.sign(bar.x) * 1.5, ty, { jag: 0.3, depth: 4 });
        arcs.push({ s, path, fk: forks(rn, path, { count: rn.int(0, 1), len: 7, jag: 0.35 }) });
        for (let i = 0; i < 5; i++) {
          const a = Math.atan2(ty - sy, bar.x - sx) + Math.PI + rn.range(-1.2, 1.2), sp = rn.range(60, 170);
          g.add(ts, P.SPARK, bar.x, ty, Math.cos(a) * sp, Math.sin(a) * sp - 40, rn.range(0.2, 0.5));
        }
      }
    }
  }
  for (const [b, , strong] of BEATS) {
    if (!strong) continue;
    for (let i = 0; i < 12; i++) {
      const a = rn.range(0, TAU), sp = rn.range(40, 110);
      g.add(fin + b + 0.02, P.MOTE, Math.cos(a) * R0, CY + Math.sin(a) * R0, Math.cos(a) * sp, Math.sin(a) * sp, rn.range(0.25, 0.5), rn.pick([WHITE, C[6], C[5]]), 0.7);
    }
  }
  // spawn / dissipate: motes and vapor at the loop edges
  const finT = o.spawn !== false ? clamp(o.fade_in ?? FIN0, 0.15, 1) : 0;
  const foutT = o.dissipate !== false ? clamp(o.fade_out ?? FOUT0, 0.15, 1) : 0;
  if (finT > 0) {
    for (let i = 0; i < 14; i++) {
      const a = rn.range(0, TAU), r = rn.range(18, 42);
      g.add(rn.range(0, finT * 0.85), P.VAPOUR, Math.cos(a) * r, CY + Math.sin(a) * r * 0.45, -Math.cos(a) * rn.range(20, 60), -Math.sin(a) * rn.range(15, 50), rn.range(0.35, 0.7), mix(C[1], C[5], 0.4), rn.range(1.5, 2.8));
    }
    for (let i = 0; i < 10; i++) {
      const a = rn.range(0, TAU), sp = rn.range(30, 90);
      g.add(rn.range(0, finT * 0.6), P.MOTE, Math.cos(a) * rn.range(12, 32), CY + Math.sin(a) * rn.range(8, 20), -Math.cos(a) * sp, -Math.sin(a) * sp * 0.8, rn.range(0.2, 0.45), rn.pick([C[6], C[5]]), 0.65);
    }
  }
  if (foutT > 0) {
    const t0 = fin + CORE;
    for (let i = 0; i < 16; i++) {
      const a = rn.range(0, TAU), sp = rn.range(40, 120);
      g.add(t0 + rn.range(0, foutT * 0.9), P.VAPOUR, Math.cos(a) * rn.range(4, 14), CY + Math.sin(a) * rn.range(4, 12), Math.cos(a) * sp, Math.sin(a) * sp * 0.7 - rn.range(10, 30), rn.range(0.45, 0.85), C[5], rn.range(2, 3.6));
    }
    for (let i = 0; i < 8; i++) {
      const a = rn.range(0, TAU), sp = rn.range(50, 140);
      g.add(t0 + rn.range(0, foutT * 0.75), P.SPARK, Math.cos(a) * R0, CY + Math.sin(a) * R0 * 0.6, Math.cos(a) * sp, Math.sin(a) * sp - 20, rn.range(0.15, 0.35), C[6]);
    }
  }
  const v = { C, arcs, g };
  cache.set(key, v);
  return v;
}

function lifecycleDraw(p, lc, C, seed) {
  const { phase, u, k } = lc;
  if (phase === "in") {
    const r = (1 - ease.outCubic(u)) * 38, a = u * TAU * 2;
    for (let i = 0; i < 6; i++) {
      const th = a + (i / 6) * TAU;
      p.disc(Math.cos(th) * r, CY + Math.sin(th) * r * 0.5, 1.5 + u * 2, mix(C[2], C[6], u), 0.1 * u);
    }
    p.glow(0, CY, 6 + u * 32, C[4], 0.12 * u);
  } else if (phase === "out") {
    const r = ease.outQuad(u) * 44;
    for (let i = 0; i < 7; i++) {
      const th = u * 4 + (i / 7) * TAU;
      p.disc(Math.cos(th) * r, CY + Math.sin(th) * r * 0.45 - u * 6, 2 + u, mix(C[5], C[3], u), 0.14 * k);
    }
    p.glow(0, CY, 40 * k, C[4], 0.2 * k);
    const f = Math.floor(u * 20), rn = rng(seed, f, 9);
    for (let i = 0; i < 4; i++) p.px(rn.range(-20, 20), CY + rn.range(-16, 8), rn.chance(0.5) ? WHITE : C[6]);
  }
}

function plinth(p, C, H, t, pulse) {
  p.shade(-30, -10, 30, 2, (x, y, out) => {
    const top = ((x / 29) ** 2 + ((y + 7) / 4) ** 2) <= 1, side = Math.abs(x) <= 29 && y > -7 && y <= 0;
    if (!top && !side) return;
    if (top) out.c = ((x / 29) ** 2 + ((y + 7) / 4) ** 2) > 0.82 ? H[0] : y < -8 ? H[5] : x < 0 ? H[4] : H[3];
    else out.c = Math.abs(x) > 28 || y === 0 ? H[0] : y === -6 ? H[4] : x < -14 ? H[3] : x > 14 ? H[1] : H[2];
  });
  for (let i = 0; i < 7; i++) {
    const x = -18 + i * 6, bk = 0.5 + 0.5 * Math.cos(TAU * (2 * (t / CORE) - i / 7));
    p.px(x, -3, bk > 0.75 ? WHITE : bk > 0.4 ? C[5] : C[2]);
    if (bk > 0.6) p.glow(x, -3, 4, C[4], 0.3 * bk);
  }
  p.glow(0, -8, 26, C[4], 0.25 + 0.3 * pulse);
}

function barDraw(p, b, C, H, pulse, back) {
  const lit = back ? C[3] : pulse > 0.5 ? C[6] : C[5], inward = -Math.sign(b.x);
  for (let y = TOPY + 2; y < BOTY; y++)
    for (let i = -1; i <= 1; i++) {
      const face = i === inward;
      p.px(b.x + i, y, back ? (face ? lit : H[1]) : face ? lit : i === 0 ? H[3] : H[1]);
    }
}

function hoop(p, y, rx, H, C, near, pulse) {
  for (let i = 0, n = Math.ceil(rx * 8); i < n; i++) {
    const g = (i / n) * TAU, s = Math.sin(g);
    if (s >= 0 !== near) continue;
    const x = Math.cos(g) * rx, yy = y + s * 4;
    p.px(x, yy, near ? (s > 0.6 ? H[4] : H[3]) : H[1]);
    p.px(x, yy + 1, near ? H[1] : H[0]);
    if (near && s < 0.3) p.px(x, yy - 1, pulse > 0.5 ? C[5] : C[3]);
  }
}

function core(p, t, C, R, pulse, seed) {
  const ph = t / CORE;
  p.shade(-R - 2, CY - R - 2, R + 2, CY + R + 2, (x, y, out) => {
    const dx = x, dy = y - CY, d = Math.sqrt(dx * dx + dy * dy) / R;
    if (d > 1.1) return;
    if (d > 1) return (out.c = C[2]);
    if (d > 0.9) return (out.c = dy < -R * 0.3 && dx < R * 0.3 ? C[6] : C[4]);
    const a = Math.atan2(dy, dx), n = 0.5 + 0.5 * tileFbm((a / TAU) * 6 + ph * 6 + d * 1.5, d * 2.2 - ph * 4, 6, 4, seed, 2);
    const band = Math.abs(n - 0.5) < 0.05 + 0.05 * pulse, heat = (1 - d) ** 2 + pulse * 0.45;
    if (band) out.c = heat > 0.5 ? WHITE : heat > 0.2 ? C[6] : C[5];
    else out.c = heat > 0.7 ? C[6] : heat > 0.42 ? C[5] : heat > 0.2 ? C[3] : n > 0.5 ? C[2] : C[1];
  });
  const f = Math.floor(t * 15), r = rng(seed, f, 5);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + f * 0.7 + r.range(-0.4, 0.4), pts = bolt(r, 0, CY, Math.cos(a) * R * 0.88, CY + Math.sin(a) * R * 0.88, { jag: 0.32, depth: 3 });
    p.polyline(pts, (u) => (u < 0.4 ? WHITE : C[6]));
    const [ex, ey] = pts[pts.length - 1];
    p.px(ex, ey, WHITE);
    p.glow(ex, ey, 4, C[5], 0.4);
  }
  p.circle(0, CY, 1.8 + pulse * 2, WHITE);
  p.circle(0, CY, 3 + pulse * 2, (d) => (d > 0.6 ? C[6] : WHITE), 0.0001);
  p.px(-R * 0.45, CY - R * 0.55, WHITE);
  p.px(-R * 0.45 + 1, CY - R * 0.55, C[6]);
}

function ring(p, t, rg, C, front, pulse) {
  const spin = rg.spin(t), bead = (t / CORE) * TAU * 3;
  for (let i = 0, n = Math.ceil(rg.r * 9); i < n; i++) {
    const a = (i / n) * TAU, [x, y, z] = ringPt(rg.r, rg.tilt, spin, a);
    if (z >= 0 !== front) continue;
    const u = ((((a - bead) / TAU) % 1) + 1) % 1, head = u > 0.9;
    p.px(x, y, head ? WHITE : !front ? C[3] : z > 0.5 * rg.r || pulse > 0.6 ? C[6] : C[5]);
  }
  if (front) {
    const [x, y] = ringPt(rg.r, rg.tilt, spin, bead);
    p.glow(x, y, 6, C[5], 0.5);
  }
}

function drawCore(p, t, o, layer) {
  const lc = lifecycle(t, o);
  const { C, arcs, g } = setup(o), H = fit(o.metal, 6), pulse = pulseAt(lc.tc), R = R0 * (1 + 0.14 * pulse), cageOn = o.cage !== false;
  const fade = p.fade;
  p.fade = fade * lc.k;
  lifecycleDraw(p, lc, C, o.seed);
  if (lc.k < 0.02) {
    p.fade = fade;
    return;
  }
  if (layer === "back") {
    if (cageOn) {
      hoop(p, BOTY, RC, H, C, false, pulse);
      hoop(p, TOPY, RC, H, C, false, pulse);
      for (const b of BARS) if (b.z < 0) barDraw(p, b, C, H, pulse, true);
    }
    for (const rg of RINGS) ring(p, lc.tc, rg, C, false, pulse);
    g.at(t).draw(p, "back");
    p.fade = fade * lc.k;
    return;
  }
  if (cageOn) plinth(p, C, H, lc.tc, pulse);
  core(p, lc.tc, C, R * (lc.phase === "in" ? 0.35 + 0.65 * lc.u : 1), pulse, o.seed);
  for (const rg of RINGS) ring(p, lc.tc, rg, C, true, pulse);
  if (cageOn) {
    for (const b of BARS) if (b.z >= 0) barDraw(p, b, C, H, pulse, false);
    hoop(p, BOTY, RC, H, C, true, pulse);
    hoop(p, TOPY, RC, H, C, true, pulse);
    p.shade(-15, TOPY - 7, 15, TOPY, (x, y, out) => {
      const d = (x / 14.5) ** 2 + ((y - TOPY) / 6.5) ** 2;
      if (d > 1) return;
      const l = -x * 0.05 - (y - TOPY) * 0.12;
      out.c = d > 0.8 ? H[0] : l > 0.55 ? H[5] : l > 0.3 ? H[4] : H[3];
    });
    p.px(0, TOPY - 7, pulse > 0.4 ? WHITE : C[5]);
    p.glow(0, TOPY - 7, 5, C[4], 0.4 + 0.4 * pulse);
    const s = Math.floor(lc.tc / SLOT) % NS, k = 1 - (lc.tc - Math.floor(lc.tc / SLOT) * SLOT) / SLOT;
    for (const a of arcs) {
      if (a.s !== s) continue;
      strokeArc(p, a.path, [C[2], C[5], C[4]], k);
      for (const f of a.fk) strokeArc(p, f, [C[2], C[5], C[4]], k, 0.6);
      const [ex, ey] = a.path[a.path.length - 1];
      p.glow(ex, ey, 8, C[5], 0.6 * k);
    }
  }
  if (lc.phase === "hold" || lc.phase === "in")
    for (const [b, , strong] of BEATS) {
      const a = since(lc.tc, b, CORE);
      if (!strong || a > 0.45) continue;
      const q = a / 0.45, r = R0 + 34 * ease.outCubic(q);
      p.ring(0, CY, r, Math.max(1, 3 * (1 - q)), q < 0.25 ? WHITE : q < 0.5 ? C[6] : C[5], 1.1 - q);
      p.glowRing(0, CY, r, 6, C[4], 0.35 * (1 - q));
    }
  g.at(t).draw(p);
  p.glow(0, CY, 46, C[4], 0.2 + 0.3 * pulse);
  p.glow(0, CY, 9, WHITE, 0.35 + 0.4 * pulse);
  p.fade = fade;
}

export function drawBack(p, t, o) {
  drawCore(p, t, o, "back");
}

export function draw(p, t, o) {
  drawCore(p, t, o, "front");
}
