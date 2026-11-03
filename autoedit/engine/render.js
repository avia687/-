// Render Engine: EDL → one ffmpeg filter graph. Real progress, cancellable, preview & final quality.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { ensureSfx } from './sfx.js';

export const EXPORT_PRESETS = {
  reel: { label: 'Instagram Reel', width: 1080, height: 1920, crf: 18, preset: 'medium' },
  tiktok: { label: 'TikTok', width: 1080, height: 1920, crf: 18, preset: 'medium' },
  shorts: { label: 'YouTube Short', width: 1080, height: 1920, crf: 18, preset: 'medium' },
  youtube: { label: 'YouTube', width: 1920, height: 1080, crf: 18, preset: 'medium' },
  p1080: { label: '1080p', width: null, height: 1080, crf: 18, preset: 'medium' },
  k4: { label: '4K', width: null, height: 2160, crf: 20, preset: 'fast' },
};

const LOOKS = {
  clean: { contrast: 1.03, saturation: 1.03, gamma: 1, balance: null },
  social: { contrast: 1.07, saturation: 1.16, gamma: 0.98, balance: null },
  cinematic: { contrast: 1.1, saturation: 0.9, gamma: 0.97, balance: 'rs=0.03:bs=-0.04:rh=-0.02:bh=0.04' },
  luxury: { contrast: 1.05, saturation: 0.98, gamma: 0.98, balance: 'rm=0.02:bm=-0.02:rh=0.02' },
  warm: { contrast: 1.04, saturation: 1.06, gamma: 1, balance: 'rm=0.05:bm=-0.05' },
  cold: { contrast: 1.05, saturation: 0.98, gamma: 1, balance: 'rm=-0.04:bm=0.05' },
};
export const LOOK_NAMES = Object.keys(LOOKS);

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const f3 = (n) => Number(n).toFixed(3);

/** Size of the output for a preset given the EDL's base format. */
export function outputSize(edl, presetKey, preview) {
  const p = EXPORT_PRESETS[presetKey] || {};
  let { width, height } = edl.format;
  if (p.width && p.height) { width = p.width; height = p.height; }
  else if (p.height) {
    // Keep the EDL aspect, scale so the SHORT side matches the preset.
    const short = Math.min(width, height);
    const k = p.height / short;
    width = even(width * k); height = even(height * k);
  }
  if (preview) { const k = 540 / Math.min(width, height); width = even(width * k); height = even(height * k); }
  return { width, height };
}

/**
 * Build ffmpeg args for an EDL.
 * @param {object} edl
 * @param {(mediaId:string, preferProxy:boolean)=>{path:string, kind:string, hasAudio:boolean}} resolveMedia
 */
export function buildRenderGraph(edl, resolveMedia, { preview = false, preset = 'reel', sfxFiles = {}, captionsFile = null, fontsDir = null, logo = null } = {}) {
  const { width: W, height: H } = outputSize(edl, preset, preview);
  const fps = edl.format.fps || 30;
  const look = LOOKS[edl.color?.look] || LOOKS.clean;
  const inputs = [];
  const chains = [];
  const addInput = (args) => { inputs.push(...args); return inputs.filter((a) => a === '-i').length - 1; };

  const shots = edl.shots.filter((s) => s.duration > 0.05);
  shots.forEach((s, i) => {
    const media = resolveMedia(s.mediaId, preview);
    const dur = s.duration;
    let vin;
    if (media.kind === 'image') {
      vin = addInput(['-loop', '1', '-framerate', String(fps), '-t', f3(dur + 0.1), '-i', media.path]);
    } else {
      vin = addInput(['-ss', f3(s.in), '-t', f3((s.out - s.in) + 0.25), '-i', media.path]);
    }
    const speed = s.speed || 1;
    const v = [];
    v.push(`[${vin}:v]setpts=(PTS-STARTPTS)/${speed}`);
    v.push(`fps=${fps}`);
    const z = s.zoom || { type: 'none', from: 1, to: 1 };
    // Fit: cover = fill frame; blur = keep whole frame over a soft blurred copy of itself.
    if (s.fit === 'blur') {
      chains.push(`${v.join(',')},split=2[bgs${i}][fgs${i}]`);
      chains.push(`[bgs${i}]scale=${even(W / 4)}:${even(H / 4)}:force_original_aspect_ratio=increase,crop=${even(W / 4)}:${even(H / 4)},boxblur=10:2,scale=${W}:${H},eq=brightness=-0.06[bg${i}]`);
      chains.push(`[fgs${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg${i}]`);
      chains.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[fit${i}]`);
    } else {
      chains.push(`${v.join(',')},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[fit${i}]`);
    }
    const post = [];
    if (z.type === 'punch' && z.from > 1.001) {
      post.push(`scale=${even(W * z.from)}:${even(H * z.from)},crop=${W}:${H}`);
    } else if (z.type === 'push' && Math.abs(z.to - z.from) > 0.001) {
      // Smooth push: zoompan on a 2x canvas to avoid sub-pixel jitter.
      const frames = Math.max(1, Math.round(dur * fps));
      const zexpr = `${f3(z.from)}+(${f3(z.to - z.from)})*on/${frames}`;
      const up = preview ? 1.5 : 2;
      post.push(`scale=${even(W * up)}:${even(H * up)}`);
      post.push(`zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}`);
    } else if (z.from > 1.001) {
      post.push(`scale=${even(W * z.from)}:${even(H * z.from)},crop=${W}:${H}`);
    }
    // Color: per-shot exposure fix + style look.
    const bright = (s.exposure || 0);
    post.push(`eq=brightness=${f3(bright)}:contrast=${look.contrast}:saturation=${look.saturation}:gamma=${look.gamma}`);
    if (look.balance) post.push(`colorbalance=${look.balance}`);
    post.push(`tpad=stop_mode=clone:stop_duration=1`, `trim=duration=${f3(dur)}`, 'setpts=PTS-STARTPTS', 'setsar=1', 'format=yuv420p', 'settb=AVTB');
    chains.push(`[fit${i}]${post.join(',')}[v${i}]`);

    // Audio for this shot.
    const vol = s.volume ?? (edl.audio?.sourceMode === 'ambient' ? 0.18 : 1);
    if (s.audio && speed === 1) {
      const am = resolveMedia(s.audio.mediaId, preview);
      if (am.hasAudio) {
        const ain = s.audio.mediaId === s.mediaId && media.kind !== 'image' ? vin : addInput(['-ss', f3(s.audio.in), '-t', f3(dur + 0.25), '-i', am.path]);
        chains.push(`[${ain}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${f3(dur)},afade=t=in:d=0.015,afade=t=out:st=${f3(Math.max(0, dur - 0.03))}:d=0.03,volume=${vol}[a${i}]`);
        return;
      }
    }
    chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(dur)},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
  });

  // Join shots: cuts via concat, crossfades via xfade/acrossfade, preserving exact timing.
  let curV = 'v0';
  let curA = 'a0';
  let acc = shots[0]?.duration || 0;
  for (let i = 1; i < shots.length; i++) {
    const t = shots[i].transition;
    if (t?.type === 'crossfade' && t.duration > 0) {
      const d = Math.min(t.duration, shots[i].duration / 2, acc / 2);
      chains.push(`[${curV}][v${i}]xfade=transition=fade:duration=${f3(d)}:offset=${f3(acc - d)}[jv${i}]`);
      chains.push(`[${curA}][a${i}]acrossfade=d=${f3(d)}[ja${i}]`);
      acc += shots[i].duration - d;
    } else {
      chains.push(`[${curV}][${curA}][v${i}][a${i}]concat=n=2:v=1:a=1[jv${i}][ja${i}]`);
      acc += shots[i].duration;
    }
    curV = `jv${i}`;
    curA = `ja${i}`;
  }
  const total = acc;

  // Video finishing: captions, logo, fades.
  const vpost = [];
  if (captionsFile) vpost.push(`subtitles=${captionsFile}${fontsDir ? `:fontsdir=${fontsDir}` : ''}`);
  if (edl.fadeIn > 0) vpost.push(`fade=t=in:st=0:d=${f3(edl.fadeIn)}`);
  if (edl.fadeOut > 0) vpost.push(`fade=t=out:st=${f3(Math.max(0, total - edl.fadeOut))}:d=${f3(edl.fadeOut)}`);
  let vOut = curV;
  if (logo) {
    const li = addInput(['-loop', '1', '-i', logo.path]);
    const lw = even(W * (logo.scale || 0.16));
    const pad = Math.round(W * 0.05);
    const enable = logo.endOnly ? `:enable='gte(t,${f3(Math.max(0, total - 2.5))})'` : '';
    chains.push(`[${li}:v]scale=${lw}:-2,format=rgba,colorchannelmixer=aa=${logo.opacity ?? 0.85}[logo]`);
    const pos = logo.endOnly ? `(W-w)/2:(H-h)/2` : `W-w-${pad}:${Math.round(H * 0.06)}`;
    chains.push(`[${curV}][logo]overlay=${pos}${enable}:shortest=1[vlogo]`);
    vOut = 'vlogo';
  }
  if (vpost.length) { chains.push(`[${vOut}]${vpost.join(',')}[vout]`); vOut = 'vout'; }

  // Audio finishing: voice chain → (music + ducking) → sfx → loudness normalization.
  const voice = edl.audio?.voice || 'clear';
  const dialog = edl.audio?.sourceMode === 'dialog';
  const voiceChain = !dialog ? ['highpass=f=40'] : voice === 'natural'
    ? ['highpass=f=70', 'acompressor=threshold=-22dB:ratio=2:attack=10:release=150:makeup=1.5']
    : voice === 'studio'
      ? ['highpass=f=90', 'afftdn=nf=-28', 'equalizer=f=220:t=q:w=1.2:g=-3', 'equalizer=f=3200:t=q:w=1:g=3', 'equalizer=f=7000:t=q:w=1.5:g=-2', 'acompressor=threshold=-24dB:ratio=4:attack=4:release=90:makeup=3']
      : ['highpass=f=80', 'afftdn=nf=-25', 'equalizer=f=250:t=q:w=1:g=-2', 'equalizer=f=3000:t=q:w=1:g=2', 'acompressor=threshold=-21dB:ratio=3:attack=5:release=100:makeup=2'];
  chains.push(`[${curA}]${voiceChain.join(',')}[voice]`);
  let mixA = 'voice';
  const music = edl.audio?.music;
  if (music) {
    const mm = resolveMedia(music.mediaId, false);
    const mi = addInput(['-stream_loop', '-1', '-ss', f3(music.start || 0), '-i', mm.path]);
    // Ducking = a smooth volume curve built from where speech is heard (no feedback graph → no deadlocks).
    const duck = music.duck && dialog && music.duckIntervals?.length ? `,volume='${duckExpr(music.duckIntervals, music.duckDepth ?? 0.72)}':eval=frame` : '';
    chains.push(`[${mi}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${f3(total)},asetpts=PTS-STARTPTS,volume=${f3(music.volume ?? 0.8)}${duck},afade=t=in:d=0.3,afade=t=out:st=${f3(Math.max(0, total - 1.5))}:d=1.5[mus]`);
    chains.push(`[voice][mus]amix=inputs=2:normalize=0:duration=first[mix]`);
    mixA = 'mix';
  }
  const sfxShots = shots.map((s, i) => ({ s, i })).filter(({ s }) => s.sfx && sfxFiles[s.sfx.type]);
  if (sfxShots.length) {
    const labels = [];
    let start = 0;
    const starts = [];
    shots.forEach((s, i) => { starts[i] = start; start += s.duration - (shots[i + 1]?.transition?.type === 'crossfade' ? shots[i + 1].transition.duration : 0); });
    sfxShots.forEach(({ s, i }, k) => {
      const si = addInput(['-i', sfxFiles[s.sfx.type]]);
      const lead = s.sfx.type === 'whoosh' ? 0.28 : 0;
      const ms = Math.max(0, Math.round((starts[i] - lead) * 1000));
      chains.push(`[${si}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${s.sfx.volume ?? 0.5},adelay=${ms}|${ms}[sfx${k}]`);
      labels.push(`[sfx${k}]`);
    });
    chains.push(`[${mixA}]${labels.join('')}amix=inputs=${labels.length + 1}:normalize=0:duration=first[mixs]`);
    mixA = 'mixs';
  }
  const lufs = dialog || music ? -14 : -18;
  chains.push(`[${mixA}]loudnorm=I=${lufs}:TP=-1.5:LRA=11,alimiter=limit=0.89:level=false,aresample=48000,atrim=duration=${f3(total)}[aout]`);

  return { inputs, graph: chains.join(';\n'), vOut, total, width: W, height: H };
}

/**
 * Render an EDL to an MP4.
 */
export async function renderEdl(edl, resolveMedia, outFile, { preview = false, preset = 'reel', signal, onProgress, workDir, sfxDir, captionsFile, fontsDir, logo, attempt = 0 } = {}) {
  const sfxFiles = await ensureSfx(sfxDir, edl.shots.filter((s) => s.sfx).map((s) => s.sfx.type), { signal });
  const g = buildRenderGraph(edl, resolveMedia, { preview, preset, sfxFiles, captionsFile, fontsDir, logo });
  await fsp.mkdir(workDir, { recursive: true });
  const script = path.join(workDir, `graph-${Date.now()}.txt`);
  await fsp.writeFile(script, g.graph);
  const p = EXPORT_PRESETS[preset] || EXPORT_PRESETS.reel;
  // Retry with safer encoder settings on the second attempt.
  const safe = attempt > 0;
  const enc = preview
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k']
    : ['-c:v', 'libx264', '-preset', safe ? 'fast' : p.preset, '-crf', String(p.crf), '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k'];
  const tmpOut = `${outFile}.part.mp4`;
  try {
    await runFfmpeg([
      ...g.inputs,
      '-filter_complex_script', path.basename(script),
      '-map', `[${g.vOut}]`, '-map', '[aout]',
      ...enc,
      '-pix_fmt', 'yuv420p', '-r', String(edl.format.fps || 30),
      '-movflags', '+faststart', '-t', f3(g.total),
      ...(safe ? ['-threads', '2'] : []),
      tmpOut,
    ], { duration: g.total, signal, onProgress, cwd: workDir });
    await fsp.rename(tmpOut, outFile);
  } finally {
    await fsp.rm(script, { force: true });
    await fsp.rm(tmpOut, { force: true });
  }
  return { file: outFile, duration: g.total, width: g.width, height: g.height };
}

/**
 * ffmpeg expression for music ducking: 1 outside speech, (1-depth) under speech, with 0.25s ramps.
 * Sum of trapezoids, clipped to 1 — commas escaped for the filter parser.
 */
export function duckExpr(intervals, depth = 0.72, ramp = 0.25) {
  const parts = intervals.slice(0, 400).map(([a, b]) => `clip((t-${f3(a - ramp)})/${ramp}\\,0\\,1)*clip((${f3(b + ramp)}-t)/${ramp}\\,0\\,1)`);
  if (!parts.length) return '1';
  return `1-${depth}*min(1\\,${parts.join('+')})`;
}
