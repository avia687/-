// Caption Engine: real transcripts → styled ASS subtitles (Hebrew RTL / English LTR, word highlight, safe zones).

const HEB = /[֐-׿]/;
const EMPHASIS = new Set([
  // Hebrew
  'הכי', 'חשוב', 'סוד', 'בחינם', 'עכשיו', 'אף', 'פעם', 'תמיד', 'מדהים', 'חדש', 'הטוב', 'הטובה', 'רק', 'לא', 'כן', 'כסף', 'שקל', 'אחוז', 'תוצאה', 'לפני', 'אחרי', 'מושלם', 'טעות', 'שווה',
  // English
  'best', 'never', 'always', 'free', 'secret', 'now', 'new', 'only', 'stop', 'mistake', 'money', 'results', 'before', 'after', 'perfect', 'easy', 'fast', 'why', 'how', 'worst',
]);

export const CAPTION_STYLES = {
  minimal: { font: 'Heebo', size: 0.034, bold: 0, primary: '&H00FFFFFF', outline: 2, shadow: 0, maxWords: 6, maxChars: 34, lines: 2, pos: 0.24, highlight: false, upper: false, box: false },
  modern: { font: 'Heebo', size: 0.042, bold: 1, primary: '&H00FFFFFF', outline: 3, shadow: 1, maxWords: 4, maxChars: 24, lines: 2, pos: 0.27, highlight: true, upper: false, box: false },
  bold: { font: 'Heebo', size: 0.056, bold: 1, primary: '&H00FFFFFF', outline: 5, shadow: 2, maxWords: 3, maxChars: 18, lines: 1, pos: 0.32, highlight: true, upper: true, box: false },
  viral: { font: 'Heebo', size: 0.062, bold: 1, primary: '&H00FFFFFF', outline: 6, shadow: 3, maxWords: 2, maxChars: 14, lines: 1, pos: 0.36, highlight: true, upper: true, box: false },
  luxury: { font: 'Heebo', size: 0.036, bold: 0, primary: '&H00F0F4F8', outline: 0, shadow: 2, maxWords: 5, maxChars: 30, lines: 1, pos: 0.22, highlight: false, upper: false, box: false, spacing: 1.5 },
  corporate: { font: 'Heebo', size: 0.036, bold: 1, primary: '&H00FFFFFF', outline: 0, shadow: 0, maxWords: 7, maxChars: 38, lines: 2, pos: 0.2, highlight: false, upper: false, box: true },
  creator: { font: 'Heebo', size: 0.048, bold: 1, primary: '&H00FFFFFF', outline: 4, shadow: 2, maxWords: 3, maxChars: 20, lines: 1, pos: 0.3, highlight: true, upper: false, box: false },
};
const STYLE_FOR = { viral: 'viral', cinematic: 'minimal', premium: 'luxury' };

/** "#RRGGBB" → ASS "&H00BBGGRR" */
export function assColor(hex, fallback = '&H0000E1FF') {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return fallback;
  const [r, g, b] = [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  return `&H00${b}${g}${r}`.toUpperCase();
}

const ts = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const esc = (s) => s.replace(/[{}\\]/g, '').replace(/\n/g, ' ');

export function isImportant(word) {
  const w = word.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '');
  if (!w) return false;
  if (/\d/.test(w)) return true;
  if (/[!]/.test(word)) return true;
  return EMPHASIS.has(w) || EMPHASIS.has(w.replace(/^[והבכלמש]/, ''));
}

/** Map transcript words onto the edited timeline. */
export function timelineWords(p, edl) {
  const out = [];
  for (const s of edl.shots) {
    if (!s.audio || (s.speed || 1) !== 1) continue;
    const tr = p.transcripts?.[s.audio.mediaId];
    if (!tr?.words?.length) continue;
    const a = s.audio.in;
    const b = a + s.duration;
    for (const w of tr.words) {
      if (w.start >= a - 0.05 && w.end <= b + 0.1 && w.start < b - 0.05) {
        out.push({ w: w.w.trim(), start: s.start + Math.max(0, w.start - a), end: s.start + Math.min(s.duration, w.end - a) });
      }
    }
  }
  return out.filter((w) => w.w && !/^(אה+|אמ+|אממ+|uh+|um+|erm|hmm+)[.,]?$/i.test(w.w));
}

/** Smart line breaks: chunk by style limits, punctuation and natural pauses. */
export function chunkWords(words, st) {
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((s, x) => s + x.w.length + 1, 0) + w.w.length;
    if (prev && (w.start - prev.end > 0.35 || cur.length >= st.maxWords || chars > st.maxChars * st.lines || w.end - cur[0].start > 2.6)) flush();
    cur.push(w);
    if (/[.?!,:;]$/.test(w.w)) flush();
  }
  flush();
  return chunks;
}

export function buildCaptions(p, edl, { style, preview = false, brand } = {}) {
  const words = timelineWords(p, edl);
  if (words.length < 2) return null;
  const key = CAPTION_STYLES[style] ? style : STYLE_FOR[edl.style] || 'modern';
  const st = CAPTION_STYLES[key];
  const H = preview ? 960 : edl.format.height;
  const W = Math.round(H * edl.format.width / edl.format.height);
  const landscape = edl.format.width > edl.format.height;
  const size = Math.round(H * st.size * (landscape ? 1.25 : 1));
  const marginV = Math.round(H * (landscape ? 0.08 : st.pos));
  const hl = assColor(brand?.colors?.find((c) => !/^#?(000000|111111|ffffff)$/i.test(c)), '&H0000E1FF');
  const rtl = words.filter((w) => HEB.test(w.w)).length > words.length / 2;
  const header = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,${st.font},${size},${st.primary},&H000000FF,&H00000000,${st.box ? '&H99000000' : '&H64000000'},${st.bold ? -1 : 0},0,0,0,100,100,${st.spacing || 0},0,${st.box ? 3 : 1},${st.box ? Math.round(size * 0.25) : Math.max(0, Math.round(st.outline * H / 1920))},${Math.round(st.shadow * H / 1920)},2,${Math.round(W * 0.08)},${Math.round(W * 0.08)},${marginV},177`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const lines = [];
  const chunks = chunkWords(words, st);
  let emphasized = 0;
  for (let c = 0; c < chunks.length; c++) {
    const ch = chunks[c];
    const start = ch[0].start;
    const end = Math.min(ch[ch.length - 1].end + 0.25, chunks[c + 1]?.[0].start ?? Infinity);
    const text = (w) => (st.upper && !HEB.test(w) ? w.toUpperCase() : w);
    const imp = ch.map((w) => isImportant(w.w));
    emphasized += imp.filter(Boolean).length;
    const render = (activeIdx) => ch.map((w, i) => {
      const t = esc(text(w.w));
      if (st.highlight && (i === activeIdx || imp[i])) return `{\\c${hl}${imp[i] ? `\\fscx108\\fscy108` : ''}}${t}{\\r}`;
      return t;
    }).join(' ');
    // Pop-in for punchy styles.
    const pop = st.highlight ? '{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}' : '{\\fad(80,60)}';
    if (st.highlight) {
      // One event per word = karaoke-style word highlighting with exact timing.
      for (let i = 0; i < ch.length; i++) {
        const ws = i === 0 ? start : ch[i].start;
        const we = i === ch.length - 1 ? end : ch[i + 1].start;
        if (we - ws < 0.02) continue;
        lines.push(`Dialogue: 0,${ts(ws)},${ts(we)},Cap,,0,0,0,,${i === 0 ? pop : ''}${rtl ? '‫' : ''}${render(i)}`);
      }
    } else {
      lines.push(`Dialogue: 0,${ts(start)},${ts(end)},Cap,,0,0,0,,${pop}${rtl ? '‫' : ''}${render(-1)}`);
    }
  }
  // Caption QC: a chunk too fast to read is a real readability problem.
  const tooFast = chunks.filter((ch) => {
    const d = ch[ch.length - 1].end - ch[0].start;
    const chars = ch.reduce((s, w) => s + w.w.length, 0);
    return d > 0 && chars / d > 25;
  }).length;
  const qcScore = Math.max(60, 100 - tooFast * 5);
  return { ass: [...header, ...lines].join('\n') + '\n', style: key, words: words.length, emphasized, rtl, qcScore };
}
