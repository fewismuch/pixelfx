// The particle recipe (fire puffs that cool into smoke, sparks, embers, burning brands, grit, rocks, scorch) is
// adapted from Sprite Fusion's open-source explosion (https://www.spritefusion.com/pixel-art-vfx/explosion),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Bits, Lights, Blazes, P, PF, B, Rng, fit, band, clamp, smooth, ease, rand, TAU, WHITE, hex, mix, scale, rgb } from "../../core/index.js";

export const meta = {
  name: "Explosion",
  desc: "A ground blast: a white flash and shock rings, fire that cools into a rolling smoke column, sparks, burning brands that land and keep burning, tumbling rocks and a glowing scorch.",
  tags: ["explosion", "fire", "smoke", "debris", "impact", "one-shot"],
  size: [300, 240],
  origin: [150, 196],
  duration: 6.8,
  loop: false,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    stone: "#8a7358",
    dust: "#a08a76",
    size: 1,
    seed: 7,
    smoke: true,
    smoke_amount: 1,
    smoke_size: 1,
    smoke_life: 1,
    spark: true,
    spark_amount: 1,
    spark_life: 1,
    rock: true,
    rock_amount: 1,
    rock_life: 1,
    dust_life: 1,
  },
};

const BASE = 5.4, MAX = 6.8;

const SOOT = hex("#0d0a12"), SOOT2 = hex("#17121d"), OUTLINE = hex("#1a1422"), WARM = rgb(255, 176, 96);

function stone(c) {
  c = hex(c);
  return { light: mix(scale(c, 1.35), WHITE, 0.08), body: c, shade: scale(c, 0.64), dust: mix(scale(c, 1.2), rgb(150, 140, 150), 0.3) };
}

// the floor under the blast: white-hot, cooling through the fire ramp to soot
function scorch(p, F, t, rx0, cool, fade) {
  if (fade <= 0) return;
  const rx = rx0 * Math.min(1, t / 0.08), ry = 4, heat = [...F].reverse();
  for (let y = 0; y <= 2; y++)
    for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
      const dx = (x + 0.5) / rx, dy = (y + 0.5) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const k = rand(x * 31 + y, 3), T = Math.pow(clamp(1 - t / cool), 1.4) * (1.25 - d) - k * 0.35;
      if (T > 0.06) {
        const c = heat[Math.min(heat.length - 1, Math.floor((1 - Math.min(1, T)) * (heat.length - 1)))];
        p.dot(x, y, c, fade);
        if ((x & 3) === 0) p.glow(x + 0.5, y, 6, c, 0.18 * T * fade);
      } else p.dot(x, y, d < 0.5 ? SOOT : SOOT2, (d < 0.95 - k * 0.3 ? 1 : 1 - d) * fade);
    }
}

// a rock: a lit side, a shaded side, an outline, spinning
function rock(p, b, st) {
  const r = 0.6 + b.s * 0.75, fade = Math.min(1, b.life / 0.5), lx = Math.cos(b.a) * r * 0.4, ly = Math.sin(b.a) * r * 0.4;
  p.shade(b.x - r - 1, b.y - r - 1, b.x + r + 1, b.y + r + 1, (x, y, out) => {
    const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx * 1.15, dy);
    if (d > r + 0.9) return;
    const lit = dx * lx + dy * ly;
    out.c = d > r ? OUTLINE : lit < -0.4 ? st.light : lit > 0.6 ? st.shade : st.body;
    out.a = fade;
  });
}

export function create(o) {
  const F = fit(o.palette, 8), S = o.size, RAD = 18 * S, POWER = 0.9 * Math.pow(S, 0.8), EARTH = 1.6;
  const smokeOn = o.smoke !== false, sparkOn = o.spark !== false, rockOn = o.rock !== false;
  const SL = smokeOn ? clamp(o.smoke_life, 0.25, 2.5) : 1;
  const SS = smokeOn ? clamp(o.smoke_size, 0.35, 2) : 1;
  const SN = smokeOn ? clamp(o.smoke_amount, 0.25, 2) : 0;
  const SKL = sparkOn ? clamp(o.spark_life, 0.25, 2.5) : 1;
  const SK = sparkOn ? clamp(o.spark_amount, 0.25, 2) : 0;
  const RKL = rockOn ? clamp(o.rock_life, 0.25, 2.5) : 1;
  const RK = rockOn ? clamp(o.rock_amount, 0.25, 2) : 0;
  const DL = clamp(o.dust_life, 0.25, 2.5);
  const st = stone(o.stone), du = stone(o.dust);
  const smokes = (flags) => (smokeOn ? flags : flags & ~PF.SMOKES);
  const tail = Math.max(smokeOn ? SL : 1, sparkOn ? SKL : 1, rockOn ? RKL : 1, SN > 0 ? DL : 1);
  const DUR = clamp(BASE * tail, 2.2, MAX);
  const R = new Rng(o.seed), floor = () => 0;
  let t = 0;
  const tailLife = (life, d = 0, mul) => Math.min(life * mul, DUR - 0.1 - t - d);
  const smokeLife = (life, d = 0) => tailLife(life, d, SL);
  const sparkLife = (life, d = 0) => tailLife(life, d, SKL);
  const rockLife = (life, d = 0) => tailLife(life, d, RKL);
  const dustLife = (life, d = 0) => tailLife(life, d, DL);
  let blazes;
  const ps = new Particles({ rng: R, ground: floor, sparks: [F[6], F[5], F[3], F[2]], onLand: (x, y) => blazes.add(x, y - 0.25, R.range(0.9, 1.5), R.range(0.55, 0.85)) });
  blazes = new Blazes(ps);
  const rocks = new Bits({ ground: floor }), lights = new Lights(), flashes = [], rings = [];
  const Y = -RAD * 0.3;

  // the fireball
  flashes.push({ r: RAD * 1.05, life: 0.06, max: 0.06 });
  rings.push({ r0: RAD * 0.45, r1: RAD * 2.7, life: 0.34, max: 0.34, thick: 3, c: F[5] }, { r0: RAD * 0.3, r1: RAD * 1.6, life: 0.22, max: 0.22, thick: 1.8, c: F[3] });
  lights.add(0, Y, RAD * 3.4, WARM, 0.6 * POWER, 0.7);
  lights.add(0, Y, RAD * 1.6, WHITE, 0.6, 0.08);
  for (let i = 0; i < 5; i++) ps.spawn(P.FIRE, R.range(-2.5, 2.5), Y + R.range(-2.5, 2.5), R.range(-20, 20), R.range(-40, -10), R.range(0.18, 0.3), 0, R.range(RAD * 0.4, RAD * 0.55));
  for (let i = 0; i < Math.round(28 * POWER); i++) {
    const a = R.range(0, TAU), d = R.range(0, RAD * 0.55), sp = R.range(40, 210) * POWER;
    const fl = smokeOn ? smokeLife(R.range(0.55, 1.15)) : R.range(0.55, 1.15);
    ps.spawn(P.FIRE, Math.cos(a) * d, Y + Math.sin(a) * d, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 - 40, fl, 0, R.range(RAD * 0.22, RAD * 0.46) * (smokeOn ? SS : 1), 0, R.chance(0.45) ? smokes(PF.SMOKES | PF.BIG) : 0);
  }
  if (SN > 0) {
    for (let i = 0; i < Math.round(5 * SN); i++) {
      const a = R.range(0, TAU), d = R.range(RAD * 0.1, RAD * 0.5), delay = R.range(0.06, 0.2);
      ps.spawn(P.SMOKE, Math.cos(a) * d, Y + Math.sin(a) * d, Math.cos(a) * 30, Math.sin(a) * 20 - 30, smokeLife(R.range(0.9, 1.5), delay), rgb(34, 29, 38), R.range(RAD * 0.15, RAD * 0.26) * SS, delay, PF.BIG);
    }
    for (let i = 0; i < Math.round(5 * SN); i++) {
      const delay = R.range(0, 0.1);
      ps.spawn(P.FIRE, R.range(-RAD * 0.25, RAD * 0.25), Y, R.range(-12, 12), R.range(-180, -100), smokeLife(R.range(0.8, 1.3), delay), 0, R.range(RAD * 0.24, RAD * 0.36) * SS, delay, PF.SMOKES | PF.BIG);
    }
    for (let i = 0; i < Math.round(10 * POWER * SN); i++) {
      const a = R.range(0, TAU), d = R.range(0, RAD * 0.7), sp = R.range(15, 100), delay = R.range(0.12, 0.45);
      ps.spawn(P.SMOKE, Math.cos(a) * d, Y + Math.sin(a) * d, Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - 35, smokeLife(R.range(1.8, 2.8), delay), 0, R.range(RAD * 0.26, RAD * 0.44) * SS, delay, PF.BIG);
    }
  }
  if (SK > 0) {
    for (let i = 0; i < Math.round(80 * POWER * SK); i++) {
      const a = R.range(0, TAU), sp = R.range(140, 380) * POWER;
      ps.spawn(P.SPARK, 0, Y, Math.cos(a) * sp, Math.sin(a) * sp - 70, sparkLife(R.range(0.18, 0.6)));
    }
    for (let i = 0; i < Math.round(40 * POWER * SK); i++) {
      const a = R.range(0, TAU), sp = R.range(30, 150);
      ps.spawn(P.EMBER, Math.cos(a) * RAD * 0.4, Y + Math.sin(a) * RAD * 0.4, Math.cos(a) * sp, Math.sin(a) * sp - 75, sparkLife(R.range(1.2, 2.6)), F[3]);
    }
  }
  for (let i = 0; i < Math.round(R.range(9, 14) * Math.max(0, POWER - 0.55)); i++) {
    const a = -Math.PI / 2 + R.range(-1.35, 1.35), sp = R.range(170, 330);
    ps.spawn(P.BRAND, 0, Y, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.7, 1.3));
  }
  // the ground's part: dust rolling out along the floor, rocks and grit thrown up, a dust column
  if (SN > 0)
    for (let i = 0; i < Math.round(RAD * 0.5 * SN); i++) {
      const s = R.sign(), delay = R.range(0, 0.06);
      ps.spawn(P.SMOKE, s * R.range(0, RAD * 0.6), -R.range(1, 5 + RAD * 0.04), s * R.range(3, 9.5) * RAD, -R.range(2, 15), dustLife(R.range(1.1, 2.0), delay), du.dust, (R.range(4, 7) + RAD / 6) * SS, delay, PF.BIG);
    }
  if (RK > 0) {
    for (let i = 0; i < Math.round(26 * Math.min(1.5, S) * RK); i++)
      rocks.add({ kind: B.CHUNK, x: R.range(-0.4, 0.4) * RAD, y: -3, vx: R.range(-9, 9) * RAD * 0.25, vy: -R.range(7, 16) * RAD * 0.9, g: 1, drag: 0.4, bounce: 0.3, life: rockLife(R.range(1.8, 2.6)), a: R.range(0, TAU), va: R.range(-16, 16), s: R.int(1, 3) });
    for (let i = 0; i < Math.round(EARTH * RAD * 4 * RK); i++) {
      const u = R.range(-1, 1), a = -Math.PI / 2 + u * 0.5, sp = R.range(5, 15) * RAD * (1 - 0.45 * Math.abs(u));
      ps.spawn(P.GRIT, u * 0.25 * RAD, -1, Math.cos(a) * sp, Math.sin(a) * sp, rockLife(R.range(1.2, 2.2)), R.pick([st.light, st.body, st.body, st.shade]), R.chance(0.45) ? 2 : 1);
    }
  }
  if (SN > 0)
    for (let i = 0; i < Math.round(EARTH * 12 * SN); i++) {
      const delay = R.range(0, 0.15);
      ps.spawn(P.SMOKE, R.range(-0.3, 0.3) * RAD, -R.range(2, RAD * 0.6), R.range(-15, 15), -R.range(60, 190) * EARTH * 0.6, dustLife(R.range(1.6, 2.6), delay), du.dust, (R.range(5, 9) * Math.sqrt(S) + RAD / 7) * SS, delay, PF.BIG);
    }

  return {
    update(dt) {
      t += dt;
      for (const a of [flashes, rings]) for (let i = a.length - 1; i >= 0; i--) if ((a[i].life -= dt) <= 0) a.splice(i, 1);
      rocks.update(dt);
      // rocks that hit hard kick up dust
      for (const b of rocks.list)
        if (b.rest && !b.dusted) {
          b.dusted = true;
          for (let i = 0; i < 3; i++) ps.spawn(P.DUST, b.x + R.range(-1.5, 1.5), -0.5, R.sign() * R.range(10, 55) * 0.6, -R.range(2, 22), dustLife(R.range(0.3, 0.65)), du.dust, R.range(1.3, 2.8));
        }
      blazes.update(dt);
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      scorch(p, F, t, 22 * S, (1.2 + RAD / 14) * tail, 1 - smooth(DUR - 1.2, DUR - 0.2, t));
      ps.draw(p, "back");
      blazes.drawBack(p);
      const k = t / 0.5;
      if (k < 1) band(p, 0, 0.5, 80 * S * ease.outCubic(k), 0.16, Math.max(1, (2 + RAD / 9) * (1 - k)), 1.15 - k, [du.body, du.light, F[3], F[6]], (g) => Math.sin(g) < 0);
    },
    draw(p) {
      const k = t / 0.5;
      if (k < 1) band(p, 0, 0.5, 80 * S * ease.outCubic(k), 0.16, Math.max(1, (2 + RAD / 9) * (1 - k)), 1.15 - k, [du.body, du.light, F[3], F[6]], (g) => Math.sin(g) >= 0);
      for (const b of rocks.list) rock(p, b, st);
      ps.draw(p, "front");
      for (const f of flashes) {
        const k2 = f.life / f.max, r = f.r * (0.8 + 0.2 * k2);
        p.circle(0, Y, r + 1.2, F[2]);
        p.circle(0, Y, r, k2 > 0.45 ? F[6] : F[5]);
        p.circle(0, Y, r * 0.6, k2 > 0.45 ? WHITE : F[6]);
      }
      for (const r of rings) {
        const k2 = r.life / r.max, e = 1 - Math.pow(k2, 3);
        p.ring(0, Y, r.r0 + (r.r1 - r.r0) * e, Math.max(1, r.thick * k2 + 0.4), r.c, Math.min(1, k2 * 1.6));
      }
      lights.draw(p);
    },
  };
}
