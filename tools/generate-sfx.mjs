#!/usr/bin/env node
import { generateSfx, saveTiming } from './lib/sfx.mjs';
const id = process.argv[2] ?? 'lightning/sky-bolt';
const offsetAt = process.argv.indexOf('--offset');
const descriptionAt = process.argv.indexOf('--description');
if (offsetAt !== -1 || descriptionAt !== -1) {
  if (offsetAt === -1 || descriptionAt === -1) throw new Error('需同时提供 --offset 秒数 和 --description 时序说明');
  await saveTiming(id, { offset: Number(process.argv[offsetAt + 1]), description: process.argv[descriptionAt + 1] });
}
const promptAt = process.argv.indexOf('--prompt');
if (promptAt !== -1 && !process.argv[promptAt + 1]?.trim()) throw new Error('--prompt 需要提供完整音效提示词');
const state = await generateSfx(id, {}, promptAt === -1 ? null : process.argv[promptAt + 1]);
console.log(JSON.stringify(state, null, 2));
if (state.status === 'error') process.exitCode = 1;
