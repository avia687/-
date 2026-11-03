// AutoEdit engine entry: composes store, jobs, settings and the pipeline.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { resolveDataDir } from './paths.js';
import { initLog, log } from './log.js';
import { ProjectStore, newId } from './store.js';
import { JobQueue } from './jobs.js';
import { Settings } from './settings.js';
import { Pipeline } from './pipeline.js';
import { kindOf, roleHint, safeFileName, convertHeicIfNeeded } from './ingest.js';
import { parseRequest, validateOps, applyOps } from './nlEdit.js';
import { ffmpegAvailable, FFMPEG } from './ffmpeg.js';
import { Transcriber } from './transcribe.js';
import { AI } from './ai.js';

export async function createEngine({ dataDir, cipher, exportDir, fontsDir } = {}) {
  const root = resolveDataDir(dataDir);
  initLog(path.join(root, 'logs'));
  const store = new ProjectStore(root);
  const jobs = new JobQueue(root);
  const settings = new Settings(root, cipher);
  const ai = new AI(settings);
  const transcriber = new Transcriber({ store, settings, dataDir: root });
  const pipeline = new Pipeline({ store, jobs, settings, dataDir: root, exportDir, transcriber, fontsDir });
  jobs.resume();
  log('info', 'engine.start', { root, ffmpeg: FFMPEG });

  const engine = {
    root, store, jobs, settings, pipeline, ai,

    async systemCheck() {
      const ok = await ffmpegAvailable();
      let free = null;
      try { const s = await fsp.statfs(root); free = s.bavail * s.bsize; } catch { /* older node */ }
      return { mediaEngine: ok, freeBytes: free, dataDir: root, writable: true };
    },

    createProject(opts) { return store.create(opts); },

    /** Register an uploaded file that the server already streamed into media/. */
    async addMedia(projectId, { tmpPath, name, relPath }) {
      const kind = kindOf(name);
      if (!kind) { await fsp.rm(tmpPath, { force: true }); return null; }
      const id = newId('m_');
      const fileName = `${id}_${safeFileName(name)}`;
      let abs = store.resolve(projectId, path.join('media', fileName));
      await fsp.rename(tmpPath, abs);
      try { abs = await convertHeicIfNeeded(abs); } catch (e) { log('warn', 'heic.failed', { error: String(e) }); }
      const stat = await fsp.stat(abs);
      const item = {
        id, name, relPath: relPath || name, kind, role: roleHint(relPath || name, kind),
        file: path.join('media', path.basename(abs)).split(path.sep).join('/'),
        sizeBytes: stat.size, addedAt: new Date().toISOString(), analysis: null, thumb: null, duration: null, error: null,
      };
      await store.update(projectId, (d) => { d.media.push(item); if (d.status === 'ready') d.status = 'ready'; });
      return item;
    },

    async removeMedia(projectId, mediaId) {
      const p = store.get(projectId);
      const m = p.media.find((x) => x.id === mediaId);
      if (!m) return;
      await store.update(projectId, (d) => { d.media = d.media.filter((x) => x.id !== mediaId); });
      await fsp.rm(store.resolve(projectId, m.file), { force: true });
      await fsp.rm(store.resolve(projectId, path.join('cache', mediaId)), { recursive: true, force: true });
    },

    async setMediaRole(projectId, mediaId, role) {
      await store.update(projectId, (d) => { const m = d.media.find((x) => x.id === mediaId); if (m) m.role = role; });
    },

    analyze(projectId) { return jobs.enqueue('analyze', projectId); },

    create(projectId, params) {
      const allowed = ['style', 'targetDuration', 'platform', 'goal'];
      const clean = Object.fromEntries(Object.entries(params || {}).filter(([k]) => allowed.includes(k)));
      return jobs.enqueue('create', projectId, clean);
    },

    /** Natural-language request → ops (AI when configured, rules otherwise) → new version job. */
    async requestEdit(projectId, text) {
      const p = store.get(projectId);
      const cur = p.versions.find((v) => v.id === p.currentVersionId);
      if (!cur) return { ok: false, reason: 'no_version' };
      let ops = validateOps(parseRequest(text));
      let via = 'rules';
      if (ai.available('chat')) {
        try {
          const aiOps = validateOps(await ai.mapEditRequest(text, contextFor(p, cur, settings.get())));
          if (aiOps.length) { ops = aiOps; via = 'ai'; }
        } catch (e) { log('warn', 'ai.map_failed', { error: String(e?.message || e) }); }
      }
      if (!ops.length) return { ok: false, reason: 'not_understood' };
      const { next, said } = applyOps(cur, ops, cur.edl.scores);
      const job = jobs.enqueue('edit', projectId, { ...next, request: text, ops, said, label: { he: text, en: text } });
      return { ok: true, ops, via, jobId: job.id };
    },

    /** Switch style / duration / platform from buttons (no text). */
    variant(projectId, patch) {
      const p = store.get(projectId);
      const cur = p.versions.find((v) => v.id === p.currentVersionId);
      const base = cur || { style: p.style, platform: p.platform, targetDuration: p.targetDuration, directives: {} };
      const next = { style: patch.style || base.style, platform: patch.platform || base.platform, targetDuration: patch.targetDuration || base.targetDuration, directives: { ...(base.directives || {}), ...(patch.directives || {}) } };
      const label = patch.style ? { he: `גרסת ${({ viral: 'ויראלי', cinematic: 'קולנועי', premium: 'פרימיום' })[patch.style]}`, en: `${patch.style} version` } : { he: 'גרסה חדשה', en: 'New version' };
      return jobs.enqueue('edit', projectId, { ...next, label });
    },

    async undo(projectId) {
      return store.update(projectId, (d) => {
        const i = d.versions.findIndex((v) => v.id === d.currentVersionId);
        if (i > 0) { d.redo.push(d.currentVersionId); d.currentVersionId = d.versions[i - 1].id; }
      });
    },
    async redo(projectId) {
      return store.update(projectId, (d) => { const id = d.redo.pop(); if (id) d.currentVersionId = id; });
    },
    async restore(projectId, versionId) {
      return store.update(projectId, (d) => { if (d.versions.some((v) => v.id === versionId)) { d.currentVersionId = versionId; d.redo = []; } });
    },

    exportVideo(projectId, { versionId, preset }) { return jobs.enqueue('export', projectId, { versionId, preset }); },
  };
  return engine;
}

/** Compact context for the AI — only what's needed, no media or personal data. */
export function contextFor(p, cur, s) {
  return {
    goal: p.goal, platform: cur.platform, style: cur.style, targetDuration: cur.targetDuration,
    durationNow: cur.edl.duration, shots: cur.edl.shots.length, structure: cur.edl.structure,
    scores: cur.edl.scores, directives: cur.directives, brand: { hasLogo: !!s.brand.logo, cta: s.brand.cta || null },
    profile: s.profile,
  };
}
