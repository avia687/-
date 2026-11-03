// Transcription: speech → words with timestamps (Hebrew, English, mixed). Uses OpenAI's speech-to-text
// when the user adds a key (Settings → AI Services). Results are cached by file fingerprint so the same
// footage is never sent twice.
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { runFfmpeg } from './ffmpeg.js';
import { log } from './log.js';

export const FILLERS = /^(אה+|אמ+|אממ+|אהם|כאילו|נו|uh+|um+|umm+|erm|hmm+|like|you know)[.,!?]?$/i;

async function fingerprint(file) {
  const st = await fsp.stat(file);
  const fh = await fsp.open(file, 'r');
  const h = crypto.createHash('sha1');
  try {
    const size = Math.min(4 * 1024 * 1024, st.size);
    const buf = Buffer.alloc(size);
    await fh.read(buf, 0, size, 0);
    h.update(buf);
    if (st.size > size) { await fh.read(buf, 0, size, st.size - size); h.update(buf); }
  } finally { await fh.close(); }
  h.update(String(st.size));
  return h.digest('hex');
}

/** Mark filler words, repeats and long pauses — used by smart cutting and captions. */
export function annotate(words) {
  const out = words.map((w) => ({ ...w }));
  for (let i = 0; i < out.length; i++) {
    const w = out[i];
    w.filler = FILLERS.test(w.w.trim());
    const norm = (x) => x?.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (i > 0 && norm(w) && norm(w) === norm(out[i - 1])) w.repeat = true; // "I I think"
    w.pauseBefore = i > 0 ? Math.max(0, w.start - out[i - 1].end) : 0;
  }
  return out;
}

export class Transcriber {
  constructor({ store, settings, dataDir }) {
    this.store = store;
    this.settings = settings;
    this.cacheDir = path.join(dataDir, 'cache', 'transcripts');
  }

  available() { return !!this.settings.getSecret('openai'); }

  /** Which clips contain speech worth transcribing. */
  candidates(p) {
    return p.media.filter((m) => !m.error && m.analysis?.meta?.hasAudio && (m.kind === 'video' || m.role === 'voice')
      && (m.role === 'aroll' || m.role === 'voice' || (m.role == null && m.analysis.speechRatio >= 0.3)) && !p.transcripts?.[m.id]);
  }

  async transcribePending(p, ctx, onProgress) {
    const list = this.candidates(p);
    if (!list.length) return;
    if (!this.available()) return; // honest: no key → no captions; UI explains how to enable
    await fsp.mkdir(this.cacheDir, { recursive: true });
    let i = 0;
    for (const m of list) {
      onProgress(i / list.length);
      try {
        const tr = await this.transcribeFile(this.store.resolve(p.id, m.file), m.analysis.meta.duration, ctx.signal);
        await this.store.update(p.id, (d) => {
          d.transcripts[m.id] = tr;
          const dm = d.media.find((x) => x.id === m.id);
          if (dm) { dm.transcriptWords = tr.words.length; if (dm.role == null && tr.words.length > 3) dm.role = 'aroll'; }
        });
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        log('warn', 'transcribe.failed', { id: m.id, error: String(err?.message || err).slice(0, 500) });
      }
      i++;
    }
    onProgress(1);
  }

  async transcribeFile(file, duration, signal) {
    const fp = await fingerprint(file);
    const cached = path.join(this.cacheDir, `${fp}.json`);
    if (fs.existsSync(cached)) return JSON.parse(await fsp.readFile(cached, 'utf8'));
    // Compact speech-only audio (mono 16 kHz) keeps uploads small and fast.
    const audio = path.join(this.cacheDir, `${fp}.m4a`);
    await runFfmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '48k', audio], { duration, signal });
    try {
      const form = new FormData();
      form.append('file', new Blob([await fsp.readFile(audio)], { type: 'audio/mp4' }), 'audio.m4a');
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${this.settings.getSecret('openai')}` }, body: form, signal,
      });
      if (!res.ok) {
        const err = new Error(`transcription failed: HTTP ${res.status}`);
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
      }
      const json = await res.json();
      const words = annotate((json.words || []).map((w) => ({ w: w.word, start: w.start, end: w.end })));
      const tr = {
        language: json.language || null,
        text: json.text || '',
        words,
        segments: (json.segments || []).map((s) => ({ text: s.text, start: s.start, end: s.end })),
        source: 'openai-whisper-1',
        createdAt: new Date().toISOString(),
      };
      await fsp.writeFile(cached, JSON.stringify(tr));
      return tr;
    } finally {
      await fsp.rm(audio, { force: true });
    }
  }

  static async testKey(key) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (res.status === 401) return { ok: false, reason: 'invalid_key' };
      return { ok: res.ok, reason: res.ok ? null : 'error' };
    } catch { return { ok: false, reason: 'offline' }; }
  }
}
