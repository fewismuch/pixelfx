#!/usr/bin/env node
// Inspect the same saved options and duration used by audio generation, without calling any audio API.
import { configuredEffect } from './lib/fx-config.mjs';
const id = process.argv[2];
if (!id) throw new Error('用法：node tools/show-fx-config.mjs <特效 id>');
const { fx, config, options, duration } = await configuredEffect(id);
console.log(JSON.stringify({ id, source: config ? `config/fx/${id}.json` : '源码默认值', duration, defaultDuration: fx.meta.duration, options, flip: config?.flip ?? false }, null, 2));
