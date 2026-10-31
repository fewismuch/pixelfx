// The release (a white frame, a flare, a ball that swells and hollows, rings on a tilted plane, light) follows
// Sprite Fusion's open-source energy (https://www.spritefusion.com/pixel-art-vfx/energy),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, flare, band, sparkle, clamp, smooth, ease, noise, TAU, WHITE } from "../../core/index.js";

export const meta = {
  name: "Spell blast",
  desc: "Any spell going off over an area: a white dome, a ball of energy that lifts and hollows, shock rings racing over the floor, sparks, glowing embers and glitter.",
  tags: ["explosion", "spell", "magic", "aoe", "area", "generic", "one-shot"],
  size: [256, 192],
  origin: [128, 136],
  duration: 1.5,
  loop: false,
  fps: 30,
  bg: "ground",
  // size: scale, 0.5 .. 1.5 (at 1 the rings reach about 56 px out)
  options: { palette: PAL.arcane, size: 1, seed: 6 },
};

const BALL = 0.5, SY = 0.32;

export function create(o) {
  const C = fit(o.palette, 8), S = clamp(o.size, 0.4, 1.6), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  lights.add(0, -12 * S, 80 * S, C[5], 1, 0.6);
  lights.add(0, -10 * S, 30 * S, WHITE, 0.9, 0.1);
  lights.add(0, -4 * S, 44 * S, C[4], 0.45, 1.3);
  // sparks thrown out and up, landing and bouncing over the floor
  for (let i = 0; i < Math.round(28 * S); i++) {
    const a = R.range(-Math.PI * 0.95, -Math.PI * 0.05), v = R.range(120, 300) * Math.sqrt(S);
    ps.spawn(P.SPARK, Math.cos(a) * 4 * S, -6 * S, Math.cos(a) * v * 1.2, Math.sin(a) * v, R.range(0.4, 0.9));
  }
  // a column of motes shot straight up out of the heart
  for (let i = 0; i < Math.round(14 * S); i++)
    ps.spawn(P.MOTE, R.range(-6, 6) * S, -6 * S, R.range(-30, 30), -R.range(150, 280) * Math.sqrt(S), R.range(0.2, 0.4), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.1), R.range(0, 0.08));
  // glitter hanging in the air where the ball was, drifting down
  for (let i = 0; i < Math.round(14 * S); i++) {
    const a = R.range(0, TAU), r = R.range(4, 26) * S;
    ps.spawn(i % 3 ? P.FLAKE : P.STAR, Math.cos(a) * r, -16 * S + Math.sin(a) * r * 0.7, R.range(-10, 10), R.range(-20, 10), R.range(0.5, 1.0), R.pick([WHITE, C[6], C[5]]), R.range(0.7, 1.6), R.range(0.25, 0.5));
  }
  // embers strewn over the floor round the heart, each cooling at its own pace
  const embers = Array.from({ length: Math.round(22 * S) }, () => {
    const a = R.range(0, TAU), r = 30 * Math.sqrt(R.next());
    return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r * SY), life: R.range(0.4, 1.3), big: R.chance(0.3) };
  });
  let t = 0, broke = false;
  return {
    update(dt) {
      t += dt;
      // the hollowed ball breaks: its shell flies apart into motes that drift out and up and fade
      if (!broke && t >= BALL * 0.9) {
        broke = true;
        const r = 28 * S, cy = -r * 0.6;
        for (let i = 0; i < Math.round(26 * S); i++) {
          const a = R.range(-Math.PI, 0.2), v = R.range(25, 70) * S;
          ps.spawn(P.MOTE, Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, Math.cos(a) * v, Math.sin(a) * v - 20, R.range(0.35, 0.7), R.pick([C[6], C[5], C[4]]), R.range(0.7, 1));
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      // the floor where it went off: a pool of light that dies slowly, and embers that cool one by one
      const pool = 1 - smooth(0.1, 1.4, t), rr = 34 * S * ease.outCubic(clamp(t / 0.25));
      if (pool > 0 && rr > 1)
        p.shade(-rr, -rr * SY, rr, rr * SY, (x, y, out) => {
          const d = Math.hypot(x / rr, y / (rr * SY));
          if (d < 1) (out.l = C[4]), (out.k = 0.32 * pool * (1 - d) * (1 - d));
        });
      for (const e of embers) {
        const k = 1 - clamp((t - 0.15) / e.life);
        if (k <= 0 || t < 0.15) continue;
        const x = e.x * S, y = e.y * S;
        p.px(x, y, k > 0.7 ? C[6] : k > 0.45 ? C[5] : k > 0.2 ? C[4] : C[3]);
        if (e.big && k > 0.4) p.px(x + 1, y, C[4]);
        p.light(x, y, C[5], 0.5 * k);
      }
      rings(p, t, C, S, true);
      ps.draw(p, "back");
    },
    draw(p) {
      // the ball lifting off the floor: a white heart, the palette in bands, a boiling rim; it swells and hollows
      if (t < BALL) {
        const u = t / BALL, r = (6 + 22 * ease.outCubic(u)) * S, cy = -r * 0.6, hollow = smooth(0.3, 1, u), boil = Math.floor(t * 20);
        p.shade(-r - 3, cy - r - 3, r + 3, 2, (x, y, out) => {
          const dy = y - cy, d = Math.hypot(x, dy), a = Math.atan2(dy, x), edge = r * (1 + 0.12 * noise(a * 3 + boil * 0.7, 3));
          if (d > edge || y > 1) return;
          const v = d / edge;
          if (v < hollow * 0.92) return;
          const w = v + noise(a * 4 + d * 0.25 + boil * 0.5, 5) * 0.15, fil = Math.abs(Math.sin(a * 5 + d * 0.3 - t * 12)) < 0.09;
          out.k = 0.25 * (1 - u);
          if (fil && v > 0.3 && v < 0.88) return u < 0.5 ? WHITE : C[6];
          return w < 0.32 - u * 0.25 ? WHITE : w < 0.55 ? C[6] : w < 0.74 ? C[5] : w < 0.9 ? C[4] : C[3];
        });
        p.glow(0, cy, r * 1.6 + 8, C[5], 0.55 * (1 - u));
      }
      // the white dome, the flare
      if (t < 0.06) p.shade(-16 * S, -16 * S, 16 * S, 1, (x, y) => (Math.hypot(x, y) < 14 * S ? WHITE : undefined));
      if (t < 0.28) flare(p, 0, -10 * S, 56 * S * Math.pow(1 - t / 0.28, 1.3), 1 - t / 0.28, C);
      // a ring standing up round the ball, punched out
      const u = t / 0.35;
      if (u < 1) p.ring(0, -12 * S, 8 + 40 * S * ease.outCubic(u), Math.max(1, 3 * (1 - u)), u < 0.25 ? WHITE : C[6], 1.15 - u);
      // the heart's last glint
      const g = (t - 0.35) / 0.4;
      if (g > 0 && g < 1) sparkle(p, 0, -8 * S, 5 * S * Math.sin(g * Math.PI), C[6], C[5], 0.35 * (1 - g));
      rings(p, t, C, S, false);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };
}

// two shock rings racing out over the floor, a fast hot one and a slower one: far halves behind, near in front
function rings(p, t, C, S, back) {
  const keep = (g) => (Math.sin(g) < 0) === back;
  const u1 = (t - 0.02) / 0.5;
  if (u1 > 0 && u1 < 1) band(p, 0, 0, 8 + 50 * S * ease.outCubic(u1), SY, Math.max(1, 5 * (1 - u1)) * S, 1.15 - u1, [C[3], C[4], C[5], C[6]], keep, u1 < 0.2);
  const u2 = (t - 0.12) / 0.75;
  if (u2 > 0 && u2 < 1) band(p, 0, 0, 6 + 36 * S * ease.outCubic(u2), SY, Math.max(1, 2.5 * (1 - u2)) * S, 1 - u2, [C[2], C[3], C[4], C[5]], keep);
}
