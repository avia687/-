// Thin, safe wrapper around ffmpeg/ffprobe. All media work in AutoEdit goes through here.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { CancelledError } from './errors.js';
import { log } from './log.js';

const require = createRequire(import.meta.url);

function fixAsar(p) {
  // Inside a packaged Electron app, binaries live in app.asar.unpacked.
  return p ? p.replace(`app.asar${require('node:path').sep}`, `app.asar.unpacked${require('node:path').sep}`) : p;
}

function pickBinary(envVar, resolver, fallback) {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) return process.env[envVar];
  try {
    const p = fixAsar(resolver());
    if (p && fs.existsSync(p)) return p;
  } catch { /* not installed for this platform */ }
  return fallback; // system binary on PATH (dev machines / CI)
}

export const FFMPEG = pickBinary('AUTOEDIT_FFMPEG', () => require('ffmpeg-static'), 'ffmpeg');
const STALL_MS = Number(process.env.AUTOEDIT_STALL_MS || 180000);
export const FFPROBE = pickBinary('AUTOEDIT_FFPROBE', () => require('ffprobe-static').path, 'ffprobe');

/**
 * Run ffmpeg. Reports REAL progress (from -progress out_time) when `duration` is known.
 * @param {string[]} args
 * @param {{duration?:number,onProgress?:(p:number)=>void,signal?:AbortSignal,collectStderr?:boolean}} opts
 */
export function runFfmpeg(args, { duration, onProgress, signal, collectStderr = true, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const full = ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...args];
    const child = spawn(FFMPEG, full, { windowsHide: true, cwd });
    let stderr = '';
    let stdoutBuf = '';
    const onAbort = () => { try { child.kill('SIGKILL'); } catch { /* ignore */ } };
    // Stall watchdog: ffmpeg reports progress every ~0.5s; silence for this long means it is stuck.
    let lastOutput = Date.now();
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastOutput > STALL_MS) { stalled = true; clearInterval(watchdog); onAbort(); }
    }, 5000);
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => {
      lastOutput = Date.now();
      stdoutBuf += d.toString();
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx).trim();
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (line.startsWith('out_time_us=') && duration && onProgress) {
          const us = Number(line.slice(12));
          if (Number.isFinite(us) && us >= 0) onProgress(Math.min(1, us / 1e6 / duration));
        }
      }
    });
    child.stderr.on('data', (d) => {
      lastOutput = Date.now();
      if (!collectStderr) return;
      stderr += d.toString();
      if (stderr.length > 8_000_000) stderr = stderr.slice(-4_000_000);
    });
    child.on('error', (err) => { clearInterval(watchdog); signal?.removeEventListener('abort', onAbort); reject(err); });
    child.on('close', (code) => {
      clearInterval(watchdog);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(new CancelledError());
      if (stalled) {
        log('error', 'ffmpeg.stalled', { args: full.join(' ').slice(0, 2000), tail: stderr.slice(-2000) });
        return reject(Object.assign(new Error('ffmpeg stalled'), { retryable: true }));
      }
      if (code === 0) { onProgress?.(1); return resolve({ stderr }); }
      const tail = stderr.split('\n').slice(-25).join('\n');
      log('error', 'ffmpeg.failed', { code, args: full.join(' ').slice(0, 4000), tail });
      const err = new Error(`ffmpeg exited with code ${code}: ${tail}`);
      err.stderr = stderr;
      reject(err);
    });
  });
}

/** ffprobe → normalized metadata. */
export function probe(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.slice(-500)}`));
      try { resolve(normalizeProbe(JSON.parse(out))); } catch (e) { reject(e); }
    });
  });
}

function parseRate(r) {
  if (!r || r === '0/0') return 0;
  const [a, b] = r.split('/').map(Number);
  return b ? a / b : a;
}

export function normalizeProbe(json) {
  const streams = json.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition?.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  let width = v?.width || 0;
  let height = v?.height || 0;
  // Phone videos carry a rotation flag; ffmpeg auto-rotates on decode, so report display size.
  const rot = Math.abs(Number(v?.tags?.rotate || v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation || 0)) % 180;
  if (rot === 90) [width, height] = [height, width];
  const duration = Number(json.format?.duration || v?.duration || a?.duration || 0);
  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width,
    height,
    fps: v ? Math.round(parseRate(v.avg_frame_rate || v.r_frame_rate) * 100) / 100 : 0,
    videoCodec: v?.codec_name || null,
    hasVideo: !!v,
    hasAudio: !!a,
    audioCodec: a?.codec_name || null,
    sampleRate: a ? Number(a.sample_rate) : 0,
    channels: a?.channels || 0,
    bitrate: Number(json.format?.bit_rate || 0),
    formatName: json.format?.format_name || '',
    sizeBytes: Number(json.format?.size || 0),
    creationTime: json.format?.tags?.creation_time || v?.tags?.creation_time || null,
  };
}

export async function ffmpegAvailable() {
  try {
    await new Promise((resolve, reject) => {
      const c = spawn(FFMPEG, ['-version'], { windowsHide: true });
      c.on('error', reject);
      c.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg not runnable'))));
    });
    return true;
  } catch { return false; }
}
