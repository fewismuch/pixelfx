// Gathering streaks and pulse rings adapted from Sprite Fusion's open-source energy charge
// (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, P, Rng, fit, clamp, ease, TAU, WHITE, hex, mix } from "../../core/index.js";
import { cull } from "./_lib.js";

const SUCK = 0.8, STILL = 1.02, VOID = hex("#05040a");

export const meta = {
  name: "Implosion",
  desc: "Everything is sucked in: streaks and grit rush inward, rings contract and a dark sphere collapses onto a crushed white point trembling in stillness.",
  tags: ["implosion", "energy", "magic", "collapse", "charge", "one-shot"],
  size: [208, 184],
  origin: [104, 92],
  duration: STILL,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#0a0614", "#1c1236", "#3a2470", "#6a44c0", "#a080f0", "#d8c8ff", "#ffffff"],
    seed: 2,
    // 0.35..2: void, contracting rings, grit and streaks (1 = default)
    radius: 1,
  },
};

export function create(o) {
  const RAD = clamp(o.radius ?? 1, 0.35, 2);
  const C = fit(o.palette, 7), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, sparks: [C[6], C[5], C[4], C[3]] });
  // grit pulled in: specks that spiral toward the middle, faster and faster
  const grit = Array.from({ length: 70 }, () => {
    const t0 = R.range(0, 0.4);
    return { a: R.range(0, TAU), d: R.range(40, 86) * RAD, t0, T: R.range(0.3, SUCK - 0.04 - t0), spin: R.sign() * R.range(0.6, 1.6), c: R.pick([C[2], C[3], C[4], hex("#4a4458"), hex("#6e6880")]) };
  });
  let t = 0;
  return {
    update(dt) {
      t += dt;
      if (t < SUCK - 0.26) {
        // streaks of light rushing in from all round, accelerating, more of them as it goes
        const k = t / SUCK;
        for (let n = 0; n < 1 + Math.floor(k * 4); n++) {
          if (!R.chance(0.9)) continue;
          const a = R.range(0, TAU), D = R.range(34, 82) * RAD * (1 - 0.3 * k), T = R.range(0.14, 0.24), v = (D * 3) / (Math.exp(3 * T) - 1);
          ps.spawn(P.STREAK, Math.cos(a) * D, Math.sin(a) * D, -Math.cos(a) * v, -Math.sin(a) * v, T, R.chance(0.5) ? C[5] : C[4]);
        }
        // vapour drawn in along the way
        if (R.chance(14 * dt)) {
          const a = R.range(0, TAU), D = R.range(50, 80) * RAD;
          ps.spawn(P.VAPOUR, Math.cos(a) * D, Math.sin(a) * D, -Math.cos(a) * 90 * RAD, -Math.sin(a) * 90 * RAD, R.range(0.4, 0.6), C[3], R.range(3, 5) * RAD);
        }
      }
      ps.update(dt);
      cull(ps, -meta.origin[0] + 3, -meta.origin[1] + 3, meta.size[0] - meta.origin[0] - 3, meta.size[1] - meta.origin[1] - 3);
    },
    draw(p) {
      const k = clamp(t / SUCK);
      // the void: a dark sphere edged with light, collapsing onto the core
      const vr = 64 * RAD * (1 - ease.inCubic(k)) + Math.max(2, 3 * RAD);
      if (k < 1) {
        p.disc(0, 0, vr, VOID, 0.35 + 0.35 * k);
        p.ring(0, 0, vr + 1, 1, k < 0.5 ? C[3] : C[4], 0.5 + 0.5 * k);
        p.glowRing(0, 0, vr, 5, C[4], 0.18 + 0.3 * k);
      }
      // rings pulled in after it, one after another, brighter as they go
      for (let i = 0; i < 4; i++) {
        const u = (t - i * 0.17) / 0.34;
        if (u <= 0 || u >= 1) continue;
        const r = (70 - i * 8) * RAD * (1 - ease.inQuad(u)) + Math.max(1.5, 2 * RAD);
        p.ring(0, 0, r, u > 0.7 ? 2 : 1, u > 0.6 ? C[5] : C[3], 0.4 + 0.6 * u);
      }
      // the grit, spiralling in
      for (const q of grit) {
        const u = (t - q.t0) / q.T;
        if (u <= 0 || u >= 1) continue;
        const d = q.d * (1 - ease.inCubic(u)), a = q.a + q.spin * ease.inQuad(u) * 2, x = Math.cos(a) * d, y = Math.sin(a) * d;
        const x2 = Math.cos(a - q.spin * 0.1) * (d + 4 * RAD * u * u + 0.5), y2 = Math.sin(a - q.spin * 0.1) * (d + 4 * RAD * u * u + 0.5);
        p.line(x2, y2, x, y, (v) => (v < 0.5 ? mix(q.c, VOID, 0.4) : q.c));
      }
      // the core: growing hotter as it's crushed, then a white point trembling in the stillness
      const still = t > SUCK, jit = still ? (Math.floor(t * 40) % 2 ? 0.5 : -0.5) : 0, cr = still ? 1.6 : 1 + 3.5 * (1 - k) * k * 4;
      p.disc(jit, 0, cr + 3.5, VOID, 0.85);
      p.circle(jit, 0, cr + 1.2, C[4]);
      p.circle(jit, 0, cr, WHITE);
      p.glow(0, 0, (10 + 26 * k) * RAD, C[4], 0.3 + 0.5 * k);
      if (still) p.glow(0, 0, 8, WHITE, 0.4 + 0.2 * Math.sin(t * 60));
      ps.draw(p);
    },
  };
}
