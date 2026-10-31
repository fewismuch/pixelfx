#!/usr/bin/env node
// Export an effect for a game engine as two sprite sheets, the layer behind the character and the layer in front
// of it, without the character itself, so the game draws its own sprite between them.
//
//   node tools/export-godot.mjs status/bleeding --actor path/to/hero.png
//   node tools/export-godot.mjs status/poisoned --actor hero.png --opts '{"sway":0,"floor_ring":false,"floor_glow":false}'
//   node tools/export-godot.mjs nature/root-snare --actor hero.png --opts '{"hold":true}' --from 1.6 --to 3.2 --loop --name rooted-hold
//
// Frames are trimmed to what the effect actually draws (over every frame, both layers, plus the character), so a
// bigger character or size option still fits and nothing is wasted; meta.pixelfx.pivot says where the origin is.
//
// Writes <out>/<name>_back.png/.json and <out>/<name>_front.png/.json (Aseprite-style JSON, meta.pixelfx as in
// render.mjs --sheet), plus <name>_preview.png: both layers with the character between them, to check by eye.
//
// Options: --actor PNG (the character actor effects wrap: cropped to its opaque pixels, feet at the bottom middle)
// --opts JSON --seed N --fps N --from S --to S (a stretch of time, e.g. to cut a loop out of a one-shot)
// --loop (mark that stretch as a loop) --margin N (room rendered round the effect's canvas, default 64 px)
// --name NAME --out DIR (default records/<id>/godot)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, resolveIds, loadEffect, canvas, contactSheet, save } from "./lib/fxlib.mjs";
import { decodePNG } from "./lib/png.mjs";
import { createFrame, clearFrame, createFx, composite, stockActor, actorAlphaOf, rgb, backdrop, effectDuration } from "../src/core/index.js";

const args = process.argv.slice(2), flags = {}, ids = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) ids.push(a);
  else if (a === "--loop") flags.loop = true;
  else flags[a.slice(2)] = args[++i];
}
if (ids.length !== 1) {
  console.error("usage: node tools/export-godot.mjs <category/name> [--actor PNG] [--opts JSON] [--seed N] [--fps N] [--from S --to S --loop] [--name NAME] [--out DIR]");
  process.exit(1);
}

/**
 * An actor (as stockActor returns) from a character sprite: cropped to its opaque pixels (alpha > 8), feet at
 * the bottom middle, with its own colors. Also returns the cropped RGBA, for the preview.
 */
function actorFromPNG(file) {
  const img = decodePNG(readFileSync(file));
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3] > 8) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  if (x1 < 0) throw new Error(`${file} has no opaque pixels`);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h), pixels = new Uint32Array(w * h), rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((y + y0) * img.w + x + x0) * 4, i = y * w + x, [r, g, b, a] = img.data.subarray(s, s + 4);
      if (a <= 8) continue;
      mask[i] = 1;
      pixels[i] = rgb(r, g, b) >>> 0;
      rgba.set([r, g, b, 255], i * 4);
    }
  const x = -Math.floor(w / 2), y = -h;
  return { actor: { mask: { w, h, data: mask }, pixels, x, y, w, h, k: 2, head: [0, y], chest: [0, y + Math.round(h * 0.4)] }, rgba };
}

const id = resolveIds(ids)[0];
if (!id) process.exit(1);
const fx = await loadEffect(id), { meta } = fx, [W, H] = meta.size, [OX, OY] = meta.origin;
const fps = flags.fps ? +flags.fps : meta.fps, name = flags.name ?? id.split("/")[1], out = flags.out ?? join(ROOT, "records", id, "godot");
const options = flags.opts ? JSON.parse(flags.opts) : {};
if (flags.seed !== undefined) options.seed = +flags.seed;
let stand = null;
if (flags.actor) {
  if (!meta.actor) console.warn(`${id} is not an actor effect: --actor only changes the preview`);
  stand = actorFromPNG(flags.actor);
  options.actor = stand.actor;
}
const actor = options.actor ?? (meta.actor ? stockActor(meta.actor === 2 ? 2 : 1) : null);

// render with room round the effect's canvas (a bigger character, a bigger size option), then trim to what is drawn
const M = flags.margin !== undefined ? +flags.margin : 64, BW = W + M * 2, BH = H + M * 2, BX = OX + M, BY = OY + M;

// the stretch of time: by default the whole effect (a one-shot's last, empty frame included); a stretch you
// give is from <= t < to, so an intro cut at 1.6 s and a loop from 1.6 s meet without a repeated frame
const whole = flags.from === undefined && flags.to === undefined;
const inst = createFx(fx.mod, { x: BX, y: BY, ...options }), frame = createFrame(BW, BH);
const fullDur = effectDuration(meta, fx.mod, options);
const from = flags.from !== undefined ? +flags.from : 0, to = flags.to !== undefined ? +flags.to : fullDur;
const loop = !!flags.loop || (whole && meta.loop);
const first = Math.round(from * fps), n = Math.max(1, Math.round((to - from) * fps) + (whole && !meta.loop ? 1 : 0));
if (!loop && to > fullDur + 1e-9) console.warn(`--to ${to} runs past the effect's ${fullDur} s`);

const raw = { back: [], front: [] }, alphas = [], ts = [];
for (let i = 0; i < first + n; i++) {
  if (i > 0) inst.update(1 / fps);
  if (i < first) continue;
  for (const layer of ["back", "front"]) {
    clearFrame(frame);
    inst.draw(frame, layer);
    raw[layer].push(composite(frame, new Uint8ClampedArray(BW * BH * 4), null));
  }
  const tt = meta.loop ? inst.t % fullDur : Math.min(inst.t, fullDur);
  alphas.push(+actorAlphaOf(fx.mod, tt, inst.options).toFixed(3));
  ts.push(inst.t);
}

// the box round everything any frame draws (faint glow under alpha 8 left out) and the character, a pixel spare
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
const grow = (x, y) => ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)));
for (const f of [...raw.back, ...raw.front])
  for (let j = 0; j < BW * BH; j++) if (f[j * 4 + 3] > 8) grow(j % BW, Math.floor(j / BW));
if (actor) (grow(BX + actor.x, BY + actor.y), grow(BX + actor.x + actor.w - 1, BY - 1));
if (x1 < 0) grow(BX, BY);
x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(BW - 1, x1 + 1); y1 = Math.min(BH - 1, y1 + 1);
if (x0 === 0 || y0 === 0 || x1 === BW - 1 || y1 === BH - 1) console.warn(`drawing reaches the ${M} px margin: try a bigger --margin`);
const w = x1 - x0 + 1, h = y1 - y0 + 1, ox = BX - x0, oy = BY - y0;
const crop = (f) => {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) o.set(f.subarray(((y + y0) * BW + x0) * 4, ((y + y0) * BW + x0 + w) * 4), y * w * 4);
  return o;
};
const layers = { back: raw.back.map(crop), front: raw.front.map(crop) };

// lay a layer's frames out in a grid with Aseprite-style JSON, as tools/lib/fxlib.mjs spriteSheet does
function sheet(frames, file) {
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w)))), rows = Math.ceil(n / cols);
  const img = canvas(cols * w, rows * h, [0, 0, 0, 0]), json = { frames: [], meta: {} };
  let empty = true;
  frames.forEach((f, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    img.paste(f, w, h, x, y);
    for (let j = 3; empty && j < f.length; j += 4) if (f[j]) empty = false;
    json.frames.push({
      filename: `${file} ${i}`, frame: { x, y, w, h }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h }, duration: Math.round(1000 / fps),
    });
  });
  json.meta = {
    app: "https://github.com/patch-gg/pixelfx", version: "1", image: `${file}.png`, format: "RGBA8888",
    size: { w: cols * w, h: rows * h }, scale: "1",
    frameTags: [{ name, from: 0, to: n - 1, direction: "forward" }],
    pixelfx: {
      id, name: meta.name, fps, loop, frames: n, frameSize: [w, h], pivot: [ox, oy], columns: cols,
      options: flags.opts ? JSON.parse(flags.opts) : {}, seed: inst.options.seed, time: [from, +(from + n / fps).toFixed(4)],
      // how visible the game's own character should be on each frame (0 when the effect draws the body itself)
      ...(typeof fx.mod.actorAlpha === "function" ? { actorAlpha: alphas } : {}),
    },
  };
  return { png: img.png(), json, empty };
}

const made = [];
for (const layer of ["back", "front"]) {
  const file = `${name}_${layer}`, s = sheet(layers[layer], file);
  made.push(save(join(out, `${file}.png`), s.png), save(join(out, `${file}.json`), JSON.stringify(s.json, null, 1)));
  if (s.empty) console.log(`  (${layer} layer is empty)`);
}

// the preview: back, the character, front, over the effect's backdrop
const bg = composite(createFrame(w, h), new Uint8ClampedArray(w * h * 4), backdrop(meta.bg, w, h, oy));
const shots = layers.back.map((back, i) => {
  const c = canvas(w, h);
  c.paste(bg, w, h, 0, 0);
  c.paste(back, w, h, 0, 0);
  if (stand && alphas[i] > 0) {
    const a = stand.actor, sprite = stand.rgba.slice();
    for (let j = 3; j < sprite.length; j += 4) sprite[j] *= alphas[i];
    c.paste(sprite, a.w, a.h, ox + a.x, oy + a.y);
  }
  c.paste(layers.front[i], w, h, 0, 0);
  return { t: ts[i], color: c.data };
});
made.push(save(join(out, `${name}_preview.png`), contactSheet(fx, { w, h, fps, frames: shots }, { title: `${id}  ${name}  ${w}x${h}  ${n}F @${fps}  ${loop ? "LOOP" : "ONE-SHOT"}  BACK + ACTOR + FRONT` })));
console.log(`${id}  ${n} frames  ->  ${made.join("  ")}`);
