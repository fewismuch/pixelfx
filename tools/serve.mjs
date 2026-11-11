#!/usr/bin/env node
// Serve the repo so the gallery can load the effects as modules: node tools/serve.mjs [port]
// then open http://localhost:8080/gallery/

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { readSfx, generateSfx, keepSfx, saveTiming } from "./lib/sfx.mjs";
import { readFxConfig, writeFxConfig } from "./lib/fx-config.mjs";
import { ROOT } from "./lib/fxlib.mjs";

const PORT = +(process.argv[2] ?? 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8", ".mp4": "video/mp4",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/fx-config") {
    const reply = (status, body) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
    try {
      const id = url.searchParams.get("id");
      if (req.method === "GET") return reply(200, { config: await readFxConfig(id) });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(403, { error: "来源不允许" });
      if (req.method !== "POST" || !req.headers["content-type"]?.startsWith("application/json")) return reply(405, { error: "需要 JSON POST" });
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 16384) return reply(413, { error: "请求过大" }); }
      const data = JSON.parse(body);
      if (data.action !== "save" && data.action !== "reset") return reply(400, { error: "未知操作" });
      const config = await writeFxConfig(id, data.action === "reset" ? { opts: {}, flip: false } : data.config);
      return reply(200, { config });
    } catch (e) { return reply(400, { error: e.message }); }
  }
  if (url.pathname === "/api/sfx") {
    const reply = (status, body) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
    try {
      const id = url.searchParams.get("id");
      if (req.method === "GET") return reply(200, await readSfx(id));
      // Only the local gallery may trigger generation or cleanup.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(403, { error: "来源不允许" });
      if (req.method !== "POST" || !req.headers["content-type"]?.startsWith("application/json")) return reply(405, { error: "需要 JSON POST" });
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 16384) return reply(413, { error: "请求过大" }); }
      const data = JSON.parse(body);
      if (data.action === "timing") return reply(200, await saveTiming(id, data.timing, data.key));
      if (data.action === "keep") return reply(200, await keepSfx(id, data.key));
      if (data.action === "generate") {
        const state = await readSfx(id);
        if (!state.timing?.description) throw new Error('请先保存声音与时序说明');
        generateSfx(id, data.options ?? {}).catch(() => {});
        return reply(202, { status: "generating" });
      }
      return reply(400, { error: "未知操作" });
    } catch (e) { return reply(400, { error: e.message }); }
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return res.writeHead(400).end(); }
  if (path === "/") return res.writeHead(302, { location: "/gallery/" }).end();
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`gallery: http://localhost:${PORT}/gallery/`));
