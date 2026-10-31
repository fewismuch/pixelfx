// Shared by the arcane effects: a dithered light ramp, closed-form motes and streaks for loops, crackling
// arcs, floor rings and an original rune alphabet. Files starting with _ are helpers, not effects.
// The dithered ramp (tone) is adapted from Sprite Fusion's open-source black hole
// (https://www.spritefusion.com/pixel-art-vfx/black-hole), and the arc drawing and the missile (its head, ribbon
// and pop) from its energy (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez.

import { scale, clamp, bolt, luma, ease, TAU, WHITE } from "../../core/index.js";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** The 4x4 ordered-dither threshold (0..1) of the pixel cell holding (x, y). */
export const bayer = (x, y) => BAYER[((Math.floor(y) & 3) << 2) | (Math.floor(x) & 3)];

/**
 * Light intensity I (0..1) to a step of ramp R (dark to bright), dithering between neighbouring steps so a
 * gradient reads smooth at 1x; below lo it thins out through the dither and returns 0 (draw nothing).
 */
export function tone(R, I, x, y, lo = 0.06, sharp = 0) {
  const b = bayer(x, y);
  if (I < lo && b > I / lo) return 0;
  const n = R.length - 1, f = clamp(I) * n;
  let i = Math.floor(f);
  // sharp (0..1) narrows the dithered zone between two steps, so broad areas stay clean and only edges dither
  const q = sharp > 0 ? clamp((f - i - 0.5) / (1 - sharp) + 0.5) : f - i;
  if (q > b) i = Math.min(n, i + 1);
  return R[i];
}

/** A drifting mote at (x, y) moving (vx, vy) px/s, drawn like the sim's MOTE: bright head, darker tail, light. */
export function mote(p, x, y, vx, vy, c, size = 1, k = 1, glow = 0.4) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, len = Math.min(16, 0.5 + sp * 0.026) * size, a = k < 0.35 ? k / 0.35 : 1;
  if (len > 1.2) p.line(x - ux * len, y - uy * len, x - ux * len * 0.35, y - uy * len * 0.35, scale(c, 0.55), a);
  p.line(x - ux * len * 0.4, y - uy * len * 0.4, x, y, c, a);
  if (glow > 0) p.glow(x, y, 2.5 + size, c, glow * k);
}

/** Energy rushing in, drawn like the sim's STREAK: a white tip, a colored body, a dim dotted tail. */
export function streak(p, x, y, vx, vy, c, a = 1, maxLen = 7, glow = 0.4) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, L = clamp(sp / 30, 1, maxLen);
  for (let d = L; d >= 0; d -= 0.5) p.dot(x - ux * d, y - uy * d, d < 1 ? WHITE : d < L * 0.5 ? c : scale(c, 0.6), (d < L * 0.5 ? 1 : 1.2 - d / L) * a);
  if (glow > 0) p.glow(x, y, 4, c, glow * a);
}

/**
 * A crackling arc from (x0, y0) to (x1, y1): a jagged main path plus forks, as [{ pts, w }]. r is an Rng, so
 * re-seed it every couple of frames for flicker.
 */
export function arc(r, x0, y0, x1, y1, { jag = 0.3, forks = 1, forkLen = 0.5 } = {}) {
  const L = Math.hypot(x1 - x0, y1 - y0), depth = Math.max(1, Math.min(5, Math.round(Math.log2(L / 1.5)))), main = bolt(r, x0, y0, x1, y1, { jag, depth });
  const out = [{ pts: main, w: 1 }];
  for (let k = 0; k < forks && main.length > 3; k++) {
    if (r.next() > 0.7) continue;
    const i = 1 + Math.floor(r.next() * (main.length - 2)), [x, y] = main[i], [px, py] = main[i - 1];
    const a = Math.atan2(y - py, x - px) + (r.next() < 0.5 ? -1 : 1) * (0.4 + r.next() * 0.6), l = L * forkLen * (0.4 + 0.6 * r.next()) * (1 - i / main.length);
    if (l > 1.5) out.push({ pts: bolt(r, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, { jag: jag * 1.1, depth: Math.max(1, depth - 2) }), w: 0.55 });
  }
  return out;
}

/**
 * Draw arc paths the way Sprite Fusion draws its bolts: a dithered halo while it's fresh, a body beside the
 * core, a white core, light along the path. cols: { core, body, halo, glow }; k: 1 fresh .. 0 gone.
 */
export function drawArc(p, paths, cols, k = 1, glowK = 0.5) {
  const steps = (fn) => {
    for (const path of paths)
      for (let i = 0; i < path.pts.length - 1; i++) {
        const [ax, ay] = path.pts[i], [bx, by] = path.pts[i + 1], l = Math.max(1, Math.hypot(bx - ax, by - ay));
        for (let d = 0; d <= l; d += 0.5) fn(ax + ((bx - ax) * d) / l, ay + ((by - ay) * d) / l, path, i, d === 0);
      }
  };
  if (k > 0.45) steps((x, y, path) => { if (path.w >= 1) for (const [dx, dy] of CROSS) p.dot(x + dx * 1.5, y + dy * 1.5, cols.halo, (k - 0.45) * 1.6); });
  if (k > 0.25) steps((x, y, path) => { if (path.w > 0.4) (p.dot(x + 1, y, cols.body), p.dot(x, y + 1, cols.body)); });
  steps((x, y, path, i, first) => {
    p.px(x, y, path.w >= 1 && k > 0.3 ? cols.core : cols.body);
    if (first && i % 3 === 0) p.glow(x, y, (path.w >= 1 ? 9 : 5) * (0.5 + k * 0.5), cols.glow, glowK * k * path.w);
  });
}

/**
 * A ring lying on the floor (or any tilted plane): centre (cx, cy), radius r, squashed by sy, 1 px thick at
 * any size. c and a may be functions of the angle g around it (sin(g) > 0 is the near side, towards the viewer).
 * keep(g) picks which part to draw: (g) => Math.sin(g) < 0 is the far half, for drawBack.
 */
export function floorRing(p, cx, cy, r, sy, c, a = 1, keep = null) {
  if (r < 0.5) return;
  const fc = typeof c === "function", fa = typeof a === "function", ry = r * sy;
  p.shade(cx - r - 1, cy - ry - 1, cx + r + 1, cy + ry + 1, (x, y, o) => {
    const nx = (x - cx) / r, ny = (y - cy) / Math.max(0.3, ry), d = Math.hypot(nx, ny);
    if (d < 1e-6) return;
    const g = Math.hypot(nx / r, ny / Math.max(0.3, ry)) / d;
    if (Math.abs(d - 1) / g > 0.5) return;
    const ang = Math.atan2(ny, nx);
    if (keep && !keep(ang)) return;
    o.c = fc ? c(ang) : c;
    o.a = fa ? a(ang) : a;
  });
}

// An original rune alphabet: angular 3 x 5 glyphs that stay readable standing upright at 1x.
export const GLYPHS = [
  [".#.", "#.#", ".#.", ".#.", "#.#"],
  ["#.#", "#.#", ".#.", "#.#", "#.#"],
  ["##.", "#.#", "##.", "#..", "#.."],
  ["#..", "#.#", "###", "#.#", "..#"],
  [".##", "#..", ".#.", "..#", "##."],
  ["###", ".#.", "###", ".#.", ".#."],
  ["#.#", "###", "#.#", "..#", "..#"],
  [".#.", ".##", ".#.", "##.", ".#."],
];

/**
 * Rune i standing on (x, y): its bottom row sits on y, centred on x. c body color, a alpha (dithered), under an
 * optional darker color drawn a pixel lower so the glyph has a little thickness.
 */
export function glyph(p, i, x, y, c, a = 1, under = 0) {
  const g = GLYPHS[((i % GLYPHS.length) + GLYPHS.length) % GLYPHS.length], X = Math.round(x) - 1, Y = Math.round(y) - g.length + 1;
  if (under) p.sprite(g, {}, X, Y + 1, { tint: under, a });
  p.sprite(g, {}, X, Y, { tint: c, a });
}

// Larger original sigils, 5 x 7, for runes that fly or hover on their own.
export const SIGILS = [
  ["..#..", ".#.#.", "#.#.#", "..#..", ".###.", "..#..", ".#.#."],
  ["#...#", ".#.#.", "..#..", ".###.", "..#..", ".#.#.", "#...#"],
  ["#....", "##...", "#.#..", "#..#.", "#.#..", "##...", "#...."],
  ["..#..", "#.#.#", ".###.", "..#..", "..#..", ".#.#.", "#...#"],
  ["#.#.#", "#.#.#", "#####", "..#..", "..#..", "..#..", ".###."],
  ["#...#", "##.##", "#.#.#", "#...#", "#.#.#", "##.##", "#...#"],
  ["..#..", ".#.#.", "#...#", ".#.#.", "..#..", "..#..", "..#.."],
  ["#..#.", "#.#..", "##...", "#....", "##...", "#.#..", "#..#."],
];

/** Sigil i centred on (x, y) in color c, ringed by a 1 px edge in a darker color so it reads against anything. */
export function sigil(p, i, x, y, c, a = 1, edge = 0) {
  const g = SIGILS[((i % SIGILS.length) + SIGILS.length) % SIGILS.length], X = Math.round(x) - 2, Y = Math.round(y) - 3;
  if (edge) for (const [dx, dy] of CROSS) p.sprite(g, {}, X + dx, Y + dy, { tint: edge, a });
  p.sprite(g, {}, X, Y, { tint: c, a });
}

/** A character's silhouette shaded by how light each pixel is: 1 its dark outline, 2 mid, 3 light (0 empty). */
export function shades(A) {
  const s = new Uint8Array(A.w * A.h);
  for (let i = 0; i < s.length; i++) if (A.mask.data[i]) s[i] = A.pixels ? (luma(A.pixels[i]) < 0.24 ? 1 : luma(A.pixels[i]) < 0.62 ? 2 : 3) : 2;
  return s;
}

/**
 * Silhouette A (an actor) squeezed to sx of its width about its middle and shifted by dx: body color on its
 * pixels, edge color on its dark outline pixels. sh is shades(A). The blink's squeeze, adapted from Sprite Fusion.
 */
export function squeezed(p, A, sh, sx, body, edge, a = 1, dx = 0) {
  if (sx <= 0.02) return;
  const cx = A.x + A.w / 2, half = A.w / 2 + 1;
  for (let y = 0; y < A.h; y++)
    for (let x = Math.floor(cx - half * sx); x <= Math.ceil(cx + half * sx); x++) {
      const i = Math.round(cx + (x + 0.5 - cx) / sx - 0.5) - A.x, v = i < 0 || i >= A.w ? 0 : sh[y * A.w + i];
      if (v) p.dot(x + dx, A.y + y, v === 1 ? edge : body, a);
    }
}

// The arcane missile, shared by arcane-missiles (the volley), arcane-bolt (one in flight) and arcane-pop (its hit).
// C is the 8-step palette. t is the effect's time, tw a per-missile phase. The rates are how fast the rays spin,
// flicker and the strands twist; a loop passes rates that close on its duration.

/**
 * The missile's ribbon tail through pts (head first, [x, y] each): a capsule tapering down the tail, white along
 * its middle near the head, with two strands twisting round it. fade 1 .. 0 as it goes out.
 */
export function missileRibbon(p, pts, t, tw, C, fade = 1, twist = 26) {
  const n = pts.length;
  if (n < 2 || fade <= 0) return;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let d = 0; d < L; d += 0.5) {
      const u = (i + d / L) / (n - 1), x = x0 + ((x1 - x0) * d) / L, y = y0 + ((y1 - y0) * d) / L, a = (1 - u) * 1.7 * fade;
      // the body: a capsule that tapers down the tail, white along its middle near the head, cooling outward
      const w = 2.6 * Math.pow(1 - u, 0.8) + 0.3;
      for (let q = -w; q <= w; q += 0.5) {
        const v = Math.abs(q) / w;
        p.dot(x + nx * q, y + ny * q, v < 0.35 ? (u < 0.25 ? WHITE : C[6]) : v < 0.7 ? (u < 0.4 ? C[6] : C[5]) : u < 0.5 ? C[5] : C[4], a * (v < 0.7 ? 1 : 0.75));
      }
      // two strands twisting round it: bright where they come round the front, dim behind
      for (const s of [0, Math.PI]) {
        const ph = u * 10 - t * twist + tw + s, off = Math.sin(ph) * (w + 1.4);
        if (Math.cos(ph) > -0.2) p.dot(x + nx * off, y + ny * off, Math.cos(ph) > 0.4 ? (u < 0.35 ? WHITE : C[6]) : C[4], a);
      }
    }
    if (i % 3 === 0) p.glow(x0, y0, 9 * (1 - i / n) + 3, C[5], 0.3 * (1 - i / n) * fade);
  }
}

/** A soft arcane orb: shaded disc plus glow (teleport marks, charges). r is radius in px. */
export function lightOrb(p, x, y, r, C, a = 1) {
  if (r <= 0.35 || a <= 0.01) return;
  p.circle(x, y, r, (d) => (d > 0.9 ? C[4] : d > 0.68 ? C[5] : d > 0.38 ? C[6] : WHITE), a);
  p.glow(x, y, r * 2.4, C[5], 0.55 * a);
  p.glow(x, y, Math.max(2, r * 0.55), WHITE, 0.38 * a);
}

/** The missile's head at (x, y): a layered orb with four spinning, flickering rays and a hot light. */
export function missileHead(p, x, y, t, tw, C, spin = 24, flicker = 50) {
  for (let i = 0; i < 4; i++) {
    const a = t * spin + (i * TAU) / 4 + tw, l = 5.5 + 1.5 * Math.sin(t * flicker + i);
    p.line(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, x + Math.cos(a) * l, y + Math.sin(a) * l, C[6]);
  }
  p.circle(x, y, 3.8, C[4]);
  p.circle(x, y, 3, C[5]);
  p.circle(x, y, 2.1, C[6]);
  p.circle(x, y, 1.2, WHITE);
  p.glow(x, y, 24, C[5], 0.6);
  p.glow(x, y, 7, WHITE, 0.4);
}

/** The missile's pop at (x, y), q 0 .. 1 through it: a flash disc, a cross, then a ring spreading out. */
export function missilePop(p, q, x, y, C) {
  if (q < 0.16) {
    const r = 9 * (1 - q / 0.16) + 1.5;
    p.circle(x, y, r + 1.5, C[5]);
    p.circle(x, y, r, WHITE);
  }
  if (q < 0.4) {
    const l = 15 * (1 - q / 0.4) + 3;
    for (let d = -l; d <= l; d++) {
      const a = Math.abs(d) / l, c = a < 0.3 ? WHITE : a < 0.65 ? C[6] : C[5];
      p.dot(x + d, y, c, 1.15 - a);
      p.dot(x, y + d * 0.7, c, 1.15 - a);
    }
  }
  const rr = 3 + 18 * ease.outCubic(q);
  p.ring(x, y, rr + 0.5, Math.max(1, 3 * (1 - q)), q < 0.3 ? WHITE : C[6], 1.2 - q);
}
