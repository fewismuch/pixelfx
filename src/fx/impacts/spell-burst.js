// The star's key frames and the breaking ring follow Sprite Fusion's open-source impact
// (https://www.spritefusion.com/pixel-art-vfx/impact), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, clamp, smooth, ease, TAU, WHITE } from "../../core/index.js";
import { star, brokenRing } from "./_lib.js";

export const meta = {
  name: "Spell burst",
  desc: "A small, clean burst for any spell: a four-point star flashes white, a ring breaks into flying arcs and a few sparks shoot straight out and fade. Recolor it per element.",
  tags: ["impact", "hit", "burst", "spell", "magic", "generic", "simple", "one-shot"],
  size: [112, 96],
  origin: [56, 48],
  duration: 0.6,
  loop: false,
  fps: 30,
  bg: "dark",
  // size: scale, 0.5 .. 1.5. sparks: how many shoot out
  options: { palette: PAL.arcane, size: 1, sparks: 8, seed: 11 },
};

export function create(o) {
  const C = fit(o.palette, 8), S = clamp(o.size, 0.4, 1.6), R = new Rng(o.seed);
  const ps = new Particles({ rng: R }), lights = new Lights();
  // a hard four-point star: long arms on the axes, short ones between
  const sp = [];
  for (let i = 0; i < 8; i++) sp.push({ a: (i * Math.PI) / 4 + R.range(-0.04, 0.04), len: (i % 2 ? R.range(5, 7) : i % 4 === 0 ? R.range(16, 19) : R.range(12, 14)) * S, w: i % 2 ? 1.2 : 2 });
  const segs = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * TAU + R.range(-0.1, 0.1), gap: R.range(0.55, 0.8), dr: R.range(0.1, 0.35) }));
  lights.add(0, 0, 44 * S, C[5], 0.65, 0.3);
  lights.add(0, 0, 16 * S, WHITE, 0.8, 0.07);
  // a few sparks shot straight out, evenly round with a little jitter: no gravity, they slow and fade in the air
  const n = Math.max(0, Math.round(o.sparks));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R.range(-0.35, 0.35), v = R.range(110, 170) * S;
    ps.spawn(P.MOTE, Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a) * v, Math.sin(a) * v, R.range(0.15, 0.24), R.pick([WHITE, C[6], C[6], C[5]]), R.range(0.9, 1.2), R.range(0, 0.03));
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // the ring: rings out off the star and breaks into arcs that fly on and cool
      const u = (t - 0.03) / 0.34;
      if (u >= 0 && u < 1) {
        const r = (6 + 20 * ease.outCubic(u)) * S, brk = smooth(0.15, 0.6, u), i = u < 0.15 ? 7 : u < 0.35 ? 6 : u < 0.6 ? 5 : 4;
        brokenRing(p, 0, 0, r, Math.max(1, 2.4 * S * Math.pow(1 - u, 1.2)), segs, brk, C[i], C[Math.max(3, i - 2)], u < 0.6 ? 1 : (1 - u) / 0.4);
        if (u < 0.5) p.glowRing(0, 0, r, 5, C[5], 0.3 * (1 - u / 0.5));
      }
      ps.draw(p);
      // the star: white, then bigger and colored as it thins, then just a glint
      if (t < 0.025) star(p, 0, 0, sp, 1, 1, [C[5], WHITE, WHITE, WHITE], 1, 2.4 * S);
      else if (t < 0.058) star(p, 0, 0, sp, 1.25, 0.65, [C[3], C[6], C[7], WHITE], 1, 2.4 * S);
      else if (t < 0.092) star(p, 0, 0, sp, 1.4, 0.3, [C[3], C[5], C[6], C[7]], 1, 1.8 * S);
      const pop = Math.exp(-t / 0.05);
      if (pop > 0.02) {
        p.glow(0, 0, 26 * S, C[5], 0.5 * pop);
        p.glow(0, 0, 9 * S, WHITE, 0.4 * pop);
      }
      lights.draw(p);
    },
  };
}
