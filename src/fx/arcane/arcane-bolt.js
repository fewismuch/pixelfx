// One of arcane-missiles' bolts on its own, for games that fly it themselves. The head and ribbon are adapted
// from Sprite Fusion's open-source energy bolt (https://www.spritefusion.com/pixel-art-vfx/energy),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { PAL, fit, cycle, fly, TAU } from "../../core/index.js";
import { missileRibbon, missileHead, mote } from "./_lib.js";

export const meta = {
  name: "Arcane bolt",
  desc: "One violet bolt in flight, in place and facing right: a spinning orb on a short twisting ribbon, shedding motes. Move and rotate it in the game.",
  tags: ["arcane", "missile", "projectile", "bolt", "magic", "directional", "loop"],
  size: [96, 48],
  origin: [64, 24],
  duration: 0.5,
  loop: true,
  fps: 30,
  bg: "dark",
  // length: the ribbon behind the head, px. speed: how fast it is taken to fly, px/s (how fast the motes fall behind)
  options: { palette: PAL.arcane, seed: 3, length: 34, speed: 150 },
};

// rates that close on the 0.5 s loop, the nearest to arcane-missiles' 24, 50 and 26
const D = meta.duration, SPIN = (2 * TAU) / D, FLICKER = (4 * TAU) / D, TWIST = (2 * TAU) / D, N = 18;

export function draw(p, t, o) {
  const C = fit(o.palette, 8), tw = 0.6;
  // motes shed off the ribbon: nearly still in the world, so they stream away behind the flying head
  cycle(t, D, 16, o.seed, (g) => 0.15 + 0.15 * g.next(), (age, L, r) => {
    const wx = r.range(-25, 25), wy = r.range(-25, 25), [x, y] = fly(-r.range(0, o.length * 0.4), r.range(-2.5, 2.5), wx - o.speed, wy, age, 0, 0.6);
    mote(p, x, y, wx, wy, r.chance(0.5) ? C[6] : C[5], 0.55, 1 - age / L);
  });
  // the ribbon snakes a little behind the head, as if it were still steering
  const pts = Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1);
    return [-u * o.length, 1.6 * u * Math.sin(u * 5 - (t / D) * 2 * TAU)];
  });
  missileRibbon(p, pts, t, tw, C, 1, TWIST);
  missileHead(p, 0, 0, t, tw, C, SPIN, FLICKER);
}
