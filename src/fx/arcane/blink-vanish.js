// Teleport departure (crackling outline, white flash, silhouette squeezed to a line, floor ring, afterimage)
// split from blink-in / blink-out; adapted from Sprite Fusion's open-source blink
// (https://www.spritefusion.com/pixel-art-vfx/movement), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, band, flare, sparkle, clamp, ease, rand, TAU, WHITE, bodyVisible } from "../../core/index.js";
import { shades, squeezed, lightOrb } from "./_lib.js";

const OUT = 0.32, SQUEEZE = 0.12, COLLAPSE = 0.08, POP = OUT + SQUEEZE + COLLAPSE;

export const meta = {
  name: "Blink vanish",
  desc: "The caster gathers into light and pops away in sparks; `silhouette` off shrinks a round orb at `height` with no actor shape.",
  tags: ["arcane", "blink", "teleport", "vanish", "despawn", "movement", "magic", "one-shot"],
  size: [136, 96],
  origin: [68, 80],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: PAL.arcane, seed: 11, silhouette: true, height: 20, radius: 14, ring_radius: 30 },
};

/** Hide the stand-in once the body becomes light; with `silhouette: false` hide your own sprite in game instead. */
export const actorAlpha = (t, o) => (o?.silhouette === false ? 1 : t < OUT ? 1 : 0);

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), shape = o.silhouette !== false && bodyVisible(o), A = shape ? o.actor : null;
  const mx = shape ? A.x + A.w / 2 : 0, my = shape ? A.y + A.h * 0.55 : -clamp(o.height ?? 20, 8, 44);
  const halfH = shape ? A.h / 2 + 2 : clamp(o.height ?? 20, 8, 44) * 0.55 + 2;
  const orbR = clamp(o.radius ?? 14, 6, 28), RR = clamp(o.ring_radius ?? 30, 14, 64);
  const sh = shape ? shades(A) : null;
  const inside = shape ? (x, y) => x >= 0 && y >= 0 && x < A.w && y < A.h && A.mask.data[y * A.w + x] : () => false;
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const COLS = [WHITE, C[6], C[6], C[5], C[4]];
  let t = 0, out = false, popped = false;

  return {
    update(dt) {
      t += dt;
      if (t < OUT - 0.04 && R.chance(0.7)) {
        const a = R.range(0, TAU), D = R.range(22, 44), T = R.range(0.12, 0.18), v = (D * 3) / (Math.exp(3 * T) - 1);
        const x = mx + Math.cos(a) * D, y = Math.min(-2, my + Math.sin(a) * D), l = Math.hypot(x - mx, y - my) || 1;
        ps.spawn(P.STREAK, x, y, ((mx - x) / l) * v, ((my - y) / l) * v, T, R.chance(0.5) ? C[6] : C[5]);
      }
      if (!out && t >= OUT) {
        out = true;
        lights.add(mx, my - 6, 54, C[5], 0.9, 0.3);
        lights.add(mx, my, 26, WHITE, 0.8, 0.1);
      }
      if (!popped && t >= POP) {
        popped = true;
        lights.add(mx, my - 6, 58, C[5], 0.9, 0.35);
        lights.add(mx, my, 24, WHITE, 0.9, 0.08);
        for (let i = 0; i < 110; i++) {
          const y = shape ? A.y + R.range(2, A.h - 2) : my + R.range(-orbR, orbR * 0.55);
          const s = R.sign();
          ps.spawn(P.EMBER, mx + R.range(-1, 1), y, s * R.range(25, 105), R.range(-70, 10), R.range(0.5, 0.95), R.pick(COLS), R.chance(0.3) ? 2 : 1);
        }
        for (let i = 0; i < 18; i++) {
          const a = R.range(0, TAU), sp = R.range(80, 240);
          ps.spawn(P.SPARK, mx, my, Math.cos(a) * sp, Math.sin(a) * sp - 40, R.range(0.2, 0.5));
        }
        for (let i = 0; i < 14; i++) {
          const a = R.range(0, TAU), sp = R.range(20, 110);
          ps.spawn(i % 2 ? P.STAR : P.MOTE, mx, my, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 - 20, R.range(0.4, 0.9), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.8));
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      if (shape && t > POP && t < POP + 0.6) {
        const k = 0.5 * (1 - (t - POP) / 0.6);
        for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) if (sh[y * A.w + x]) p.blend(A.x + x, A.y + y, sh[y * A.w + x] === 1 ? C[3] : C[4], k);
      }
      const k = (t - POP) / 0.5;
      if (k >= 0 && k < 1) band(p, 0, 0, 4 + RR * ease.outCubic(k), 0.2, Math.max(1, 3 * (RR / 30) * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) < 0, k < 0.25);
      if (t < POP + 0.3) p.glow(0, -1, 26, C[5], 0.3 * (t < OUT ? t / OUT : 1 - clamp((t - POP) / 0.3)));
    },
    draw(p) {
      const f = Math.floor(t * 30);
      if (t < OUT) {
        const k = t / OUT;
        if (shape) {
          for (let y = 0; y < A.h; y++)
            for (let x = 0; x < A.w; x++) {
              if (inside(x, y)) p.light(A.x + x, A.y + y, C[6], k * k * (sh[y * A.w + x] === 1 ? 0.3 : 0.75));
              else if ((inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) && rand(x, y, f) < 0.25 + 0.65 * k)
                p.px(A.x + x, A.y + y, k > 0.6 && rand(x, y, 7) < 0.5 ? WHITE : C[6]);
            }
        } else lightOrb(p, mx, my, 2 + orbR * 0.75 * k, C, 0.65 + 0.35 * k);
        p.glow(mx, my, 30, C[5], 0.5 * k);
      } else if (t < OUT + 0.05) {
        if (shape) squeezed(p, A, sh, 1, WHITE, C[6]);
        else lightOrb(p, mx, my, orbR, C, 1);
        p.glow(mx, my, 40, C[5], 0.8);
      } else if (shape && t < OUT + SQUEEZE) {
        const q = ease.inCubic((t - OUT - 0.05) / (SQUEEZE - 0.05));
        squeezed(p, A, sh, 1 - q, WHITE, C[6]);
        p.glow(mx, my, 34, C[5], 0.8);
      } else if (shape && t < POP) {
        const q = (t - OUT - SQUEEZE) / COLLAPSE, hh = halfH * (1 - ease.inQuad(q));
        for (let y = -hh - 3; y <= hh + 3; y++) p.dot(mx, my + y, Math.abs(y) < hh ? WHITE : C[6], Math.abs(y) < hh ? 1 : 0.7);
        if (hh > 4) for (let y = -hh * 0.7; y <= hh * 0.7; y++) (p.dot(mx - 1, my + y, C[5], 0.6), p.dot(mx + 1, my + y, C[5], 0.6));
        p.glow(mx, my, 30, C[5], 0.9);
        p.glow(mx, my, 8, WHITE, 0.5);
      } else if (!shape && t < POP) {
        const q = (t - OUT - 0.05) / (POP - OUT - 0.05), r = orbR * (1 - ease.inQuad(clamp(q)));
        if (r > 0.6) lightOrb(p, mx, my, r, C, 1);
        else if (r > 0.15) p.circle(mx, my, r, (d) => (d > 0.5 ? WHITE : C[6]), 1);
      }
      if (t >= POP && t < POP + 0.22) {
        const q = (t - POP) / 0.22;
        flare(p, mx, my, 22 * Math.pow(1 - q, 1.5) + 2, 1 - q, C);
        if (q < 0.3) p.circle(mx, my, 4 * (1 - q / 0.3) + 1, WHITE);
      }
      const k = (t - POP) / 0.5;
      if (k >= 0 && k < 1) band(p, 0, 0, 4 + RR * ease.outCubic(k), 0.2, Math.max(1, 3 * (RR / 30) * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) >= 0, k < 0.25);
      if (t > POP && t < POP + 0.3) sparkle(p, mx, my - 1, 3, C[6], C[5], 0.3 * (1 - (t - POP) / 0.3));
      ps.draw(p);
      lights.draw(p);
    },
  };
}
