// The gallery: every effect playing live from its own code. Tiles start when they scroll into view; a click
// opens one effect with its options, a sprite sheet and the code to use it.

import { effects, categories } from "../src/fx/index.js";
import { createFrame, clearFrame, createFx, frameTimes, stepFx, partGroups, PART_GROUPS, createAct, actBounds, composite, backdrop, drawActor, painterFor, stockActor, actorAlphaOf, effectDuration, PAL, BACKDROPS } from "../src/core/index.js";
import { capturePreviewConfig, applyPreviewConfig } from "./preview-config.js";
import { SfxPanel } from "./sfx.js";
import { loadPlayerActor } from "./player-actor.js";

const REPO = "https://github.com/fewismuch/pixelfx";
/** Custom character for gallery previews (loaded from gallery/player.png). */
let playerActor = null;
loadPlayerActor(new URL("./player.png", import.meta.url).href).then((a) => {
  playerActor = a;
  $("#d-player").disabled = !a;
  if (detail?.usePlayer) detail.restart();
});
/** Frames a second to show and export at; effects still simulate at their own meta.fps (30). */
const FPS_CHOICES = [30, 15, 12, 10];
let outFps = FPS_CHOICES.includes(+localStorage.getItem("pixelfx.fps")) ? +localStorage.getItem("pixelfx.fps") : 15;
// sprite sheet: crop every frame to the box all frames draw in (on unless turned off)
let trimSheet = localStorage.getItem("pixelfx.trim") !== "0";
const FX = Object.entries(effects).map(([id, mod]) => {
  const meta = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
  return { id, cat: id.split("/")[0], name: meta.name, mod: { ...mod, meta }, meta };
});
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
// full-screen effects (transitions, weather, impact frames) fill a 16:9 stage edge to edge instead of floating in it
const isScreen = (fx) => fx.meta.size[0] >= 320 && Math.abs(fx.meta.size[0] / fx.meta.size[1] - 16 / 9) < 0.05;
const $ = (s) => document.querySelector(s);
function el(tag, props = {}, kids = []) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) e.append(k);
  return e;
}

// ---- a live effect on a canvas, at an integer scale that fits the stage
class Player {
  constructor(canvas, fx, aspect, pad) {
    Object.assign(this, { canvas, fx, ctx: canvas.getContext("2d"), opts: {}, flip: false, actor: true, usePlayer: false, speed: 1, playing: true });
    this.bg = fx.meta.bg;
    this.layout(aspect, pad);
  }
  // the art-pixel stage: the effect's canvas plus some room, stretched to the tile's aspect; CSS scales it up
  layout(aspect, pad) {
    Object.assign(this, { aspect, pad });
    // an act needs room for the whole performance, not just the effect's canvas
    const acted = this.hasAct, b = acted ? { ...actBounds(this.fx.mod) } : null;
    // an act happens above the floor: don't spend the tile on bricks
    if (b) b.y1 = Math.min(b.y1, 22);
    const [w, h] = acted ? [b.x1 - b.x0, b.y1 - b.y0] : this.fx.meta.size, [ox, oy] = acted ? [-b.x0, -b.y0] : this.fx.meta.origin;
    this.W = Math.ceil(Math.max(w * (acted ? Math.min(pad, 1.1) : pad), h * (acted ? Math.min(pad, 1.1) : pad) * aspect));
    this.H = Math.ceil(this.W / aspect);
    this.x = Math.floor((this.W - w) / 2) + ox;
    // an act stands near the bottom of its tile, with the room above it
    this.y = acted ? Math.max(oy + 2, this.H - b.y1 - 2) : Math.floor((this.H - h) / 2) + oy;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    // shrinking pixel art nearest-neighbour drops whole 1 px lines; smooth it only when it has to shrink
    const shown = this.canvas.getBoundingClientRect().width * devicePixelRatio;
    this.canvas.style.imageRendering = shown && shown < this.W ? "auto" : "";
    this.frame = createFrame(this.W, this.H);
    this.img = this.ctx.createImageData(this.W, this.H);
    this.setBg(this.bg);
    this.restart();
  }
  setBg(kind) {
    this.bg = kind;
    this.bgBuf = kind === "none" ? null : backdrop(kind, this.W, this.H, this.y);
    this.dirty = true;
  }
  // an effect with an act always runs createAct; actor toggles the posed body (and meta.actor toggles the stand-in)
  get hasAct() {
    return !!this.fx.mod.act;
  }
  /** Act performance, unless previewing your own standing sprite instead of the rig. */
  get useAct() {
    return this.hasAct && !this.usePlayer;
  }
  instOpts() {
    const o = { x: this.x, y: this.y, flip: this.flip, showBody: this.actor, ...this.opts };
    // Player is drawn in drawStandIn at the same feet as the dummy; effect does not paint the stand-in.
    if (this.usePlayer) o.showBody = false;
    return o;
  }
  /** Your player PNG or the stock dummy, feet at (this.x, this.y). */
  drawStandIn(f, tt) {
    const m = this.fx.meta, p = painterFor(f).place(this.x, this.y, this.flip);
    if (this.usePlayer && playerActor) {
      drawActor(p, playerActor, 1);
      return;
    }
    if (m.actor && this.actor) drawActor(p, this.inst.options.actor ?? stockActor(m.actor === 2 ? 2 : 1), actorAlphaOf(this.fx.mod, tt, this.inst.options));
  }
  restart() {
    this.inst = (this.useAct ? createAct : createFx)(this.fx.mod, this.instOpts());
    // show every frame of the output rate, simulating in between at the effect's own rate
    const m = this.fx.meta, dur = effectDuration(m, this.fx.mod, this.opts), ft = frameTimes(m, dur, outFps);
    Object.assign(this, { fps: outFps, n: ft.n, step: m.loop && !this.useAct ? dur / ft.n : 1 / outFps, fi: 0 });
    this.acc = 0;
    this.wait = 0;
    this.dirty = true;
    this.onRestart?.();
  }
  tick(dt) {
    if (this.fps !== outFps) this.restart();
    const m = this.fx.meta, step = this.step;
    if (this.playing) this.acc = Math.min(this.acc + dt * this.speed, 0.25);
    let moved = false;
    while (this.acc >= step) {
      this.acc -= step;
      if (!m.loop && (this.useAct ? this.inst.done() : this.fi >= this.n - 1)) {
        this.wait += step;
        if (this.wait > 0.45) this.restart();
      } else {
        stepFx(this.inst, step, m.fps);
        this.fi++;
        if (m.loop && this.fi % this.n === 0) this.onRestart?.();
      }
      moved = true;
    }
    if (moved || this.dirty) this.render();
  }
  seek(t) {
    this.restart();
    this.inst.update(t);
    this.render();
  }
  render() {
    const f = clearFrame(this.frame);
    if (this.useAct) {
      this.inst.draw(f, { body: this.actor, target: true });
      composite(f, this.img.data, this.bgBuf);
      const [sx, sy] = this.inst.shake;
      if (sx || sy) this.ctx.clearRect(0, 0, this.W, this.H);
      this.ctx.putImageData(this.img, sx, sy);
      this.dirty = false;
      return;
    }
    this.inst.draw(f, "back");
    const m = this.fx.meta, tt = m.loop ? this.inst.t % m.duration : Math.min(this.inst.t, m.duration);
    if (!this.usePlayer) this.drawStandIn(f, tt);
    this.inst.draw(f, "front");
    if (this.usePlayer && playerActor) this.drawStandIn(f, tt);
    composite(f, this.img.data, this.bgBuf);
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }
}

// ---- tiles
const tiles = [];
const sections = [];
function build() {
  $("#count").textContent = FX.length;
  const main = $("#grid");
  for (const c of categories) {
    const list = FX.filter((f) => f.cat === c.id);
    if (!list.length) continue;
    const grid = el("div", { className: "grid" });
    const sec = el("section", { id: c.id }, [el("div", { className: "section-head" }, [el("h2", { textContent: c.name + "." }), el("p", { textContent: c.blurb })]), grid]);
    sections.push({ c, sec, list });
    for (const fx of list) {
      const cv = el("canvas", { ariaLabel: fx.name });
      const b = fx.mod.act ? actBounds(fx.mod) : null, [fw, fh] = b ? [b.x1 - b.x0, b.y1 - b.y0] : fx.meta.size;
      const fig = el("figure", { className: isScreen(fx) ? "tile big screen" : fw > 200 || fh > 170 || (b && (fw > 130 || fx.mod.act.target || fx.mod.act.targets)) ? "tile big" : "tile", tabIndex: 0 }, [
        el("div", { className: "stage" }, cv),
        el("figcaption", {}, [el("b", { textContent: fx.name }), el("small", { textContent: fx.meta.loop ? "loop" : `${+fx.meta.duration.toFixed(2)}s` })]),
      ]);
      const t = { fx, fig, cv, player: null, visible: false, hover: false };
      fig.addEventListener("click", () => openDetail(fx));
      fig.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDetail(fx)));
      fig.addEventListener("pointerenter", () => (t.hover = true));
      fig.addEventListener("pointerleave", () => (t.hover = false));
      grid.append(fig);
      tiles.push(t);
    }
    main.append(sec);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tiles.find((x) => x.fig === e.target);
      t.visible = e.isIntersecting;
      if (t.visible && !t.player) {
        t.player = isScreen(t.fx) ? new Player(t.cv, t.fx, 16 / 9, 1) : new Player(t.cv, t.fx, 6 / 5, 1.25);
        if (reduced) t.player.seek(t.fx.meta.duration * 0.4);
      }
    }
  }, { rootMargin: "200px" });
  tiles.forEach((t) => io.observe(t.fig));
}

// ---- filters
const state = { cat: "all", q: "" };
function chips() {
  const box = $("#chips");
  const mk = (id, label, n) => {
    const b = el("button", { className: "chip", type: "button" }, [label, el("span", { textContent: n })]);
    b.dataset.cat = id;
    b.addEventListener("click", () => setCat(id));
    box.append(b);
  };
  mk("all", "all", FX.length);
  for (const s of sections) mk(s.c.id, s.c.name, s.list.length);
}
function setCat(id, fromHash = false) {
  state.cat = sections.some((s) => s.c.id === id) ? id : "all";
  document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat)));
  if (!fromHash) history.replaceState(null, "", state.cat === "all" ? location.pathname : "#" + state.cat);
  filter();
  if (!fromHash) window.scrollTo({ top: 0 });
}
function filter() {
  const q = state.q.trim().toLowerCase();
  let shown = 0;
  for (const s of sections) {
    let any = false;
    for (const fx of s.list) {
      const t = tiles.find((x) => x.fx === fx);
      const hit = (state.cat === "all" || state.cat === s.c.id) && (!q || [fx.id, fx.name, fx.meta.desc, ...fx.meta.tags].join(" ").toLowerCase().includes(q));
      t.fig.hidden = !hit;
      any ||= hit;
      shown += hit;
    }
    s.sec.hidden = !any;
  }
  $("#none").hidden = shown > 0;
}

// ---- detail
let detail = null;
const sfx = new SfxPanel(() => detail);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) sfx.stop();
  else if (detail) detail.restart();
});
// Settings per effect: project file first, browser cache as fallback; includes backdrop and show toggles.
const cfgKey = (id) => `pixelfx.cfg.${id}`;
function loadCfg(id) {
  try {
    return JSON.parse(localStorage.getItem(cfgKey(id)) ?? "null");
  } catch {
    return null;
  }
}
async function configRequest(id, body) {
  const response = await fetch(`/api/fx-config?id=${encodeURIComponent(id)}`, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "项目配置请求失败");
  return data.config;
}
const configSnapshot = player => JSON.stringify(capturePreviewConfig(player, trimSheet));
async function loadProjectCfg(fx, player) {
  const before = configSnapshot(player);
  try {
    const saved = await configRequest(fx.id);
    // Do not overwrite changes or a save made while the request was in flight.
    if (detail !== player || player.cfgVersion || before !== configSnapshot(player)) return;
    if (!saved) return;
    trimSheet = applyPreviewConfig(player, saved, trimSheet);
    syncControls(fx);
    try { localStorage.setItem(cfgKey(fx.id), JSON.stringify(saved)); } catch {}
    $("#d-cfg").textContent = "已读取项目配置";
  } catch {
    if (detail === player && !player.cfgVersion) $("#d-cfg").textContent = "项目配置未读取，仅使用浏览器配置";
  }
}
const palName = (p) => (p ? Object.keys(PAL).find((k) => JSON.stringify(PAL[k]) === JSON.stringify(p)) ?? "" : "");
/** Put the detail controls back in step with detail.opts and detail.flip. */
function syncControls(fx) {
  $("#d-pal").value = palName(detail.opts.palette);
  $("#d-flip").setAttribute("aria-pressed", String(detail.flip));
  $("#d-actor").setAttribute("aria-pressed", String(detail.actor));
  $("#d-player").setAttribute("aria-pressed", String(detail.usePlayer));
  $("#d-trim").setAttribute("aria-pressed", String(trimSheet));
  $("#d-bg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.textContent === detail.bg)));
  options(fx);
  code(fx);
  updateFacts(fx);
  $("#d-sheet").replaceChildren();
}
function openDetail(fx) {
  const d = $("#detail");
  const big = $("#big"), screen = isScreen(fx);
  big.parentElement.classList.toggle("screen", screen);
  detail = screen ? new Player(big, fx, 16 / 9, 1) : new Player(big, fx, 16 / 10, 1.6);
  const m = fx.meta;
  $("#d-name").textContent = m.name;
  $("#d-id").textContent = fx.id;
  $("#d-desc").textContent = m.desc;
  updateFacts(fx);
  // controls
  $("#d-bg").replaceChildren(...BACKDROPS.concat("none").map((b) => btn(b, () => detail.setBg(b), b === m.bg, "bg")));
  $("#d-fps").replaceChildren(
    ...FPS_CHOICES.map((f) =>
      btn(`${f}`, () => {
        outFps = f;
        localStorage.setItem("pixelfx.fps", String(f));
        detail.restart();
        updateFacts(detail.fx);
        $("#d-sheet").replaceChildren();
      }, f === outFps, "fps"),
    ),
  );
  $("#d-speed").replaceChildren(...[0.25, 0.5, 1].map((s) => btn(`${s}×`, () => { detail.speed = s; detail.restart(); }, s === 1, "speed")));
  const pal = $("#d-pal");
  pal.replaceChildren(el("option", { value: "", textContent: "its own" }), ...Object.keys(PAL).map((k) => el("option", { value: k, textContent: k })));
  // your saved settings for this effect, if any
  const saved = loadCfg(fx.id);
  if (saved) {
    trimSheet = applyPreviewConfig(detail, saved, trimSheet);
  }
  $("#d-cfg").textContent = saved ? "your saved settings" : "";
  $("#d-actor").hidden = !m.actor && !fx.mod.act;
  $("#d-actor").setAttribute("aria-pressed", "true");
  $("#d-actor").textContent = fx.mod.act ? "body" : "character";
  $("#d-player").setAttribute("aria-pressed", "false");
  $("#d-player").disabled = !playerActor;
  $("#d-play").setAttribute("aria-pressed", "true");
  $("#d-play").textContent = "pause";
  syncControls(fx);
  detail.onRestart = () => sfx.restart();
  sfx.open(fx.id);
  d.showModal();
  d.scrollTop = 0;
  detail.cfgVersion = 0;
  loadProjectCfg(fx, detail);
}
function actFacts(mod) {
  const k = mod.act.poses, lead = Math.max(0, -k[0][0]), end = k[k.length - 1][0] - mod.meta.duration, hits = (mod.act.hits ?? []).filter((h) => h.stop);
  const parts = [];
  if (lead > 0) parts.push(`${lead.toFixed(2)} s wind-up`);
  if (hits.length) parts.push(`${hits.length === 1 ? `${Math.round(hits[0].stop * 1000)} ms freeze` : `${hits.length} freezes`} at ${hits[0].t.toFixed(2)} s`);
  if (!mod.meta.loop && end > 0.02) parts.push(`${end.toFixed(2)} s recovery`);
  return parts.join(", ") || "the body moves with it";
}
function updateFacts(fx) {
  const m = fx.meta, dur = effectDuration(m, fx.mod, detail?.opts ?? {}), frames = frameTimes(m, dur, outFps).n;
  $("#d-facts").replaceChildren(
    ...[["kind", m.loop ? "loop" : "one-shot"], ["length", `${dur.toFixed(2).replace(/\.?0+$/, "")} s, ${frames} frames at ${outFps} fps${outFps !== m.fps ? ` (simulated at ${m.fps})` : ""}`], ...(fx.mod.act ? [["acted", actFacts(fx.mod)]] : []), ["canvas", `${m.size[0]} × ${m.size[1]} px`], ["tags", m.tags.join(", ")]].flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]),
  );
}
const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
// the effect's own switches, numbers and #rrggbb colors from meta.options (palette and seed have their own controls)
function options(fx) {
  const set = (k, v, def) => {
    if (v === def) delete detail.opts[k];
    else detail.opts[k] = v;
    detail.restart();
    code(fx);
    updateFacts(fx);
  };
  // tempo: every effect can play faster or slower (not acts: their poses are timed to the effect as made)
  const entries = Object.entries(fx.meta.options).concat(fx.mod.act ? [] : [["tempo", 1]]);
  const kids = entries.flatMap(([k, def]) => {
    if (k === "seed") return [];
    if (typeof def === "boolean") {
      const cur = detail.opts[k] ?? def;
      const b = btn(k, () => {
        const next = !(detail.opts[k] ?? def);
        b.setAttribute("aria-pressed", String(next));
        set(k, next, def);
      }, cur);
      return [b];
    }
    if (typeof def === "number" && (k === "size" || k === "tempo")) {
      const cur = detail.opts[k] ?? def;
      const [min, max, step] = k === "tempo" ? [0.5, 2.5, 0.05] : [0.4, 1.6, 0.05];
      const r = el("input", { className: "btn range", type: "range", min, max, step, value: cur, ariaLabel: k });
      const v = el("span", { className: "val", textContent: (+cur).toFixed(2) });
      r.addEventListener("input", () => {
        v.textContent = (+r.value).toFixed(2);
        set(k, +r.value, def);
      });
      return [el("span", { className: "opt size", textContent: k }, [r, v])];
    }
    if (typeof def === "number") {
      const cur = detail.opts[k] ?? def;
      const i = el("input", { className: "btn", type: "number", value: cur, step: Number.isInteger(def) && Math.abs(def) >= 5 ? 1 : 0.1, ariaLabel: k });
      i.addEventListener("change", () => i.value !== "" && Number.isFinite(+i.value) && set(k, +i.value, def));
      return [el("span", { className: "opt", textContent: k }, i)];
    }
    if (isHex(def)) {
      const cur = detail.opts[k] ?? def;
      const i = el("input", { className: "btn color", type: "color", value: cur, ariaLabel: k });
      i.addEventListener("input", () => set(k, i.value, def));
      return [el("span", { className: "opt", textContent: k }, i)];
    }
    return [];
  });
  $("#d-opts").replaceChildren(...kids);
  $("#d-opts-row").hidden = !kids.length;
  particles(fx);
}
// the particle groups this effect uses: each can be switched off, thinned or doubled, and made shorter-lived
function particles(fx) {
  const groups = partGroups(fx.mod);
  const tune = (g, k, v, def) => {
    const parts = { ...(detail.opts.parts ?? {}) }, c = { ...(parts[g] ?? {}) };
    if (v === def) delete c[k];
    else c[k] = v;
    if (Object.keys(c).length) parts[g] = c;
    else delete parts[g];
    if (Object.keys(parts).length) detail.opts.parts = parts;
    else delete detail.opts.parts;
    detail.restart();
    code(fx);
    updateFacts(fx);
  };
  const slider = (g, k, min, max, def) => {
    const cur = detail.opts.parts?.[g]?.[k] ?? def;
    const r = el("input", { className: "btn range", type: "range", min, max, step: 0.05, value: cur, ariaLabel: `${g} ${k}` });
    const v = el("span", { className: "val", textContent: (+cur).toFixed(2) });
    r.addEventListener("input", () => {
      v.textContent = (+r.value).toFixed(2);
      tune(g, k, +r.value, def);
    });
    return el("span", { className: "opt size", textContent: k }, [r, v]);
  };
  const rows = groups.map((g) => {
    const on = btn(g, () => {
      const next = detail.opts.parts?.[g]?.on === false;
      on.setAttribute("aria-pressed", String(next));
      tune(g, "on", next, true);
    }, detail.opts.parts?.[g]?.on !== false);
    on.title = PART_GROUPS[g];
    return el("span", { className: "row part" }, [on, slider(g, "amount", 0, 2, 1), slider(g, "life", 0.25, 2.5, 1)]);
  });
  $("#d-parts").replaceChildren(...rows);
  $("#d-parts-row").hidden = !rows.length;
}
function btn(label, fn, on, group) {
  const b = el("button", { className: "btn", type: "button", textContent: label });
  b.setAttribute("aria-pressed", String(!!on));
  b.addEventListener("click", () => {
    if (group) b.parentElement.querySelectorAll(".btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    fn();
  });
  return b;
}
function code(fx) {
  const v = fx.id.split("/")[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const own = Object.fromEntries(Object.entries(detail.opts).filter(([k]) => k !== "palette" && k !== "seed"));
  const opts = { x: 160, y: 120, ...(detail.opts.palette ? { palette: "[…]" } : {}), ...own, ...(detail.flip ? { flip: true } : {}) };
  const acted = !!fx.mod.act, make = acted ? "createAct" : "createFx";
  $("#d-code").textContent = [
    `import { createFrame, ${make}, composite } from "pixelfx";`,
    `import * as ${v} from "pixelfx/fx/${fx.id}";`,
    ``,
    `const frame = createFrame(320, 180);`,
    `const fx = ${make}(${v}, ${JSON.stringify(opts).replace(/"\[…\]"/, "[…]").replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ")});`,
    ``,
    `// every tick`,
    `fx.update(dt);`,
    `fx.draw(frame);          // color + light buffers`,
    `composite(frame, imageData.data, null);`,
    ...(acted ? [``, `// your own character? read the timing: ${v}.act (poses, hits, freezes)`] : []),
  ].join("\n");
  $("#d-src").href = `${REPO}/blob/main/src/fx/${fx.id}.js`;
}
function sheet() {
  const fx = detail.fx, m = fx.meta;
  const showBody = detail.actor && !detail.usePlayer;
  const fxOpts = { ...detail.opts, ...(detail.flip ? { flip: true } : {}), showBody };
  const dur = effectDuration(m, fx.mod, fxOpts);
  const { n, at } = frameTimes(m, dur, outFps);
  const useAct = !!fx.mod.act && !detail.usePlayer;
  const [w, h] = useAct ? [detail.W, detail.H] : m.size;
  const frame = createFrame(w, h), shots = [];
  const inst = useAct
    ? createAct(fx.mod, { x: detail.x, y: detail.y, flip: detail.flip, ...fxOpts })
    : createFx(fx.mod, { x: m.origin[0], y: m.origin[1], ...fxOpts });
  for (let i = 0; i < n; i++) {
    if (i) stepFx(inst, at(i) - at(i - 1), m.fps);
    clearFrame(frame);
    if (useAct) inst.draw(frame, { body: showBody, target: true });
    else {
      inst.draw(frame, "back");
      const tt = m.loop ? inst.t % dur : Math.min(inst.t, dur);
      if (showBody && m.actor) drawActor(painterFor(frame).place(m.origin[0], m.origin[1], detail.flip), inst.options.actor ?? stockActor(m.actor === 2 ? 2 : 1), actorAlphaOf(fx.mod, tt, inst.options));
      inst.draw(frame, "front");
    }
    const img = new ImageData(w, h);
    composite(frame, img.data, null);
    shots.push(img);
  }
  const box = trimSheet ? drawnBox(shots, w, h) : null;
  const [x0, y0, fw, fh] = box ?? [0, 0, w, h];
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * fh) / fw)))), rows = Math.ceil(n / cols);
  const cv = el("canvas", { width: cols * fw, height: rows * fh }), ctx = cv.getContext("2d");
  shots.forEach((img, i) => ctx.putImageData(img, (i % cols) * fw - x0, Math.floor(i / cols) * fh - y0, x0, y0, fw, fh));
  const k = Math.max(1, Math.min(4, Math.floor(1100 / (cols * w))));
  const pic = el("img", { src: cv.toDataURL("image/png"), alt: `${m.name} sprite sheet`, width: cols * fw * k, height: rows * fh * k });
  const optsHint = (outFps !== m.fps ? ` --fps ${outFps}` : "") + (Object.keys(detail.opts).length || detail.flip ? ` --opts '${JSON.stringify(fxOpts)}'` : "");
  // the effect's origin inside each (trimmed) frame, and the offset a centered Godot sprite needs to put it on the node
  const [px, py] = [m.origin[0] - x0, m.origin[1] - y0];
  const trimNote = box ? ` Trimmed from ${w} × ${h}.` : "";
  const pivotNote = ` Origin at (${px}, ${py}) in each frame; Godot centered sprite offset (${fw / 2 - px}, ${fh / 2 - py}).`;
  $("#d-sheet").replaceChildren(pic, el("p", { textContent: `${n} frames of ${fw} × ${fh} px, ${cols} across, ${outFps} fps, ${m.loop ? "loops" : "plays once"}.${trimNote}${pivotNote} Save the image, or run: node tools/render.mjs ${fx.id} --sheet${optsHint}` }));
}
/** The box every frame draws inside, [x, y, w, h] with even sides (a centered sprite then sits on whole pixels); null if nothing is drawn. */
function drawnBox(shots, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const { data } of shots)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (data[(y * w + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
  if (x1 < 0) return null;
  // grow an odd side by one pixel, into whichever side the canvas still has room
  const even = (a, b, max) => ((b - a + 1) % 2 === 0 ? [a, b] : b + 1 < max ? [a, b + 1] : a > 0 ? [a - 1, b] : [a, b]);
  [x0, x1] = even(x0, x1, w);
  [y0, y1] = even(y0, y1, h);
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
function wireDetail() {
  const d = $("#detail");
  $("#d-close").addEventListener("click", () => d.close());
  d.addEventListener("close", () => { sfx.close(); detail = null; });
  d.addEventListener("click", (e) => e.target === d && d.close());
  $("#d-play").addEventListener("click", (e) => {
    detail.playing = !detail.playing;
    if (detail.playing) detail.restart();
    else sfx.stop();
    e.target.setAttribute("aria-pressed", String(detail.playing));
    e.target.textContent = detail.playing ? "pause" : "play";
  });
  $("#d-again").addEventListener("click", () => detail.restart());
  $("#d-flip").addEventListener("click", (e) => {
    detail.flip = !detail.flip;
    e.target.setAttribute("aria-pressed", String(detail.flip));
    detail.restart();
    code(detail.fx);
  });
  $("#d-actor").addEventListener("click", (e) => {
    detail.actor = !detail.actor;
    e.target.setAttribute("aria-pressed", String(detail.actor));
    detail.restart();
  });
  $("#d-player").addEventListener("click", (e) => {
    if (!playerActor) return;
    detail.usePlayer = !detail.usePlayer;
    e.target.setAttribute("aria-pressed", String(detail.usePlayer));
    detail.restart();
    detail.render();
  });
  $("#d-seed").addEventListener("click", () => {
    detail.opts.seed = 1 + Math.floor(Math.random() * 9999);
    detail.restart();
  });
  $("#d-pal").addEventListener("change", (e) => {
    if (e.target.value) detail.opts.palette = PAL[e.target.value];
    else delete detail.opts.palette;
    detail.restart();
    code(detail.fx);
  });
  $("#d-make").addEventListener("click", sheet);
  $("#d-trim").setAttribute("aria-pressed", String(trimSheet));
  $("#d-trim").addEventListener("click", (e) => {
    trimSheet = !trimSheet;
    localStorage.setItem("pixelfx.trim", trimSheet ? "1" : "0");
    e.target.setAttribute("aria-pressed", String(trimSheet));
    $("#d-sheet").replaceChildren();
  });
  const setConfigBusy = busy => {
    $("#d-save").disabled = busy;
    $("#d-reset").disabled = busy;
  };
  $("#d-save").addEventListener("click", async () => {
    const player = detail, id = player.fx.id;
    const config = JSON.parse(configSnapshot(player));
    player.cfgVersion++;
    setConfigBusy(true);
    $("#d-cfg").textContent = "正在保存…";
    try {
      const saved = await configRequest(id, { action: "save", config });
      let cached = true;
      try { localStorage.setItem(cfgKey(id), JSON.stringify(saved)); } catch { cached = false; }
      if (detail === player) $("#d-cfg").textContent = cached ? `已保存到项目和浏览器 · ${saved.duration.toFixed(2)} 秒` : "项目已保存，浏览器缓存写入失败";
    } catch {
      let cached = true;
      try { localStorage.setItem(cfgKey(id), JSON.stringify(config)); } catch { cached = false; }
      if (detail === player) $("#d-cfg").textContent = cached ? "仅浏览器已保存；项目保存失败，请确认服务已更新" : "保存失败，请确认服务已更新";
    } finally { setConfigBusy(false); }
  });
  $("#d-reset").addEventListener("click", async () => {
    const player = detail, id = player.fx.id;
    player.cfgVersion++;
    const before = configSnapshot(player);
    setConfigBusy(true);
    try {
      await configRequest(id, { action: "reset" });
      try { localStorage.removeItem(cfgKey(id)); } catch {}
      if (detail !== player) return;
      if (before === configSnapshot(player)) {
        trimSheet = applyPreviewConfig(player, { opts: {}, flip: false, trim: true });
        try { localStorage.setItem("pixelfx.trim", "1"); } catch {}
        syncControls(player.fx);
        $("#d-cfg").textContent = "项目与浏览器已恢复默认";
      } else $("#d-cfg").textContent = "已保存默认配置，当前还有未保存的调整";
    } catch {
      if (detail === player) $("#d-cfg").textContent = "恢复默认失败，当前配置已保留，请确认服务已更新";
    } finally { setConfigBusy(false); }
  });
  $("#d-copy").addEventListener("click", async (e) => {
    const text = $("#d-code").textContent;
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = "copied";
    } catch {
      getSelection().selectAllChildren($("#d-code"));
      e.target.textContent = "selected";
    }
    setTimeout(() => (e.target.textContent = "copy"), 1400);
  });
}

// ---- the clock
let last = performance.now();
function frameLoop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (detail) detail.tick(dt);
  else for (const t of tiles) if (t.visible && t.player && !t.fig.hidden && (!reduced || t.hover)) t.player.tick(dt);
  requestAnimationFrame(frameLoop);
}

build();
chips();
wireDetail();
$("#q").addEventListener("input", (e) => {
  state.q = e.target.value;
  filter();
});
setCat(location.hash.slice(1) || "all", true);
addEventListener("hashchange", () => setCat(location.hash.slice(1) || "all", true));
requestAnimationFrame(frameLoop);
