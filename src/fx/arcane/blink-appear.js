// Teleport arrival (bits converging, a line of light that opens into the silhouette, floor ring, star burst)
// split from blink-in; adapted from Sprite Fusion's open-source blink
// (https://www.spritefusion.com/pixel-art-vfx/movement), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, band, flare, sparkle, clamp, ease, rand, TAU, WHITE, bodyVisible } from "../../core/index.js";
import { shades, squeezed, lightOrb } from "./_lib.js";

const LINE = 0.26, GROW = 0.1, OPEN = 0.12, ARRIVE = LINE + GROW + OPEN;

export const meta = {
  name: "Blink appear",
  desc: "Bits spiral in, a line opens into a silhouette that cools into the caster; `silhouette` off uses a round light orb at `height` instead.",
  tags: ["arcane", "blink", "teleport", "appear", "spawn", "movement", "magic", "one-shot"],
  size: [136, 96],
  origin: [68, 80],
  duration: 1.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: PAL.arcane, seed: 12, silhouette: true, height: 20, radius: 14 },
};

/** Hide the stand-in only while a silhouette forms; with `silhouette: false` your sprite stays visible. */
export const actorAlpha = (t, o) => (o?.silhouette === false || t >= ARRIVE ? 1 : 0);

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), shape = o.silhouette !== false && bodyVisible(o), A = shape ? o.actor : null;
  const mx = shape ? A.x + A.w / 2 : 0, my = shape ? A.y + A.h * 0.55 : -clamp(o.height ?? 20, 8, 44);
  const halfH = shape ? A.h / 2 + 3 : clamp(o.height ?? 20, 8, 44) * 0.55 + 3;
  const orbR = clamp(o.radius ?? 14, 6, 28);
  const sh = shape ? shades(A) : null;
  const inside = shape ? (x, y) => x >= 0 && y >= 0 && x < A.w && y < A.h && A.mask.data[y * A.w + x] : () => false;
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const mxW = mx, COLS = [WHITE, C[6], C[6], C[5], C[4]];
  // the bits: each spirals in from its own spot to a point on the line, arriving as the line forms
  const bits = Array.from({ length: 230 }, () => {
    const a = R.range(0, TAU), d = R.range(16, 46);
    const ty = shape ? A.y + R.range(3, A.h - 2) : my + R.range(-orbR * 0.5, orbR * 0.35);
    let oy = Math.sin(a) * d * 0.8 - 6;
    if (ty + oy > -2) oy = -Math.abs(oy) - 2; // none start under the floor
    return { tx: mxW + R.range(-1, 1), ty: shape ? ty : my, ox: Math.cos(a) * d, oy: shape ? oy : Math.sin(a) * d * 0.75, t0: R.range(0, 0.1), t1: LINE + R.range(-0.02, GROW), spin: R.range(0.8, 1.8) * R.sign(), c: R.pick(COLS) };
  });
  let t = 0, arrived = false;
  const at = (b, tt) => {
    const k = clamp((tt - b.t0) / (b.t1 - b.t0)), e = ease.outCubic(k), r = 1 - e, sp = b.spin * r * 1.2;
    const ox = b.ox * Math.cos(sp) - b.oy * Math.sin(sp), oy = b.ox * Math.sin(sp) + b.oy * Math.cos(sp);
    return [b.tx + ox * r, Math.min(-1, b.ty + oy * r), k];
  };

  return {
    update(dt) {
      t += dt;
      if (t < LINE && R.chance(0.6)) {
        const a = R.range(0, TAU), D = R.range(22, 44), T = R.range(0.12, 0.18), v = (D * 3) / (Math.exp(3 * T) - 1);
        const x = mxW + Math.cos(a) * D, y = Math.min(-2, my + Math.sin(a) * D), l = Math.hypot(x - mxW, y - my) || 1;
        ps.spawn(P.STREAK, x, y, ((mxW - x) / l) * v, ((my - y) / l) * v, T, R.chance(0.5) ? C[6] : C[5]);
      }
      if (!arrived && t >= ARRIVE) {
        arrived = true;
        lights.add(mxW, my - 6, 56, C[5], 0.9, 0.35);
        lights.add(mxW, my, 24, WHITE, 0.8, 0.1);
        for (let i = 0; i < 30; i++) {
          const a = R.range(0, TAU), sp = R.range(35, 110);
          ps.spawn(R.chance(0.6) ? P.STAR : P.MOTE, mxW, my, Math.cos(a) * sp, Math.sin(a) * sp * 0.7 - 30, R.range(0.4, 0.85), R.pick(COLS), R.range(0.6, 1.6));
        }
        for (let i = 0; i < 12; i++) {
          const s = R.sign();
          ps.spawn(P.SPARK, mxW + s * R.range(2, 8), -1, s * R.range(60, 180), -R.range(20, 110), R.range(0.2, 0.45));
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      const k = (t - ARRIVE + 0.03) / 0.5;
      if (k >= 0 && k < 1) band(p, 0, 0, 4 + 30 * ease.outCubic(k), 0.2, Math.max(1, 3 * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) < 0, k < 0.25);
      p.glow(0, -1, 26, C[5], 0.3 * (t < ARRIVE ? t / ARRIVE : 1 - clamp((t - ARRIVE) / 0.5)));
    },
    draw(p) {
      for (const b of bits) {
        if (t < b.t0 || t > b.t1 + 0.02) continue;
        const [x, y, k] = at(b, t);
        p.dot(x, y, k > 0.75 ? WHITE : b.c, Math.min(1, 0.35 + k * 2));
        if (k > 0.55) {
          const [px, py] = at(b, t - 0.015);
          p.dot((x + px) / 2, (y + py) / 2, C[5], 0.8);
        }
        if (k > 0.8) p.glow(x, y, 3, C[6], 0.3);
      }
      if (t >= LINE - 0.04 && t < LINE) {
        const q = (t - LINE + 0.04) / 0.04;
        sparkle(p, mxW, my, 2 + 3 * q, C[6], C[5], 0.6);
      } else if (!shape && t >= LINE && t < ARRIVE) {
        const q = ease.outCubic((t - LINE) / (ARRIVE - LINE));
        lightOrb(p, mxW, my, 1.2 + (orbR - 1.2) * q, C, 1);
      } else if (shape && t >= LINE && t < LINE + GROW) {
        const q = ease.outCubic((t - LINE) / GROW), hh = halfH * q;
        for (let y = -hh - 2; y <= hh + 2; y++) p.dot(mxW, my + y, Math.abs(y) < hh ? WHITE : C[6], Math.abs(y) < hh ? 1 : 0.7);
        for (let y = -hh * 0.7; y <= hh * 0.7; y++) (p.dot(mxW - 1, my + y, C[5], 0.6), p.dot(mxW + 1, my + y, C[5], 0.6));
        p.glow(mxW, my, 30, C[5], 0.9);
        p.glow(mxW, my, 8, WHITE, 0.5);
      } else if (shape && t >= LINE + GROW && t < ARRIVE) {
        const q = ease.outCubic((t - LINE - GROW) / OPEN);
        squeezed(p, A, sh, q, WHITE, C[6]);
        p.glow(mxW, my, 36, C[5], 0.8);
      } else if (shape && t >= ARRIVE && t < ARRIVE + 0.42) {
        const k = 1 - (t - ARRIVE) / 0.42, f = Math.floor(t * 30);
        if (k > 0.86) squeezed(p, A, sh, 1, WHITE, C[6]);
        for (let y = 0; y < A.h; y++)
          for (let x = 0; x < A.w; x++)
            if (inside(x, y)) p.light(A.x + x, A.y + y, C[6], k * k * (sh[y * A.w + x] === 1 ? 0.3 : 0.8));
            else if ((inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) && rand(x, y, f) < 0.85 * k) p.px(A.x + x, A.y + y, k > 0.5 && rand(x, y, 7) < 0.5 ? WHITE : C[6]);
        p.glow(mxW, my, 34, C[5], 0.6 * k);
      } else if (!shape && t >= ARRIVE && t < ARRIVE + 0.28) {
        const k = 1 - (t - ARRIVE) / 0.28;
        lightOrb(p, mxW, my, orbR * (0.35 + 0.65 * k), C, k);
      }
      if (t >= ARRIVE && t < ARRIVE + 0.2) {
        const q = (t - ARRIVE) / 0.2;
        flare(p, mxW, my - 4, 18 * Math.pow(1 - q, 1.5) + 2, 1 - q, C);
      }
      const k = (t - ARRIVE + 0.03) / 0.5;
      if (k >= 0 && k < 1) band(p, 0, 0, 4 + 30 * ease.outCubic(k), 0.2, Math.max(1, 3 * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) >= 0, k < 0.25);
      ps.draw(p);
      lights.draw(p);
    },
  };
}
