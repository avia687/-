import type {
  BusinessConfig,
  MessageTemplateKey,
  PartialBusinessConfig,
  Terminology,
} from "@/lib/business/types";

// Shared defaults. A template only needs to declare what differs from these.
const DEFAULT_TERMS: Terminology = {
  customer: "לקוח",
  customers: "לקוחות",
  lead: "ליד",
  leads: "לידים",
  job: "עבודה",
  jobs: "עבודות",
  service: "שירות",
  services: "שירותים",
  employee: "עובד",
  employees: "עובדים",
  quote: "הצעת מחיר",
};

const DEFAULT_LEAD_STATUSES = [
  { key: "new", label: "חדש", color: "blue" },
  { key: "contacted", label: "נוצר קשר", color: "indigo" },
  { key: "quoted", label: "הצעת מחיר", color: "violet" },
  { key: "awaiting", label: "ממתין לאישור", color: "amber" },
  { key: "won", label: "נסגר", color: "green" },
  { key: "lost", label: "אבד", color: "red" },
];

const DEFAULT_JOB_STATUSES = [
  { key: "scheduled", label: "מתוזמן", color: "blue" },
  { key: "in_progress", label: "בביצוע", color: "amber" },
  { key: "done", label: "הושלם", color: "green" },
  { key: "cancelled", label: "בוטל", color: "red" },
];

const DEFAULT_MESSAGES: Record<MessageTemplateKey, string> = {
  job_confirmation: "שלום {customer}, העבודה שלך נקבעה ל-{date} בשעה {time}. {business}",
  reminder_24h: "תזכורת: מחר ב-{time} נגיע אליך. {business}",
  thank_you: "תודה שבחרת ב{business}! נשמח לעמוד לרשותך שוב.",
  review_request: "שלום {customer}, נשמח אם תשאיר/י לנו ביקורת קצרה: {link}",
  quote_followup: "שלום {customer}, רצינו לבדוק לגבי הצעת המחיר ששלחנו. נשמח לענות על כל שאלה.",
  payment_reminder: "שלום {customer}, נותרה יתרה לתשלום בסך {amount}. תודה!",
};

function build(
  type: string,
  label: string,
  icon: string,
  overrides: PartialBusinessConfig,
): BusinessConfig {
  return {
    type,
    label,
    icon,
    terminology: { ...DEFAULT_TERMS, ...(overrides.terminology ?? {}) },
    leadStatuses: overrides.leadStatuses ?? DEFAULT_LEAD_STATUSES,
    jobStatuses: overrides.jobStatuses ?? DEFAULT_JOB_STATUSES,
    sampleServices: overrides.sampleServices ?? [],
    customFields: overrides.customFields ?? [],
    messageTemplates: { ...DEFAULT_MESSAGES, ...(overrides.messageTemplates ?? {}) },
    aiInstructions:
      overrides.aiInstructions ??
      "אתה עוזר עסקי מקצועי. השתמש רק בנתוני העסק האמיתיים. אל תמציא מחירים או פרטים.",
  };
}

export const TEMPLATES: Record<string, BusinessConfig> = {
  generic: build("generic", "עסק כללי", "Briefcase", {
    sampleServices: [
      { name: "שירות בסיסי", category: "כללי", price: 200, durationMin: 60 },
      { name: "שירות מורחב", category: "כללי", price: 450, durationMin: 120 },
    ],
    aiInstructions: "אתה עוזר עסקי כללי. השתמש בנתוני העסק בלבד.",
  }),

  sofa_cleaning: build("sofa_cleaning", "ניקוי ספות", "Sofa", {
    sampleServices: [
      { name: "ניקוי ספה 2 מושבים", category: "ניקוי", price: 250, durationMin: 60, cost: 40 },
      { name: "ניקוי ספה 3 מושבים", category: "ניקוי", price: 350, durationMin: 75, cost: 55 },
      { name: "ניקוי ספה 4 מושבים", category: "ניקוי", price: 450, durationMin: 90, cost: 70 },
      { name: "ניקוי פינת ישיבה", category: "ניקוי", price: 600, durationMin: 120, cost: 90 },
      { name: "ניקוי מזרן זוגי", category: "ניקוי", price: 300, durationMin: 60, cost: 45 },
      { name: "ניקוי שטיח", category: "ניקוי", price: 180, durationMin: 45, cost: 25 },
    ],
    aiInstructions:
      "אתה עוזר לעסק ניקוי ספות. הצע שירותי ניקוי לפי מספר מושבים והשתמש במחירון בלבד.",
  }),

  cleaning_company: build("cleaning_company", "חברת ניקיון", "Sparkles", {
    sampleServices: [
      { name: "ניקיון דירה עד 3 חדרים", category: "ניקיון", price: 300, durationMin: 180 },
      { name: "ניקיון דירה 4-5 חדרים", category: "ניקיון", price: 450, durationMin: 240 },
      { name: "ניקיון לאחר שיפוץ", category: "ניקיון", price: 700, durationMin: 300 },
      { name: "ניקיון משרד", category: "מסחרי", price: 400, durationMin: 180 },
    ],
  }),

  plumber: build("plumber", "אינסטלטור", "Wrench", {
    terminology: { job: "קריאת שירות", jobs: "קריאות שירות", employee: "טכנאי", employees: "טכנאים" },
    sampleServices: [
      { name: "פתיחת סתימה", category: "אינסטלציה", price: 350, durationMin: 60 },
      { name: "החלפת ברז", category: "אינסטלציה", price: 250, durationMin: 45 },
      { name: "תיקון נזילה", category: "אינסטלציה", price: 400, durationMin: 90 },
      { name: "התקנת דוד שמש", category: "התקנות", price: 1200, durationMin: 180 },
    ],
    aiInstructions: "אתה עוזר לאינסטלטור. קריאות שירות ותיקונים. השתמש במחירון בלבד.",
  }),

  electrician: build("electrician", "חשמלאי", "Zap", {
    terminology: { job: "קריאת שירות", jobs: "קריאות שירות", employee: "טכנאי", employees: "טכנאים" },
    sampleServices: [
      { name: "תיקון תקלת חשמל", category: "חשמל", price: 350, durationMin: 60 },
      { name: "התקנת גוף תאורה", category: "התקנות", price: 200, durationMin: 45 },
      { name: "החלפת לוח חשמל", category: "חשמל", price: 900, durationMin: 180 },
      { name: "בדיקת תקינות", category: "בדיקות", price: 250, durationMin: 60 },
    ],
  }),

  hvac: build("hvac", "טכנאי מזגנים", "Wind", {
    terminology: { job: "קריאת שירות", jobs: "קריאות שירות", employee: "טכנאי", employees: "טכנאים" },
    sampleServices: [
      { name: "ניקוי מזגן", category: "תחזוקה", price: 250, durationMin: 45 },
      { name: "מילוי גז", category: "תיקונים", price: 400, durationMin: 60 },
      { name: "התקנת מזגן", category: "התקנות", price: 800, durationMin: 180 },
      { name: "תיקון מזגן", category: "תיקונים", price: 350, durationMin: 90 },
    ],
  }),

  barber: build("barber", "מספרה", "Scissors", {
    terminology: { job: "תור", jobs: "תורים", customer: "לקוח", employee: "ספר", employees: "ספרים" },
    sampleServices: [
      { name: "תספורת גבר", category: "תספורות", price: 60, durationMin: 30 },
      { name: "תספורת + זקן", category: "תספורות", price: 90, durationMin: 45 },
      { name: "עיצוב זקן", category: "עיצוב", price: 40, durationMin: 20 },
      { name: "צביעה", category: "טיפולים", price: 150, durationMin: 60 },
    ],
    aiInstructions: "אתה עוזר למספרה. ניהול תורים ושירותי תספורת. השתמש במחירון בלבד.",
  }),

  pest_control: build("pest_control", "הדברה", "Bug", {
    terminology: { job: "קריאת שירות", jobs: "קריאות שירות" },
    sampleServices: [
      { name: "הדברת ג'וקים", category: "הדברה", price: 350, durationMin: 60 },
      { name: "הדברת נמלים", category: "הדברה", price: 300, durationMin: 45 },
      { name: "הדברה מונעת שנתית", category: "מנויים", price: 900, durationMin: 90 },
    ],
  }),

  mover: build("mover", "עסק הובלות", "Truck", {
    terminology: { job: "הובלה", jobs: "הובלות" },
    sampleServices: [
      { name: "הובלת דירת 2 חדרים", category: "הובלות", price: 900, durationMin: 240 },
      { name: "הובלת דירת 3 חדרים", category: "הובלות", price: 1400, durationMin: 300 },
      { name: "הובלת פריט בודד", category: "הובלות", price: 300, durationMin: 90 },
    ],
  }),

  photographer: build("photographer", "צלם", "Camera", {
    terminology: { job: "צילום", jobs: "צילומים" },
    sampleServices: [
      { name: "צילום אירוע", category: "אירועים", price: 2500, durationMin: 240 },
      { name: "צילום מוצר", category: "מסחרי", price: 800, durationMin: 120 },
      { name: "פוטו-שוט משפחתי", category: "פרטי", price: 600, durationMin: 90 },
    ],
  }),

  personal_trainer: build("personal_trainer", "מאמן כושר", "Dumbbell", {
    terminology: { customer: "מתאמן", customers: "מתאמנים", job: "אימון", jobs: "אימונים" },
    sampleServices: [
      { name: "אימון אישי", category: "אימונים", price: 150, durationMin: 60 },
      { name: "חבילת 10 אימונים", category: "חבילות", price: 1300, durationMin: 60 },
      { name: "בניית תוכנית תזונה", category: "ייעוץ", price: 400, durationMin: 60 },
    ],
  }),

  cosmetician: build("cosmetician", "קוסמטיקאית", "Flower2", {
    terminology: { customer: "מטופלת", customers: "מטופלות", job: "טיפול", jobs: "טיפולים" },
    sampleServices: [
      { name: "טיפול פנים", category: "פנים", price: 250, durationMin: 60 },
      { name: "הסרת שיער בלייזר", category: "לייזר", price: 200, durationMin: 30 },
      { name: "עיצוב גבות", category: "עיצוב", price: 80, durationMin: 20 },
    ],
  }),

  mechanic: build("mechanic", "מוסך", "Car", {
    terminology: { job: "טיפול", jobs: "טיפולים", employee: "מכונאי", employees: "מכונאים" },
    sampleServices: [
      { name: "טיפול תקופתי", category: "תחזוקה", price: 600, durationMin: 120 },
      { name: "החלפת בלמים", category: "תיקונים", price: 800, durationMin: 120 },
      { name: "בדיקה לפני קנייה", category: "בדיקות", price: 350, durationMin: 60 },
    ],
  }),

  delivery: build("delivery", "עסק משלוחים", "Package", {
    terminology: { job: "משלוח", jobs: "משלוחים", employee: "שליח", employees: "שליחים" },
    sampleServices: [
      { name: "משלוח מקומי", category: "משלוחים", price: 40, durationMin: 30 },
      { name: "משלוח בין-עירוני", category: "משלוחים", price: 90, durationMin: 90 },
    ],
  }),
};

/** Public list for onboarding pickers (label + icon + type). */
export const TEMPLATE_LIST = Object.values(TEMPLATES)
  .filter((t) => t.type !== "generic")
  .map((t) => ({ type: t.type, label: t.label, icon: t.icon }));

export function getTemplate(type: string | null | undefined): BusinessConfig {
  return (type && TEMPLATES[type]) || TEMPLATES.generic;
}
