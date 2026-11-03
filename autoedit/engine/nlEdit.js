// Natural-language editing: Hebrew/English requests → typed directive changes the Director executes.
// Works offline; when an AI key exists, the LLM maps free text to the same typed ops (see ai.js).

const T = (he, en) => ({ he, en });

const num = (text) => {
  const m = /(\d+(?:[.,]\d+)?)/.exec(text);
  return m ? Number(m[1].replace(',', '.')) : null;
};

const HE_NUMS = { 'חמש': 5, 'עשר': 10, 'חמש עשרה': 15, 'עשרים': 20, 'שלושים': 30, 'שלוש': 3, 'ארבע': 4, 'שתיים': 2, 'שניה': 1, 'שנייה': 1, 'דקה': 60 };
const heNum = (t) => { for (const [w, v] of Object.entries(HE_NUMS).sort((a, b) => b[0].length - a[0].length)) if (t.includes(w)) return v; return null; };

/** Each rule: test → ops. Ops are {op, value}. Order matters: specific before general. */
const RULES = [
  { re: /(תקצר|קצר|shorten|make it|cut it|גרסה של|version of|תעשה.*של)\s.*?(\d+|חמש עשרה|עשרים|שלושים|עשר|חמש)\s*(שניות|שנ'|sec|s\b|seconds)/i, ops: (t) => [{ op: 'duration', value: num(t) ?? heNum(t) }] },
  { re: /(\d+)\s*(שניות|seconds|sec)\b.*(גרסה|version|long|אורך)|^(\d+)\s*(שניות|sec|seconds)$/i, ops: (t) => [{ op: 'duration', value: num(t) }] },
  { re: /(תוריד|תחתוך|הורד|remove|cut|delete|drop).*(התחלה|ההתחלה|הראשונות|first|beginning|start|intro)/i, ops: (t) => [{ op: 'cutHead', value: num(t) ?? heNum(t) ?? 3 }] },
  { re: /(יותר מהיר|מהר יותר|קצב מהיר|faster|speed it up|more pace|quicker)/i, ops: () => [{ op: 'pace', value: 1.3 }] },
  { re: /(יותר איטי|לאט יותר|רגוע|slower|calmer|slow it down)/i, ops: () => [{ op: 'pace', value: 0.75 }] },
  { re: /(יותר זומים|יותר זום|more zoom)/i, ops: () => [{ op: 'zoom', value: 1.5 }] },
  { re: /(פחות זומים|בלי זום|ללא זום|less zoom|no zoom)/i, ops: (t) => [{ op: 'zoom', value: /(בלי|ללא|no)/i.test(t) ? 0 : 0.5 }] },
  { re: /(פחות אפקטים|בלי אפקטים|נקי יותר|less effects|fewer effects|no effects|cleaner)/i, ops: () => [{ op: 'effects', value: 0 }, { op: 'zoom', value: 0.6 }] },
  { re: /(יותר אפקטים|more effects)/i, ops: () => [{ op: 'effects', value: 1 }, { op: 'zoom', value: 1.3 }] },
  { re: /(ויראלי|viral|tiktok style|יותר אנרגטי|energetic)/i, ops: () => [{ op: 'style', value: 'viral' }] },
  { re: /(קולנועי|סינמטי|cinematic|movie)/i, ops: () => [{ op: 'style', value: 'cinematic' }] },
  { re: /(יוקרתי|פרימיום|premium|luxury|elegant|אלגנטי)/i, ops: (t) => (/(כתוביות|captions|subtitles)/i.test(t) ? [{ op: 'captionStyle', value: 'luxury' }] : [{ op: 'style', value: 'premium' }]) },
  { re: /(פרסומת|כמו פרסומת|advert|commercial|\bad\b)/i, ops: () => [{ op: 'style', value: 'premium' }, { op: 'pace', value: 1.15 }, { op: 'hookFirst', value: true }] },
  { re: /(כתוביות|captions|subtitles).*(גדולות|בולטות|bold|big)/i, ops: () => [{ op: 'captionStyle', value: 'bold' }] },
  { re: /(כתוביות|captions|subtitles).*(מינימל|minimal|קטנות|small|clean)/i, ops: () => [{ op: 'captionStyle', value: 'minimal' }] },
  { re: /(בלי כתוביות|הסר כתוביות|no captions|remove captions)/i, ops: () => [{ op: 'captionStyle', value: 'none' }] },
  { re: /(הקטע הכי טוב|הכי חזק|strongest|best (part|moment)).*(בהתחלה|לפתיחה|first|start|beginning)/i, ops: () => [{ op: 'hookFirst', value: true }] },
  { re: /(לוגו|logo).*(בסוף|end)/i, ops: () => [{ op: 'logoEnd', value: true }] },
  { re: /(מוזיקה|music).*(חזקה|יותר|louder|up)/i, ops: () => [{ op: 'musicVolume', value: 1.4 }] },
  { re: /(מוזיקה|music).*(חלשה|פחות|שקטה|quieter|down|lower)/i, ops: () => [{ op: 'musicVolume', value: 0.6 }] },
  { re: /(קול|voice).*(סטודיו|studio)/i, ops: () => [{ op: 'voice', value: 'studio' }] },
  { re: /(קול|voice).*(טבעי|natural)/i, ops: () => [{ op: 'voice', value: 'natural' }] },
  { re: /(קול|voice|דיבור).*(ברור|נקי|clear|clean)/i, ops: () => [{ op: 'voice', value: 'clear' }] },
  { re: /(חם|חמים|warm)/i, ops: () => [{ op: 'look', value: 'warm' }] },
  { re: /(קר|cold|cool tone)/i, ops: () => [{ op: 'look', value: 'cold' }] },
  { re: /(אינסטגרם|instagram|רילס|reels?)/i, ops: () => [{ op: 'platform', value: 'instagram' }] },
  { re: /(יוטיוב שורט|shorts)/i, ops: () => [{ op: 'platform', value: 'shorts' }] },
  { re: /(טיקטוק|tiktok)/i, ops: () => [{ op: 'platform', value: 'tiktok' }] },
  { re: /(make it better|תשפר|שפר|improve)/i, ops: () => [{ op: 'improve', value: true }] },
];

export function parseRequest(text) {
  const t = String(text || '').trim();
  const ops = [];
  for (const r of RULES) {
    if (r.re.test(t)) for (const o of r.ops(t)) if (o.value !== null && o.value !== undefined && !ops.some((x) => x.op === o.op)) ops.push(o);
  }
  return ops;
}

export const OP_SCHEMA = {
  duration: (v) => Number.isFinite(v) && v >= 5 && v <= 600,
  cutHead: (v) => Number.isFinite(v) && v > 0 && v < 120,
  pace: (v) => Number.isFinite(v) && v >= 0.5 && v <= 2,
  zoom: (v) => Number.isFinite(v) && v >= 0 && v <= 2,
  effects: (v) => v === 0 || v === 1,
  style: (v) => ['viral', 'cinematic', 'premium'].includes(v),
  captionStyle: (v) => ['minimal', 'bold', 'modern', 'luxury', 'viral', 'corporate', 'creator', 'none'].includes(v),
  hookFirst: (v) => typeof v === 'boolean',
  logoEnd: (v) => typeof v === 'boolean',
  musicVolume: (v) => Number.isFinite(v) && v >= 0 && v <= 2,
  voice: (v) => ['natural', 'clear', 'studio'].includes(v),
  look: (v) => ['clean', 'social', 'cinematic', 'luxury', 'warm', 'cold'].includes(v),
  platform: (v) => ['instagram', 'tiktok', 'shorts', 'youtube'].includes(v),
  improve: (v) => v === true,
};

export function validateOps(ops) {
  return (ops || []).filter((o) => OP_SCHEMA[o.op] && OP_SCHEMA[o.op](o.value));
}

/**
 * Apply ops to the current version's settings → next settings + human summary.
 * `improve` = "make it better": the Director uses its own scores to decide what to change.
 */
export function applyOps(current, ops, scores) {
  const next = { style: current.style, platform: current.platform, targetDuration: current.targetDuration, directives: { ...(current.directives || {}) } };
  const said = [];
  for (const { op, value } of ops) {
    const d = next.directives;
    switch (op) {
      case 'duration': next.targetDuration = value; said.push(T(`קיצרתי ל-${value} שניות.`, `Set the length to ${value} seconds.`)); break;
      case 'cutHead': d.cutHead = (d.cutHead || 0) + value; said.push(T(`הורדתי ${value} שניות מההתחלה.`, `Removed ${value}s from the start.`)); break;
      case 'pace': d.pace = Math.max(0.5, Math.min(2, (d.pace || 1) * value)); said.push(value > 1 ? T('העליתי את הקצב.', 'Picked up the pace.') : T('האטתי את הקצב.', 'Slowed the pace down.')); break;
      case 'zoom': d.zoom = value === 0 ? 0 : Math.max(0, Math.min(2, (d.zoom ?? 1) * value)); said.push(value === 0 ? T('הורדתי את הזומים.', 'Removed the zooms.') : value > 1 ? T('הוספתי זומים.', 'Added more zooms.') : T('הפחתתי זומים.', 'Reduced the zooms.')); break;
      case 'effects': d.effects = value; said.push(value ? T('הוספתי אפקטים.', 'Added effects.') : T('ניקיתי אפקטים מיותרים.', 'Removed unnecessary effects.')); break;
      case 'style': next.style = value; said.push(T(`עברתי לסגנון ${({ viral: 'ויראלי', cinematic: 'קולנועי', premium: 'פרימיום' })[value]}.`, `Switched to the ${value} style.`)); break;
      case 'captionStyle': d.captionStyle = value === 'none' ? null : value; d.noCaptions = value === 'none'; said.push(value === 'none' ? T('הסרתי כתוביות.', 'Removed captions.') : T('עדכנתי את סגנון הכתוביות.', 'Updated the caption style.')); break;
      case 'hookFirst': d.hookFirst = value; said.push(T('שמתי את הרגע הכי חזק בפתיחה.', 'Put the strongest moment first.')); break;
      case 'logoEnd': d.logoEnd = value; said.push(T('הלוגו יופיע בסוף.', 'The logo will appear at the end.')); break;
      case 'musicVolume': d.musicVolume = value; said.push(value > 1 ? T('הגברתי את המוזיקה.', 'Turned the music up.') : T('הנמכתי את המוזיקה.', 'Turned the music down.')); break;
      case 'voice': d.voice = value; said.push(T('עדכנתי את איכות הקול.', 'Updated the voice sound.')); break;
      case 'look': d.look = value; said.push(T('עדכנתי את הצבעים.', 'Updated the color look.')); break;
      case 'platform': next.platform = value; said.push(T('התאמתי לפלטפורמה.', 'Adapted it for the platform.')); break;
      case 'improve': {
        const s = scores || {};
        if ((s.hook ?? 100) < 80) { d.hookFirst = true; said.push(T('חיזקתי את הפתיחה.', 'Strengthened the hook.')); }
        if ((s.pacing ?? 100) < 75) { d.pace = Math.min(2, (d.pace || 1) * 1.15); said.push(T('הידקתי את הקצב.', 'Tightened the pacing.')); }
        if ((s.deadTime ?? 100) < 80) { d.pace = Math.min(2, (d.pace || 1) * 1.1); said.push(T('הסרתי עוד זמן מת.', 'Removed more dead time.')); }
        if ((s.variation ?? 100) < 70) { d.zoom = Math.min(2, (d.zoom ?? 1) * 1.25); said.push(T('הוספתי עוד תנועה ומגוון.', 'Added more visual variety.')); }
        if (!said.length) said.push(T('הסרטון כבר במצב טוב — עשיתי רק הידוק קל.', 'The video is already strong — I only tightened it slightly.'));
        break;
      }
      default: break;
    }
  }
  return { next, said };
}
