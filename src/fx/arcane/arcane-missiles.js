// The bolt and its pop (a layered head with spinning rays, a flash disc, a cross, a ring, plasma sparks and stars)
// are adapted from Sprite Fusion's open-source energy bolt (https://www.spritefusion.com/pixel-art-vfx/energy),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, sparkle, clamp, smooth, ease, TAU, WHITE, READY } from "../../core/index.js";
import { missileRibbon, missileHead, missilePop } from "./_lib.js";

const HX = 15, HY = -24, TX = 152, TY = -22, N = 5, TRAIL = 18;

export const meta = {
  name: "Arcane missiles",
  desc: "A volley of violet bolts fans out of the hand, curls round on twisting ribbons and pops on the target one after another.",
  tags: ["arcane", "missile", "projectile", "homing", "volley", "magic", "directional", "one-shot"],
  size: [240, 116],
  origin: [26, 88],
  duration: 1.75,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: PAL.arcane, seed: 3 },
};

const OPEN = { ...READY, x: -3, crouch: 4, lean: 4, fx: 18, fy: -24, bx: -6, by: -22, ffx: 11, fbx: -9 };
const KICK = { ...OPEN, fx: 15, fy: -26, lean: 2 };
const GATHER = { ...READY, x: -3, crouch: 4, lean: -2, fx: 6, fy: -24, bx: 8, by: -24, ffx: 9, fbx: -7 };
export const act = {
  target: { x: 152 },
  poses: [
    [-0.52, { ...READY, x: -3 }],
    [-0.24, GATHER],
    [0, { ...GATHER, crouch: 5 }],
    [0.05, KICK, "snap"],
    [0.1, OPEN, "snap"],
    [0.15, KICK, "snap"],
    [0.2, OPEN, "snap"],
    [0.25, KICK, "snap"],
    [0.29, OPEN, "snap"],
    [0.33, KICK, "snap"],
    [0.38, OPEN, "snap"],
    [0.43, KICK, "snap"],
    [0.48, OPEN, "snap"],
    [1.2, { ...OPEN, crouch: 3 }],
    [1.7, { ...READY, x: -3 }],
  ],
  hits: [
    { t: 0.77, stop: 0.02, push: 0.7, straw: 4, y: -24, flash: 0.03 },
    { t: 0.85, stop: 0.02, push: 0.7, straw: 4, y: -24, flash: 0.03 },
    { t: 0.95, stop: 0.02, push: 0.7, straw: 4, y: -24, flash: 0.03 },
    { t: 1.08, stop: 0.02, push: 0.7, straw: 4, y: -24, flash: 0.03 },
    { t: 1.2, stop: 0.07, shake: 0.14, amp: 1, push: 1.4, straw: 9, y: -24 },
  ],
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  // each bolt leaves the hand on its own heading, then homes in harder and faster until it lands
  const fan = [-1.05, 0.7, -0.5, 1.1, -1.4];
  const bolts = fan.map((a, i) => {
    a += R.range(-0.12, 0.12);
    const sp = R.range(130, 165);
    return { t0: 0.05 + i * 0.1, x: HX, y: HY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, trail: [], hit: -1, on: false, tx: TX + R.range(-3, 3), ty: TY + R.range(-6, 6), tw: R.range(0, TAU), acc: 0 };
  });
  const pops = [];
  let t = 0;

  // the lock: four brackets close on the target and pulse as each bolt lands
  function lock(p) {
    const k = smooth(0, 0.22, t) * (1 - smooth(1.15, 1.45, t));
    if (k <= 0) return;
    let kick = 0;
    for (const q of pops) kick = Math.max(kick, Math.exp(-(((t - q.t) / 0.06) ** 2)));
    const r = 9 + 10 * (1 - ease.outCubic(smooth(0, 0.22, t))) + 3 * kick, spin = t * 1.5;
    for (let i = 0; i < 4; i++) {
      const a0 = spin + (i * TAU) / 4 - 0.38;
      for (let a = a0; a <= a0 + 0.76; a += 0.06) p.dot(TX + Math.cos(a) * r, TY + Math.sin(a) * r, kick > 0.4 ? WHITE : C[5], k);
    }
    p.glow(TX, TY, 12, C[4], 0.2 * k);
  }

  return {
    update(dt) {
      t += dt;
      for (const b of bolts) {
        if (t < b.t0 || b.hit >= 0) continue;
        if (!b.on) {
          b.on = true;
          lights.add(HX, HY, 28, C[5], 0.7, 0.14);
          for (let i = 0; i < 4; i++) ps.spawn(P.MOTE, HX, HY, Math.cos(Math.atan2(b.vy, b.vx) + R.range(-0.6, 0.6)) * R.range(60, 140), Math.sin(Math.atan2(b.vy, b.vx) + R.range(-0.6, 0.6)) * R.range(60, 140), R.range(0.12, 0.25), C[6], 0.6);
        }
        const age = t - b.t0, dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy) || 1;
        const sp = 150 + 560 * age * age, steer = Math.min(1, (1.4 + 15 * age) * dt);
        b.vx += ((dx / d) * sp - b.vx) * steer;
        b.vy += ((dy / d) * sp - b.vy) * steer;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.trail.unshift([b.x, b.y]);
        if (b.trail.length > TRAIL) b.trail.pop();
        if ((b.acc += dt) > 0.012) {
          b.acc = 0;
          if (R.chance(0.6)) ps.spawn(P.MOTE, b.x, b.y, -b.vx * 0.08 + R.range(-25, 25), -b.vy * 0.08 + R.range(-25, 25), R.range(0.2, 0.4), R.chance(0.5) ? C[6] : C[5], 0.55);
        }
        if (d < 3 || age > 1.3) {
          b.hit = t;
          pops.push({ t, x: b.x, y: b.y });
          lights.add(b.x, b.y, 70, C[5], 0.9, 0.3);
          lights.add(b.x, b.y, 24, WHITE, 0.85, 0.09);
          for (let i = 0; i < 16; i++) {
            const a = R.range(0, TAU), v = R.range(80, 230);
            ps.spawn(P.SPARK, b.x, b.y, Math.cos(a) * v, Math.sin(a) * v - 40, R.range(0.15, 0.45));
          }
          for (let i = 0; i < 7; i++) {
            const a = R.range(-Math.PI, 0.3), v = R.range(40, 140);
            ps.spawn(i % 2 ? P.STAR : P.MOTE, b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, R.range(0.25, 0.48), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.6));
          }
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      // the floor catches the light of each pop
      for (const q of pops) {
        const k = 1 - clamp((t - q.t) / 0.5);
        if (k > 0) p.glow(q.x, -1, 22, C[5], 0.25 * k * k);
      }
    },
    draw(p) {
      lock(p);
      for (const b of bolts) if (b.on) missileRibbon(p, b.trail, t, b.tw, C, b.hit < 0 ? 1 : 1 - clamp((t - b.hit) / 0.16));
      for (const b of bolts) if (b.on && b.hit < 0) missileHead(p, b.x, b.y, t, b.tw, C);
      for (const q of pops) {
        const k = (t - q.t) / 0.35;
        if (k < 1) missilePop(p, k, q.x, q.y, C);
      }
      if (t < 0.55) sparkle(p, HX, HY, 3 + 2 * Math.sin(t * 40), C[6], C[5], 0.45 * (1 - t / 0.55));
      ps.draw(p);
      lights.draw(p);
    },
  };
}
