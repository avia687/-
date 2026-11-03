// Local API for the AutoEdit UI. Binds to 127.0.0.1 only; rejects foreign Host headers (DNS rebinding)
// and requires a custom header on writes (blocks cross-site form posts).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { createEngine } from '../engine/index.js';
import { friendly } from '../engine/errors.js';
import { log } from '../engine/log.js';
import { EXPORT_PRESETS } from '../engine/render.js';
import { Transcriber } from '../engine/transcribe.js';
import { Instagram } from '../engine/instagram.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST = path.join(here, '..', 'ui', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readJson(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('body too large'); chunks.push(c); }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Project for the UI: everything except bulky per-sample analysis arrays. */
export function publicProject(p) {
  return {
    ...p,
    media: p.media.map((m) => ({
      ...m,
      analysis: m.analysis ? {
        meta: m.analysis.meta, scores: m.analysis.scores, bestMoment: m.analysis.bestMoment, speechRatio: m.analysis.speechRatio,
        loudness: m.analysis.loudness, scenes: m.analysis.sceneCuts?.length ?? 0, silences: m.analysis.silences?.length ?? 0,
        hasProxy: !!m.analysis.proxy, beats: m.analysis.beats ? { bpm: m.analysis.beats.bpm, confidence: m.analysis.beats.confidence } : null,
      } : null,
    })),
    transcripts: Object.fromEntries(Object.entries(p.transcripts || {}).map(([k, t]) => [k, { language: t.language, text: t.text, words: t.words?.length || 0 }])),
  };
}

export function summary(p) {
  const v = p.versions.find((x) => x.id === p.currentVersionId);
  return {
    id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, status: p.status, platform: p.platform, style: p.style,
    goal: p.goal, mediaCount: p.media.length, duration: v?.edl?.duration ?? null, score: v?.score?.total ?? null,
    thumb: v?.thumb || p.media.find((m) => m.thumb)?.thumb || null, versions: p.versions.length,
  };
}

export async function startServer({ port = 0, dataDir, cipher, exportDir, fontsDir, host = {} } = {}) {
  const engine = await createEngine({ dataDir, cipher, exportDir, fontsDir: fontsDir || path.join(here, '..', 'assets', 'fonts') });
  const instagram = new Instagram({ settings: engine.settings, ai: engine.ai, dataDir: engine.root, openExternal: host.openExternal });
  const clients = new Set();
  const analyzeTimers = new Map();
  let boundPort = port;

  const broadcast = (type, data) => {
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };
  engine.jobs.on('update', (j) => broadcast('job', publicJob(j)));
  engine.store.on('change', (id) => broadcast('project', { id }));

  function publicJob(j) {
    return { id: j.id, type: j.type, projectId: j.projectId, status: j.status, stage: j.stage, progress: j.progress, error: j.error, retrying: !!j.retrying, resumed: !!j.resumed, result: j.status === 'done' ? j.result : undefined, createdAt: j.createdAt };
  }

  function scheduleAnalyze(projectId) {
    clearTimeout(analyzeTimers.get(projectId));
    analyzeTimers.set(projectId, setTimeout(() => {
      const busy = engine.jobs.forProject(projectId).some((j) => ['queued', 'running'].includes(j.status) && j.type === 'create');
      if (!busy) engine.analyze(projectId);
    }, 1200));
  }

  async function serveFile(req, res, file, { download } = {}) {
    let st;
    try { st = await fsp.stat(file); } catch { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  }

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

  // ---------- state & settings ----------
  route('GET', '/api/state', async () => ({
    settings: engine.settings.get(),
    secrets: engine.settings.secretStatus(),
    system: await engine.systemCheck(),
    projects: engine.store.list().map(summary),
    jobs: engine.jobs.jobs.filter((j) => ['queued', 'running'].includes(j.status)).map(publicJob),
    presets: Object.fromEntries(Object.entries(EXPORT_PRESETS).map(([k, v]) => [k, v.label])),
    instagram: instagram.status(),
    host: { desktop: !!host.desktop, exportDir: exportDir || null },
  }));
  route('PATCH', '/api/settings', async ({ body }) => {
    const allowed = ['lang', 'onboardingDone', 'mode', 'brand', 'export', 'privacy', 'flags'];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    return engine.settings.update(patch);
  });
  route('PUT', '/api/secrets/:name', async ({ params, body }) => {
    const name = params.name;
    if (!['openai', 'anthropic', 'meta_app_secret'].includes(name)) return [400, { error: 'unknown' }];
    const value = String(body.value || '').trim();
    if (!value) { await engine.settings.setSecret(name, null); return { ok: true, removed: true }; }
    const test = name === 'openai' ? await Transcriber.testKey(value) : name === 'anthropic' ? await engine.ai.testKey(value) : { ok: true };
    if (!test.ok) return { ok: false, reason: test.reason };
    await engine.settings.setSecret(name, value);
    return { ok: true, warning: test.warning || null };
  });
  route('DELETE', '/api/secrets/:name', async ({ params }) => { await engine.settings.setSecret(params.name, null); return { ok: true }; });

  route('PUT', '/api/brand/logo', async ({ req, query }) => {
    const ext = (path.extname(query.get('name') || '.png') || '.png').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return [400, { error: 'type' }];
    const file = path.join(engine.root, 'brand', `logo${ext}`);
    await streamPipeline(req, fs.createWriteStream(file));
    await engine.settings.update({ brand: { logo: `logo${ext}`, logoMode: engine.settings.get().brand.logoMode === 'off' ? 'corner' : engine.settings.get().brand.logoMode } });
    return { ok: true, logo: `logo${ext}` };
  });
  route('DELETE', '/api/brand/logo', async () => { await engine.settings.update({ brand: { logo: null, logoMode: 'off' } }); return { ok: true }; });

  // ---------- projects ----------
  route('GET', '/api/projects', async () => engine.store.list().map(summary));
  route('POST', '/api/projects', async ({ body }) => publicProject(await engine.createProject({
    name: String(body.name || '').slice(0, 120) || undefined, goal: body.goal, platform: body.platform, style: body.style, targetDuration: Number(body.targetDuration) || 30,
  })));
  route('GET', '/api/projects/:id', async ({ params }) => {
    const p = engine.store.get(params.id);
    return p ? publicProject(p) : [404, { error: 'not_found' }];
  });
  route('PATCH', '/api/projects/:id', async ({ params, body }) => {
    const allowed = ['name', 'goal', 'platform', 'style', 'targetDuration'];
    await engine.store.update(params.id, (d) => { for (const k of allowed) if (body[k] !== undefined) d[k] = k === 'name' ? String(body[k]).slice(0, 120) : body[k]; });
    return publicProject(engine.store.get(params.id));
  });
  route('DELETE', '/api/projects/:id', async ({ params }) => {
    for (const j of engine.jobs.forProject(params.id)) engine.jobs.cancel(j.id);
    await engine.store.remove(params.id);
    return { ok: true };
  });
  route('POST', '/api/projects/:id/duplicate', async ({ params }) => summary(await engine.store.duplicate(params.id)));

  route('PUT', '/api/projects/:id/media', async ({ req, params, query }) => {
    const name = String(query.get('name') || 'file').slice(0, 200);
    const relPath = String(query.get('relPath') || name).slice(0, 400);
    const tmp = path.join(engine.root, 'tmp', crypto.randomBytes(8).toString('hex'));
    try {
      await streamPipeline(req, fs.createWriteStream(tmp));
      const item = await engine.addMedia(params.id, { tmpPath: tmp, name, relPath });
      if (item) scheduleAnalyze(params.id);
      return item ? { ok: true, media: item } : { ok: false, reason: 'unsupported' };
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      throw err;
    }
  });
  route('DELETE', '/api/projects/:id/media/:mid', async ({ params }) => { await engine.removeMedia(params.id, params.mid); return { ok: true }; });
  route('PATCH', '/api/projects/:id/media/:mid', async ({ params, body }) => {
    if (!['aroll', 'broll', 'music', 'voice', 'image', 'logo', null].includes(body.role ?? null)) return [400, { error: 'role' }];
    await engine.setMediaRole(params.id, params.mid, body.role ?? null);
    return { ok: true };
  });
  route('POST', '/api/projects/:id/analyze', async ({ params }) => publicJob(engine.analyze(params.id)));
  route('POST', '/api/projects/:id/create', async ({ params, body }) => publicJob(engine.create(params.id, body)));
  route('POST', '/api/projects/:id/edit', async ({ params, body }) => engine.requestEdit(params.id, String(body.text || '').slice(0, 1000)));
  route('POST', '/api/projects/:id/variant', async ({ params, body }) => publicJob(engine.variant(params.id, body)));
  route('POST', '/api/projects/:id/undo', async ({ params }) => { await engine.undo(params.id); return { ok: true }; });
  route('POST', '/api/projects/:id/redo', async ({ params }) => { await engine.redo(params.id); return { ok: true }; });
  route('POST', '/api/projects/:id/restore', async ({ params, body }) => { await engine.restore(params.id, body.versionId); return { ok: true }; });
  route('POST', '/api/projects/:id/export', async ({ params, body }) => publicJob(engine.exportVideo(params.id, body)));
  route('POST', '/api/projects/:id/reveal', async ({ params, body }) => {
    const p = engine.store.get(params.id);
    const e = p?.exports.find((x) => x.id === body.exportId);
    if (!e) return [404, { error: 'not_found' }];
    const file = e.savedTo && fs.existsSync(e.savedTo) ? e.savedTo : engine.store.resolve(p.id, e.file);
    if (host.reveal) { host.reveal(file); return { ok: true }; }
    return { ok: false, download: `/files/${p.id}/${e.file}?download=1` };
  });

  // ---------- jobs ----------
  route('GET', '/api/jobs', async ({ query }) => engine.jobs.jobs.filter((j) => !query.get('projectId') || j.projectId === query.get('projectId')).slice(-50).map(publicJob));
  route('POST', '/api/jobs/:id/cancel', async ({ params }) => ({ ok: engine.jobs.cancel(params.id) }));
  route('POST', '/api/jobs/:id/retry', async ({ params }) => { const j = engine.jobs.retry(params.id); return j ? publicJob(j) : [400, { error: 'not_retryable' }]; });

  // ---------- Instagram ----------
  route('GET', '/api/instagram', async () => instagram.status());
  route('POST', '/api/instagram/config', async ({ body }) => instagram.configure(body));
  route('POST', '/api/instagram/connect', async () => instagram.startConnect(boundPort));
  route('GET', '/oauth/instagram/callback', async ({ query, res }) => {
    const result = await instagram.finishConnect(query, boundPort);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>AutoEdit</title><body style="font-family:system-ui;background:#0b0b0f;color:#eee;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h2>${result.ok ? 'Instagram connected ✓' : 'Instagram was not connected'}</h2><p>${result.ok ? 'You can close this window and return to AutoEdit.' : 'Return to AutoEdit and try again.'}</p></div>`);
    broadcast('instagram', instagram.status());
    return null;
  });
  route('POST', '/api/instagram/finish', async ({ body }) => { const r = await instagram.finishConnect({ pasted: String(body.url || '') }, boundPort); broadcast('instagram', instagram.status()); return r; });
  route('POST', '/api/instagram/sync', async () => { const r = await instagram.sync(); broadcast('instagram', instagram.status()); return r; });
  route('POST', '/api/instagram/disconnect', async () => { await instagram.disconnect(); broadcast('instagram', instagram.status()); return { ok: true }; });
  route('GET', '/api/instagram/dna', async () => instagram.contentDna());
  route('POST', '/api/instagram/coach', async ({ body }) => instagram.coach(String(body.question || '').slice(0, 500), engine.settings.get()));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Host allow-list: blocks DNS-rebinding attacks from websites.
    const hostHeader = (req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost'].includes(hostHeader)) { res.writeHead(403); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-autoedit'] !== '1') { res.writeHead(403); return res.end(); }

    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1500\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    // Project files (thumbnails, proxies, previews, exports): path-confined to the project folder.
    let m = /^\/files\/(p_[a-f0-9]{12})\/(.+)$/.exec(url.pathname);
    if (m && req.method === 'GET') {
      try {
        const rel = decodeURIComponent(m[2]);
        const file = engine.store.resolve(m[1], rel);
        const p = engine.store.get(m[1]);
        const exp = url.searchParams.get('download') ? p?.exports.find((e) => e.file === rel) : null;
        return serveFile(req, res, file, { download: exp?.fileName });
      } catch { res.writeHead(400); return res.end(); }
    }
    m = /^\/brand\/(logo\.(png|jpg|jpeg|webp))$/.exec(url.pathname);
    if (m) return serveFile(req, res, path.join(engine.root, 'brand', m[1]));

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const match = r.re.exec(url.pathname);
      if (!match) continue;
      try {
        const body = ['POST', 'PATCH', 'PUT'].includes(req.method) && !/\/media$|\/brand\/logo$/.test(url.pathname) ? await readJson(req) : {};
        const out = await r.handler({ req, res, params: match.groups || {}, query: url.searchParams, body });
        if (out === null) return; // handler wrote the response
        if (Array.isArray(out) && typeof out[0] === 'number') return json(res, out[0], out[1]);
        return json(res, 200, out);
      } catch (err) {
        log('error', 'api.error', { path: url.pathname, error: String(err?.stack || err).slice(0, 3000) });
        return json(res, 500, { error: friendly(err, engine.settings.get().lang) });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });

    // Static UI.
    let file = path.join(UI_DIST, path.normalize(url.pathname).replace(/^([/\\])+/, ''));
    if (!file.startsWith(UI_DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIST, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('AutoEdit UI is not built yet.'); }
    return serveFile(req, res, file);
  });

  // Prefer a fixed port (stable Instagram redirect address); fall back to any free port.
  await new Promise((resolve, reject) => {
    const onErr = (err) => {
      if (err.code === 'EADDRINUSE' && port !== 0) { server.listen(0, '127.0.0.1', resolve); } else reject(err);
    };
    server.once('error', onErr);
    server.listen(port, '127.0.0.1', () => { server.off('error', onErr); resolve(); });
  });
  boundPort = server.address().port;
  log('info', 'server.listen', { port: boundPort });
  return { server, port: boundPort, engine, url: `http://127.0.0.1:${boundPort}/`, close: () => new Promise((r) => server.close(r)) };
}
