// Captions: inject a known Hebrew transcript (as Whisper would return) and render with captions.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../engine/index.js';
import { annotate } from '../engine/transcribe.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
const style = process.argv[3] || 'viral';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-'));
const engine = await createEngine({ dataDir, fontsDir: path.join(here, '..', 'assets', 'fonts') });
const p = await engine.createProject({ name: 'Captions', style, targetDuration: 15 });
const tmp = path.join(dataDir, 'tmp', 'a.mp4');
fs.copyFileSync(src, tmp);
const m = await engine.addMedia(p.id, { tmpPath: tmp, name: 'talk.mp4', relPath: 'talking/talk.mp4' });
const words = 'זה הדבר הכי חשוב שאתם צריכים לדעת על ניקוי ספות. אה תראו את ההבדל לפני ואחרי, 100 אחוז נקי! תזמינו עכשיו'.split(' ');
const tr = []; let t = 0.3;
for (const w of words) { tr.push({ w, start: t, end: t + 0.38 }); t += 0.5; if (t % 3.2 > 2.6) t += 0.7; }
await engine.store.update(p.id, (d) => { d.transcripts[m.id] = { language: 'he', text: words.join(' '), words: annotate(tr), source: 'test' }; d.media[0].transcriptWords = tr.length; });
const job = engine.create(p.id, { style, targetDuration: 15 });
await new Promise((res) => engine.jobs.on('update', (j) => j.id === job.id && ['done', 'failed'].includes(j.status) && res()));
const proj = engine.store.get(p.id);
const v = proj.versions.at(-1);
console.log(engine.jobs.get(job.id).status, v?.edl.captions, v?.score);
const out = path.join(dataDir, 'projects', p.id, v.preview);
console.log('OUT', out);
process.exit(0);
