// Build a pixelfx actor from a PNG (feet at origin, cropped to opaque pixels). Used by the gallery preview.
import { rgb } from "../src/core/color.js";

/** @returns {Promise<object|null>} actor object for createFx / drawActor, or null on failure */
export async function loadPlayerActor(url) {
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  img.src = url;
  try {
    if (img.decode) await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  } catch {
    return null;
  }
  if (!img.naturalWidth) return null;
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width: iw, height: ih } = ctx.getImageData(0, 0, cv.width, cv.height);
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++)
    for (let x = 0; x < iw; x++)
      if (data[(y * iw + x) * 4 + 3] > 8) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((y + y0) * iw + x + x0) * 4, i = y * w + x, [r, g, b, a] = data.subarray(s, s + 4);
      if (a <= 8) continue;
      mask[i] = 1;
      pixels[i] = rgb(r, g, b) >>> 0;
    }
  const ax = -Math.floor(w / 2), ay = -h;
  return {
    custom: true,
    mask: { w, h, data: mask },
    pixels,
    x: ax,
    y: ay,
    w,
    h,
    k: 2,
    head: [0, ay],
    chest: [0, ay + Math.round(h * 0.4)],
    eyes: [[Math.floor(w * 0.45), ay + Math.round(h * 0.12)], [Math.floor(w * 0.55), ay + Math.round(h * 0.12)]],
  };
}
