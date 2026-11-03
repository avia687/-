// Media Intelligence: every number here is MEASURED from the file (ffmpeg filters), never invented.
import path from 'node:path';

import fsp from 'node:fs/promises';
import { runFfmpeg, probe } from './ffmpeg.js';

export const SAMPLE = 0.5; // analysis resolution in seconds

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Parse ffmpeg metadata=print output into [{t, k:v}] */
export function parseMetadataFile(text) {
  const frames = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('frame:')) {
      const m = /pts_time:([\d.]+)/.exec(line);
      cur = { t: m ? Number(m[1]) : 0 };
      frames.push(cur);
    } else if (cur && line.includes('=')) {
      const i = line.indexOf('=');
      const val = Number(line.slice(i + 1));
      if (Number.isFinite(val)) cur[line.slice(0, i).replace(/^lavfi\./, '')] = val;
    }
  }
  return frames;
}

export function parseIntervals(stderr, startKey, endKey) {
  const out = [];
  let start = null;
  const re = new RegExp(`${startKey}[:=]\\s*([\\d.]+)|${endKey}[:=]\\s*([\\d.]+)`, 'g');
  let m;
  while ((m = re.exec(stderr))) {
    if (m[1] !== undefined) start = Number(m[1]);
    else if (m[2] !== undefined && start !== null) { out.push([start, Number(m[2])]); start = null; }
  }
  return { intervals: out, openStart: start };
}

function parseBlack(stderr) {
  const out = [];
  const re = /black_start:([\d.]+)\s+black_end:([\d.]+)/g;
  let m;
  while ((m = re.exec(stderr))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

function parseLoudness(stderr) {
  const idx = stderr.lastIndexOf('Summary:');
  const s = idx >= 0 ? stderr.slice(idx) : '';
  const num = (re) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  return { integrated: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), peak: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

const inAny = (t, list) => list.some(([a, b]) => t >= a && t < b);

/** Full analysis of one media file. Writes thumbnail + preview proxy into outDir. */
export async function analyzeMedia(file, kind, outDir, { signal, onProgress = () => {} } = {}) {
  await fsp.mkdir(outDir, { recursive: true });
  const meta = await probe(file);
  if (kind === 'image') return analyzeImage(file, meta, outDir, { signal });
  if (kind === 'audio') return analyzeAudio(file, meta, outDir, { signal, onProgress });

  const duration = meta.duration || 0.1;
  const vMeta = 'v.meta.txt';
  const aMeta = 'a.meta.txt';
  const chains = [];
  const maps = [];
  if (meta.hasVideo) {
    chains.push(`[0:v]fps=${1 / SAMPLE},scale=320:-2,blackdetect=d=0.4:pix_th=0.10,freezedetect=n=-50dB:d=1.5,signalstats,blurdetect=block_width=32:block_height=32,scdet=threshold=12,metadata=print:file=${vMeta}[vo]`);
    maps.push('-map', '[vo]', '-f', 'null', '-');
  }
  if (meta.hasAudio) {
    chains.push(`[0:a]aresample=16000,silencedetect=n=-38dB:d=0.35,asetnsamples=n=${16000 * SAMPLE},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=${aMeta},ebur128=peak=true:framelog=verbose[ao]`);
    maps.push('-map', '[ao]', '-f', 'null', '-');
  }
  const { stderr } = await runFfmpeg(['-i', file, '-filter_complex', chains.join(';'), ...maps], {
    duration, signal, cwd: outDir, onProgress: (p) => onProgress(p * 0.55),
  });

  const vFrames = meta.hasVideo ? parseMetadataFile(await readAndRemove(path.join(outDir, vMeta))) : [];
  const aFrames = meta.hasAudio ? parseMetadataFile(await readAndRemove(path.join(outDir, aMeta))) : [];
  const silence = parseIntervals(stderr, 'silence_start', 'silence_end');
  const silences = silence.intervals;
  if (silence.openStart !== null) silences.push([silence.openStart, duration]);
  const freeze = parseIntervals(stderr, 'freeze_start', 'freeze_end');
  const frozen = freeze.intervals;
  if (freeze.openStart !== null) frozen.push([freeze.openStart, duration]);
  const black = parseBlack(stderr);
  const loudness = meta.hasAudio ? parseLoudness(stderr) : null;

  // Merge into one timeline of SAMPLE-second points.
  const n = Math.max(1, Math.ceil(duration / SAMPLE));
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t = i * SAMPLE;
    const vf = vFrames[i] || vFrames[vFrames.length - 1] || {};
    const af = aFrames[i] || {};
    const rms = Number.isFinite(af['astats.Overall.RMS_level']) ? af['astats.Overall.RMS_level'] : -90;
    samples.push({
      t,
      y: vf['signalstats.YAVG'] ?? null,
      sat: vf['signalstats.SATAVG'] ?? null,
      motion: i === 0 ? 0 : (vf['signalstats.YDIF'] ?? 0),
      blur: vf.blur ?? null,
      scene: vf['scd.score'] ?? 0,
      rms: meta.hasAudio ? Math.max(-90, rms) : null,
      silent: meta.hasAudio ? inAny(t + SAMPLE / 2, silences) : true,
      black: inAny(t + SAMPLE / 2, black),
      frozen: inAny(t + SAMPLE / 2, frozen),
    });
  }

  onProgress(0.6);
  const sceneCuts = samples.filter((s) => s.scene >= 12).map((s) => s.t);
  const speechRatio = meta.hasAudio ? samples.filter((s) => !s.silent).length / n : 0;
  const scores = scoreClip(meta, samples, loudness, speechRatio);
  const bestMoment = findBestWindow(samples, Math.min(Math.max(3, duration / 3), 8));
  const thumbAt = bestMoment ? bestMoment.start + Math.min(1, (bestMoment.end - bestMoment.start) / 2) : duration / 2;

  await runFfmpeg(['-ss', String(Math.max(0, thumbAt)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', 'thumb.jpg'], { signal, cwd: outDir });
  await runFfmpeg(['-ss', String(Math.max(0, duration / 2)), '-i', file, '-frames:v', '1', '-vf', 'scale=9:8,format=gray', '-f', 'rawvideo', 'dhash.raw'], { signal, cwd: outDir });
  const dhash = dHashFromRaw(await readAndRemove(path.join(outDir, 'dhash.raw'), null));

  // Preview proxy: lightweight H.264 copy that plays everywhere (phones shoot HEVC/ProRes).
  await runFfmpeg([
    '-i', file, '-vf', "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)',fps=30",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p',
    ...(meta.hasAudio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an']),
    '-movflags', '+faststart', 'proxy.mp4',
  ], { duration, signal, cwd: outDir, onProgress: (p) => onProgress(0.6 + p * 0.4) });

  return {
    version: 2,
    meta,
    samples,
    silences,
    black,
    frozen,
    sceneCuts,
    loudness,
    speechRatio: round(speechRatio * 100) / 100,
    scores,
    bestMoment,
    dhash,
    thumb: 'thumb.jpg',
    proxy: 'proxy.mp4',
  };
}

async function readAndRemove(file, enc = 'utf8') {
  try {
    const data = await fsp.readFile(file, enc);
    await fsp.rm(file, { force: true });
    return data;
  } catch { return enc ? '' : Buffer.alloc(0); }
}

export function dHashFromRaw(buf) {
  if (!buf || buf.length < 72) return null;
  let bits = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) bits += buf[r * 9 + c] > buf[r * 9 + c + 1] ? '1' : '0';
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

export function hamming(a, b) {
  if (!a || !b) return 64;
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** Per-sample "how good is this moment" 0..1 (visual + audio energy, penalizing bad frames). */
export function momentScore(s, hasAudio) {
  if (s.black || s.frozen) return 0;
  const exposure = s.y == null ? 0.6 : 1 - Math.min(1, Math.abs(s.y - 120) / 100);
  const sharp = s.blur == null ? 0.6 : clamp(1 - (s.blur - 3) / 9, 0, 1);
  const motion = clamp(s.motion / 12, 0, 1) * (s.motion > 40 ? 0.4 : 1); // some motion good, shaky bad
  const energy = hasAudio && s.rms != null ? clamp((s.rms + 45) / 30, 0, 1) * (s.silent ? 0.2 : 1) : 0.5;
  return 0.25 * exposure + 0.3 * sharp + 0.15 * motion + 0.3 * energy;
}

export function findBestWindow(samples, seconds) {
  const w = Math.max(1, Math.round(seconds / SAMPLE));
  if (!samples.length) return null;
  const hasAudio = samples.some((s) => s.rms != null);
  const vals = samples.map((s) => momentScore(s, hasAudio));
  let best = -1;
  let bestI = 0;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= w) sum -= vals[i - w];
    if (i >= w - 1 && sum > best) { best = sum; bestI = i - w + 1; }
  }
  if (best < 0) { best = sum; bestI = 0; }
  const win = Math.min(w, vals.length);
  return { start: bestI * SAMPLE, end: Math.min(samples.length, bestI + win) * SAMPLE, score: round((best / win) * 100) };
}

export function scoreClip(meta, samples, loudness, speechRatio) {
  const short = Math.min(meta.width, meta.height);
  const res = short >= 1080 ? 100 : short >= 720 ? 85 : short >= 480 ? 60 : 40;
  const blurs = samples.map((s) => s.blur).filter((b) => b != null);
  const sharp = blurs.length ? clamp(100 - (mean(blurs) - 3) * 11) : 60;
  const ys = samples.map((s) => s.y).filter((y) => y != null);
  const exposure = ys.length ? clamp(100 - Math.abs(mean(ys) - 120) * 1.1) : 60;
  const sats = samples.map((s) => s.sat).filter((v) => v != null);
  const color = sats.length ? clamp(40 + Math.min(60, Math.abs(mean(sats) - 128) * 1.5 + 20)) : 60;
  const fpsScore = meta.fps >= 23 ? 100 : meta.fps >= 15 ? 70 : 40;
  const bad = samples.filter((s) => s.black || s.frozen).length / Math.max(1, samples.length);
  const motions = samples.slice(1).map((s) => s.motion);
  const shake = clamp((mean(motions) - 25) * 3, 0, 40);

  const technical = round(clamp(0.35 * res + 0.35 * sharp + 0.15 * fpsScore + 15 * (1 - bad) - shake * 0.3));
  const visual = round(clamp(0.4 * exposure + 0.25 * color + 0.35 * sharp - shake * 0.4));

  let audio = null;
  if (meta.hasAudio && loudness?.integrated != null && loudness.integrated > -70) {
    const level = clamp(100 - Math.max(0, Math.abs(loudness.integrated + 16) - 4) * 5);
    const clip = loudness.peak != null && loudness.peak > -0.5 ? 60 : 100;
    const speech = speechRatio > 0.3 ? 100 : 60 + speechRatio * 130;
    audio = round(clamp(0.5 * level + 0.25 * clip + 0.25 * speech));
  }

  // Energy: variation in sound + movement — a measurable stand-in for "how lively" a clip feels.
  const rmsVals = samples.map((s) => s.rms).filter((v) => v != null && v > -80);
  const rmsSpread = rmsVals.length ? Math.sqrt(mean(rmsVals.map((v) => (v - mean(rmsVals)) ** 2))) : 0;
  const energy = round(clamp(30 + rmsSpread * 4 + Math.min(30, mean(motions) * 2)));

  const hookWin = findBestWindow(samples, 3);
  const hook = round(clamp((hookWin?.score ?? 50) * 0.8 + (samples.some((s) => s.scene >= 12) ? 10 : 0) + (speechRatio > 0.3 ? 10 : 0)));

  const parts = [technical, visual, hook, energy, ...(audio != null ? [audio] : [])];
  return { technical, visual, audio, energy, hook, story: null, total: round(mean(parts)) };
}

async function analyzeImage(file, meta, outDir, { signal }) {
  await runFfmpeg(['-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', 'thumb.jpg'], { signal, cwd: outDir });
  const { stderr } = await runFfmpeg(['-i', file, '-frames:v', '1', '-vf', 'scale=320:-2,signalstats,blurdetect,metadata=print:file=i.meta.txt', '-f', 'null', '-'], { signal, cwd: outDir });
  void stderr;
  const f = parseMetadataFile(await readAndRemove(path.join(outDir, 'i.meta.txt')))[0] || {};
  await runFfmpeg(['-i', file, '-frames:v', '1', '-vf', 'scale=9:8,format=gray', '-f', 'rawvideo', 'dhash.raw'], { signal, cwd: outDir });
  const dhash = dHashFromRaw(await readAndRemove(path.join(outDir, 'dhash.raw'), null));
  const samples = [{ t: 0, y: f['signalstats.YAVG'] ?? null, sat: f['signalstats.SATAVG'] ?? null, motion: 0, blur: f.blur ?? null, scene: 0, rms: null, silent: true, black: false, frozen: false }];
  const scores = scoreClip({ ...meta, fps: 30 }, samples, null, 0);
  return { version: 2, meta: { ...meta, duration: 0 }, samples, silences: [], black: [], frozen: [], sceneCuts: [], loudness: null, speechRatio: 0, scores, bestMoment: null, dhash, thumb: 'thumb.jpg', proxy: null };
}

async function analyzeAudio(file, meta, outDir, { signal, onProgress }) {
  const { stderr } = await runFfmpeg(['-i', file, '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-'], { duration: meta.duration, signal, onProgress: (p) => onProgress(p * 0.5) });
  const loudness = parseLoudness(stderr);
  const beats = await detectBeats(file, meta.duration, outDir, { signal, onProgress: (p) => onProgress(0.5 + p * 0.5) });
  return { version: 2, meta, samples: [], silences: [], black: [], frozen: [], sceneCuts: [], loudness, speechRatio: 0, scores: null, bestMoment: null, dhash: null, thumb: null, proxy: null, beats };
}

/**
 * Beat detection: decode mono PCM, compute onset strength (energy flux) at ~86Hz,
 * estimate tempo by autocorrelation (70–180 BPM), then phase-align a beat grid.
 */
export async function detectBeats(file, duration, outDir, { signal, onProgress } = {}) {
  const raw = path.join(outDir, 'pcm.raw');
  await runFfmpeg(['-i', file, '-ac', '1', '-ar', '11025', '-f', 's16le', 'pcm.raw'], { duration, signal, cwd: outDir, onProgress });
  const buf = await readAndRemove(raw, null);
  return beatsFromPcm(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2)), 11025);
}

export function beatsFromPcm(pcm, sr) {
  const hop = 128;
  const frames = Math.floor(pcm.length / hop);
  if (frames < 50) return { bpm: null, beats: [], confidence: 0 };
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) s += (pcm[i] / 32768) ** 2;
    env[f] = Math.log1p(1000 * s / hop);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);
  const fps = sr / hop;
  const minLag = Math.round((fps * 60) / 180);
  const maxLag = Math.round((fps * 60) / 70);
  let bestLag = 0;
  let bestVal = 0;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let v = 0;
    for (let f = lag; f < frames; f++) v += onset[f] * onset[f - lag];
    total += v;
    if (v > bestVal) { bestVal = v; bestLag = lag; }
  }
  if (!bestLag) return { bpm: null, beats: [], confidence: 0 };
  let bestPhase = 0;
  let bestPhaseVal = -1;
  for (let ph = 0; ph < bestLag; ph++) {
    let v = 0;
    for (let f = ph; f < frames; f += bestLag) v += onset[f];
    if (v > bestPhaseVal) { bestPhaseVal = v; bestPhase = ph; }
  }
  const beats = [];
  for (let f = bestPhase; f < frames; f += bestLag) beats.push(Math.round((f / fps) * 1000) / 1000);
  const avg = total / (maxLag - minLag + 1);
  return { bpm: Math.round((60 * fps) / bestLag), beats, confidence: Math.round(Math.min(1, (bestVal / (avg || 1) - 1) / 2) * 100) / 100 };
}

/** Group near-identical clips (same shot uploaded twice / duplicate takes). */
export function findDuplicates(media) {
  const groups = [];
  const vids = media.filter((m) => m.analysis?.dhash && (m.kind === 'video' || m.kind === 'image'));
  const seen = new Set();
  for (let i = 0; i < vids.length; i++) {
    if (seen.has(vids[i].id)) continue;
    const g = [vids[i].id];
    for (let j = i + 1; j < vids.length; j++) {
      const a = vids[i].analysis; const b = vids[j].analysis;
      const sameLen = Math.abs((a.meta.duration || 0) - (b.meta.duration || 0)) < 0.6;
      // Same framing but different light/colour = a before/after pair, NOT a duplicate.
      const ya = a.samples?.[0]?.y; const yb = b.samples?.[0]?.y;
      const sa = a.samples?.[0]?.sat; const sb = b.samples?.[0]?.sat;
      const sameLook = (ya == null || yb == null || Math.abs(ya - yb) < 8) && (sa == null || sb == null || Math.abs(sa - sb) < 8);
      const tags = (m) => (/(before|לפני)/i.test(m.relPath || '') ? 'b' : /(after|אחרי)/i.test(m.relPath || '') ? 'a' : '');
      const differentRole = tags(vids[i]) && tags(vids[j]) && tags(vids[i]) !== tags(vids[j]);
      if (hamming(a.dhash, b.dhash) <= 5 && sameLen && sameLook && !differentRole) { g.push(vids[j].id); seen.add(vids[j].id); }
    }
    if (g.length > 1) groups.push(g);
  }
  return groups;
}

