// AI Director: turns analyzed media + goal + style into an explicit Edit Decision List (EDL).
// Priority: Story > Retention > Clarity > Professionalism > Effects. Every decision carries a reason.
import { SAMPLE, momentScore, findDuplicates } from './analysis.js';
import { sequenceHint } from './ingest.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export const PLATFORMS = {
  instagram: { width: 1080, height: 1920, label: 'Instagram Reel' },
  tiktok: { width: 1080, height: 1920, label: 'TikTok' },
  shorts: { width: 1080, height: 1920, label: 'YouTube Short' },
  youtube: { width: 1920, height: 1080, label: 'YouTube' },
};

/** Real, distinct parameters per style. */
export const STYLES = {
  viral: {
    silenceCut: 0.28, padBefore: 0.08, padAfter: 0.14, shotLen: [0.9, 1.8], brollEvery: 5, brollLen: [1.4, 2.2],
    punch: 1.14, hookPunch: 1.18, push: [1.0, 1.1], imageZoom: 0.12, look: 'social', transition: 'cut',
    crossfade: 0, fadeIn: 0, fadeOut: 0.25, speedUpStatic: 1.35, sfx: true, beatsPerShot: [1, 2], idealShot: 1.6, idealChanges: 5,
  },
  cinematic: {
    silenceCut: 0.6, padBefore: 0.15, padAfter: 0.3, shotLen: [2.2, 3.6], brollEvery: 8, brollLen: [2.2, 3.2],
    punch: 1.07, hookPunch: 1.08, push: [1.0, 1.06], imageZoom: 0.08, look: 'cinematic', transition: 'crossfade',
    crossfade: 0.45, fadeIn: 0.4, fadeOut: 0.8, speedUpStatic: 1, sfx: false, beatsPerShot: [4, 8], idealShot: 3, idealChanges: 2.5,
  },
  premium: {
    silenceCut: 0.42, padBefore: 0.12, padAfter: 0.22, shotLen: [1.6, 2.8], brollEvery: 6.5, brollLen: [1.8, 2.6],
    punch: 1.06, hookPunch: 1.08, push: [1.0, 1.04], imageZoom: 0.06, look: 'luxury', transition: 'cut',
    crossfade: 0.3, fadeIn: 0.25, fadeOut: 0.5, speedUpStatic: 1, sfx: false, beatsPerShot: [2, 4], idealShot: 2.3, idealChanges: 3.5,
  },
};

const T = (he, en) => ({ he, en });

/** Default directives = user-adjustable knobs that natural-language edits change. */
export const DEFAULT_DIRECTIVES = {
  pace: 1, // >1 faster cuts
  zoom: 1, // multiplier on zoom intensity (0 = no zoom)
  effects: 1, // 0 = minimal (no sfx/transitions)
  cutHead: 0, // seconds removed from the start of the result
  hookFirst: true,
  look: null, // override color look
  voice: 'clear', // natural | clear | studio
  musicVolume: 1,
  captionStyle: null,
  logoEnd: false,
};

function voiceLike(m) {
  const a = m.analysis;
  if (!a?.meta?.hasAudio || !a.samples?.length) return false;
  if (m.transcriptWords > 3) return true;
  const active = a.samples.filter((s) => !s.silent && s.rms != null);
  if (active.length < 2) return false;
  const rms = active.map((s) => s.rms);
  const avg = mean(rms);
  const sd = Math.sqrt(mean(rms.map((v) => (v - avg) ** 2)));
  // Speech: lots of sound activity that fluctuates (syllables/pauses); steady machine noise is flat.
  return a.speechRatio >= 0.35 && avg > -42 && (sd > 2.5 || a.silences.length >= 1);
}

function windowScore(a, start, end, hasAudio) {
  const s = a.samples.filter((x) => x.t >= start - 1e-6 && x.t < end - 1e-6);
  return s.length ? mean(s.map((x) => momentScore(x, hasAudio))) : 0;
}

/** Word-accurate regions from a transcript: drops fillers ("אממ", "uh") and stutters, keeps natural pauses. */
function wordRegions(m, st) {
  const D = m.analysis.meta.duration;
  const all = m.transcript?.words || [];
  if (all.filter((w) => !w.filler && !w.repeat).length < 3) return null;
  const regions = [];
  let cur = null;
  for (const w of all) {
    // A filler or stutter always ends the current phrase so it is cut out, whatever the style's pause tolerance.
    if (w.filler || w.repeat) { if (cur) { regions.push(cur); cur = null; } continue; }
    if (cur && w.start - cur[1] <= st.silenceCut) cur[1] = w.end;
    else { if (cur) regions.push(cur); cur = [w.start, w.end]; }
  }
  if (cur) regions.push(cur);
  const a = m.analysis;
  const cutWords = all.filter((w) => w.filler || w.repeat);
  // Padding keeps breaths natural but must never reach into a removed word.
  const padIn = (s) => Math.max(s - st.padBefore, ...cutWords.filter((w) => w.end <= s).map((w) => w.end + 0.02), 0);
  const padOut = (e) => Math.min(e + st.padAfter, ...cutWords.filter((w) => w.start >= e).map((w) => w.start - 0.02), D);
  return regions
    .map(([s, e]) => [padIn(s), padOut(e)])
    .filter(([s, e]) => e - s >= 0.5)
    .map(([s, e]) => ({ mediaId: m.id, in: r2(s), out: r2(e), score: windowScore(a, s, e, true) }));
}

function speechRegions(m, st) {
  const fromWords = wordRegions(m, st);
  if (fromWords) return fromWords;
  const a = m.analysis;
  const D = a.meta.duration;
  const long = a.silences.filter(([s, e]) => e - s >= st.silenceCut);
  const regions = [];
  let cur = 0;
  for (const [s, e] of long) {
    if (s > cur) regions.push([cur, s]);
    cur = e;
  }
  if (cur < D) regions.push([cur, D]);
  return regions
    .map(([s, e]) => [clamp(s - st.padBefore, 0, D), clamp(e + st.padAfter, 0, D)])
    .filter(([s, e]) => e - s >= 0.6)
    .map(([s, e]) => ({ mediaId: m.id, in: r2(s), out: r2(e), score: windowScore(a, s, e, true) }));
}

/** Find a natural cut point (quietest moment) inside [lo, hi] — a breath, not mid-word. */
function breathPoint(a, lo, hi) {
  let best = hi;
  let bestRms = Infinity;
  for (const s of a.samples) {
    if (s.t < lo || s.t > hi) continue;
    const v = s.rms ?? -90;
    if (v < bestRms) { bestRms = v; best = s.t; }
  }
  return best;
}

function bestSubWindow(a, start, end, len) {
  if (end - start <= len) return [start, end];
  const hasAudio = !!a.meta.hasAudio;
  let best = start;
  let bestVal = -1;
  for (let t = start; t + len <= end + 1e-6; t += SAMPLE) {
    const v = windowScore(a, t, t + len, hasAudio);
    if (v > bestVal) { bestVal = v; best = t; }
  }
  return [best, best + len];
}

function shotsFromVisual(m, st, pace, { density = 2.5, maxPieces = 3 } = {}) {
  const a = m.analysis;
  const D = a.meta.duration;
  const lenTarget = mean(st.shotLen) / pace;
  const bounds = [0, ...a.sceneCuts.filter((t) => t > 0.4 && t < D - 0.4), D];
  const shots = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = bounds[i];
    const e = bounds[i + 1];
    if (e - s < 0.6) continue;
    // Long continuous shot → offer up to 3 distinct windows from it.
    const pieces = Math.min(maxPieces, Math.max(1, Math.floor((e - s) / (lenTarget * density))));
    const span = (e - s) / pieces;
    for (let p = 0; p < pieces; p++) {
      const [ws, we] = bestSubWindow(a, s + p * span, s + (p + 1) * span, Math.min(span, lenTarget));
      const score = windowScore(a, ws, we, !!a.meta.hasAudio);
      if (score < 0.22) continue; // black, frozen, very blurry or dark — skip
      const motion = mean(a.samples.filter((x) => x.t >= ws && x.t < we).map((x) => x.motion));
      shots.push({ mediaId: m.id, in: r2(ws), out: r2(we), score, motion });
    }
  }
  return shots;
}

function fitFor(m, fmt) {
  const { width, height } = m.analysis.meta;
  if (!width || !height) return 'cover';
  const src = width / height;
  const dst = fmt.width / fmt.height;
  const ratio = src > dst ? src / dst : dst / src;
  return ratio < 1.35 ? 'cover' : 'blur';
}

function exposureFix(a, start, end) {
  const ys = a.samples.filter((x) => x.t >= start && x.t < end && x.y != null).map((x) => x.y);
  if (!ys.length) return 0;
  return r2(clamp((118 - mean(ys)) / 255 * 0.7, -0.08, 0.1));
}

/**
 * Build the EDL.
 * @param {object} project
 * @param {{style?:string, targetDuration?:number, platform?:string, directives?:object, brand?:object, profile?:object}} opts
 */
export function direct(project, opts = {}) {
  const styleKey = STYLES[opts.style] ? opts.style : (STYLES[project.style] ? project.style : 'viral');
  const base = STYLES[styleKey];
  const dir = { ...DEFAULT_DIRECTIVES, ...(opts.directives || {}) };
  const pace = clamp(dir.pace, 0.5, 2);
  const st = { ...base, shotLen: base.shotLen.map((v) => v / pace), brollEvery: base.brollEvery / pace, silenceCut: base.silenceCut / Math.sqrt(pace) };
  const platform = PLATFORMS[opts.platform || project.platform] ? (opts.platform || project.platform) : 'instagram';
  const fmt = { ...PLATFORMS[platform], fps: 30 };
  const target = clamp(Number(opts.targetDuration || project.targetDuration || 30), 5, 600);
  const why = [];

  const ready = project.media.filter((m) => m.analysis && !m.error).map((m) => (project.transcripts?.[m.id] ? { ...m, transcript: project.transcripts[m.id] } : m));
  // Duplicates: keep only the best take of each group.
  const dupGroups = findDuplicates(ready);
  const dropped = new Set();
  for (const g of dupGroups) {
    const sorted = g.map((id) => ready.find((m) => m.id === id)).sort((x, y) => (y.analysis.scores?.total || 0) - (x.analysis.scores?.total || 0));
    sorted.slice(1).forEach((m) => dropped.add(m.id));
  }
  if (dropped.size) why.push(T(`הסרתי ${dropped.size} קבצים כפולים ושמרתי את הטייק הטוב ביותר.`, `Skipped ${dropped.size} duplicate clip(s) and kept the best take.`));

  const visual = ready.filter((m) => (m.kind === 'video' || m.kind === 'image') && !dropped.has(m.id) && m.role !== 'logo');
  if (!visual.length) {
    const err = new Error('no usable media');
    err.code = 'noMedia';
    err.retryable = false;
    throw err;
  }
  const music = ready.find((m) => m.kind === 'audio' && m.role === 'music' && m.analysis?.meta?.duration > 5);
  const voiceTrack = ready.find((m) => m.kind === 'audio' && m.role === 'voice');

  const arolls = visual.filter((m) => m.kind === 'video' && (m.role === 'aroll' || (m.role == null && voiceLike(m))));
  const brolls = visual.filter((m) => !arolls.includes(m));
  const speechTotal = arolls.reduce((s, m) => s + speechRegions(m, st).reduce((x, r) => x + r.out - r.in, 0), 0);
  const structure = speechTotal >= Math.min(target * 0.4, 8) ? 'speech' : (visual.some((m) => sequenceHint(m.relPath || m.name)) ? 'beforeAfter' : 'montage');

  let shots;
  if (structure === 'speech') shots = buildSpeech({ arolls, brolls, st, target, dir, why, fmt });
  else shots = buildMontage({ visual, st, target, dir, why, structure, music, pace });

  // Head trim requested by the user ("remove the first 5 seconds").
  if (dir.cutHead > 0) {
    let left = dir.cutHead;
    while (left > 0 && shots.length > 1) {
      const d = shots[0].out - shots[0].in;
      if (d <= left + 0.3) { left -= d; shots.shift(); } else { shots[0].in = r2(shots[0].in + left); left = 0; }
    }
    why.push(T(`הורדתי את ${dir.cutHead} השניות הראשונות.`, `Removed the first ${dir.cutHead} seconds.`));
  }

  applyMotion(shots, visual, st, dir, styleKey, why);
  applyTransitionsAndSfx(shots, st, dir, styleKey, why, structure);

  const byId = Object.fromEntries(visual.map((m) => [m.id, m]));
  for (const s of shots) {
    const m = byId[s.mediaId];
    s.kind = m.kind;
    s.fit = s.fit || fitFor(m, fmt);
    s.exposure = m.kind === 'video' || m.kind === 'image' ? exposureFix(m.analysis, s.in, Math.max(s.out, s.in + SAMPLE)) : 0;
    if (s.audio === undefined) s.audio = m.analysis.meta.hasAudio ? { mediaId: m.id, in: s.in } : null;
  }

  const look = dir.look || st.look;
  let timeline = 0;
  for (const s of shots) {
    s.duration = r2((s.out - s.in) / (s.speed || 1));
    s.start = r2(timeline);
    timeline += s.duration - (s.transition?.type === 'crossfade' ? s.transition.duration : 0);
  }
  const total = r2(timeline);

  if (total < target * 0.8) {
    why.push(T(`היה מספיק חומר טוב ל-${Math.round(total)} שניות, אז לא מתחתי את הסרטון באופן מלאכותי.`, `There was enough strong footage for ${Math.round(total)} seconds, so I didn't pad the video.`));
  }

  const audio = {
    voice: dir.voice,
    sourceMode: structure === 'speech' ? 'dialog' : (music ? 'ambient' : 'natural'),
    music: music ? { mediaId: music.id, start: 0, volume: r2((structure === 'speech' ? 0.22 : 0.85) * dir.musicVolume), duck: structure === 'speech' } : null,
    voiceOver: voiceTrack ? { mediaId: voiceTrack.id } : null,
  };
  if (music) why.push(T(structure === 'speech' ? 'הוספתי את המוזיקה שלך מתחת לדיבור, והיא יורדת אוטומטית כשמדברים.' : 'סנכרנתי את החיתוכים לקצב של המוזיקה שלך.', structure === 'speech' ? 'Added your music under the voice — it ducks automatically when someone speaks.' : 'Synced the cuts to the beat of your music.'));
  else if (structure !== 'speech') why.push(T('לא הוספתי מוזיקה כי לא הועלה שיר. העלו שיר שיש לכם זכויות עליו ואסנכרן אליו את החיתוכים.', "No music was added because none was uploaded. Add a song you have rights to and I'll sync the cuts to it."));
  if (structure === 'speech') why.push(T('איזנתי את הקול: ניקוי רעשים, בהירות ועוצמה אחידה.', 'Balanced the voice: noise cleanup, clarity and even loudness.'));

  // Music ducking curve: where the voice is actually heard on the final timeline (measured, not guessed).
  if (audio.music && audio.music.duck) audio.music.duckIntervals = speechTimeline(shots, ready);

  const edl = {
    version: 1,
    createdAt: new Date().toISOString(),
    style: styleKey,
    platform,
    goal: project.goal,
    structure,
    storyArc: arcFor(structure, shots),
    format: fmt,
    targetDuration: target,
    duration: total,
    color: { look },
    fadeIn: dir.effects ? st.fadeIn : 0,
    fadeOut: st.fadeOut,
    shots,
    audio,
    captions: dir.captionStyle ? { style: dir.captionStyle } : null,
    directives: dir,
    explanations: why,
  };
  edl.scores = scoreEdit(edl, byId, st);
  return edl;
}

function arcFor(structure, shots) {
  if (structure === 'speech') return ['hook', 'context', 'value', 'payoff'];
  if (structure === 'beforeAfter') return ['result', 'before', 'transformation', 'after'];
  return shots.length > 4 ? ['hook', 'build', 'peak', 'payoff'] : ['hook', 'payoff'];
}

function buildSpeech({ arolls, brolls, st, target, dir, why }) {
  let segs = arolls.flatMap((m) => speechRegions(m, st).map((s) => ({ ...s, media: m })));
  const rawTotal = arolls.reduce((s, m) => s + m.analysis.meta.duration, 0);
  const kept = segs.reduce((s, x) => s + x.out - x.in, 0);
  const removed = rawTotal - kept;
  if (removed > 0.5) why.push(T(`הסרתי ${removed.toFixed(1)} שניות של שקט והשהיות, והשארתי נשימות טבעיות.`, `Removed ${removed.toFixed(1)} seconds of silence and dead time, keeping natural pauses.`));

  // Too long → drop the weakest middle segments (keep opening context and the ending payoff).
  let total = kept;
  const protectedIdx = new Set([0, segs.length - 1]);
  while (total > target * 1.05 && segs.length > 2) {
    let worst = -1;
    let worstScore = Infinity;
    segs.forEach((s, i) => { if (!protectedIdx.has(i) && s.score < worstScore) { worstScore = s.score; worst = i; } });
    if (worst < 0) break;
    total -= segs[worst].out - segs[worst].in;
    segs.splice(worst, 1);
    protectedIdx.clear(); protectedIdx.add(0); protectedIdx.add(segs.length - 1);
  }
  // Still too long → shorten long segments at breath points.
  for (const s of [...segs].sort((a, b) => (b.out - b.in) - (a.out - a.in))) {
    if (total <= target * 1.05) break;
    const len = s.out - s.in;
    const want = Math.max(2, len - (total - target));
    const cut = breathPoint(s.media.analysis, s.in + want * 0.8, s.in + want);
    total -= s.out - cut;
    s.out = r2(cut);
  }
  if (rawTotal > target * 1.2) why.push(T(`בחרתי את הקטעים החזקים ביותר כדי להגיע ל-${target} שניות.`, `Picked the strongest moments to fit ${target} seconds.`));

  // Hook: strongest segment opens the video (cold open) when it isn't already first.
  if (dir.hookFirst && segs.length > 2) {
    let best = 0;
    segs.forEach((s, i) => { if (s.score > segs[best].score) best = i; });
    if (best > 0 && segs[best].score > segs[0].score * 1.08) {
      const [h] = segs.splice(best, 1);
      segs.unshift(h);
      why.push(T('העברתי את הרגע הכי חזק שלך לפתיחה.', 'Moved your strongest moment to the opening.'));
    }
  }

  let shots = segs.map((s, i) => ({
    id: `s${i + 1}`, mediaId: s.mediaId, in: s.in, out: s.out, speed: 1,
    section: i === 0 ? 'hook' : i === segs.length - 1 ? 'payoff' : 'body',
    reason: i === 0 ? T('פתיחה חזקה', 'Strong opening') : i === segs.length - 1 ? T('סיום הסיפור', 'Story payoff') : T('תוכן מרכזי', 'Key content'),
  }));

  // B-roll cutaways over the speaker's voice, never during the first 2 seconds of the hook.
  const pool = brolls.flatMap((m) => shotsFromVisual(m, { ...st, shotLen: st.brollLen }, 1).map((x) => ({ ...x, media: m }))).sort((a, b) => b.score - a.score);
  if (pool.length) {
    const out = [];
    let since = 0;
    let used = 0;
    for (const s of shots) {
      const len = s.out - s.in;
      if (s.section !== 'hook' && since + len > st.brollEvery && len >= 2.4 && pool.length) {
        // Editor rule: never leave a sliver of the speaker (<0.8s) around a cutaway —
        // either keep ≥0.8s of face on each side, or let the B-roll run to the end of the sentence.
        const b = pool.shift();
        const lead = Math.max(0.8, Math.min(1.2, len * 0.3));
        let bLen = Math.min(b.out - b.in, mean(st.brollLen));
        const tail = len - lead - bLen;
        if (tail < 0.8) bLen = Math.min(b.out - b.in, len - lead); // cover to the end of the phrase
        if (bLen < 1) { out.push(s); since += len; continue; }
        const at = r2(s.in + lead);
        const end = r2(at + bLen);
        out.push({ ...s, out: at });
        out.push({ id: `${s.id}b`, mediaId: b.mediaId, in: b.in, out: r2(b.in + bLen), speed: 1, section: 'broll', audio: { mediaId: s.mediaId, in: at }, reason: T('B-roll שממחיש את מה שנאמר', 'B-roll to illustrate what is being said') });
        if (s.out - end >= 0.8) out.push({ ...s, id: `${s.id}c`, in: end });
        else if (s.out - end > 0.05) out[out.length - 1].out = r2(b.in + (s.out - at)); // absorb the remainder
        since = Math.max(0, s.out - end);
        used++;
      } else {
        out.push(s);
        since += len;
      }
    }
    shots = out.filter((s) => s.out - s.in >= 0.3);
    if (used) why.push(T(`הוספתי ${used} קטעי B-roll בזמן ההסבר כדי לשמור על עניין.`, `Added ${used} B-roll cutaway(s) during the explanation to keep it visually engaging.`));
  }
  return shots;
}

function buildMontage({ visual, st, target, dir, why, structure, music, pace }) {
  // Candidate shots from every clip; photos become moving shots.
  let cands = [];
  for (const m of visual) {
    if (m.kind === 'image') {
      cands.push({ mediaId: m.id, in: 0, out: r2(mean(st.shotLen) * 1.2), score: (m.analysis.scores?.visual || 60) / 100, motion: 0, media: m, image: true });
    } else {
      cands.push(...shotsFromVisual(m, st, 1).map((s) => ({ ...s, media: m })));
    }
  }
  // Scarce footage: take more (still distinct) moments from each clip before giving up on length.
  const candTotal = cands.reduce((s, c) => s + (c.out - c.in), 0);
  if (candTotal < target * 1.2) {
    cands = cands.filter((c) => c.image);
    for (const m of visual) if (m.kind === 'video') cands.push(...shotsFromVisual(m, st, 1, { density: 1.05, maxPieces: 8 }).map((s) => ({ ...s, media: m })));
  }
  if (!cands.length) {
    // Everything scored poorly: still use the least-bad parts rather than fail.
    cands = visual.map((m) => ({ mediaId: m.id, in: 0, out: Math.min(m.analysis.meta.duration || 2, 2.5), score: 0.2, media: m, image: m.kind === 'image' }));
  }

  // Beat grid from the user's music → shot lengths land on beats.
  let beatLen = null;
  const beats = music?.analysis?.beats;
  if (beats?.bpm && beats.confidence > 0.15) {
    const spb = 60 / beats.bpm;
    const [lo, hi] = st.beatsPerShot;
    const per = beats.bpm > 110 ? hi : lo;
    beatLen = spb * Math.max(1, Math.round(per / Math.max(0.5, pace)));
  }

  const avgLen = beatLen || mean(st.shotLen);
  const needed = Math.max(2, Math.round(target / avgLen));
  // Diversity: at most 2 shots per clip unless footage is scarce.
  const perClipCap = cands.length >= needed * 1.5 ? 2 : 6;
  const counts = {};
  const pick = [];
  for (const c of [...cands].sort((a, b) => b.score - a.score)) {
    if (pick.length >= needed) break;
    counts[c.mediaId] = (counts[c.mediaId] || 0) + 1;
    if (counts[c.mediaId] > perClipCap) continue;
    pick.push(c);
  }

  // Order: chronological by upload order then time → reads as a story; strongest first as hook.
  const order = (c) => visual.indexOf(c.media) * 10000 + c.in;
  pick.sort((a, b) => order(a) - order(b));
  if (structure === 'beforeAfter') {
    const tag = (c) => sequenceHint(c.media.relPath || c.media.name);
    const afters = pick.filter((c) => tag(c) === 'after');
    const befores = pick.filter((c) => tag(c) === 'before');
    const rest = pick.filter((c) => !tag(c));
    const bestAfter = [...afters].sort((a, b) => b.score - a.score)[0];
    const ordered = [];
    if (bestAfter && dir.hookFirst) ordered.push({ ...bestAfter, teaser: true });
    ordered.push(...befores, ...rest, ...afters);
    pick.splice(0, pick.length, ...ordered);
    why.push(T('פתחתי בתוצאה הסופית, ואז הראיתי את הדרך: לפני ← אחרי.', 'Opened with the final result, then showed the journey: before → after.'));
  } else if (dir.hookFirst && pick.length > 2) {
    let best = 0;
    pick.forEach((c, i) => { if (c.score > pick[best].score) best = i; });
    if (best > 0) {
      const [h] = pick.splice(best, 1);
      pick.unshift(h);
      why.push(T('פתחתי בשוט הכי חזק כדי לתפוס את הצופה בשנייה הראשונה.', 'Opened with the strongest shot to grab attention in the first second.'));
    }
  }
  // Avoid identical neighbours.
  for (let i = 1; i < pick.length - 1; i++) {
    if (pick[i].mediaId === pick[i - 1].mediaId && pick[i + 1].mediaId !== pick[i].mediaId) [pick[i], pick[i + 1]] = [pick[i + 1], pick[i]];
  }

  let shots = pick.map((c, i) => {
    let len = Math.min(c.out - c.in, beatLen || (c.out - c.in));
    if (c.image) len = beatLen ? beatLen * Math.max(1, Math.round(mean(st.shotLen) * 1.2 / beatLen)) : c.out - c.in;
    if (c.teaser) len = Math.min(len, beatLen ? beatLen * Math.max(1, Math.round(1.4 / beatLen)) : 1.5);
    let speed = 1;
    // Time compression: slow, static footage plays faster (viral style only).
    if (!c.image && st.speedUpStatic > 1 && c.motion < 2.5 && c.out - c.in >= len * st.speedUpStatic) speed = st.speedUpStatic;
    return {
      id: `s${i + 1}`, mediaId: c.mediaId, in: c.in, out: r2(c.in + len * speed), speed,
      section: i === 0 ? 'hook' : i === pick.length - 1 ? 'payoff' : 'body',
      reason: c.teaser ? T('התוצאה כפתיח', 'Result first as the hook') : i === 0 ? T('השוט הכי חזק', 'Strongest shot') : speed > 1 ? T('הואץ כי השוט סטטי', 'Sped up because the shot is static') : T('שוט איכותי', 'High-quality shot'),
    };
  });
  // Fit total to target.
  let total = shots.reduce((s, x) => s + (x.out - x.in) / x.speed, 0);
  while (total > target * 1.08 && shots.length > 2) {
    let worst = 1;
    for (let i = 1; i < shots.length - 1; i++) if ((pick[i]?.score ?? 1) < (pick[worst]?.score ?? 1)) worst = i;
    total -= (shots[worst].out - shots[worst].in) / shots[worst].speed;
    shots.splice(worst, 1);
    pick.splice(worst, 1);
  }
  if (shots.some((s) => s.speed > 1)) why.push(T('האצתי קטעים סטטיים כדי לשמור על קצב.', 'Sped up static moments to keep the pace up.'));
  if (music) {
    for (const s of shots) s.audio = null; // montage over music: picture-led
  }
  return shots;
}

function applyMotion(shots, visual, st, dir, styleKey, why) {
  const byId = Object.fromEntries(visual.map((m) => [m.id, m]));
  const k = clamp(dir.zoom, 0, 2);
  let zooms = 0;
  let prevMedia = null;
  let prevOut = null;
  let alt = false;
  for (const s of shots) {
    const m = byId[s.mediaId];
    const motion = m.kind === 'image' ? 0 : mean(m.analysis.samples.filter((x) => x.t >= s.in && x.t < s.out).map((x) => x.motion));
    const amp = (z) => r2(1 + (z - 1) * k);
    if (k === 0) { s.zoom = { type: 'none', from: 1, to: 1 }; continue; }
    if (m.kind === 'image') {
      const z = amp(1 + st.imageZoom);
      s.zoom = alt ? { type: 'push', from: z, to: 1 } : { type: 'push', from: 1, to: z };
      alt = !alt;
      zooms++;
    } else if (motion > 14) {
      s.zoom = { type: 'none', from: 1, to: 1, reason: T('המצלמה כבר זזה — בלי תנועה נוספת', 'Camera is already moving — no extra motion') };
    } else if (prevMedia === s.mediaId && prevOut != null && Math.abs(s.in - prevOut) > 0.05) {
      // Jump cut in the same shot: alternate framing so the cut feels intentional.
      alt = !alt;
      const z = amp(alt ? st.punch : 1);
      s.zoom = z > 1
        ? { type: 'punch', from: z, to: z, reason: T('זום להסתרת קפיצה בחיתוך', 'Punch-in to hide a jump cut') }
        : { type: 'none', from: 1, to: 1, reason: T('חזרה לפריים רחב', 'Back to the wide framing') };
      if (z > 1) zooms++;
    } else if (s.section === 'hook' && styleKey === 'viral') {
      const z = amp(st.hookPunch);
      s.zoom = { type: 'push', from: z, to: amp(st.hookPunch + 0.04), reason: T('הדגשת הפתיחה', 'Emphasize the opening') };
      zooms++;
    } else if (s.section === 'broll' || (s.audio === null || s.kind === 'image') || styleKey !== 'viral') {
      const [a, b] = st.push;
      s.zoom = { type: 'push', from: amp(a), to: amp(b) };
      zooms++;
    } else {
      s.zoom = { type: 'none', from: 1, to: 1 };
    }
    prevMedia = s.mediaId;
    prevOut = s.out;
  }
  if (zooms) why.push(T(styleKey === 'viral' ? 'הוספתי זומים במקומות שמדגישים את התוכן.' : 'הוספתי תנועת מצלמה עדינה כדי שהתמונה תרגיש חיה.', styleKey === 'viral' ? 'Added zooms where they emphasize the content.' : 'Added subtle camera movement so the picture feels alive.'));
}

function applyTransitionsAndSfx(shots, st, dir, styleKey, why, structure) {
  let fades = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    s.transition = { type: 'cut', duration: 0 };
    if (i === 0 || !dir.effects) continue;
    const prev = shots[i - 1];
    const sectionChange = prev.mediaId !== s.mediaId;
    const roomy = (s.out - s.in) / (s.speed || 1) > 1.2 && (prev.out - prev.in) / (prev.speed || 1) > 1.2;
    if (st.crossfade && sectionChange && roomy && s.section !== 'broll' && prev.section !== 'broll') {
      if (styleKey === 'cinematic' || (styleKey === 'premium' && structure !== 'speech' && i % 3 === 0)) {
        s.transition = { type: 'crossfade', duration: st.crossfade };
        fades++;
      }
    }
  }
  if (fades) why.push(T('השתמשתי במעברים רכים רק בין חלקים שונים בסיפור — בשאר המקומות חיתוך נקי.', 'Used soft transitions only between story sections — clean cuts everywhere else.'));
  if (st.sfx && dir.effects >= 1 && shots.length > 2) {
    const target = shots.findIndex((s, i) => i > 0 && s.section !== 'broll');
    if (target > 0) {
      shots[target].sfx = { type: 'whoosh', at: 'start', volume: 0.5, reason: T('מעבר מהפתיחה לתוכן', 'Hook-to-content transition') };
      why.push(T('הוספתי אפקט סאונד אחד במעבר מהפתיחה — לא יותר.', 'Added one sound effect at the hook transition — no more.'));
    }
  }
}

/** Retention-oriented scores for the edit itself (estimates derived from measurable properties). */
export function scoreEdit(edl, byId, st) {
  const shots = edl.shots;
  if (!shots.length) return null;
  const first = shots[0];
  const fm = byId[first.mediaId];
  const firstSamples = fm.analysis.samples.filter((x) => x.t >= first.in && x.t < first.in + 1.5);
  const hookMoment = firstSamples.length ? mean(firstSamples.map((x) => momentScore(x, !!fm.analysis.meta.hasAudio))) : 0.6;
  const opensWithSound = firstSamples.some((x) => !x.silent);
  const hook = Math.round(clamp(hookMoment * 85 + (opensWithSound ? 8 : 0) + (first.zoom?.type !== 'none' ? 5 : 0), 0, 100));
  const lens = shots.map((s) => s.duration);
  const avgLen = mean(lens);
  const pacing = Math.round(clamp(100 - Math.abs(avgLen - st.idealShot) / st.idealShot * 45, 0, 100));
  const changes = shots.length + shots.filter((s) => s.zoom && s.zoom.type !== 'none').length * 0.5;
  const per10 = changes / Math.max(1, edl.duration) * 10;
  const variation = Math.round(clamp(100 - Math.abs(per10 - st.idealChanges) / st.idealChanges * 25, 0, 100));
  let silent = 0;
  let count = 0;
  for (const s of shots) {
    const m = byId[s.mediaId];
    if (!m.analysis.meta.hasAudio || s.audio == null || edl.structure !== 'speech') continue;
    for (const x of m.analysis.samples) if (x.t >= s.in && x.t < s.out) { count++; if (x.silent) silent++; }
  }
  const deadTime = count ? Math.round(clamp(100 - (silent / count) * 220, 0, 100)) : 90;
  const last = shots[shots.length - 1];
  const lm = byId[last.mediaId];
  const payoff = Math.round(clamp(mean(lm.analysis.samples.filter((x) => x.t >= last.in && x.t < last.out).map((x) => momentScore(x, !!lm.analysis.meta.hasAudio))) * 100 + 10, 0, 100));
  const overall = Math.round(hook * 0.3 + pacing * 0.2 + variation * 0.15 + deadTime * 0.15 + payoff * 0.2);
  return { hook, pacing, variation, deadTime, payoff, overall };
}

/** "AI decides for me": pick the style that fits the material (structure + music + goal). */
export function chooseStyle(project) {
  try {
    const probe = direct(project, { style: 'viral', targetDuration: project.targetDuration });
    if (project.goal === 'ad' || project.goal === 'product') return 'premium';
    if (probe.structure === 'speech') return 'viral';
    if (probe.structure === 'beforeAfter') return 'premium';
    return probe.audio.music ? 'viral' : 'cinematic';
  } catch { return 'viral'; }
}

/** Timeline intervals where speech is audible (from the analysis of each shot's audio source). */
export function speechTimeline(shots, media) {
  const byId = Object.fromEntries(media.map((m) => [m.id, m]));
  const out = [];
  for (const s of shots) {
    if (!s.audio || (s.speed || 1) !== 1) continue;
    const a = byId[s.audio.mediaId]?.analysis;
    if (!a?.samples?.length) continue;
    for (const x of a.samples) {
      if (x.silent || x.t + SAMPLE <= s.audio.in || x.t >= s.audio.in + s.duration) continue;
      const t0 = s.start + Math.max(0, x.t - s.audio.in);
      const t1 = s.start + Math.min(s.duration, x.t + SAMPLE - s.audio.in);
      const last = out[out.length - 1];
      if (last && t0 - last[1] < 0.6) last[1] = Math.max(last[1], t1); // hold through short pauses
      else out.push([t0, t1]);
    }
  }
  return out.map(([a, b]) => [r2(a), r2(b)]);
}
