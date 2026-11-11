// State persisted by the detail preview's Save button.
export function capturePreviewConfig(player, trim) {
  return { opts: player.opts, flip: player.flip, bg: player.bg, actor: player.actor, usePlayer: player.usePlayer, trim };
}

export function applyPreviewConfig(player, saved, fallbackTrim = true) {
  player.opts = { ...(saved.opts ?? {}) };
  player.flip = !!saved.flip;
  player.actor = saved.actor ?? true;
  // Keep the desired toggle even if the player image is still loading.
  player.usePlayer = saved.usePlayer ?? false;
  player.setBg(saved.bg ?? player.fx.meta.bg);
  player.restart();
  return saved.trim ?? fallbackTrim;
}
