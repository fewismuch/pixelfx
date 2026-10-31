// The orb (a glassy bubble that thickens towards its rim, a hot core, a double rim, a highlight arc and spot,
// motes orbiting in front and behind) is adapted from Sprite Fusion's open-source energy orb
// (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { PAL, fit, cycle, sparkle, clamp, ease, mix, rng, TAU, WHITE } from "../../core/index.js";
import { mote } from "./_lib.js";

const D = 2.4, RAD = 17, Y0 = -52, FIN0 = 0.5, CMIN = 1.2, CMAX = 6;

const DEF_PERIOD = FIN0 + D;

export const meta = {
  name: "Arcane orb",
  desc: "A floating orb of smoky violet glass with a swirl and orbiting rings; `cycle`, `fade_in`, and optional floor pool (`floor`).",
  tags: ["arcane", "orb", "sphere", "magic", "floating", "loop"],
  size: [136, 112],
  origin: [68, 104],
  duration: DEF_PERIOD,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: PAL.arcane, seed: 6, spawn: true, fade_in: FIN0, cycle: D, floor: true },
};

// two rings, each a circle tilted in depth (sy) and rolled in the picture (rot), beads running round it
const RINGS = [
  { r: 31, sy: 0.24, rot: 0.36, beads: 3, turn: 2, c: 0 },
  { r: 27, sy: 0.3, rot: -0.55, beads: 2, turn: -3, c: 1 },
];

function cycleLen(o) {
  return clamp(o.cycle ?? D, CMIN, CMAX);
}

function finLen(o) {
  return o.spawn !== false ? clamp(o.fade_in ?? FIN0, 0.15, 1) : 0;
}

function periodOf(o) {
  const fin = finLen(o), cyl = cycleLen(o);
  return fin > 0 ? fin + cyl : cyl;
}

/** One timeline for the whole loop: orb phase never jumps; spawn fades in/out at the ends. */
function timing(tm, o) {
  const fin = finLen(o), cyl = cycleLen(o), period = periodOf(o);
  const tc = (tm / period) * cyl;
  let k = 1, sc = 1, spawn = false;
  if (fin > 0 && o.spawn !== false) {
    if (tm < fin) {
      spawn = true;
      const u = tm / fin;
      k = ease.outCubic(u);
      sc = 0.18 + 0.82 * ease.outCubic(u);
    } else if (tm > period - fin) {
      const u = (period - tm) / fin;
      k = ease.inCubic(u);
      sc = 0.18 + 0.82 * ease.inCubic(u);
    }
  }
  return { tc, k, sc, spawn, u: tm < fin ? tm / fin : 0, cyl, period };
}

function setup(t, cyl) {
  const ph = t / cyl;
  return { ph, cx: 0, cy: Y0 + Math.sin(ph * TAU) * 2 };
}

// motes and vapor rushing in before the orb opens (centre follows the bobbing orb)
function spawnIn(p, lc, C, seed, s) {
  const { u, k } = lc, { cx, cy } = s, rn = rng(seed, Math.floor(u * 28), 5);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + u * 3 + rn.range(-0.12, 0.12);
    const rr = (1 - ease.outCubic(u)) * rn.range(32, 44) + 4;
    p.disc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.38, 0.8 + rn.range(0, 1.2), mix(C[2], C[6], u), 0.08 * k + 0.05);
  }
  for (let i = 0; i < 6; i++) {
    const a = u * 3.2 + i * 1.05, r = (1 - u) * 38;
    p.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.32, rn.chance(0.55) ? C[6] : C[5], 0.3 + 0.7 * k);
  }
  p.glow(cx, cy, 6 + 40 * ease.outCubic(u), C[4], 0.1 * k);
}

// one ring's points on the near (z > 0) or far side; beads brighter, with light
function ring(p, C, s, R, near) {
  const { ph, cx, cy } = s, rot = R.rot + 0.12 * Math.sin(ph * TAU + R.c), cr = Math.cos(rot), sr = Math.sin(rot), n = Math.ceil(R.r * TAU * 1.5);
  const pos = (g) => {
    const lx = Math.cos(g) * R.r, ly = Math.sin(g) * R.r * R.sy;
    return [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr];
  };
  for (let j = 0; j < n; j++) {
    const g = (j / n) * TAU, z = Math.sin(g);
    if (z > 0 !== near) continue;
    const [x, y] = pos(g);
    p.dot(x, y, near ? C[5] : C[4], near ? 0.7 : 0.4);
  }
  for (let b = 0; b < R.beads; b++) {
    const g = ph * TAU * R.turn + (b * TAU) / R.beads;
    for (let k = 0; k < 7; k++) {
      const gg = g - Math.sign(R.turn) * k * 0.07, z = Math.sin(gg);
      if (z > 0 !== near) continue;
      const [x, y] = pos(gg);
      p.dot(x, y, k === 0 ? WHITE : k < 3 ? C[6] : C[5], k < 4 ? 1 : 1 - (k - 3) / 4);
      if (k === 0) p.glow(x, y, near ? 7 : 5, C[6], near ? 0.5 : 0.25);
    }
  }
}

// the orb itself: smoky glass, the swirl, the heart, the rim, the highlights
function orb(p, C, s, sc = 1) {
  const { ph, cx, cy } = s, rad = RAD * sc;
  p.disc(cx, cy, rad, (d) => (d > 0.82 ? C[2] : C[1]), (d) => 0.32 + 0.5 * d * d);
  for (const [s0, main] of [[0, 1], [Math.PI, 1], [Math.PI / 2, 0], [(3 * Math.PI) / 2, 0]])
    for (let u = 0.08; u <= 0.85; u += 0.012) {
      const a = ph * TAU * 2 + s0 + u * 3.4, r = u * rad * 0.92, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, fade = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.25;
      if (!main) {
        p.dot(x, y, C[4], fade * 0.8);
        continue;
      }
      const b = a - 0.16, xb = cx + Math.cos(b) * r, yb = cy + Math.sin(b) * r;
      p.dot(xb, yb, u < 0.4 ? C[6] : C[5], fade);
      p.dot(x, y, u < 0.3 ? WHITE : u < 0.55 ? C[6] : C[5], fade);
    }
  const pulse = 0.85 + 0.15 * Math.sin(ph * TAU * 3);
  p.circle(cx, cy, (3.6 * pulse + 1) * sc, C[5]);
  p.circle(cx, cy, 2.8 * pulse * sc, C[6]);
  p.circle(cx, cy, 1.7 * pulse * sc, WHITE);
  p.ring(cx, cy, rad + 0.4, 1, C[5]);
  p.ring(cx, cy, rad + 1.3, 1, C[2], 0.8);
  for (let a = 3.5; a < 4.7; a += 0.03) p.dot(cx + Math.cos(a) * (rad - 2.4), cy + Math.sin(a) * (rad - 2.4), a > 3.85 && a < 4.35 ? WHITE : C[6]);
  p.circle(cx - rad * 0.42, cy - rad * 0.5, 1.3 * sc, WHITE);
  p.dot(cx + rad * 0.52, cy + rad * 0.55, C[6]);
  p.glow(cx, cy, 20 * sc, C[6], 0.26 * pulse);
  p.glowRing(cx, cy, rad, 6, C[5], 0.25);
}

function motes(p, C, s, S, near, sc = 1, cyl = D) {
  const { ph, cx, cy } = s;
  for (let i = 0; i < 8; i++) {
    const a = ((i * 2.4 + S) % TAU) + ph * TAU * (i % 2 ? 1 : -1) * (1 + (i % 3)), rr = (RAD + 5 + ((i * 0.37) % 1) * 12) * sc, tilt = (((i * 0.71) % 1) - 0.5) * 1.4;
    const x0 = Math.cos(a) * rr, z = Math.sin(a);
    if (z > 0 !== near) continue;
    const x = cx + x0 * Math.cos(tilt), y = cy + x0 * Math.sin(tilt) + z * rr * 0.28, dir = i % 2 ? 1 : -1;
    p.dot(x, y, near ? WHITE : C[5]);
    p.dot(x - dir, y, near ? C[6] : C[4], near ? 1 : 0.6);
    if (near) p.dot(x - 2 * dir, y, C[4], 0.6), p.glow(x, y, 5, C[6], 0.35);
  }
  if (!near || sc < 0.75) return;
  cycle(ph * cyl, cyl, 10, S * 3 + 1, (g) => g.range(0.6, 1), (age, life, r) => {
    const a = r.range(0, TAU), q = age / life, d = (RAD + 1 + q * r.range(8, 18)) * sc;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d - q * 10;
    mote(p, x, y, Math.cos(a) * 25, Math.sin(a) * 25 - 12, r.chance(0.5) ? C[6] : C[5], 0.6, 1 - q, 0.3);
  });
}

function drawScene(p, tm, o, layer) {
  const lc = timing(tm, o), C = fit(o.palette, 8), fade = p.fade;
  p.fade = fade * lc.k;
  if (lc.k < 0.012) {
    p.fade = fade;
    return;
  }
  const s = setup(lc.tc, lc.cyl), sc = lc.sc, lift = (s.cy - Y0) / 2;
  if (lc.spawn) spawnIn(p, lc, C, o.seed, s);
  const rRing = (R) => ({ ...R, r: R.r * sc });

  if (layer === "back") {
    if (o.floor !== false) {
      p.glow(0, -1, 36, C[4], (0.26 - 0.04 * lift) * lc.k);
      for (let x = -20; x <= 20; x++) {
        const u = Math.abs(x + 0.5) / 20;
        p.dot(x, 0, u < 0.3 ? C[6] : C[5], (1.1 - u) * (0.9 - 0.15 * lift) * lc.k);
      }
    }
    p.glow(s.cx, s.cy, 60 * sc, C[4], 0.36 * lc.k);
    for (const R of RINGS) ring(p, C, s, rRing(R), false);
    motes(p, C, s, o.seed, false, sc, lc.cyl);
  } else {
    orb(p, C, s, sc);
    for (const R of RINGS) ring(p, C, s, rRing(R), true);
    motes(p, C, s, o.seed, true, sc, lc.cyl);
    sparkle(p, s.cx - RAD * sc * 0.42, s.cy - RAD * sc * 0.5, 1.5 + Math.max(0, Math.sin(s.ph * TAU * 2)) * 2, C[6], C[5], 0.3 * lc.k);
  }
  p.fade = fade;
}

/** Sprite sheet / render length for the current options (fade_in + cycle when spawn is on). */
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
