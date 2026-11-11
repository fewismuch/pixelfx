// Shared project configuration for the gallery and offline audio generation.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, allIds, loadEffect } from './fxlib.mjs';
import { BACKDROPS, effectDuration } from '../../src/core/index.js';

function validateJSON(value, depth = 0) {
  if (depth > 10) throw new Error('配置层级过深');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) return value.forEach(v => validateJSON(v, depth + 1));
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('配置字段不允许');
      validateJSON(v, depth + 1);
    }
    return;
  }
  throw new Error('配置含无效值');
}

export function createConfigStore(directory = join(ROOT, 'config/fx')) {
  const fileFor = id => {
    if (!allIds().includes(id)) throw new Error('未知特效');
    return join(directory, `${id}.json`);
  };
  return {
    async read(id) {
      const file = fileFor(id);
      try { return JSON.parse(await readFile(file, 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async write(id, config) {
      const file = fileFor(id);
      if (!config || typeof config !== 'object' || !config.opts || typeof config.opts !== 'object' || Array.isArray(config.opts) || typeof config.flip !== 'boolean') throw new Error('配置需要 opts 对象和 flip 布尔值');
      validateJSON(config.opts);
      const fx = await loadEffect(id);
      const bg = config.bg ?? fx.meta.bg;
      if (![...BACKDROPS, 'none'].includes(bg)) throw new Error('背景无效');
      for (const key of ['actor', 'usePlayer', 'trim']) {
        if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error(`${key} 必须为布尔值`);
      }
      const duration = effectDuration(fx.meta, fx.mod, config.opts);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('特效时长无效');
      const saved = { opts: config.opts, flip: config.flip, bg, actor: config.actor ?? true, usePlayer: config.usePlayer ?? false, trim: config.trim ?? true, duration, updatedAt: new Date().toISOString() };
      await mkdir(dirname(file), { recursive: true });
      const pending = `${file}.${randomUUID()}.tmp`;
      await writeFile(pending, JSON.stringify(saved, null, 2) + '\n');
      await rename(pending, file);
      return saved;
    },
  };
}
const store = createConfigStore();
export const readFxConfig = store.read;
export const writeFxConfig = store.write;

export async function configuredEffect(id, overrides = {}) {
  const [fx, config] = await Promise.all([loadEffect(id), readFxConfig(id)]);
  const options = { ...(config?.opts ?? {}), ...overrides };
  return { fx, config, options, duration: effectDuration(fx.meta, fx.mod, options) };
}
