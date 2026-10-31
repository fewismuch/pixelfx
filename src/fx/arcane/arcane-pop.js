// arcane-missiles' hit on its own, for games that fly the bolt themselves. The pop (a flash disc, a cross, a ring,
// plasma sparks and stars) is adapted from Sprite Fusion's open-source energy bolt
// (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, clamp, TAU, WHITE } from "../../core/index.js";
import { missilePop } from "./_lib.js";

export const meta = {
  name: "Arcane pop",
  desc: "Where an arcane bolt lands: a white flash and cross, a violet ring spreading out, sparks and stars spraying off and the floor below catching the light.",
  tags: ["arcane", "missile", "impact", "hit", "pop", "magic", "one-shot"],
  size: [128, 80],
  origin: [64, 48],
  duration: 0.6,
  loop: false,
  fps: 30,
  bg: "dark",
  // floor: how far below the hit the floor is, px (sparks bounce on it, it catches the light); 0 for none
  options: { palette: PAL.arcane, seed: 3, floor: 22 },
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), F = o.floor > 0 ? o.floor : Infinity;
  const ps = new Particles({ rng: R, ground: () => F, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  lights.add(0, 0, 46, C[5], 0.9, 0.3);
  lights.add(0, 0, 24, WHITE, 0.85, 0.09);
  for (let i = 0; i < 16; i++) {
    const a = R.range(0, TAU), v = R.range(80, 230);
    ps.spawn(P.SPARK, 0, 0, Math.cos(a) * v, Math.sin(a) * v - 40, R.range(0.15, 0.45));
  }
  for (let i = 0; i < 7; i++) {
    const a = R.range(-Math.PI, 0.3), v = R.range(40, 140);
    ps.spawn(i % 2 ? P.STAR : P.MOTE, 0, 0, Math.cos(a) * v, Math.sin(a) * v, R.range(0.25, 0.48), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.6));
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      const k = 1 - clamp(t / 0.5);
      if (F < Infinity && k > 0) p.glow(0, F - 1, 22, C[5], 0.25 * k * k);
    },
    draw(p) {
      const k = t / 0.35;
      if (k < 1) missilePop(p, k, 0, 0, C);
      ps.draw(p);
      lights.draw(p);
    },
  };
}
