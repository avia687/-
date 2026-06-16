# אדמונד · EDMOND Barbershop ✂️

אתר תדמית יוקרתי למספרה/ברברשופ עם **מערכת קביעת תורים מלאה** — עיצוב כהה
(שחור · אפור · זהב), אנימציות פרימיום, נגישות מלאה ו‑SEO מובנה.

נבנה עם **Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion ·
GSAP** ורכיבי UI בסגנון **shadcn**.

> כל הממשק בעברית עם תמיכת RTL מלאה.

---

## ✨ יכולות עיקריות

- **Hero** עם רקע אנימטיבי, כותרת זוהרת, נתונים ואנימציות כניסה.
- **אודות** עם אפקט Parallax על התמונות וכרטיסי ערכים.
- **שירותים** — כרטיסים עם אייקונים, מחירים, hover תלת‑ממדי (tilt) וקישור ישיר להזמנה.
- **גלריה** — השוואת *לפני / אחרי* אינטראקטיבית (מחוון נגרר), סינון לפי קטגוריה ו‑Lightbox.
- **צוות** — כרטיסי ספרים עם תמונות, דירוגים, התמחויות וכפתור "קבע עם…".
- **מערכת קביעת תורים** ב‑5 שלבים: שירות → ספר → תאריך → שעה → פרטים → אישור.
  - בדיקת זמינות מול השרת, **מניעת תורים כפולים**, ולידציה (זוד) ו**שליחת מייל אישור**.
- **ביקורות לקוחות** עם דירוג כוכבים.
- **יצירת קשר** — טלפון, WhatsApp צף, מפת Google מוטמעת ושעות פעילות.
- **אפקטים**: Cursor מותאם (מספריים זהב), קווי שיער זורמים על Canvas שמגיבים לעכבר,
  מספריים שנפתחות ונסגרות, פס התקדמות גלילה, Reveal בכניסה (fade/slide/scale).
- **נגישות**: HTML סמנטי, ניווט מקלדת, `aria-*`, דילוג לתוכן, כיבוד `prefers-reduced-motion`.
- **SEO**: Metadata, Open Graph, JSON‑LD (`HairSalon`), `sitemap.xml`, `robots.txt`, `manifest`.

---

## 🚀 התקנה והרצה

דרישה מקדימה: **Node.js 18+** (מומלץ 20/22).

```bash
cd barbershop

# התקנת תלויות
npm install

# הרצה במצב פיתוח → http://localhost:3000
npm run dev

# בנייה לפרודקשן + הרצה
npm run build
npm start

# בדיקות עזר
npm run lint        # ESLint
npm run typecheck   # בדיקת טיפוסים
```

### משתני סביבה (אופציונלי)

העתיקו `.env.example` ל‑`.env.local`. מיילים נשלחים רק אם מוגדר SMTP — אחרת
ההזמנה נשמרת והמייל נרשם ל‑console (האתר עובד מצוין גם בלי הגדרה):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
SMTP_FROM="אדמונד ברברשופ <no-reply@example.com>"
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

---

## 🗂️ מבנה הפרויקט

```
barbershop/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # RTL, פונטים, SEO, JSON-LD
│   │   ├── page.tsx            # הרכבת כל הסקשנים
│   │   ├── globals.css         # מערכת העיצוב (משתני CSS, יוטיליטיז)
│   │   ├── robots.ts · sitemap.ts · manifest.ts · icon.svg
│   │   └── api/
│   │       ├── availability/   # GET — שעות פנויות
│   │       └── bookings/       # POST — יצירת הזמנה
│   ├── components/
│   │   ├── ui/                 # רכיבי בסיס בסגנון shadcn (button, card…)
│   │   ├── effects/            # Cursor, HairLines, Parallax, Reveal, Tilt…
│   │   ├── layout/             # Navbar, Footer, WhatsAppButton
│   │   ├── shared/             # SectionHeading, SmartImage, BeforeAfter…
│   │   └── sections/           # Hero, About, Services, Gallery, Team,
│   │       └── booking/        # Booking + שלבים + Context
│   ├── data/                   # services, team, gallery, reviews
│   └── lib/                    # site config, types, slots, store, email, utils
├── tailwind.config.ts          # ערכת צבעים זהב + אנימציות
└── .env.example
```

---

## 🎨 התאמה אישית (Customization)

- **פרטי העסק** (שם, טלפון, כתובת, שעות, וואטסאפ, רשתות): `src/lib/site.ts`.
- **שירותים ומחירים**: `src/data/services.ts`.
- **צוות הספרים**: `src/data/team.ts` (שדה `image` — קישור לתמונה; ריק ⇐ Fallback מעוצב).
- **גלריה לפני/אחרי**: `src/data/gallery.ts`.
- **ביקורות**: `src/data/reviews.ts`.
- **צבעים וטיפוגרפיה**: `tailwind.config.ts` + `globals.css`.
- **שעות עבודה לזימון** (פר יום בשבוע) וצעד הסלוטים: `workingHours` / `slotStepMin` ב‑`site.ts`.

> התמונות משתמשות ב‑Unsplash דרך `next/image`. אם תמונה לא נטענת, מוצג רקע זהב
> מעוצב במקום — כך הפריסה לעולם לא נשברת. להחלפה לתמונות אמיתיות, עדכנו את
> שדות ה‑`image` / `before` / `after` בקבצי ה‑data.

---

## 🔐 מערכת התורים — הערה לפרודקשן

האחסון הנוכחי הוא **בזיכרון** (`src/lib/booking-store.ts`) לצורך הדגמה, ולכן
מתאפס בהפעלה מחדש / בסביבת serverless. החלפה ל‑DB אמיתי (Postgres + Prisma,
Supabase, וכו') אינה משנה את שאר הקוד — חתימות הפונקציות `availableTimes`,
`createBooking` ו‑`isBarberFree` נשארות זהות. מניעת התורים הכפולים מתבצעת
בצד השרת בלבד (לא ניתן לעקוף מהדפדפן).

---

## 💡 רעיונות לשיפורים עתידיים

- חיבור למסד נתונים + פאנל ניהול לספרים (יומן, אישור/ביטול תורים).
- אימות SMS/OTP, תזכורות אוטומטיות ויומן Google/iCal.
- תשלום מקדמה אונליין (Stripe / Tranzila / Bit).
- אזור אישי ללקוח עם היסטוריית תספורות והעדפות.
- ריבוי שפות (he/en/ar) עם `next-intl`, ומצב בהיר/כהה.
- CMS (Sanity/Contentful) לניהול גלריה, שירותים וצוות.
- בדיקות (Playwright/Vitest) ו‑Analytics (Vercel/Plausible).
- העלאת תמונות "לפני/אחרי" אמיתיות + אופטימיזציה אוטומטית.

---

## 📦 פריסה (Deploy)

מתאים במיוחד ל‑**Vercel** (לחצו Import, הגדירו משתני סביבה, Deploy). פועל גם על
כל פלטפורמה שתומכת ב‑Node: `npm run build && npm start`.

נבנה באהבה ובדיוק ✦
