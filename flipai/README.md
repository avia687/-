# FlipAI — פלטפורמת מכירה יד-שנייה מבוססת AI

העלו תמונת מוצר → FlipAI מזהה את המוצר → מעריך שווי שוק → יוצר מודעה מקצועית →
עוזר למכור מהר ויקר יותר. ממשק פרימיום בעברית מלאה (RTL), מצב בהיר וכהה.

> **הלולאה המרכזית:** העלאה → ניתוח → תמחור → מודעה → מכירה, בפחות מדקה.

הפרויקט **רץ במלואו ללא אף מפתח חיצוני** — ניתוח ה-AI והתשלומים עובדים במצב
הדגמה (mock) דטרמיניסטי, ומשתדרגים אוטומטית ל-OpenAI/Stripe אמיתיים ברגע
שמוסיפים מפתחות בסביבת ההרצה.

## הרצה מקומית

```bash
cd flipai
cp .env.example .env          # הגדירו NEXTAUTH_SECRET אמיתי
npm install
npm run setup                 # prisma generate + db push + seed
npm run dev                   # http://localhost:3000
```

משתמשי הדגמה שנוצרים ב-seed:

- **מוכר:** `demo@flipai.co` / `demo1234` (מסלול Pro, מוצרים לדוגמה)
- **מנהל:** `admin@flipai.co` / `admin1234` (גישה לפאנל /admin)

בדיקות איכות:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # בניית production
```

## מבנה

```
src/
  app/
    (auth)/           login · signup · forgot-password
    (app)/            layout (shell+auth) · dashboard · analyze · products · settings · admin
    onboarding/       שאלון קצר לאחר הרשמה
    api/              analyze · listings/regenerate · negotiate · products/[id]
                      billing/{checkout,cancel,webhook} · onboarding · profile · auth
    page.tsx          דף נחיתה · pricing · sitemap/robots/manifest
  components/
    ui/               מערכת עיצוב (button, card, modal, tabs, toast, score, price-card…)
    app/              app-shell · stat-tile · usage-meter · upgrade-modal · subscription-panel
    product/          product-detail · negotiation · library-controls
    marketing/        header · footer · pricing-section · faq
  lib/
    ai/               types(zod) · provider · mock · openai · index  (שירות AI מרוכז)
    market/engine.ts  מנוע שווי שוק (גוזר טווחים, מחירים וציון עסקה)
    billing/          plans · provider · mock · stripe · index
    usage · rate-limit · analytics · images(sharp) · auth · db · queries · utils
prisma/
  schema.prisma       SQLite (users, subscriptions, usage, products, images, analyses,
                      listings, negotiations)
  seed.ts
```

## מסד נתונים

SQLite ברירת מחדל (אפס הגדרה). למעבר ל-PostgreSQL בפרודקשן: שנו את
`datasource.provider` ל-`postgresql` ב-`prisma/schema.prisma` והצביעו את
`DATABASE_URL` על מסד רץ — אין צורך בשינוי מודלים.

ישויות: `User`, `Account`, `Session`, `Subscription`, `Usage`, `Product`,
`ProductImage`, `Analysis`, `GeneratedListing`, `NegotiationMessage` — עם
מפתחות זרים, אינדקסים וחותמות זמן.

## משתני סביבה

| משתנה | חובה | תיאור |
|---|---|---|
| `DATABASE_URL` | ✅ | ברירת מחדל `file:./dev.db` |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | כתובת האפליקציה |
| `OPENAI_API_KEY` | — | מפעיל ניתוח AI אמיתי (אחרת mock) |
| `OPENAI_MODEL` | — | ברירת מחדל `gpt-4o-mini` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | — | כפתור התחברות Google |
| `STRIPE_SECRET_KEY` | — | מפעיל חיוב אמיתי (אחרת checkout מדומה) |
| `STRIPE_WEBHOOK_SECRET` | — | אימות webhook |
| `STRIPE_PRICE_PRO` / `_SELLER` | — | מזהי מחיר ב-Stripe |
| `APP_URL` | — | בסיס לקישורי Stripe/SEO |

## מה נותר לחיבור בפרודקשן

1. **מסד נתונים אמיתי** — החלפת SQLite ב-Postgres (שורה אחת).
2. **OpenAI** — הוספת `OPENAI_API_KEY` להפעלת זיהוי ותמחור אמיתיים מתמונות.
3. **Stripe** — הוספת מפתחות + מזהי מחיר; ה-webhook כבר מוכן (`/api/billing/webhook`).
4. **נתוני שוק אמיתיים** — מנוע השווי (`lib/market/engine.ts`) בנוי כך שאפשר
   לשלב מקורות מחירים אמיתיים (יד2, מרקטפלייס, eBay sold) לצד/במקום הערכת ה-AI.
   כל שווי מסומן בבירור כ**"שווי משוער ע"י AI"** — לעולם לא כנתון מכירה בפועל.
5. **שליחת אימיילים** — חיבור ספק לאיפוס סיסמה.
6. **אחסון תמונות** — כרגע דיסק מקומי `/public/uploads`; לפרודקשן מומלץ S3/R2.

## החלטות טכניות עיקריות

- **שכבת הפשטה ל-AI ולתשלומים** עם fallback ללא מפתחות — האפליקציה תמיד עובדת.
- **כל קריאות ה-AI עוברות דרך שירות אחד** (`lib/ai`), עם ולידציית zod ו-fallback
  אוטומטי ל-mock אם תשובת המודל שגויה.
- **הפרדה בין הערכת AI לנתוני שוק** — מנוע נפרד, כל ערך מסומן כמשוער.
- **בדיקות הרשאה ומכסות בצד השרת בלבד** — לעולם לא סומכים על הלקוח לזהות
  משתמש, רמת מנוי או מספר ניתוחים.
- **תמונות**: ולידציה (JPG/PNG/WEBP, עד 8MB), דחיסה ל-webp + תמונה ממוזערת (sharp).
- **Rate-limiting** בזיכרון על נתיבי ה-API.
