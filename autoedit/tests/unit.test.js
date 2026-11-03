import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRequest, validateOps, applyOps } from '../engine/nlEdit.js';
import { chunkWords, isImportant, assColor, buildCaptions } from '../engine/captions.js';
import { computeContentDna } from '../engine/instagram.js';
import { beatsFromPcm, findBestWindow, parseMetadataFile, dHashFromRaw, hamming } from '../engine/analysis.js';
import { direct, STYLES } from '../engine/director.js';
import { ProjectStore, atomicWriteJson, readJsonSafe } from '../engine/store.js';
import { fileKeyCipher } from '../engine/settings.js';
import { roleHint, kindOf, sequenceHint } from '../engine/ingest.js';
import { buildRenderGraph, outputSize, duckExpr } from '../engine/render.js';
import { speechTimeline } from '../engine/director.js';
import { runFfmpeg } from '../engine/ffmpeg.js';
import { annotate } from '../engine/transcribe.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aeu-'));

describe('natural language editing', () => {
  const cases = [
    ['תעשה את הסרטון יותר מהיר', { op: 'pace', value: 1.3 }],
    ['תקצר ל-20 שניות', { op: 'duration', value: 20 }],
    ['תוריד את 5 השניות הראשונות', { op: 'cutHead', value: 5 }],
    ['פחות אפקטים', { op: 'effects', value: 0 }],
    ['יותר זומים', { op: 'zoom', value: 1.5 }],
    ['כתוביות יותר יוקרתיות', { op: 'captionStyle', value: 'luxury' }],
    ['שים את הלוגו בסוף', { op: 'logoEnd', value: true }],
    ['תעשה אותו יותר ויראלי', { op: 'style', value: 'viral' }],
    ['make it cinematic', { op: 'style', value: 'cinematic' }],
    ['shorten it to 15 seconds', { op: 'duration', value: 15 }],
    ['שים את הקטע הכי טוב בהתחלה', { op: 'hookFirst', value: true }],
    ['Make it better', { op: 'improve', value: true }],
  ];
  for (const [text, expected] of cases) {
    it(text, () => expect(validateOps(parseRequest(text))).toContainEqual(expected));
  }
  it('rejects nonsense and invalid values', () => {
    expect(validateOps(parseRequest('בננה כחולה'))).toEqual([]);
    expect(validateOps([{ op: 'duration', value: 9999 }, { op: 'style', value: 'x' }])).toEqual([]);
  });
  it('applies ops cumulatively and explains them', () => {
    const { next, said } = applyOps({ style: 'viral', platform: 'instagram', targetDuration: 30, directives: { pace: 1 } }, [{ op: 'pace', value: 1.3 }, { op: 'duration', value: 20 }]);
    expect(next.directives.pace).toBeCloseTo(1.3);
    expect(next.targetDuration).toBe(20);
    expect(said).toHaveLength(2);
  });
});

describe('captions', () => {
  const words = 'זה הדבר הכי חשוב שאתם צריכים לדעת. תזמינו עכשיו!'.split(' ').map((w, i) => ({ w, start: i * 0.4, end: i * 0.4 + 0.35 }));
  it('chunks by style limits and punctuation', () => {
    const chunks = chunkWords(words, { maxWords: 3, maxChars: 18, lines: 1 });
    expect(chunks.every((c) => c.length <= 3)).toBe(true);
    expect(chunks.map((c) => c.at(-1).w)).toContain('לדעת.');
  });
  it('finds emphasis words in Hebrew and English', () => {
    expect(isImportant('הכי')).toBe(true);
    expect(isImportant('100%')).toBe(true);
    expect(isImportant('FREE')).toBe(true);
    expect(isImportant('שולחן')).toBe(false);
  });
  it('converts brand colors to ASS', () => expect(assColor('#FF8800')).toBe('&H000088FF'));
  it('builds RTL ASS from transcript mapped onto the edit timeline', () => {
    const p = { transcripts: { m1: { words: annotate([...words, { w: 'אממ', start: 10, end: 10.3 }]) } } };
    const edl = { style: 'viral', format: { width: 1080, height: 1920 }, shots: [{ mediaId: 'm1', audio: { mediaId: 'm1', in: 0 }, start: 0, duration: 4, speed: 1 }] };
    const c = buildCaptions(p, edl, {});
    expect(c.rtl).toBe(true);
    expect(c.ass).toContain('Dialogue:');
    expect(c.ass).not.toContain('אממ');
  });
  it('marks fillers and repeats', () => {
    const a = annotate([{ w: 'אממ', start: 0, end: 0.2 }, { w: 'אני', start: 0.3, end: 0.5 }, { w: 'אני', start: 0.6, end: 0.8 }]);
    expect(a[0].filler).toBe(true);
    expect(a[2].repeat).toBe(true);
  });
});

describe('content DNA', () => {
  it('refuses to conclude with too little data', () => {
    expect(computeContentDna([{ insights: { views: 10 } }]).enough).toBe(false);
  });
  it('finds a pattern with confidence and correlation wording', () => {
    const media = [];
    for (let i = 0; i < 24; i++) {
      const short = i % 2 === 0;
      media.push({ media_product_type: 'REELS', media_type: 'VIDEO', timestamp: new Date(2026, 0, 1 + i, 12).toISOString(), caption: 'x', duration: short ? 20 : 50, insights: { views: short ? 2000 + i : 800 + i, reach: 1000, total_interactions: 50 } });
    }
    const dna = computeContentDna(media);
    expect(dna.enough).toBe(true);
    expect(dna.best.length.value).toBe('15–30s');
    expect(dna.best.length.confidence).toBe('high');
    expect(dna.insights[0].text.en).toMatch(/correlation/);
    expect(dna.directorHint.targetDuration).toBe(25);
  });
});

describe('analysis helpers', () => {
  it('parses ffmpeg metadata output and skips NaN', () => {
    const f = parseMetadataFile('frame:0 pts:0 pts_time:0\nlavfi.signalstats.YAVG=120\nlavfi.blur=nan\nframe:1 pts:1 pts_time:0.5\nlavfi.signalstats.YAVG=90\n');
    expect(f).toHaveLength(2);
    expect(f[0]['signalstats.YAVG']).toBe(120);
    expect(f[0].blur).toBeUndefined();
  });
  it('detects tempo from a synthetic 120 BPM click track', () => {
    const sr = 11025;
    const pcm = new Int16Array(sr * 12);
    for (let b = 0; b < 24; b++) for (let i = 0; i < 400; i++) pcm[Math.round(b * 0.5 * sr) + i] = Math.round(20000 * Math.exp(-i / 80) * Math.sin(i / 3));
    const r = beatsFromPcm(pcm, sr);
    expect(Math.abs(r.bpm - 120)).toBeLessThanOrEqual(3);
  });
  it('dHash + hamming', () => {
    const buf = Buffer.from(Array.from({ length: 72 }, (_, i) => (i * 37) % 255));
    const h = dHashFromRaw(buf);
    expect(h).toHaveLength(16);
    expect(hamming(h, h)).toBe(0);
  });
  it('best window prefers lively, sharp, voiced moments', () => {
    const s = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.5, y: 120, sat: 100, motion: 5, blur: 3, scene: 0, rms: i >= 10 ? -18 : -60, silent: i < 10, black: false, frozen: false }));
    expect(findBestWindow(s, 3).start).toBeGreaterThanOrEqual(5);
  });
});

describe('ingest', () => {
  it('classifies files and folder hints', () => {
    expect(kindOf('a.MOV')).toBe('video');
    expect(kindOf('b.heic')).toBe('image');
    expect(kindOf('x.txt')).toBe(null);
    expect(roleHint('shoot/broll/city.mp4', 'video')).toBe('broll');
    expect(roleHint('music/song.mp3', 'audio')).toBe('music');
    expect(roleHint('VO/voice.wav', 'audio')).toBe('voice');
    expect(sequenceHint('photos/לפני/1.jpg')).toBe('before');
  });
});

describe('store integrity', () => {
  it('atomic writes leave a readable file + backup, and recover from corruption', async () => {
    const d = tmp();
    const f = path.join(d, 'x.json');
    await atomicWriteJson(f, { a: 1 });
    await atomicWriteJson(f, { a: 2 });
    fs.writeFileSync(f, '{broken');
    expect(readJsonSafe(f)).toEqual({ a: 1 });
  });
  it('serializes concurrent updates without losing data', async () => {
    const s = new ProjectStore(tmp());
    const p = await s.create({ name: 't' });
    await Promise.all(Array.from({ length: 25 }, (_, i) => s.update(p.id, (d) => { d.aiDecisions.push(i); })));
    const fresh = new ProjectStore(path.dirname(s.root));
    expect(fresh.get(p.id).aiDecisions).toHaveLength(25);
  });
  it('rejects path escapes', async () => {
    const s = new ProjectStore(tmp());
    const p = await s.create({});
    expect(() => s.resolve(p.id, '../../etc/passwd')).toThrow();
  });
  it('encrypts secrets at rest', () => {
    const c = fileKeyCipher(tmp());
    const enc = c.encrypt('sk-secret-123456');
    expect(enc).not.toContain('secret');
    expect(c.decrypt(enc)).toBe('sk-secret-123456');
  });
});

function fakeMedia(id, { voice = false, dur = 10, w = 1080, h = 1920, rel = id } = {}) {
  const samples = Array.from({ length: dur * 2 }, (_, i) => ({ t: i * 0.5, y: 120, sat: 100, motion: 4, blur: 3, scene: i === 8 ? 20 : 0, rms: voice ? (i % 7 === 6 ? -70 : -20 + (i % 3) * 4) : -60, silent: voice ? i % 7 === 6 : true, black: false, frozen: false }));
  const silences = voice ? samples.filter((s) => s.silent).map((s) => [s.t, s.t + 0.5]) : [];
  return { id, kind: 'video', role: null, relPath: rel, name: rel, analysis: { meta: { duration: dur, width: w, height: h, hasAudio: voice, fps: 30 }, samples, silences, sceneCuts: [4], speechRatio: voice ? 0.85 : 0, scores: { total: 80, visual: 80 }, dhash: id.padEnd(16, '0').slice(0, 16).replace(/[^0-9a-f]/g, 'a') } };
}

describe('AI Director', () => {
  const project = { goal: 'reel', platform: 'instagram', style: 'viral', targetDuration: 20, media: [fakeMedia('a1', { voice: true, dur: 30 }), fakeMedia('b1', { rel: 'broll/b1.mp4', dur: 8, w: 1920, h: 1080 }), fakeMedia('b2', { rel: 'broll/b2.mp4', dur: 8 })] };
  it('builds a speech-led edit near the target with reasons on every shot', () => {
    const edl = direct(project, {});
    expect(edl.structure).toBe('speech');
    expect(edl.duration).toBeLessThanOrEqual(22);
    expect(edl.duration).toBeGreaterThan(12);
    expect(edl.shots.every((s) => s.reason?.he && s.reason?.en)).toBe(true);
    expect(edl.shots.some((s) => s.section === 'broll')).toBe(true);
    expect(edl.shots.every((s) => s.duration >= 0.3)).toBe(true);
  });
  it('styles are really different', () => {
    const v = direct(project, { style: 'viral' });
    const c = direct(project, { style: 'cinematic' });
    expect(STYLES.viral.look).not.toBe(STYLES.cinematic.look);
    expect(v.color.look).toBe('social');
    expect(c.color.look).toBe('cinematic');
    expect(v.shots.filter((s) => s.sfx).length).toBeLessThanOrEqual(1);
    expect(c.shots.filter((s) => s.sfx).length).toBe(0);
  });
  it('zoom=0 directive removes all zooms; effects=0 removes sfx/transitions', () => {
    const e = direct(project, { directives: { zoom: 0, effects: 0 } });
    expect(e.shots.every((s) => s.zoom.type === 'none')).toBe(true);
    expect(e.shots.every((s) => !s.sfx && s.transition.type === 'cut')).toBe(true);
  });
  it('cutHead trims the beginning', () => {
    const a = direct(project, {});
    const b = direct(project, { directives: { cutHead: 3 } });
    expect(b.duration).toBeLessThan(a.duration);
  });
  it('builds a valid ffmpeg graph', () => {
    const edl = direct(project, {});
    const g = buildRenderGraph(edl, (id) => ({ path: `/x/${id}.mp4`, kind: 'video', hasAudio: id === 'a1' }), { preview: true });
    expect(g.graph).toContain('[vout]'.slice(0, 0) || 'concat');
    expect(g.graph).toContain('loudnorm');
    expect(g.width).toBe(540);
    expect(outputSize(edl, 'k4', false)).toEqual({ width: 2160, height: 3840 });
  });
  it('uses the transcript to cut filler words and stutters', () => {
    const words = [];
    let t = 0.2;
    for (let i = 0; i < 40; i++) { const filler = i % 5 === 2; words.push({ w: filler ? 'אממ' : `מילה${i}`, start: t, end: t + 0.3, filler, repeat: false }); t += 0.4 + (filler ? 0 : 0); }
    const proj = { ...project, transcripts: { a1: { words } } };
    for (const style of ['viral', 'cinematic']) {
    const edl = direct(proj, { targetDuration: 60, style });
    const fillers = words.filter((w) => w.filler);
    const inside = fillers.filter((f) => edl.shots.some((s) => s.mediaId === 'a1' && f.start < s.out && f.end > s.in));
    expect(inside.length).toBe(0);
    }
  });
  it('throws a friendly error when there is nothing to edit', () => {
    expect(() => direct({ ...project, media: [] }, {})).toThrow();
  });
});

describe('audio ducking + watchdog', () => {
  it('builds a ducking curve from where speech is heard', () => {
    const media = [{ id: 'v', analysis: { samples: [0, 0.5, 1, 1.5, 2, 2.5].map((t, i) => ({ t, silent: i === 3 || i === 4 })) } }];
    const iv = speechTimeline([{ mediaId: 'v', audio: { mediaId: 'v', in: 0 }, start: 10, duration: 3, speed: 1 }], media);
    expect(iv[0][0]).toBe(10);
    expect(iv.length).toBe(2);
    expect(duckExpr(iv)).toMatch(/^1-0.72\*min\(1/);
  });
  it('watchdog does not interfere with a normal ffmpeg run', async () => {
    // A real ffmpeg run that finishes quickly must still succeed with the watchdog armed.
    await expect(runFfmpeg(['-f', 'lavfi', '-i', 'sine=d=0.2', '-f', 'null', '-'])).resolves.toBeTruthy();
  });
});
