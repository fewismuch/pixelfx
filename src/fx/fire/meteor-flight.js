// Loop projectile: fire/meteor's falling rock and its comet of fire, drawn from t alone so it loops without a
// seam. The flame-puff, smoke and spark recipe is adapted from Sprite Fusion's open-source explosion
// (https://www.spritefusion.com/pixel-art-vfx/explosion), MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, mix, hex, clamp, rand, WHITE } from "../../core/index.js";
import { noiseFor, pnoise, hotFirst, flameBlade, firePuff, smokePuff, spark, ember, drift, looped, LAYERS } from "./_lib.js";

export const meta = {
  name: "Meteor flight",
  desc: "Looping burning rock in a comet of fire for code-driven flight. `dive`: heading in degrees, 0 flat right, 90 straight down. Anchor on the rock; fire/meteor-impact where it lands.",
  tags: ["fire", "meteor", "projectile", "spell", "directional", "loop"],
  size: [160, 152],
  origin: [128, 120],
  duration: 1.2,
  loop: true,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    rock: ["#120e16", "#2a2230", "#463a4a", "#6a5a66"],
    dive: 52,
    radius: 6.5,
    speed: 220,
    smoke: true,
    seed: 9,
  },
};

const D = meta.duration, NL = noiseFor(D), OUTLINE = hex("#1a1422"), SMOKE1 = hex("#5b5566");
// the comet: tongues of flame streaming back off the rock [length, half-width, offset to the side]
const BODY = [[36, 7, 0], [26, 7.5, -2.5], [26, 7.5, 2.5], [16, 8, 0]];

// the rock: lumpy, white-hot on the face it flies into, glowing cracks over its dark back, lit from the top left
function rock(p, H, RK, R0, ux, uy, S) {
  p.shade(-R0 - 3, -R0 - 3, R0 + 3, R0 + 3, (px, py) => {
    const d = Math.hypot(px, py), a = Math.atan2(py, px) / (2 * Math.PI) + 0.5;
    const rr = R0 * (1 + 0.18 * pnoise(a * 4, 4, S) + 0.1 * pnoise(a * 9, 9, S + 1));
    if (d > rr + 1) return;
    if (d > rr) return OUTLINE;
    const face = (px * ux + py * uy) / Math.max(1, d), heat = face * 0.6 + 0.5 - (d / rr) * 0.25;
    if (heat > 0.62) return heat > 0.85 ? H[0] : heat > 0.74 ? H[1] : H[2];
    if (heat > 0.42) return H[4];
    if (rand(Math.floor(px), Math.floor(py), S + 3) < 0.22) return H[4];
    return px * -0.6 + py * -0.8 > 0 ? RK[2] : d / rr > 0.6 ? RK[0] : RK[1];
  });
}

export function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), RK = fit(o.rock, 4), S = o.seed;
  const R0 = clamp(o.radius, 3, 12), V = clamp(o.speed, 60, 500), k = R0 / 6.5;
  const th = (clamp(o.dive, -30, 90) * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
  const N = (rate, seed = 0, off = 0) => NL(t, rate, seed, off);
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.25), SMOKE = mix(SMOKE1, H[6], 0.3), SPARKS = [H[1], H[2], H[4], H[5]], EMB = [H[1], H[2], H[4], H[6]];
  // flight frame (a ahead, l to the side) to screen, plus a lift in screen y (heat rises, embers fall)
  const at = (a, l, lift = 0) => [ux * a + nx * l, uy * a + ny * l + lift];
  // flame tongues trail straight back but curl up a little, as flame does
  const bx = -ux, by = -uy - 0.35, bl = Math.hypot(bx, by), tx = bx / bl, ty = by / bl;

  // the tail: flame puffs shed off the back that the rock outruns; they cool, swell, rise, burn out into smoke
  const fire = [], smoke = [];
  looped(t, D, 120, S + 100, (r) => {
    const fl = r.range(0.16, 0.36), sm = o.smoke !== false && r.chance(0.6), a = -r.range(2, 22) * k;
    return { a, l: r.range(-1, 1) * (R0 + 0.12 * a), v: V * r.range(0.25, 0.55), vl: r.range(-18, 18), fl, sm, sl: r.range(0.25, 0.42), s: r.range(1.6, 3.4) * k, f: r.next() * 0.5 + 0.5 * Math.min(1, -a / (22 * k)), life: fl + (sm ? 0.42 : 0) };
  }, (q, age) => {
    const ta = Math.min(age, q.fl), [wa, l] = drift(0, q.l, q.v, q.vl, ta, 0, 0, 4.5, 3), lift = drift(0, 0, 0, 0, ta, 0, -80, 0, 3)[1];
    const [x, y] = at(q.a + wa - V * ta, l, lift);
    if (age < q.fl) return fire.push([age, x, y, q]);
    if (!q.sm || age - q.fl > q.sl) return;
    const sa = age - q.fl, [sx, sy] = drift(x, y, -ux * V * 0.3, -uy * V * 0.3 - 8, sa, 0, -26, 2.2, 1.4);
    smoke.push([sa, sx, sy, q]);
  });
  for (const [sa, x, y, q] of smoke) smokePuff(p, x, y, 1 - sa / q.sl, q.s, SMOKE, q.s > 2.6);
  fire.sort((a, b) => b[0] - a[0]);
  for (const [age, x, y, q] of fire) {
    const u = age / q.fl;
    firePuff(p, x, y, 1 - u, q.s * (1 + 1.2 * u), q.f, H, 0.07, tx * 0.86, ty * 0.86);
  }

  // the comet body rooted in the rock, and a few licks off its shoulders
  BODY.forEach(([L, w, off], i) => {
    const n = (S + i) * 13, len = L * k * (0.85 + 0.25 * N(5, n)) * (1 + 0.2 * Math.max(0, N(2.4, n + 3)));
    flameBlade(p, nx * off * k, ny * off * k, tx, ty, len, w * k, N(3, n + 3) * 3 + off, N, n, H, LAYERS, 0.5, 1.6);
  });
  for (let i = 0; i < 4; i++) {
    const n = (S + i + 20) * 13, side = i % 2 ? 1 : -1, a0 = 0.35 + 0.3 * (i >> 1), [ox, oy] = at(R0 * (0.2 - a0), side * R0 * 0.9);
    const dx = tx - nx * side * 0.5, dy = ty - ny * side * 0.5, dl = Math.hypot(dx, dy);
    flameBlade(p, ox, oy, dx / dl, dy / dl, (7 + 4 * (0.5 + 0.5 * N(6, n))) * k, 1.3 * k, side * 1.5, N, n, H, LAYERS);
  }
  rock(p, H, RK, R0, ux, uy, S);

  // motes flicked off the hot face: short streaks that die at once
  looped(t, D, 24, S + 200, (r) => ({ a: r.range(-2.2, 2.2), v: r.range(30, 80), life: r.range(0.08, 0.18) }), (q, age) => {
    const ca = Math.cos(q.a), sa = Math.sin(q.a), d = R0 * 0.9 + q.v * age, [x, y] = at(ca * d - V * 0.4 * age, sa * d);
    const kk = 1 - age / q.life, L = 1 + 2 * kk, ex = ux * ca + nx * sa, ey = uy * ca + ny * sa;
    p.line(x - ex * L, y - ey * L, x, y, kk > 0.5 ? H[1] : H[3]);
    p.glow(x, y, 3, H[2], 0.4 * kk);
  });
  // embers and sparks left behind: the rock outruns them and they fall as they cool
  looped(t, D, 34, S + 300, (r) => ({ a: -r.range(2, 18) * k, l: r.range(-4, 4) * k, v: V * r.range(0.3, 0.8), vl: r.range(-30, 30), life: r.range(0.25, 0.5), big: r.chance(0.25), ph: r.range(0, 6.3) }), (q, age) => {
    const [wa, l, wva, vl] = drift(0, q.l, q.v, q.vl, age, 0, 0, 3, 2), fall = drift(0, 0, 0, 0, age, 0, 60, 0, 2);
    const [x, y] = at(q.a + wa - V * age, l, fall[1]), kk = 1 - age / q.life;
    if (q.big) ember(p, x, y, kk, 2, EMB, age * 40 + q.ph);
    else spark(p, x, y, ux * (wva - V) + nx * vl, uy * (wva - V) + ny * vl + fall[3], kk, SPARKS);
  });

  // light: a hot heart, a warm halo, light running down the tail
  const fl = 0.85 + 0.15 * N(9, S + 7);
  p.glowLine(-ux * 4, -uy * 4, -ux * 50 * k, -uy * 50 * k, 12 * k, GLOW, 0.2 * fl);
  p.glow(0, 0, 46 * k, GLOW, 0.5 * fl);
  p.glow(0, 0, 12 * k, H[1], 0.4 * fl);
}
