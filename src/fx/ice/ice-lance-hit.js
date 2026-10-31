// Where an ice lance strikes: a cold flash, a ring of frost and shards. The pop follows Sprite Fusion's open-source
// energy bolt (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, flare, sparkle, clamp, smooth, ease, TAU, WHITE } from "../../core/index.js";
import { blade } from "./_lib.js";
import { brokenRing } from "../impacts/_lib.js";

export const meta = {
  name: "Ice lance hit",
  desc: "Where an ice lance strikes a target: a white flash and cold flare, a ring of frost that cracks outward, ice shards and crystal glints bursting all round and drifting down.",
  tags: ["ice", "lance", "spear", "impact", "hit", "projectile", "magic", "one-shot"],
  size: [136, 96],
  origin: [68, 52],
  duration: 0.85,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"],
    size: 1,
    floor: 0,
    seed: 14,
  },
};

export function create(o) {
  const C = fit(o.palette, 8), S = clamp(o.size, 0.4, 1.6), R = new Rng(o.seed), F = o.floor > 0 ? o.floor : Infinity;
  const ps = new Particles({ rng: R, ground: () => F, sparks: [WHITE, C[7], C[6], C[5]] }), lights = new Lights();
  const segs = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * TAU + R.range(-0.12, 0.12), gap: R.range(0.5, 0.78), dr: R.range(0.08, 0.28) }));
  const shards = Array.from({ length: 8 }, () => ({
    a: R.range(0, TAU), sp: R.range(85, 200) * S, rot: R.range(0, TAU), w: R.sign() * R.range(8, 14), life: R.range(0.22, 0.38), age: 0,
    w0: R.range(2.5, 4) * S,
  }));
  lights.add(0, 0, 42 * S, C[5], 0.85, 0.32);
  lights.add(0, 0, 18 * S, WHITE, 0.9, 0.08);
  for (let i = 0; i < Math.round(16 * S); i++) {
    const a = R.range(0, TAU), v = R.range(100, 240) * Math.sqrt(S);
    ps.spawn(P.MOTE, Math.cos(a) * 2, Math.sin(a) * 2, Math.cos(a) * v, Math.sin(a) * v - 50, R.range(0.14, 0.32), R.pick([WHITE, C[7], C[6]]), R.range(0.7, 1));
  }
  for (let i = 0; i < Math.round(10 * S); i++) {
    const a = R.range(0, TAU), v = R.range(40, 130) * S;
    ps.spawn(P.FLAKE, 0, 0, Math.cos(a) * v, Math.sin(a) * v - 20, R.range(0.35, 0.65), R.chance(0.55) ? WHITE : C[6], R.range(0.5, 1.2), R.range(0, 0.05));
  }
  for (let i = 0; i < Math.round(8 * S); i++) {
    const a = R.range(0, TAU), v = R.range(70, 180) * S;
    ps.spawn(P.SPARK, 0, 0, Math.cos(a) * v, Math.sin(a) * v - 60, R.range(0.18, 0.45));
  }
  for (let i = 0; i < 4; i++) {
    const a = R.range(0, TAU), v = R.range(25, 55) * S;
    ps.spawn(P.STAR, Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * v, Math.sin(a) * v - 8, R.range(0.3, 0.55), R.pick([WHITE, C[6]]), R.range(0.9, 1.8), R.range(0.04, 0.14));
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (const sh of shards) sh.age += dt;
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      const k = 1 - clamp(t / 0.5);
      if (F < Infinity && k > 0) p.glow(0, F - 1, 24 * S, C[4], 0.28 * k * k);
    },
    draw(p) {
      const u = (t - 0.02) / 0.32;
      if (u >= 0 && u < 1) {
        const r = (5 + 22 * ease.outCubic(u)) * S, brk = smooth(0.12, 0.55, u), i = u < 0.12 ? 7 : u < 0.3 ? 6 : u < 0.55 ? 5 : 4;
        brokenRing(p, 0, 0, r, Math.max(1, 2.2 * S * Math.pow(1 - u, 1.15)), segs, brk, C[i], C[Math.max(2, i - 2)], u < 0.55 ? 1 : (1 - u) / 0.45);
        if (u < 0.45) p.glowRing(0, 0, r, 4, C[5], 0.35 * (1 - u / 0.45));
      }
      for (const sh of shards) {
        if (sh.age >= sh.life) continue;
        const k = 1 - sh.age / sh.life, u = sh.age / sh.life, dist = sh.sp * sh.age * (1 - 0.3 * u);
        const x = Math.cos(sh.a) * dist, y = Math.sin(sh.a) * dist, tail = 7 * S;
        blade(p, x, y, x - Math.cos(sh.a) * tail, y - Math.sin(sh.a) * tail, sh.w0, C, { a: k, glint: k > 0.5 && Math.sin(sh.rot + sh.age * sh.w) > 0.92 ? 0.6 : -1 });
      }
      if (t < 0.06) p.circle(0, 0, 6 * S + 1, WHITE);
      if (t < 0.2) flare(p, 0, 0, 24 * S * Math.pow(1 - t / 0.2, 1.3), 1 - t / 0.2, C);
      const u2 = t / 0.26;
      if (u2 < 1) p.ring(0, 0, 3 + 14 * S * ease.outCubic(u2), Math.max(1, 2 * (1 - u2)), u2 < 0.25 ? WHITE : C[6], 1.1 - u2);
      const g = (t - 0.12) / 0.22;
      if (g > 0 && g < 1) sparkle(p, 0, 0, 3.5 * S * Math.sin(g * Math.PI), C[7], WHITE, 0.35 * (1 - g));
      ps.draw(p);
      lights.draw(p);
    },
  };
}
