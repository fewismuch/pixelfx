// Frames and live effect instances.

import { Painter } from "./painter.js";
import { clamp } from "./math.js";
import { stockActor, emptyActor } from "./actor.js";
import { fit, toHex } from "./color.js";
import { withParts, PART_GROUPS } from "./sim.js";

/**
 * A frame: w x h pixels whose top-left sits at (ox, oy) in world space. `color` holds opaque pixels,
 * `light` additive glow; composite() puts them together. Same shape as Sprite Fusion's VFX frames.
 */
export function createFrame(w, h, ox = 0, oy = 0) {
  return { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
}
export function clearFrame(f) {
  f.color.fill(0);
  f.light.fill(0);
  return f;
}

const painters = new WeakMap();
/** The painter for a frame (one per frame, reused). */
export function painterFor(frame) {
  let p = painters.get(frame);
  if (!p) painters.set(frame, (p = new Painter(frame)));
  return p.reset();
}

const FADE = 0.3;

const isRamp = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "number" || /^#[0-9a-f]{3,8}$/i.test(c));

/**
 * An effect's options: its defaults with the caller's on top. Any color ramp (palette, or another ramp option
 * like dust or smoke) of a different length than its default is resampled to the default's length, so effects
 * can index steps by number whatever a caller passes.
 */
export function resolveOptions(meta, o = {}) {
  const opts = { ...(meta.options ?? {}), ...o };
  for (const [k, def] of Object.entries(meta.options ?? {}))
    if (isRamp(def) && isRamp(o[k]) && o[k].length !== def.length) opts[k] = fit(o[k], def.length).map(toHex);
  if (meta.actor && !opts.actor) opts.actor = stockActor(meta.actor === 2 ? 2 : 1);
  if (opts.showBody === false) opts.actor = emptyActor();
  return opts;
}

/**
 * Seconds to record for sprite sheets / renders. A module can say (mod.recordDuration). Otherwise a one-shot
 * whose *_life options are moved off their defaults is played through to find when its last pixel goes, since
 * longer or shorter lives move the end; at the defaults it is meta.duration.
 */
export function effectDuration(meta, mod, o = {}) {
  // tempo plays the whole effect faster or slower: the same moments, in less or more time
  const S = tempoOf(o);
  if (S !== 1) return effectDuration(meta, mod, { ...o, tempo: 1 }) / S;
  const opts = resolveOptions(meta, o);
  // tuned particles can outlast (or end before) whatever the module reckons: play it through and see
  if (!meta.loop && mod && partsTuned(opts.parts)) return measuredDuration(meta, mod, o);
  if (typeof mod?.recordDuration === "function") return mod.recordDuration(opts);
  const lives = Object.keys(meta.options ?? {}).filter((k) => k.endsWith("_life") && typeof meta.options[k] === "number");
  if (meta.loop || !mod || !lives.some((k) => opts[k] !== meta.options[k])) return meta.duration;
  return measuredDuration(meta, mod, o);
}

/** True when a parts option changes anything (a group off, or an amount or life other than 1). */
export const partsTuned = (parts) =>
  !!parts && Object.keys(PART_GROUPS).some((g) => parts[g] && (parts[g].on === false || (parts[g].amount ?? 1) !== 1 || (parts[g].life ?? 1) !== 1));

const groupsSeen = new WeakMap();
/**
 * Which particle groups an effect uses (spark, mote, smoke, debris), in PART_GROUPS order: what its parts
 * option can tune. Found by playing it once at its defaults.
 */
export function partGroups(mod) {
  if (groupsSeen.has(mod)) return groupsSeen.get(mod);
  const meta = mod.meta, seen = new Set(), fps = meta.fps ?? 30, f = createFrame(...meta.size);
  withParts(null, seen, () => {
    const inst = createFx(mod, { x: meta.origin[0], y: meta.origin[1] });
    for (let i = 0; i <= Math.min(12, meta.duration) * fps; i++) {
      if (i) inst.update(1 / fps);
      if (i % 6 === 0) inst.draw(clearFrame(f));
    }
  });
  const out = Object.keys(PART_GROUPS).filter((g) => seen.has(g));
  groupsSeen.set(mod, out);
  return out;
}

/** The tempo option every effect takes: 1 as made, 1.5 plays it in two thirds of the time (0.25..4). */
export const tempoOf = (o) => clamp(+(o?.tempo ?? 1) || 1, 0.25, 4);

const measured = new WeakMap();
/** Play a one-shot until it has drawn nothing for a while; its length is the last drawn frame plus a beat. */
function measuredDuration(meta, mod, o) {
  let cache = measured.get(mod);
  if (!cache) measured.set(mod, (cache = new Map()));
  const key = JSON.stringify(o, (k, v) => (k === "actor" ? undefined : v));
  if (cache.has(key)) return cache.get(key);
  const fps = meta.fps ?? 30, [w, h] = meta.size, f = createFrame(w, h), cap = 12, gap = 1.5;
  const inst = createFx(mod, { ...o, x: meta.origin[0], y: meta.origin[1], actor: emptyActor() });
  let last = 0;
  for (let i = 0; i <= cap * fps; i++) {
    if (i) inst.update(1 / fps);
    clearFrame(f);
    inst.draw(f);
    if (f.color.some((c) => c)) last = i;
    else if (i - last > gap * fps) break;
  }
  // one empty frame to end on, a short beat after, in whole frames
  const d = Math.min(cap, (last + 1 + Math.round(0.1 * fps)) / fps);
  cache.set(key, d);
  return d;
}

/**
 * Which moments to show when playing or exporting at `fps` frames a second, which may be lower than the
 * effect's own meta.fps. Returns { n, at(i) }: n frames, frame i at effect time at(i). A one-shot steps by
 * 1/fps and ends on its very last moment; a loop spreads n whole frames evenly over its length so it still
 * closes without a seam.
 */
export function frameTimes(meta, dur, fps = meta.fps) {
  if (meta.loop) {
    const n = Math.max(1, Math.round(dur * fps));
    return { n, at: (i) => (i * dur) / n };
  }
  // whole steps of 1/fps, and a last frame on the very end even when the length isn't a whole number of them
  const n = Math.max(1, Math.ceil(dur * fps - 1e-6) + 1);
  return { n, at: (i) => Math.min(i / fps, dur) };
}

/**
 * Advance an effect instance by dt, in steps no longer than its own 1/meta.fps, so dropping frames for
 * output never changes how the effect moves (fast sparks, bounces) — it only shows fewer of its moments.
 */
export function stepFx(inst, dt, fps) {
  const base = 1 / fps, k = Math.round(dt * fps);
  // a whole number of the effect's own ticks: take exactly those, so 15 fps is precisely every other 30 fps frame
  if (k > 0 && Math.abs(dt * fps - k) < 1e-6) {
    for (let i = 0; i < k; i++) inst.update(base);
    return;
  }
  while (dt > 1e-9) {
    const d = Math.min(base, dt);
    inst.update(d);
    dt -= d;
  }
}

/**
 * A live instance of an effect module: { update(dt), draw(frame, layer), stop(), done() }.
 * o: { x, y, flip, angle, seed, palette, light (glow strength), actor, tempo (time scale, 1 as made),
 * ...the effect's own options }. t is the effect's own time, so with tempo 2 it runs twice as fast as the clock.
 * draw(frame, "back") draws what goes behind a character, "front" what goes in front, nothing both.
 */
export function createFx(mod, o = {}) {
  const meta = mod.meta ?? {};
  const opts = resolveOptions(meta, o);
  // parts: every particle the effect makes, now or later, goes through its group's on / amount / life
  const P = opts.parts ?? null;
  const impl = withParts(P, null, () => (mod.create ? mod.create(opts) : mod));
  const D = meta.duration ?? 1, S = tempoOf(opts);
  let t = 0, stopAt = Infinity;
  return {
    meta,
    options: opts,
    get t() {
      return t;
    },
    update(dt) {
      dt *= S;
      t += dt;
      if (!impl.update) return;
      // simulations step at 120 Hz or finer whatever the caller's frame rate, so they look the same everywhere
      const n = Math.max(1, Math.ceil(dt * 120 - 1e-9));
      withParts(P, null, () => {
        for (let i = 0; i < n; i++) impl.update(dt / n, opts);
      });
    },
    draw(frame, layer) {
      const p = painterFor(frame);
      p.place(opts.x ?? 0, opts.y ?? 0, !!opts.flip, opts.angle ?? 0);
      p.fade = stopAt === Infinity ? 1 : clamp(1 - (t - stopAt) / FADE);
      p.lightK = opts.light ?? 1;
      const tt = meta.loop ? t % D : Math.min(t, D);
      if (layer !== "front" && impl.drawBack) {
        p.layer = "back";
        withParts(P, null, () => impl.drawBack(p, tt, opts));
      }
      if (layer !== "back") {
        p.layer = "front";
        withParts(P, null, () => impl.draw(p, tt, opts));
      }
    },
    /** Let it end: loops fade out, one-shots cut short. */
    stop() {
      if (stopAt === Infinity) stopAt = t;
    },
    done() {
      return t - stopAt >= FADE || (!meta.loop && t >= D);
    },
  };
}

/**
 * Color over a background, plus light, into RGBA bytes (a Uint8ClampedArray or Buffer, w * h * 4).
 * bg: null for transparent, a color number, or a Uint32Array of the frame's size. Over transparency, light
 * becomes color with alpha (its brightest channel), which reads as additive over dark backgrounds.
 */
export function composite(f, out, bg = null, lightK = 1) {
  const n = f.w * f.h, C = f.color, L = f.light, flat = typeof bg === "number";
  for (let i = 0; i < n; i++) {
    const c = C[i], l = L[i] & 0xffffff;
    let r, g, b, a;
    const ca = c >>> 24;
    if (ca === 255) {
      r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; a = 255;
    } else if (bg === null) {
      // translucent color over nothing keeps its alpha
      r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; a = ca;
    } else {
      const k = flat ? bg : bg[i], f = ca / 255;
      r = (c & 255) * f + (k & 255) * (1 - f); g = ((c >>> 8) & 255) * f + ((k >>> 8) & 255) * (1 - f);
      b = ((c >>> 16) & 255) * f + ((k >>> 16) & 255) * (1 - f); a = 255;
    }
    if (l) {
      const lr = (l & 255) * lightK, lg = ((l >>> 8) & 255) * lightK, lb = ((l >>> 16) & 255) * lightK;
      if (a < 255) {
        // over transparency: premultiply what's there, add the light, divide by the new alpha
        const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
        const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
        if (na > 0) { r = Math.min(255, pr / na); g = Math.min(255, pg / na); b = Math.min(255, pb / na); a = na * 255; }
      } else {
        r = Math.min(255, r + lr); g = Math.min(255, g + lg); b = Math.min(255, b + lb);
      }
    }
    const j = i * 4;
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = a;
  }
  return out;
}
