import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ROOT, allIds } from './fxlib.mjs';
import { configuredEffect } from './fx-config.mjs';
const exec = promisify(execFile);
const busy = new Set();
const base = join(ROOT, 'audio/sfx');
function folder(id) {
  if (!allIds().includes(id)) throw new Error('未知特效');
  return join(base, id);
}
export async function readSfx(id) {
  try { return JSON.parse(await readFile(join(folder(id), 'manifest.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return { candidates: [] }; throw e; }
}
async function save(id, data) {
  await mkdir(folder(id), { recursive: true });
  const pending = join(folder(id), `manifest.${randomUUID()}.tmp`);
  await writeFile(pending, JSON.stringify(data, null, 2) + '\n');
  await rename(pending, join(folder(id), 'manifest.json'));
}
export async function saveTiming(id, timing, key = null) {
  if (busy.has(id)) throw new Error('生成完成后再修改时序');
  const state = await readSfx(id);
  const { duration } = await configuredEffect(id);
  const offset = Number(timing.offset);
  if (!Number.isFinite(offset) || offset < 0 || offset >= duration) throw new Error('发声延迟必须大于等于 0 且小于特效时长');
  const description = String(timing.description ?? '').trim().slice(0, 1000);
  const candidates = state.candidates.map(c => ({ ...c, timing: c.timing ?? state.timing ?? { offset: 0, description: '' }, prompt: c.prompt ?? state.prompt }));
  if (key) {
    const chosen = candidates.find(c => c.key === key);
    if (!chosen) throw new Error('候选不存在');
    chosen.timing = { offset, description };
    await save(id, { ...state, candidates });
  } else {
    await save(id, { ...state, candidates, timing: { offset, description } });
  }
  return readSfx(id);
}
export async function generateSfx(id, options = {}, promptOverride = null) {
  folder(id);
  if (busy.size) throw new Error('已有一批候选正在生成，请完成后再试');
  busy.add(id);
  let state;
  try {
    const configured = await configuredEffect(id, options);
    const { fx, duration } = configured;
    const previous = await readSfx(id);
    if (!previous.timing?.description) throw new Error('请先读取特效代码、确认发声时机，再保存时序说明');
    const timing = previous.timing;
    if (timing.offset >= duration) throw new Error('发声延迟超过当前特效时长，请先调整时序');
    const soundDuration = duration - timing.offset;
    const batch = randomUUID();
    const prompt = promptOverride?.trim() || `游戏技能音效，${fx.meta.name}。${fx.meta.desc} 音效用途及动作：${timing.description}。音频本身时长约 ${soundDuration.toFixed(2)} 秒，音频起始立即发声，自然收尾；发声前的等待由播放器负责，不要在音频前添加等待静音。仅音效，无音乐、无人声。`;
    state = { ...previous, id, duration, soundDuration, prompt, effectOptions: configured.options, status: 'generating', error: null };
    await save(id, state);
    const out = join(folder(id), batch);
    await mkdir(out);
    try {
      try {
        await exec('python3', [join(ROOT, 'scripts/audio_gen/gen_sfx.py'), out, 'candidate', prompt, '-n', '5'], { timeout: 330000 });
      } catch { /* Inspect and retain successful files even when another request failed. */ }
      const { stdout } = await exec('python3', [join(ROOT, 'scripts/audio_gen/inspect_sfx.py'), out], { timeout: 60000 });
      const measured = JSON.parse(stdout);
      const candidates = measured.map((item, i) => ({ ...item, effectOptions: configured.options, effectDuration: duration, timing: { ...timing }, prompt, key: `${batch}/${item.file}`, label: `候选 ${state.candidates.length + i + 1}`, url: `/audio/sfx/${id}/${batch}/${item.file}` }));
      state.candidates.push(...candidates);
      state.status = candidates.length === 5 ? 'ready' : 'error';
      state.error = candidates.length === 5 ? null : `只成功生成 ${candidates.length}/5 个候选，可重试；已有文件已保留。`;
    } catch (e) {
      state.status = 'error';
      // Do not expose provider response bodies or credentials through the server.
      state.error = '生成或音频检查失败，请检查 API 配置、网络及 ffmpeg。已生成的文件保留在批次目录。';
    }
    await save(id, state);
    return state;
  } finally { busy.delete(id); }
}
export async function keepSfx(id, key) {
  folder(id);
  if (busy.has(id)) throw new Error('生成完成后再确认保留');
  const state = await readSfx(id);
  const chosen = state.candidates.find(c => c.key === key);
  if (!chosen) throw new Error('候选不存在');
  const others = state.candidates.filter(c => c.key !== key);
  // Write the surviving selection first, so interruption cannot reference deleted files.
  await save(id, { ...state, candidates: [chosen], selected: key, status: 'ready', error: null });
  for (const c of others) await unlink(join(folder(id), c.key));
  return readSfx(id);
}
