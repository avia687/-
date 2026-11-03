// Headless end-to-end: 10 videos + photos + music → Instagram Reel / 30s / Viral → CREATE → export.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createEngine } from '../engine/index.js';

const mediaDir = process.argv[2];
const style = process.argv[3] || 'viral';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-'));
setTimeout(() => { console.log('SMOKE TIMEOUT'); for (const l of fs.readFileSync(path.join(dataDir, 'logs', 'autoedit.log'), 'utf8').split('\n').slice(-30)) console.log(l.slice(0, 1500)); process.exit(2); }, 20 * 60 * 1000).unref();
const engine = await createEngine({ dataDir, exportDir: path.join(dataDir, 'Videos') });
const p = await engine.createProject({ name: 'Smoke test', platform: 'instagram', style, targetDuration: 30 });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(mediaDir)) {
  const tmp = path.join(dataDir, 'tmp', path.basename(f));
  fs.copyFileSync(f, tmp);
  await engine.addMedia(p.id, { tmpPath: tmp, name: path.basename(f), relPath: path.relative(mediaDir, f) });
}
const wait = (id) => new Promise((res) => {
  let last = '';
  const on = (j) => {
    if (j.id !== id) return;
    const s = `${j.status} ${j.stage} ${Math.round(j.progress * 100)}%`;
    const key = `${j.status} ${j.stage}`;
    if (key !== last) { last = key; console.log(`  [${new Date().toISOString().slice(11, 19)}] ${j.type} ${s}`); }
    if (['done', 'failed', 'cancelled'].includes(j.status)) { engine.jobs.off('update', on); res(j); }
  };
  engine.jobs.on('update', on);
});
let t0 = Date.now();
const job = engine.create(p.id, { style, targetDuration: 30, platform: 'instagram' });
const done = await wait(job.id);
console.log('CREATE', done.status, done.error || '', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
const proj = engine.store.get(p.id);
for (const m of proj.media) console.log(' media', m.relPath.padEnd(28), m.kind, String(m.role).padEnd(6), m.error || '', JSON.stringify(m.analysis?.scores));
const v = proj.versions.at(-1);
if (!v) process.exit(1);
console.log('structure', v.edl.structure, 'duration', v.edl.duration, 'shots', v.edl.shots.length);
for (const s of v.edl.shots) console.log('  ', s.start.toFixed(2).padStart(6), s.duration.toFixed(2), proj.media.find((m) => m.id === s.mediaId).relPath.padEnd(26), s.section.padEnd(7), s.zoom?.type, s.zoom?.from, s.zoom?.to, s.transition?.type, s.speed, s.sfx?.type || '', s.reason.en);
console.log('scores', JSON.stringify(v.edl.scores), 'final', JSON.stringify(v.score));
console.log('qc', JSON.stringify(v.qc));
for (const e of v.explanations) console.log(' •', e.he, '|', e.en);
t0 = Date.now();
const ex = engine.exportVideo(p.id, { versionId: v.id, preset: 'reel' });
const exDone = await wait(ex.id);
console.log('EXPORT', exDone.status, exDone.error || '', `${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(exDone.result?.qc), exDone.result?.savedTo);
console.log('DATA', dataDir, path.join(dataDir, 'projects', p.id, v.preview));
const ok = done.status === 'done' && exDone.status === 'done' && fs.existsSync(exDone.result.savedTo) && v.edl.duration > 8;
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
process.exit(ok ? 0 : 1);
