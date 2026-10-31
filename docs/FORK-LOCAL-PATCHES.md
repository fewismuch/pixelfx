# 本地 fork 补丁说明（相对 patch-gg/pixelfx upstream）

本文档记录**本仓库相对上游**为 Gallery、body 开关、循环/导出、部分特效行为等做的改动。  
从 upstream 合并后若冲突被误删，可按本文 **逐节恢复**。

**验证命令（恢复后应通过）：**

```bash
node tools/check.mjs
node -e "
import { allIds, loadEffect } from './tools/lib/fxlib.mjs';
import { createFrame, clearFrame, createFx, createAct } from './src/core/index.js';
for (const id of allIds()) {
  const fx = await loadEffect(id);
  const { mod, meta } = fx;
  if (!meta.actor && !mod.act) continue;
  const inst = mod.act
    ? createAct(mod, { x: meta.origin[0], y: meta.origin[1], showBody: false, seed: 1 })
    : createFx(mod, { x: meta.origin[0], y: meta.origin[1], showBody: false, seed: 1 });
  const f = createFrame(meta.size[0] + 80, meta.size[1] + 80, -40, -40);
  for (let i = 0; i <= Math.min(90, Math.ceil(meta.duration * 30)); i++) {
    if (i) inst.update(1 / 30);
    clearFrame(f);
    if (mod.act) inst.draw(f, { body: false, target: false });
    else { inst.draw(f, 'back'); inst.draw(f, 'front'); }
  }
}
console.log('body-off smoke ok');
"
```

---

## 1. Gallery：body / character 开关（`act` 与 `meta.actor`）

**目的：** 带 `act` 的特效始终用 `createAct` 播放；按钮关 body 时只留 VFX（及可选靶子），不再留 rig 小人或 `create()` 里烤进的身体像素。

**文件：`gallery/app.js`**

| 改动 | 说明 |
|------|------|
| `acted` → `hasAct` | `hasAct = !!fx.mod.act`，不再要求 `this.actor === true` 才走 createAct |
| `restart()` | 传入 `showBody: this.actor` |
| `render()` | `createAct` 时 `inst.draw(f, { body: this.actor, target: true })` |
| `#d-actor` | 有 `mod.act` 时也显示按钮；文案 `body` / `character` |
| 点击 body 按钮 | **`detail.restart()`**（不要只 `dirty = true`，否则 `create()` 实例仍带旧 actor） |

---

## 2. 核心：`showBody: false` 时不再画/烤身体

### 2.1 `src/core/actor.js`

- 新增 **`emptyActor()`**：0×0 mask，脚在原点，供「仅 VFX」预览。
- **`bodyVisible(o)`**：`showBody !== false` 且 `o.actor.mask.data.length > 0`。
- **`bodyActor(o)`**：可见时返回 `o.actor`，否则 `null`（给 `draw(p,t,o)` 里显式判断用）。
- 导出：`emptyActor`, `bodyActor`（经 `index.js`）。

### 2.2 `src/core/fx.js` — `resolveOptions`

在注入 `stockActor` 之后增加：

```js
if (opts.showBody === false) opts.actor = emptyActor();
```

这样所有 `mod.create(opts)` 在 Gallery 关 body 时不会用 24×38 dummy 做 `bodyOf` / 形状缓存。

### 2.3 `src/core/act.js` — `createAct().draw`

- `draw()` 包一层：临时设 `fx.options.showBody`、`body === false` 时用 **`emptyActor()`** 替换 `fx.options.actor`，再调 **`_drawAct`**，finally 还原。
- `body === false` 分支：只 `fx.draw` back/front + 靶子/稻草/灰尘，**不**走 `onBody`  warp 与 rig 绘制。
- （若 upstream 已有类似逻辑，合并时保留：**emptyActor + finally 还原 + drawDust 在 body off 路径**。）

### 2.4 `src/core/math.js` — `Rng.pick`

```js
if (!list?.length) return undefined;
```

避免 spawn/status 在空 `rim` / 空列表上 `.x` 崩溃。

### 2.5 `src/fx/spawn/_lib.js` — `bodyOf`

`actor?.mask` 缺失时返回空 `{ list: [], w:0, h:0, on: () => false, ... }`。

### 2.6 `src/core/index.js`

导出 `emptyActor`, `bodyActor`（与 `bodyVisible` 一并）。

---

## 3. 特效层：关 body 时必须安全或跳过 silhouette

以下文件在 **关 body** 或 **无 mask** 时不应再画小人/不 crash。合并冲突时优先保留 **本 fork 侧** 的 guard。

### 3.1 `onBody` + `create()` 用 `bodyOf(o.actor)`（spawn）

依赖 §2 的 `emptyActor` + `bodyOf` 即可，无需再改逻辑（若 upstream 重写 `create()`，确认仍读 `o.actor` 而非闭包里的 stock）。

- `spawn/dissolve-burn.js`
- `spawn/disintegrate.js`
- `spawn/shatter-death.js`
- `spawn/soul-rise.js` — 额外：`R.pick(rim)` 后 **`if (!c) continue`**
- `spawn/respawn-beam.js` — 同上

### 3.2 `draw(p,t,o)` 直接用 `o.actor` — 加 `bodyVisible`

| 文件 | 要点 |
|------|------|
| `lightning/charge-up.js` | `A = bodyVisible(o) ? o.actor : null`，`p.mask` 等只在 `A` 时 |
| `lightning/thunderclap.js` | 同上 |
| `lightning/electrified.js` | `drawBack`/`draw` 开头 `bodyVisible`；off 时 back 可留脚边 glow |
| `scifi/glitch.js` | `draw` 开头 `if (!bodyVisible(o)) return` |
| `scifi/scanner.js` | 同上（无 body 时不画扫描框/描边） |
| `arcane/blink-appear.js` | `shape = silhouette !== false && bodyVisible(o)`，`A = shape ? o.actor : null` |
| `arcane/blink-vanish.js` | 同上 |
| `status/poisoned.js` | `body()` 空 shape 返回空 veins/blisters；`draw` 开头 `bodyVisible` |
| `status/bleeding.js` | `wounds()` 空 body → `[]`；`draw`/`drawBack` `bodyVisible` |
| `status/cursed.js` | `draw`/`drawBack` `bodyVisible` + 空 `S.body` 早退 |
| `status/burning.js` | `drawBack` 地板光后 `bodyVisible` 再 `spots`；`draw` 开头 guard |
| `status/rage.js` | `drawBack` 地板与 cracks 分 guard；`draw` 开头 guard |
| `status/petrified.js` | `update` 里 `S.body.length`、`cracks.length`、`stone.length` 判断后再 pick/spawn |

### 3.3 `create()` 扫描写 body 像素

| 文件 | 要点 |
|------|------|
| `scifi/warp-in.js` | `body.length` 为 0 时不要 `ps.spawn` 读 `b.x` |

---

## 4. 其它本地改动（与 body 无关，合并时常一起动）

合并 upstream 时这些文件也常冲突；若你只关心 body 开关，可只恢复 §1–§3；若行为要一致，一并核对。

### 4.1 去掉 stand-in 人体轮廓（仅 VFX）

- `holy/divine-shield.js` — 去掉 `meta.actor` / 用 pose 画 outline 的 stand-in（保留纯盾 VFX）。
- `shadow/life-steal.js`、`shadow/curse.js` — 去掉 actor 重着色/outline；curse 用池子光代替 body flood（与 upstream 0.3.0 `act` 并存时注意 import `READY` 等）。

### 4.2 循环 / 导出时长

- `src/core/fx.js` — **`effectDuration(meta, mod, options)`**；`mod.recordDuration(o)` 可选。
- `arcane/arcane-orb.js`、`arcane/portal.js` — `create()`、`periodOf`/`timing`、`recordDuration`、内部 `t % period`（无缝 loop + `fade_in`/`cycle`）。
- `tools/lib/fxlib.mjs`、`tools/check.mjs`、`tools/export-godot.mjs`、`gallery/app.js` — 用 `effectDuration` 算 sheet/导出帧数；Gallery `updateFacts` / sheet `--opts` 等。

### 4.3 与 upstream 0.3.0 acting 合并结果

- `arcane/blink-in.js`、`blink-out.js` 删除 → **`blink-appear.js`**、**`blink-vanish.js`**
- `README.md`、`docs/CATALOG.md` — fork 说明 + acting 文案
- 大量 `src/fx/**` 来自 upstream 新 effect / `act`（hammer、sword、implosion-burst、magic-missile 等）— 以你本地 `git log` / `git diff upstream/main` 为准

---

## 5. 合并 upstream 后的推荐流程

1. `git fetch upstream && git merge upstream/main`（或 rebase，按你习惯）。
2. 冲突文件对照本文 **§1 → §2 → §3** 逐项检查（尤其 `gallery/app.js`、`actor.js`、`fx.js`、`act.js`）。
3. 跑上文 **验证命令**。
4. Gallery 手动点几条：`spawn/dissolve-burn`、`status/poisoned`、`lightning/thunderclap`、`scifi/scanner` — 关 **body** 不应再有人形像素。

### 5.1 生成可重复应用的 patch（可选）

在合并前或合并后、工作区干净时：

```bash
git diff upstream/main -- gallery/app.js src/core/actor.js src/core/fx.js src/core/act.js src/core/math.js src/core/index.js src/fx/spawn/_lib.js > patches/body-toggle-core.patch
# 再按需把 §3 列表打成一个 patch
git apply --check patches/body-toggle-core.patch
```

把 `patches/` 目录纳入版本控制，冲突时 `git apply` 或手动对照 patch。

---

## 6. 改动文件速查表（body 相关）

```
gallery/app.js
src/core/actor.js
src/core/act.js
src/core/fx.js
src/core/index.js
src/core/math.js
src/fx/spawn/_lib.js
src/fx/spawn/soul-rise.js
src/fx/spawn/respawn-beam.js
src/fx/lightning/charge-up.js
src/fx/lightning/thunderclap.js
src/fx/lightning/electrified.js
src/fx/scifi/glitch.js
src/fx/scifi/scanner.js
src/fx/scifi/warp-in.js
src/fx/arcane/blink-appear.js
src/fx/arcane/blink-vanish.js
src/fx/status/poisoned.js
src/fx/status/bleeding.js
src/fx/status/cursed.js
src/fx/status/burning.js
src/fx/status/rage.js
src/fx/status/petrified.js
```

（`dissolve-burn` 等 spawn 仅依赖 core + `_lib`，未单独改 draw guard。）

---

*文档随 2026-03 本地 fork 整理；upstream 默认指 `https://github.com/patch-gg/pixelfx` main。*
