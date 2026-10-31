// Loop projectile: plasma-style orb plus the original twisting ribbon (trail points drift behind each update).
// Layered head and ribbon follow Sprite Fusion's open-source energy bolt and orb
// (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { rng, fit, cycle, clamp, TAU, WHITE } from "../../core/index.js";
import { beat, wake, spark } from "./_lib.js";

export const meta = {
  name: "Magic missile flight",
  desc: "Looping arcane orb for code-driven flight: twisting ribbon (`sway`), plasma core. Anchor on the projectile; magic-missile-burst on hit.",
  tags: ["projectile", "magic", "arcane", "missile", "spell", "directional", "loop"],
  size: [208, 112],
  origin: [176, 56],
  duration: 0.8,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff"],
    size: 5,
    speed: 180,
    sway: 1,
    seed: 6,
  },
};

const RIBBON = 0.32;
const SWAY = 4; // lateral weave at sway 1 (matches pre-option default)

function drawRibbon(p, now, trail, C) {
  const keep = trail.filter((q) => now - q.t < RIBBON);
  for (let i = 1; i < keep.length; i++) {
    const a = keep[i - 1], b = keep[i], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    for (let f = 0; f < 1; f += 0.5 / l) {
      const tt = a.t + (b.t - a.t) * f, k = 1 - (now - tt) / RIBBON, tw = Math.sin(tt * 26), w = 3.2 * k * Math.abs(tw) + 0.4, face = tw > 0;
      const x = a.x + dx * f, y = a.y + dy * f;
      for (let s = -w; s <= w; s += 0.5) {
        const edge = Math.abs(s) > w - 0.8, c = face ? (edge ? C[6] : k > 0.6 ? C[5] : C[4]) : edge ? C[4] : C[2];
        p.dot(x + nx * s, y + ny * s, c, k > 0.35 ? 1 : k / 0.35);
      }
    }
    if (i % 3 === 0) p.glow(b.x, b.y, 6, C[4], 0.25 * (1 - (now - b.t) / RIBBON));
  }
}

function drawOrb(p, tt, o) {
  const C = fit(o.palette, 8), R = clamp(o.size, 3, 9), V = o.speed, S = o.seed, D = meta.duration, w = (TAU * tt) / D;
  const fr = Math.floor(tt * 30 + 1e-6), left = -meta.origin[0] + 2;

  const balls = [{ x: 0, y: 0, r: R, h: 1, core: 0.85 }];
  for (let i = 0; i < 3; i++) {
    const a = w * [2, -3, 5][i] + (i * TAU) / 3, d = R * (0.5 + 0.1 * Math.sin(w * 3 + i * 2));
    balls.push({ x: Math.cos(a) * d - 0.4, y: Math.sin(a) * d * 0.8, r: R * 0.32, h: 1, core: 1 });
  }
  for (let i = 1; i <= 6; i++) {
    const x = -R * (0.5 + i * 0.42), wag = Math.sin(w * 2 - i * 0.9) * (0.3 + i * 0.28), r = R * (0.62 - i * 0.08);
    balls.push({ x, y: wag, r, h: 0.96 - i * 0.05, core: Math.sqrt((5.2 - i * 0.65) * 0.3) / r });
  }
  const drops = [];
  cycle(tt, D, 11, S, (r) => r.range(0.34, 0.5), (age, life, r) => {
    const k = age / life, pull = r.range(450, 800), x = -R * 2.9 - 0.5 * pull * age * age - r.range(0, 16) * age;
    const y = Math.sin(w * 2 - 5.4 + age * 12) * 2 + r.range(-30, 30) * age * (0.4 + age);
    const rad = R * r.range(0.3, 0.48) * (1 - k * 0.6);
    drops.push({ x, y, r: rad, h: 0.97 * (1 - k * 0.75), core: Math.sqrt(Math.max(0, 1 - k * 1.3) * 7 * 0.3) / rad, k });
  });
  const all = balls.concat(drops);
  p.shade(-R * 2.6 - 60, -R * 2 - 8, R * 1.6, R * 2 + 8, (x, y) => {
    let f = 0, heat = 0, hh = 0;
    for (const b of all) {
      const dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy, q = d2 / (4 * b.r * b.r);
      if (q < 1) {
        const c = ((1 - q) * (1 - q)) / 0.5625;
        f += c;
        heat += c * b.h;
      }
      if (b.core) hh += (b.core * b.core * b.r * b.r) / (d2 + 0.3);
    }
    if (f < 1) return;
    const lvl = hh > 10 ? 7 : hh > 4.6 ? 6 : hh > 2.2 ? 5 : f > 1.4 ? 4 : 3, cap = Math.round(2 + (heat / f) * 5.4);
    return C[Math.max(2, Math.min(x > R * 0.3 && lvl < 5 ? lvl + 1 : lvl, cap))];
  });

  for (let j = 0; j < 3; j++) {
    const g = rng(fr, j, S), a0 = g.range(-2.3, 2.3), span = g.range(0.45, 0.9) * g.sign(), n = 6, hgt = g.range(1.5, 3.5);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n, rr = R + 0.6 + hgt * Math.sin((Math.PI * i) / n) + (i % n ? g.range(-0.5, 0.5) : 0);
      pts.push([Math.cos(a) * rr - 0.4, Math.sin(a) * rr * 0.92]);
    }
    p.polyline(pts, j ? C[5] : C[6]);
    p.px(pts[3][0], pts[3][1], WHITE);
    p.glow(pts[3][0], pts[3][1], 6, C[5], 0.4);
  }
  for (let i = 0; i < 3; i++) {
    const a = w * 14 + (i * TAU) / 3;
    p.px(Math.cos(a) * (R + 3) - 0.4, Math.sin(a) * (R + 3) * 0.6, i ? C[6] : WHITE);
  }
  for (let j = 0; j < 4; j++) {
    const g = rng(fr, j + 9, S), a = g.range(-2.2, 2.2), l = g.range(1.5, 4), r0 = R + 1;
    const x0 = Math.cos(a) * r0 - 0.4, y0 = Math.sin(a) * r0 * 0.92;
    p.line(x0, y0, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l, j % 2 ? C[4] : C[5]);
  }
  const SP = [WHITE, C[6], C[5], C[3]];
  beat(tt, D, 14, S + 5, (r) => r.range(0.12, 0.3), (age, life, r) => {
    const a = r.range(-2.4, 2.4), sp = r.range(60, 130);
    const [x, y, vx, vy] = wake(Math.cos(a) * (R + 1), Math.sin(a) * (R + 1), Math.cos(a) * sp, Math.sin(a) * sp, age, V * 0.7, 4, 0);
    if (x > left + 4 && Math.abs(y) < 26) spark(p, x, y, vx, vy, 1 - age / life, SP, 0.4, 0.015, 6);
  });

  const pulse = 0.85 + 0.15 * Math.sin(w * 4);
  p.glow(-2, 0, 34, C[3], 0.8 * pulse);
  p.glow(0, 0, 16, C[4], 0.35 * pulse);
  p.glow(1, 0, 7, C[6], 0.3 * pulse);
  p.glowLine(-R, 0, -R * 4.6, 0, 7, C[3], 0.3);
  for (const d of drops) {
    if (d.x < left + 4) continue;
    if (d.k < 0.6 && d.x < -R * 3.5) p.px(d.x, d.y, d.k < 0.3 ? C[7] : C[6]);
    p.glow(d.x, d.y, 3 + d.r * 2, C[2], 0.6 * (1 - d.k));
  }
}

export function create(o) {
  const trail = [];
  let simT = 0;
  return {
    update(dt, opts) {
      simT += dt;
      const V = opts.speed ?? o.speed, sway = clamp(opts.sway ?? o.sway, 0.25, 2.5);
      for (const q of trail) q.x -= V * dt;
      trail.push({ x: 0, y: Math.sin(simT * TAU * 1.5) * SWAY * sway, t: simT });
      while (trail.length && (trail[0].x < -150 || simT - trail[0].t > RIBBON)) trail.shift();
    },
    draw(p, tt, opts) {
      drawRibbon(p, simT, trail, fit(opts.palette, 8));
      drawOrb(p, tt, opts);
    },
  };
}
