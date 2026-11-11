// Audio follows the detail player's restart/cycle, never the independently playing gallery tiles.
export class SfxPanel {
  constructor(getPlayer) {
    this.getPlayer = getPlayer;
    this.$ = id => document.getElementById(id);
    this.$('sfx-keep').onclick = () => this.keep();
    this.$('sfx-mute').onclick = () => {
      this.muted = !this.muted;
      this.$('sfx-mute').setAttribute('aria-pressed', String(this.muted));
      this.$('sfx-mute').textContent = this.muted ? '取消静音' : '静音';
      this.getPlayer()?.restart();
    };
  }
  async request(body) {
    const res = await fetch(`/api/sfx?id=${encodeURIComponent(this.id)}`, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '请求失败');
    return data;
  }
  stop() {
    if (this.source) { this.source.stop(); this.source.disconnect(); this.source = null; }
  }
  close() {
    clearTimeout(this.timer);
    this.token = (this.token ?? 0) + 1;
    this.stop(); this.buffer = null; this.id = null;
  }
  async open(id) {
    this.close(); this.id = id; this.key = null;
    this.$('sfx-candidates').replaceChildren();
    this.$('sfx-keep').disabled = true;
    this.$('sfx-status').textContent = '读取中…';
    this.$('sfx-prompt').textContent = '读取中…';
    // Resume during the opening click, before asynchronous loading loses the browser gesture.
    this.context ??= new AudioContext();
    this.context.resume().catch(() => {});
    await this.refresh(true);
  }
  async refresh(autoPlay = false) {
    const id = this.id;
    try {
      const data = await this.request();
      if (id !== this.id) return;
      this.data = data;
      const chosen = data.candidates.find(c => c.key === (this.key ?? data.selected));
      this.$('sfx-prompt').textContent = chosen?.prompt ?? data.prompt ?? '暂无音效提示词';
      this.$('sfx-status').textContent = data.error ?? (data.status === 'generating' ? '正在生成 5 个候选…' :
        `${data.selected ? '已确认的音效会随此特效自动播放。' : ''}${data.duration ? `生成参考时长 ${data.duration.toFixed(2)} 秒。` : ''}选择候选，与特效同步循环试听；确认保留后才会删除其余文件。`);
      this.$('sfx-keep').disabled = !this.key || data.status === 'generating' || (data.candidates.length <= 1 && data.selected === this.key);
      const buttons = data.candidates.map(c => {
        const b = document.createElement('button');
        b.className = 'btn'; b.type = 'button';
        b.textContent = `${c.label} · ${c.duration.toFixed(2)}s${c.duration > data.duration + .1 ? '（较长）' : ''}`;
        b.title = `响度 ${c.lufs?.toFixed(1) ?? '—'} LUFS，峰值 ${c.peak?.toFixed(1) ?? '—'} dBTP`;
        b.setAttribute('aria-pressed', String(c.key === this.key));
        b.onclick = () => this.select(c);
        return b;
      });
      this.$('sfx-candidates').replaceChildren(...buttons);
      if (data.status === 'generating') this.timer = setTimeout(() => this.refresh(), 2000);
      if (autoPlay && data.selected) {
        const chosen = data.candidates.find(c => c.key === data.selected);
        if (chosen) await this.select(chosen);
      }
    } catch {
      if (id === this.id) this.$('sfx-status').textContent = '音效服务不可用，请使用 node tools/serve.mjs 启动预览。';
    }
  }
  async select(c) {
    const id = this.id, token = ++this.token;
    this.stop(); this.buffer = null;
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      const response = await fetch(c.url);
      if (!response.ok) throw new Error('读取音频失败');
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      if (id !== this.id || token !== this.token) return;
      this.buffer = buffer; this.key = c.key;
      this.$('sfx-prompt').textContent = c.prompt ?? this.data?.prompt ?? '暂无音效提示词';
      const player = this.getPlayer();
      player.playing = true;
      document.getElementById('d-play').textContent = 'pause';
      document.getElementById('d-play').setAttribute('aria-pressed', 'true');
      player.restart(); player.render();
      await this.refresh();
    } catch (e) { if (id === this.id) this.$('sfx-status').textContent = e.message; }
  }
  restart() {
    this.stop();
    const p = this.getPlayer();
    if (!this.buffer || !p?.playing || this.muted || document.hidden) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = p.speed;
    source.connect(this.context.destination);
    const chosen = this.data?.candidates.find(c => c.key === this.key);
    const offset = chosen?.timing?.offset ?? this.data?.timing?.offset ?? 0;
    source.start(this.context.currentTime + offset / p.speed); this.source = source;
  }
  async keep() {
    this.$('sfx-keep').disabled = true;
    try { await this.request({ action: 'keep', key: this.key }); await this.refresh(); }
    catch (e) { this.$('sfx-status').textContent = e.message; }
  }
}
