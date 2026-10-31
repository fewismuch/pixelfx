// arcane-missiles' launch flash on its own, for games that fly the bolt themselves. The flare and motes follow
// Sprite Fusion's open-source energy bolt (https://www.spritefusion.com/pixel-art-vfx/energy),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, sparkle, TAU, WHITE } from "../../core/index.js";

export const meta = {
  name: "Arcane cast",
  desc: "The flash in the hand as an arcane bolt leaves it, facing right: a twinkling violet star, a ring snapping out and motes spraying forward.",
  tags: ["arcane", "missile", "cast", "muzzle", "magic", "directional", "one-shot"],
  size: [64, 48],
  origin: [20, 24],
  duration: 0.45,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: PAL.arcane, seed: 3 },
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  lights.add(0, 0, 28, C[5], 0.7, 0.14);
  lights.add(0, 0, 10, WHITE, 0.6, 0.06);
  for (let i = 0; i < 6; i++) {
    const a = R.range(-0.6, 0.6), v = R.range(60, 140);
    ps.spawn(P.MOTE, 0, 0, Math.cos(a) * v, Math.sin(a) * v, R.range(0.12, 0.25), R.chance(0.5) ? C[6] : C[5], 0.6);
  }
  for (let i = 0; i < 3; i++) {
    const a = R.range(-1.2, 1.2), v = R.range(30, 70);
    ps.spawn(P.STAR, 0, 0, Math.cos(a) * v, Math.sin(a) * v, R.range(0.2, 0.35), R.pick([WHITE, C[6]]), R.range(0.8, 1.4));
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // the white core for a frame, then the star twinkling down
      if (t < 0.05) p.circle(0, 0, 3, WHITE);
      const k = 1 - t / 0.35;
      if (k > 0) sparkle(p, 0, 0, (3 + 2 * Math.sin(t * 40)) * (0.5 + 0.5 * k), C[6], C[5], 0.45 * k);
      const q = t / 0.2;
      if (q < 1) p.ring(0, 0, 2 + 8 * Math.sqrt(q), 1, q < 0.4 ? WHITE : C[6], 1.1 - q);
      ps.draw(p);
      lights.draw(p);
    },
  };
}
