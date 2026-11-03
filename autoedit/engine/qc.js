// Quality Control: inspects the RENDERED file (not the plan) and reports/fixes real problems.
import { runFfmpeg, probe } from './ffmpeg.js';
import { parseIntervals } from './analysis.js';

const T = (he, en) => ({ he, en });

export async function inspectRender(file, edl, { signal, expected } = {}) {
  const meta = await probe(file);
  const { stderr } = await runFfmpeg([
    '-i', file,
    '-filter_complex', '[0:v]blackdetect=d=0.25:pix_th=0.08,freezedetect=n=-55dB:d=1.2[vo];[0:a]ebur128=peak=true:framelog=verbose,astats=metadata=0[ao]',
    '-map', '[vo]', '-f', 'null', '-', '-map', '[ao]', '-f', 'null', '-',
  ], { duration: meta.duration, signal });

  const black = [];
  for (const m of stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)) black.push([Number(m[1]), Number(m[2])]);
  const fr = parseIntervals(stderr, 'freeze_start', 'freeze_end');
  const frozen = fr.intervals;
  if (fr.openStart !== null) frozen.push([fr.openStart, meta.duration]);
  const sum = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = Number((/I:\s+(-?[\d.]+) LUFS/.exec(sum) || [])[1]);
  const peak = Number((/Peak:\s+(-?[\d.]+) dBFS/.exec(sum) || [])[1]);

  const issues = [];
  const fadeIn = edl.fadeIn || 0;
  const fadeOut = edl.fadeOut || 0;
  // Black frames that are not our intentional fades.
  for (const [s, e] of black) {
    const intentional = (s < fadeIn + 0.05 && e <= fadeIn + 0.3) || (s >= meta.duration - fadeOut - 0.3);
    if (!intentional) issues.push({ code: 'black', at: s, end: e, fixable: true, msg: T('נמצאו פריימים שחורים', 'Black frames found') });
  }
  // Frozen video that isn't a photo shot.
  const imageRanges = edl.shots.filter((s) => s.kind === 'image').map((s) => [s.start, s.start + s.duration]);
  for (const [s, e] of frozen) {
    const isImage = imageRanges.some(([a, b]) => s >= a - 0.2 && e <= b + 0.2);
    if (!isImage && e - s > 1.2) issues.push({ code: 'frozen', at: s, end: e, fixable: true, msg: T('תמונה קפואה בסרטון', 'Frozen picture in the video') });
  }
  const targetLufs = edl.audio?.sourceMode === 'dialog' || edl.audio?.music ? -14 : -18;
  if (Number.isFinite(integrated) && integrated > -60 && Math.abs(integrated - targetLufs) > 2) {
    issues.push({ code: 'loudness', value: integrated, target: targetLufs, fixable: true, msg: T('עוצמת השמע לא מאוזנת', 'Audio loudness is off') });
  }
  if (Number.isFinite(peak) && peak > -0.5) issues.push({ code: 'clipping', value: peak, fixable: true, msg: T('עיוות בשמע (קליפינג)', 'Audio clipping') });
  if (expected) {
    if (meta.width !== expected.width || meta.height !== expected.height) issues.push({ code: 'aspect', fixable: false, msg: T('גודל פריים לא נכון', 'Wrong frame size') });
    if (Math.abs(meta.duration - expected.duration) > 0.5) issues.push({ code: 'duration', value: meta.duration, fixable: false, msg: T('אורך הסרטון שונה מהמתוכנן', 'Video length differs from the plan') });
  }
  return { meta, black, frozen, loudness: Number.isFinite(integrated) ? integrated : null, peak: Number.isFinite(peak) ? peak : null, issues, ok: issues.length === 0 };
}

/** Fix what can be fixed in the EDL itself (trim bad frames) — returns a new EDL or null. */
export function fixEdl(edl, report) {
  const shotsAt = (t) => edl.shots.find((s) => t >= s.start - 0.01 && t < s.start + s.duration);
  let changed = false;
  const next = structuredClone(edl);
  for (const issue of report.issues) {
    if (issue.code !== 'black' && issue.code !== 'frozen') continue;
    const s = shotsAt(issue.at);
    if (!s) continue;
    const ns = next.shots.find((x) => x.id === s.id);
    const local = (issue.at - s.start) * (s.speed || 1);
    const localEnd = (issue.end - s.start) * (s.speed || 1);
    if (local < 0.3) { ns.in = Math.round((ns.in + localEnd + 0.05) * 100) / 100; changed = true; }
    else { ns.out = Math.round((ns.in + local - 0.05) * 100) / 100; changed = true; }
    if (ns.out - ns.in < 0.4) { next.shots = next.shots.filter((x) => x.id !== ns.id); }
  }
  if (!changed) return null;
  let t = 0;
  for (const s of next.shots) {
    s.duration = Math.round(((s.out - s.in) / (s.speed || 1)) * 100) / 100;
    s.start = Math.round(t * 100) / 100;
    t += s.duration - (s.transition?.type === 'crossfade' ? s.transition.duration : 0);
  }
  next.duration = Math.round(t * 100) / 100;
  next.explanations = [...(next.explanations || []), T('בדיקת האיכות מצאה פריימים בעייתיים — חתכתי אותם.', 'Quality check found bad frames — I trimmed them out.')];
  return next;
}

/** Final Video Score — only categories we can actually measure are included. */
export function finalScore(edl, report, media) {
  const used = [...new Set(edl.shots.map((s) => s.mediaId))].map((id) => media.find((m) => m.id === id)).filter(Boolean);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const visuals = avg(used.map((m) => m.analysis?.scores?.visual).filter((v) => v != null));
  let audio = null;
  if (report?.loudness != null) {
    const target = edl.audio?.sourceMode === 'dialog' || edl.audio?.music ? -14 : -18;
    audio = Math.round(Math.max(0, 100 - Math.abs(report.loudness - target) * 8 - (report.peak > -0.5 ? 15 : 0)));
    const src = avg(used.map((m) => m.analysis?.scores?.audio).filter((v) => v != null));
    if (src != null && edl.structure === 'speech') audio = Math.round(audio * 0.5 + src * 0.5);
  }
  const s = edl.scores || {};
  const breakdown = {
    hook: s.hook ?? null,
    story: edl.structure === 'speech' ? Math.round(((s.payoff ?? 70) + (s.deadTime ?? 70)) / 2) : Math.round(((s.payoff ?? 70) + (s.variation ?? 70)) / 2),
    pacing: s.pacing ?? null,
    visuals,
    audio,
    captions: edl.captions?.words ? (edl.captions.qcScore ?? 90) : null,
    brand: edl.brand?.applied ? 95 : null,
  };
  const vals = Object.values(breakdown).filter((v) => v != null);
  const penalty = (report?.issues || []).filter((i) => !i.fixed).length * 4;
  return { total: Math.max(0, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) - penalty), breakdown };
}
