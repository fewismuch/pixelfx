// The bolt's forked shape, its halo-body-core inking and its flicker follow Sprite Fusion's open-source
// lightning (https://www.spritefusion.com/pixel-art-vfx/lightning), MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, clamp, rng, WHITE, hex } from "../../core/index.js";
import { VOLT, PLASMA, zigzag, stroke, flight, spark } from "./_lib.js";

export const meta = {
  name: "Sky bolt",
  desc: "A forked bolt tears down from overhead, flickers on impact, lights the strike and throws plasma sparks from the floor.",
  tags: ["lightning", "electric", "strike", "weather", "ground", "one-shot"],
  size: [168, 176],
  origin: [84, 164],
  duration: 0.85,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: VOLT, sparks: PLASMA, seed: 8, height: 100 },
};

const FPS = 30, BK = [1, 0.7, 0.3, 0.95, 0.5, 0.75, 0.2];

export function draw(p, t, o) {
  const C = fit(o.palette, 8), S = o.sparks.map(hex), H = clamp(o.height, 48, 156), f = Math.floor(t * FPS + 1e-6), ba = f;
  const br = rng(o.seed, 5), bx1 = br.range(-8, 8), bx0 = bx1 + br.range(-5, 5), y0 = -H - 3, yGlow = -H;
  if (ba < BK.length) {
    const k = BK[ba];
    stroke(p, zigzag(rng(o.seed, 9), bx0, y0, bx1, 0, 0.22, 0.7), k, C, ba === 0 ? 1.15 : 1, { hero: ba === 0 });
    p.circle(bx1, -1, 3 * k + 1.5, C[2]);
    p.circle(bx1, -1, 3 * k + 0.5, C[5]);
    p.circle(bx1, -1, 2 * k, WHITE);
    p.glow(bx1, -0.22 * H, 0.78 * H, C[3], 0.5 * k);
    p.glow(bx1, -3, 18, C[5], 0.45 * k);
    p.glow(bx0, yGlow, H * 0.84, C[4], 0.3 * k);
  }
  for (let j = 0; j < 16; j++) {
    const q = rng(o.seed, 31, j), life = q.range(0.25, 0.6);
    if (t >= life) continue;
    const a = -Math.PI / 2 + q.range(-1.3, 1.3), sp = q.range(60, 200), [x, y, vx, vy] = flight(bx1, -1, Math.cos(a) * sp, Math.sin(a) * sp, t, { floor: 0 });
    spark(p, x, y, vx, vy, 1 - t / life, S);
  }
}
