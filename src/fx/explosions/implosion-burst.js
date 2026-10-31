// Pop release (cross flare, rings, motes) split from implosion; adapted from Sprite Fusion's open-source energy charge
// (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, sparkle, clamp, ease, TAU, WHITE } from "../../core/index.js";
import { cull } from "./_lib.js";

export const meta = {
  name: "Implosion burst",
  desc: "The sharp pop after an implosion: a white point bursting, a cross flare, fast and slow shock rings, sparks and glitter.",
  tags: ["implosion", "explosion", "energy", "magic", "pop", "one-shot"],
  size: [208, 184],
  origin: [104, 92],
  duration: 0.55,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#0a0614", "#1c1236", "#3a2470", "#6a44c0", "#a080f0", "#d8c8ff", "#ffffff"], seed: 2 },
};

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, sparks: [C[6], C[5], C[4], C[3]] }), lights = new Lights();
  const rays = Array.from({ length: 4 }, (_, i) => (i * TAU) / 4 + Math.PI / 4);
  lights.add(0, 0, 90, C[4], 1, 0.4);
  lights.add(0, 0, 30, WHITE, 0.9, 0.08);
  for (let i = 0; i < 34; i++) {
    const a = R.range(0, TAU), sp = R.range(120, 330);
    ps.spawn(R.chance(0.6) ? P.MOTE : P.STAR, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.2, 0.45), R.pick([C[6], C[5], C[4]]), R.range(0.8, 1.8));
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      cull(ps, -meta.origin[0] + 3, -meta.origin[1] + 3, meta.size[0] - meta.origin[0] - 3, meta.size[1] - meta.origin[1] - 3);
      lights.update(dt);
    },
    draw(p) {
      const q = t / 0.5, e = ease.outCubic(clamp(q));
      if (q < 0.08) p.circle(0, 0, 6 * (1 - q / 0.08) + 1, WHITE);
      if (q < 0.35) {
        const L = (1 - q / 0.35) * 34 + 3;
        for (const a of rays) for (let d = 0; d <= L; d += 0.5) p.dot(Math.cos(a) * d, Math.sin(a) * d, d < L * 0.4 ? WHITE : C[5], d < L * 0.7 ? 1 : 1 - (d / L - 0.7) / 0.3);
        for (const a of rays) for (let d = 0; d <= L * 0.45; d += 0.5) p.dot(Math.cos(a + Math.PI / 4) * d, Math.sin(a + Math.PI / 4) * d, C[5], 1 - d / (L * 0.45));
      }
      if (q < 1) {
        p.ring(0, 0, 4 + 74 * e, Math.max(1, 2.5 * (1 - q)), q < 0.2 ? WHITE : C[5], 1.15 - q);
        p.ring(0, 0, 2 + 40 * ease.outCubic(clamp(q * 1.4)), 1, C[4], 1 - q);
      }
      if (q < 0.6) sparkle(p, 0, 0, 5 * (1 - q / 0.6), WHITE, C[5], 0.6);
      ps.draw(p);
      lights.draw(p);
    },
  };
}
