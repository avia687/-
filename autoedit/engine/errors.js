// Maps internal failures to calm, human messages. Developers see details in the log.
export class UserFacingError extends Error {
  constructor(code, message, { action = null, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.action = action;
    this.retryable = retryable;
  }
}

export class CancelledError extends Error {
  constructor() { super('cancelled'); this.code = 'cancelled'; }
}

const MESSAGES = {
  he: {
    generic: 'משהו השתבש בעיבוד הסרטון. AutoEdit מנסה שוב אוטומטית.',
    unreadable: 'לא הצלחנו לקרוא את אחד הקבצים. ייתכן שהוא פגום או בפורמט לא נתמך.',
    disk: 'אין מספיק מקום פנוי במחשב. פנו מקום ונסו שוב.',
    noMedia: 'לא נמצא חומר וידאו או תמונות לעריכה. העלו לפחות סרטון אחד או תמונה.',
    cancelled: 'העיבוד בוטל.',
  },
  en: {
    generic: "Something went wrong while processing the video. We're retrying automatically.",
    unreadable: "We couldn't read one of the files. It may be damaged or in an unsupported format.",
    disk: 'Your computer is out of free space. Free up some space and try again.',
    noMedia: 'No video or photos to edit were found. Upload at least one video or photo.',
    cancelled: 'Processing was cancelled.',
  },
};

export function friendly(err, lang = 'he') {
  const m = MESSAGES[lang] || MESSAGES.en;
  if (err instanceof UserFacingError) return { code: err.code, message: err.message, action: err.action };
  if (err?.code === 'cancelled') return { code: 'cancelled', message: m.cancelled };
  const text = String(err?.message || err);
  if (/ENOSPC|No space left/i.test(text)) return { code: 'disk', message: m.disk };
  if (/Invalid data found|moov atom not found|could not find codec/i.test(text)) return { code: 'unreadable', message: m.unreadable };
  return { code: 'generic', message: m.generic };
}

export function messageFor(code, lang = 'he') {
  return (MESSAGES[lang] || MESSAGES.en)[code];
}
