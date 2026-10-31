// The release (a white frame, a flare, a ball that swells and hollows, rings, light) follows Sprite Fusion's
// open-source energy (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, flare, sparkle, clamp, smooth, ease, noise, TAU, WHITE } from "../../core/index.js";

export const meta = {
  name: "Spell hit",
  desc: "Any spell landing on a target: a white frame and flare, a ball of energy that swells and hollows out, a ring, sparks raining down, glittering dust. Recolor it per element.",
  tags: ["impact", "hit", "spell", "magic", "generic", "projectile", "one-shot"],
  size: [144, 112],
  origin: [72, 64],
  duration: 1,
  loop: false,
  fps: 30,
  bg: "dark",
  // size: scale, 0.5 .. 1.5. floor: how far below the hit the floor is, px (sparks land on it, it catches the
  // light); 0 for none
  options: { palette: PAL.arcane, size: 1, floor: 24, seed: 4 },
};

const BALL = 0.3;

export function create(o) {
  const C = fit(o.palette, 8), S = clamp(o.size, 0.4, 1.6), R = new Rng(o.seed), F = o.floor > 0 ? o.floor : Infinity;
  const ps = new Particles({ rng: R, ground: () => F, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  lights.add(0, 0, 40 * S, C[5], 0.9, 0.35);
  lights.add(0, 0, 16 * S, WHITE, 0.9, 0.08);
  // sparks thrown out and up, falling and bouncing; fast motes; a few stars that hang and twinkle
  for (let i = 0; i < Math.round(14 * S); i++) {
    const a = R.range(0, TAU), v = R.range(90, 220) * Math.sqrt(S);
    ps.spawn(P.SPARK, 0, 0, Math.cos(a) * v, Math.sin(a) * v - 70, R.range(0.3, 0.7));
  }
  for (let i = 0; i < Math.round(12 * S); i++) {
    const a = R.range(0, TAU), v = R.range(120, 240) * S;
    ps.spawn(P.MOTE, Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a) * v, Math.sin(a) * v, R.range(0.12, 0.26), R.pick([WHITE, C[6], C[5]]), 0.8);
  }
  for (let i = 0; i < 4; i++) {
    const a = R.range(-Math.PI, 0), v = R.range(25, 60) * S;
    ps.spawn(P.STAR, 0, 0, Math.cos(a) * v, Math.sin(a) * v, R.range(0.35, 0.6), R.pick([WHITE, C[6]]), R.range(0.9, 1.6), R.range(0.04, 0.12));
  }
  // glittering dust drifting down out of it, in a glow that dies slowly
  lights.add(0, 0, 22 * S, C[5], 0.4, 0.6);
  for (let i = 0; i < Math.round(9 * S); i++) {
    const a = R.range(0, TAU), v = R.range(15, 45) * S;
    ps.spawn(P.FLAKE, Math.cos(a) * 5 * S, Math.sin(a) * 5 * S, Math.cos(a) * v, Math.sin(a) * v - 10, R.range(0.45, 0.75), R.pick([C[5], C[6], WHITE]), R.range(0.6, 1.5), R.range(0.08, 0.2));
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      // the floor catches the flash
      const k = 1 - clamp(t / 0.45);
      if (F < Infinity && k > 0) p.glow(0, F - 1, 26 * S, C[5], 0.3 * k * k);
    },
    draw(p) {
      // the ball: a white heart, the palette in bands out to a dark boiling rim; it swells, then hollows out
      if (t < BALL) {
        const u = t / BALL, r = (3 + 9 * ease.outCubic(u)) * S, hollow = smooth(0.25, 1, u), boil = Math.floor(t * 24);
        p.shade(-r - 2, -r - 2, r + 2, r + 2, (x, y, out) => {
          const d = Math.hypot(x, y), a = Math.atan2(y, x), edge = r * (1 + 0.14 * noise(a * 3 + boil * 0.8, 3));
          if (d > edge) return;
          const v = d / edge;
          if (v < hollow * 0.9) return;
          const w = v + noise(a * 4 + d * 0.3 + boil * 0.5, 5) * 0.16;
          out.k = 0.3 * (1 - u);
          return w < 0.35 - u * 0.3 ? WHITE : w < 0.6 ? C[6] : w < 0.8 ? C[5] : w < 0.92 ? C[4] : C[3];
        });
        p.glow(0, 0, r * 1.8 + 6, C[5], 0.55 * (1 - u));
      }
      // the white frame, the flare across it
      if (t < 0.05) p.circle(0, 0, 7 * S, WHITE);
      if (t < 0.18) flare(p, 0, 0, 26 * S * Math.pow(1 - t / 0.18, 1.2), 1 - t / 0.18, C);
      // a ring punched out, and a second slower one a beat later
      const u1 = t / 0.28;
      if (u1 < 1) p.ring(0, 0, 4 + 22 * S * ease.outCubic(u1), Math.max(1, 2.5 * (1 - u1)), u1 < 0.3 ? WHITE : C[6], 1.15 - u1);
      const u2 = (t - 0.05) / 0.4;
      if (u2 > 0 && u2 < 1) p.ring(0, 0, 3 + 15 * S * ease.outCubic(u2), 1, C[5], 1 - u2);
      // a last glint at the heart as it goes
      const g = (t - 0.2) / 0.25;
      if (g > 0 && g < 1) sparkle(p, 0, 0, 3 * S * Math.sin(g * Math.PI), C[6], C[5], 0.3 * (1 - g));
      ps.draw(p);
      lights.draw(p);
    },
  };
}
