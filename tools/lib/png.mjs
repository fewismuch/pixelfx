// A small PNG writer (RGBA, 8 bits per channel) and reader on node:zlib, so the tools need no packages.

import { deflateSync, inflateSync } from "node:zlib";

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, "ascii"), data]), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode w x h RGBA bytes as a PNG buffer. */
export function encodePNG(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 1; // Sub filter: pixel art has long runs, so differences compress well
    for (let x = 0; x < stride; x++) raw[o + 1 + x] = (src[y * stride + x] - (x >= 4 ? src[y * stride + x - 4] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Decode a PNG buffer to { w, h, data: RGBA bytes }. 8-bit grey, grey + alpha, RGB, RGBA and palette images
 * (with tRNS transparency), not interlaced: what pixel art editors write.
 */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0, pal = null, trns = null;
  const idat = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o), kind = buf.toString("ascii", o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (kind === "IHDR") (w = d.readUInt32BE(0)), (h = d.readUInt32BE(4)), (depth = d[8]), (type = d[9]), (interlace = d[12]);
    else if (kind === "PLTE") pal = d;
    else if (kind === "tRNS") trns = d;
    else if (kind === "IDAT") idat.push(d);
    else if (kind === "IEND") break;
    o += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`PNG must be 8 bits per channel and not interlaced (got ${depth}-bit${interlace ? ", interlaced" : ""})`);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!bpp) throw new Error(`PNG color type ${type} not supported`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(stride * h), data = new Uint8ClampedArray(w * h * 4);
  // undo the per-row filters
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = v & 255;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp, j = i * 4;
    if (type === 6) data.set(px.subarray(s, s + 4), j);
    else if (type === 2) data.set([px[s], px[s + 1], px[s + 2], 255], j);
    else if (type === 0) data.set([px[s], px[s], px[s], 255], j);
    else if (type === 4) data.set([px[s], px[s], px[s], px[s + 1]], j);
    else data.set([pal[px[s] * 3], pal[px[s] * 3 + 1], pal[px[s] * 3 + 2], trns && px[s] < trns.length ? trns[px[s]] : 255], j);
  }
  return { w, h, data };
}
