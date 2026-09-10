# BizOS — מערכת הפעלה לעסק (multi-tenant SaaS)

מערכת SaaS אחת גנרית לניהול עסקים קטנים ובינוניים. **קור אחד** משרת מגוון עסקים
(ניקוי ספות, אינסטלטור, מספרה, מוסך, טכנאי מזגנים, מדביר, צלם ועוד) — רק
**הטרמינולוגיה, השירותים, השדות והסטטוסים** משתנים לפי סוג העסק, דרך
**Business Configuration / Template Engine**.

## הרצה מקומית

```bash
cd bizos
cp .env.example .env      # ברירת מחדל: SQLite ללא קונפיגורציה
npm install
npm run setup             # prisma generate + db push + seed
npm run dev               # http://localhost:3000
```

### התחברות לדמו (נוצרת ע"י ה-seed)

- אימייל: `avia@demo.bizos`
- סיסמה: `demo1234`

עסק הדמו — **Avia Sofa Cleaning** — מגיע מלא בלקוחות, לידים, שירותים, הצעות מחיר,
עבודות ביומן, תשלומים, הוצאות, עובדים וביקורות.

## פריסה אונליין (Vercel + Postgres) — כדי להשתמש מכל מקום

המערכת מוכנה לפריסה. בפיתוח היא רצה על SQLite; בפרודקשן היא עוברת אוטומטית ל-PostgreSQL
(סקריפט `vercel-build` מחליף את ה-provider בזמן ה-build — אין צורך לערוך כלום ידנית).

1. **Vercel** → התחבר/י עם GitHub → **Add New → Project** → ייבא את המאגר `avia687/-`.
2. **Root Directory** → הגדר ל-`bizos` (במאגר יש כמה פרויקטים — זה מפנה את Vercel ל-BizOS).
   Vercel יזהה אוטומטית **Next.js**.
3. **מסד נתונים**: ב-Vercel → **Storage → Create → Postgres** (מבוסס Neon), באותו פרויקט.
   העתק/י את מחרוזת החיבור (connection string).
4. **Environment Variables** (Project → Settings → Environment Variables):
   - `DATABASE_URL` = מחרוזת החיבור מ-Postgres.
   - `NEXTAUTH_SECRET` = מחרוזת אקראית ארוכה (`openssl rand -base64 32`).
   - `NEXTAUTH_URL` = כתובת האתר שלך (למשל `https://your-app.vercel.app`) — הגדר לאחר
     הפריסה הראשונה כשה-domain מופיע, ואז **Redeploy**.
   - *(רשות)* `OPENAI_API_KEY` — כדי להחליף את ה-AI מה-mock המובנה למודל אמיתי.
5. **Deploy**. ה-build הראשון מריץ `prisma db push` ויוצר את הטבלאות ב-Postgres.
6. פתח/י את הכתובת → **הרשמה** → אשף ה-Onboarding → בחר/י סוג עסק → מתחילים לעבוד.
   הנתונים נשמרים ב-Postgres וזמינים מכל מכשיר.

> אם ה-build נכשל על `prisma db push` — כמעט תמיד זה `DATABASE_URL` שגוי/חסר.
> בפרודקשן אין נתוני דמו: נרשמים ומקימים עסק אמיתי דרך ה-Onboarding.

## סטאק

Next.js 14 (App Router) · TypeScript · Prisma · NextAuth (credentials) ·
Tailwind · Recharts · Zod · framer-motion.

DB: SQLite כברירת מחדל לפיתוח. למעבר לפרודקשן — שנה את `provider` ל-`postgresql`
ב-`prisma/schema.prisma` והצבע `DATABASE_URL` ל-Postgres (ללא שינוי מודלים).

## ארכיטקטורה

- **Multi-tenant**: כל עסק הוא `Organization`. כל שורה עסקית נושאת `organizationId`,
  וכל שאילתה מסוננת דרך `src/lib/tenant.ts` — בידוד מוחלט בין עסקים.
- **הרשאות (RBAC)**: `src/lib/rbac.ts` — OWNER / ADMIN / MANAGER / EMPLOYEE, נאכף בשרת.
- **Business Engine**: `src/lib/business/` — `templates.ts` (רישום תבניות),
  `resolve.ts` (מיזוג תבנית + התאמות הטננט). המסכים קוראים את הקונפיג המפוצל
  (`useBusiness()` / `<Term>`) ולא מסתעפים לפי סוג עסק.
- **הפשטות ספקים** (ללא זיוף חיבורים):
  - `src/lib/ai/` — `AIProvider` עם mock דטרמיניסטי + מתאם OpenAI מאחורי `isRealAI()`.
    ה-AI תמיד מבוסס על `BusinessSnapshot` מנתונים אמיתיים ולא ממציא מחירים.
  - `src/lib/messaging/` — ממשק WhatsApp/SMS/אימייל + mock provider (מדווח `connected=false`).
  - `src/lib/payments/` — מעקב תשלומים אמיתי; *סליקה* היא ממשק + mock (מוכן ל-Stripe/Bit).
- **מנויים**: `src/lib/subscription.ts` — תוכניות + `assertWithinLimit()` לגבולות שימוש.
- **עמודים ציבוריים** (ללא התחברות, מוגנים בטוקן): `/quote/[token]` (אישור הצעה),
  `/review/[token]` (השארת ביקורת).

## בדיקות

```bash
npm run typecheck   # tsc --noEmit
npm run build       # בניית פרודקשן
npm run test        # Vitest — unit + integration (בידוד multi-tenant, הרשאות, הצעות, AI, אוטומציות)
npm run test:e2e    # Playwright — זרימות E2E קריטיות (משתמש ב-Chromium מותקן מראש)
```

**כיסוי הבדיקות:**
- **Unit**: חישובי הצעות מחיר (`calcQuote`), מיזוג קונפיגורציית עסק, מטריצת הרשאות (`rbac`), מגבלות מנוי.
- **Integration** (מול DB אמיתי): בידוד multi-tenant (עסק B מקבל 404 על משאב של עסק A), הרשאות (EMPLOYEE מקבל 403 על הגדרות), ולידציה (422), זרימת הצעת מחיר מלאה + אישור ציבורי, עיגון ה-AI בנתונים אמיתיים, ומניעת כפילות באוטומציות.
- **E2E**: הרשמה→Onboarding→דשבורד, יצירת לקוח ששורד Refresh, וטעינת דשבורד/הגדרות.
