// Orchestrator: wires analysis → (transcription) → director → render → QC into background jobs.
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { analyzeMedia } from './analysis.js';
import { direct, STYLES, chooseStyle } from './director.js';
import { renderEdl, EXPORT_PRESETS, outputSize } from './render.js';
import { inspectRender, fixEdl, finalScore } from './qc.js';
import { newId } from './store.js';
import { runFfmpeg } from './ffmpeg.js';
import { timed, log } from './log.js';
import { buildCaptions } from './captions.js';

const T = (he, en) => ({ he, en });
const ANALYSIS_VERSION = 2;

export class Pipeline {
  constructor({ store, jobs, settings, dataDir, exportDir, transcriber, fontsDir }) {
    Object.assign(this, { store, jobs, settings, dataDir, exportDir, transcriber, fontsDir });
    jobs.register('analyze', (ctx) => this.runAnalyze(ctx));
    jobs.register('create', (ctx) => this.runCreate(ctx));
    jobs.register('edit', (ctx) => this.runEdit(ctx));
    jobs.register('export', (ctx) => this.runExport(ctx));
    jobs.register('version', (ctx) => this.runVersion(ctx));
  }

  mediaPath(p, m) { return this.store.resolve(p.id, m.file); }
  cacheDir(p, m) { return this.store.resolve(p.id, path.join('cache', m.id)); }

  resolver(p) {
    return (mediaId, preferProxy) => {
      const m = p.media.find((x) => x.id === mediaId);
      if (!m) throw new Error(`missing media ${mediaId}`);
      let file = this.mediaPath(p, m);
      if (preferProxy && m.analysis?.proxy) {
        const proxy = path.join(this.cacheDir(p, m), m.analysis.proxy);
        if (fs.existsSync(proxy)) file = proxy;
      }
      return { path: file, kind: m.kind, hasAudio: !!m.analysis?.meta?.hasAudio };
    };
  }

  /** Analyze every media item that has no (current) analysis. Measured progress per file. */
  async analyzePending(projectId, ctx, from = 0, to = 1) {
    let p = this.store.get(projectId);
    const pending = p.media.filter((m) => !m.error && (!m.analysis || m.analysis.version !== ANALYSIS_VERSION));
    const weight = (m) => Math.max(1, m.sizeBytes / 1e6);
    const totalW = pending.reduce((s, m) => s + weight(m), 0) || 1;
    let doneW = 0;
    for (const m of pending) {
      ctx.progress(from + (to - from) * (doneW / totalW), 'analyzing');
      try {
        const analysis = await timed('analyze.media', { kind: m.kind }, () => analyzeMedia(this.mediaPath(p, m), m.kind, this.cacheDir(p, m), {
          signal: ctx.signal,
          onProgress: (x) => ctx.progress(from + (to - from) * ((doneW + weight(m) * x) / totalW)),
        }));
        await this.store.update(projectId, (d) => {
          const dm = d.media.find((x) => x.id === m.id);
          if (!dm) return;
          dm.analysis = analysis;
          dm.thumb = analysis.thumb ? `cache/${m.id}/${analysis.thumb}` : null;
          dm.duration = analysis.meta.duration;
        });
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        log('warn', 'analyze.media_failed', { id: m.id, error: String(err?.message || err).slice(0, 800) });
        await this.store.update(projectId, (d) => {
          const dm = d.media.find((x) => x.id === m.id);
          if (dm) dm.error = 'unreadable';
        });
      }
      doneW += weight(m);
    }
    p = this.store.get(projectId);
    return p;
  }

  async runAnalyze(ctx) {
    await this.analyzePending(ctx.job.projectId, ctx, 0, 1);
    return { ok: true };
  }

  async setPipeline(projectId, patch) {
    await this.store.update(projectId, (d) => { Object.assign(d, patch); });
  }

  async runCreate(ctx) {
    const { projectId, params } = ctx.job;
    await this.setPipeline(projectId, { status: 'working', ...pick(params, ['style', 'targetDuration', 'platform', 'goal']) });
    try {
      await this.analyzePending(projectId, ctx, 0, 0.5);
      let p = this.store.get(projectId);
      if (this.transcriber) {
        ctx.progress(0.5, 'transcribing');
        await this.transcriber.transcribePending(p, ctx, (x) => ctx.progress(0.5 + x * 0.12));
        p = this.store.get(projectId);
      }
      ctx.progress(0.62, 'directing');
      if (!STYLES[p.style]) {
        const style = chooseStyle(p);
        await this.store.update(projectId, (d) => { d.style = style; });
        p = this.store.get(projectId);
      }
      const directives = { ...(params.directives || {}) };
      const brandCfg = this.settings.get().brand;
      const version = await this.buildVersion(p, { style: p.style, platform: p.platform, targetDuration: p.targetDuration, directives, brand: brandCfg }, ctx, 0.64, 0.98, T('הגרסה הראשונה', 'First version'));
      // Alternatives: real, different EDLs for the other styles — rendered on demand.
      const alternatives = {};
      for (const style of Object.keys(STYLES)) {
        if (style === version.style) continue;
        try {
          const e = direct(p, { style, platform: p.platform, targetDuration: p.targetDuration, directives });
          alternatives[style] = { scores: e.scores, duration: e.duration };
        } catch { /* ignore */ }
      }
      await this.store.update(projectId, (d) => {
        d.versions.push(version);
        d.currentVersionId = version.id;
        d.redo = [];
        d.alternatives = alternatives;
        d.status = 'ready';
        d.aiDecisions.push({ at: new Date().toISOString(), versionId: version.id, explanations: version.explanations });
        bumpProfile(this.settings, version.style);
      });
      ctx.progress(1, 'done');
      return { versionId: version.id };
    } catch (err) {
      await this.setPipeline(projectId, { status: ctx.signal.aborted ? (this.store.get(projectId).versions.length ? 'ready' : 'draft') : 'error' });
      throw err;
    }
  }

  /** direct → (captions) → preview render → QC (auto-fix once) → version object. */
  async buildVersion(p, opts, ctx, from, to, label, request = null) {
    let edl = direct(p, opts);
    const brand = opts.brand || this.settings.get().brand;
    const id = newId('v_');
    const n = (p.versions.at(-1)?.n || 0) + 1;
    const rel = `renders/${id}_preview.mp4`;
    const out = this.store.resolve(p.id, rel);
    const span = to - from;
    let report = null;
    for (let pass = 0; pass < 2; pass++) {
      ctx.progress(from + span * (pass ? 0.55 : 0), 'rendering');
      const extra = await this.finishingAssets(p, edl, brand, opts.directives, true);
      edl.brand = { applied: !!extra.logo };
      await timed('render.preview', { shots: edl.shots.length, pass }, () => renderEdl(edl, this.resolver(p), out, {
        preview: true, preset: p.platform === 'youtube' ? 'youtube' : 'reel', signal: ctx.signal, attempt: ctx.attempt,
        workDir: this.store.resolve(p.id, 'renders'), sfxDir: path.join(this.dataDir, 'cache', 'sfx'),
        ...extra,
        onProgress: (x) => ctx.progress(from + span * (pass ? 0.55 + x * 0.3 : x * 0.7)),
      }));
      ctx.progress(from + span * (pass ? 0.9 : 0.75), 'checking');
      const expected = { ...outputSize(edl, p.platform === 'youtube' ? 'youtube' : 'reel', true), duration: edl.duration };
      report = await inspectRender(out, edl, { signal: ctx.signal, expected });
      const fixed = pass === 0 ? fixEdl(edl, report) : null;
      if (!fixed) break;
      edl = fixed;
    }
    const thumb = `renders/${id}_thumb.jpg`;
    try {
      await runFfmpeg(['-ss', String(Math.min(1.2, edl.duration / 3)), '-i', out, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', this.store.resolve(p.id, thumb)], { signal: ctx.signal });
    } catch { /* thumbnail is cosmetic */ }
    return {
      id, n, createdAt: new Date().toISOString(), label, request, thumb,
      style: edl.style, platform: edl.platform, targetDuration: edl.targetDuration, directives: edl.directives,
      edl, preview: rel, qc: summarizeQc(report), score: finalScore(edl, report, p.media), explanations: edl.explanations,
    };
  }

  async finishingAssets(p, edl, brand, directives = {}, preview = false) {
    const out = {};
    // Captions come from real transcripts only.
    if (!directives?.noCaptions && this.settings.get().flags.captions) {
      const caps = buildCaptions(p, edl, { style: directives?.captionStyle, preview, brand });
      if (caps) {
        const file = this.store.resolve(p.id, `renders/captions_${Date.now()}.ass`);
        await fsp.writeFile(file, caps.ass);
        out.captionsFile = path.basename(file);
        out.fontsDir = this.fontsDir ? path.relative(this.store.resolve(p.id, 'renders'), this.fontsDir).split(path.sep).join('/') : null;
        edl.captions = { style: caps.style, words: caps.words, qcScore: caps.qcScore };
      }
    }
    const logoPath = brand?.logo ? path.join(this.dataDir, 'brand', path.basename(brand.logo)) : null;
    const mode = directives?.logoEnd ? 'end' : brand?.logoMode;
    if (logoPath && fs.existsSync(logoPath) && mode && mode !== 'off') {
      out.logo = { path: logoPath, endOnly: mode === 'end', scale: mode === 'end' ? 0.42 : 0.16, opacity: mode === 'end' ? 1 : 0.85 };
    }
    return out;
  }

  /** Natural-language edit or setting change → new version. */
  async runEdit(ctx) {
    const { projectId, params } = ctx.job;
    await this.setPipeline(projectId, { status: 'working' });
    try {
      const p = this.store.get(projectId);
      const label = params.label || T('גרסה חדשה', 'New version');
      const version = await this.buildVersion(p, { style: params.style, platform: params.platform, targetDuration: params.targetDuration, directives: params.directives }, ctx, 0, 1, label, params.request || null);
      if (params.said?.length) version.explanations = [...params.said, ...version.explanations];
      await this.store.update(projectId, (d) => {
        d.versions.push(version);
        d.currentVersionId = version.id;
        d.redo = [];
        d.status = 'ready';
        d.style = version.style;
        d.platform = version.platform;
        d.targetDuration = version.targetDuration;
        d.aiDecisions.push({ at: new Date().toISOString(), versionId: version.id, request: params.request || null, explanations: version.explanations });
        bumpProfile(this.settings, version.style, params.ops);
      });
      return { versionId: version.id };
    } catch (err) {
      await this.setPipeline(projectId, { status: this.store.get(projectId).versions.length ? 'ready' : 'error' });
      throw err;
    }
  }

  async runVersion(ctx) { return this.runEdit(ctx); }

  /** Final render from ORIGINAL media at export quality, then QC + automatic fixes. */
  async runExport(ctx) {
    const { projectId, params } = ctx.job;
    const p = this.store.get(projectId);
    const v = p.versions.find((x) => x.id === params.versionId) || p.versions.find((x) => x.id === p.currentVersionId);
    if (!v) throw Object.assign(new Error('nothing to export'), { retryable: false });
    const preset = EXPORT_PRESETS[params.preset] ? params.preset : 'reel';
    let edl = structuredClone(v.edl);
    // Platform presets re-frame the edit (e.g. YouTube = landscape) — re-direct for a different aspect.
    const wantLandscape = preset === 'youtube';
    const isLandscape = edl.format.width > edl.format.height;
    if (wantLandscape !== isLandscape && ['reel', 'tiktok', 'shorts', 'youtube'].includes(preset)) {
      edl = direct(p, { style: v.style, platform: wantLandscape ? 'youtube' : 'instagram', targetDuration: v.targetDuration, directives: v.directives });
    }
    const safeName = p.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'AutoEdit';
    const fileName = `${safeName} - ${EXPORT_PRESETS[preset].label} v${v.n}.mp4`;
    const rel = `exports/${v.id}_${preset}.mp4`;
    const out = this.store.resolve(p.id, rel);
    const brand = this.settings.get().brand;
    let report = null;
    for (let pass = 0; pass < 2; pass++) {
      const extra = await this.finishingAssets(p, edl, brand, v.directives, false);
      await timed('render.final', { preset, pass }, () => renderEdl(edl, this.resolver(p), out, {
        preview: false, preset, signal: ctx.signal, attempt: ctx.attempt,
        workDir: this.store.resolve(p.id, 'renders'), sfxDir: path.join(this.dataDir, 'cache', 'sfx'), ...extra,
        onProgress: (x) => ctx.progress((pass ? 0.5 : 0) + x * (pass ? 0.4 : 0.85), 'rendering'),
      }));
      ctx.progress(pass ? 0.92 : 0.87, 'checking');
      report = await inspectRender(out, edl, { signal: ctx.signal, expected: { ...outputSize(edl, preset, false), duration: edl.duration } });
      const fixed = pass === 0 ? fixEdl(edl, report) : null;
      if (!fixed) break;
      edl = fixed;
    }
    // Loudness / clipping fix: re-encode audio only (video is copied untouched).
    const loud = report.issues.find((i) => i.code === 'loudness' || i.code === 'clipping');
    if (loud && report.loudness != null) {
      const target = edl.audio?.sourceMode === 'dialog' || edl.audio?.music ? -14 : -18;
      const gain = Math.max(-12, Math.min(12, target - report.loudness));
      const tmp = out + '.fix.mp4';
      await runFfmpeg(['-i', out, '-c:v', 'copy', '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp], { signal: ctx.signal });
      await fsp.rename(tmp, out);
      for (const i of report.issues) if (i.code === 'loudness' || i.code === 'clipping') i.fixed = true;
    }
    ctx.progress(0.96, 'saving');
    let savedTo = null;
    if (this.exportDir) {
      await fsp.mkdir(this.exportDir, { recursive: true });
      savedTo = uniquePath(path.join(this.exportDir, fileName));
      await fsp.copyFile(out, savedTo);
    }
    const record = { id: newId('e_'), versionId: v.id, preset, file: rel, savedTo, fileName, createdAt: new Date().toISOString(), qc: summarizeQc(report), score: finalScore(edl, report, p.media) };
    await this.store.update(projectId, (d) => { d.exports.push(record); });
    return record;
  }
}

function uniquePath(file) {
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file);
  const base = file.slice(0, -ext.length);
  for (let i = 2; i < 1000; i++) if (!fs.existsSync(`${base} (${i})${ext}`)) return `${base} (${i})${ext}`;
  return `${base} ${Date.now()}${ext}`;
}

function summarizeQc(report) {
  if (!report) return null;
  return {
    ok: report.issues.every((i) => i.fixed),
    loudness: report.loudness,
    peak: report.peak,
    issues: report.issues.map((i) => ({ code: i.code, msg: i.msg, at: i.at ?? null, fixed: !!i.fixed })),
  };
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o?.[k] !== undefined) out[k] = o[k];
  return out;
}

/** User Editing Profile: learns preferred styles and common requests over time. */
function bumpProfile(settings, style, ops = []) {
  const prof = structuredClone(settings.get().profile || { styles: {}, edits: {} });
  prof.styles[style] = (prof.styles[style] || 0) + 1;
  for (const o of ops || []) prof.edits[o.op] = (prof.edits[o.op] || 0) + 1;
  settings.update({ profile: prof }).catch(() => {});
}
