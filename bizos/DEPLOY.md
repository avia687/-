# פריסת BizOS אונליין — מדריך מהיר

המערכת מוכנה לפריסה. הקוד וההגדרות כבר מוכנים — נשאר רק להתחבר ל-Vercel וללחוץ.
זה לוקח בערך **10–15 דקות** (רובן המתנה לבנייה).

> מה שאני יכולתי להכין — הכנתי (build אוטומטי, מעבר ל-Postgres, בדיקות, תיעוד).
> מה שנשאר זה בחשבון שלך: כניסה, יצירת מסד נתונים, ולחיצה על Deploy.

---

## אפשרות א' — כפתור בלחיצה אחת (הכי מהיר)

לחץ על הכפתור, התחבר עם GitHub, ומלא את השדות שנבקש ממך:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Favia687%2F-&project-name=bizos&repository-name=bizos&root-directory=bizos&env=DATABASE_URL,NEXTAUTH_SECRET,NEXTAUTH_URL&envDescription=DATABASE_URL%3D%D7%9E%D7%97%D7%A8%D7%95%D7%96%D7%AA%20%D7%97%D7%99%D7%91%D7%95%D7%A8%20Postgres%20%D7%A9%D7%9C%D7%9A%20%7C%20NEXTAUTH_SECRET%3D%D7%9E%D7%97%D7%A8%D7%95%D7%96%D7%AA%20%D7%90%D7%A7%D7%A8%D7%90%D7%99%D7%AA%20%D7%90%D7%A8%D7%95%D7%9B%D7%94%20%7C%20NEXTAUTH_URL%3D%D7%9B%D7%AA%D7%95%D7%91%D7%AA%20%D7%94%D7%90%D7%AA%D7%A8%20%D7%A9%D7%9C%D7%9A)

בזמן שהכפתור פותח את הטופס:
- **Root Directory** כבר מוגדר ל-`bizos`.
- אם עדיין אין לך מסד נתונים — צור אחד חינמי ב-[Neon](https://neon.tech) (2 דקות),
  העתק את מחרוזת החיבור, והדבק ב-`DATABASE_URL`. או השתמש ב-Vercel Postgres (אפשרות ב').

---

## אפשרות ב' — ייבוא ידני (הכי אמין)

1. היכנס ל-[vercel.com](https://vercel.com) עם חשבון GitHub שלך.
2. **Add New → Project** → בחר את המאגר `avia687/-`.
3. **Root Directory** → הגדר ל-`bizos`. (Vercel יזהה אוטומטית Next.js.)
4. **מסד נתונים** — Vercel → **Storage → Create → Postgres** (מבוסס Neon), באותו פרויקט.
   Vercel יזריק אוטומטית משתני חיבור; ודא שיש משתנה בשם `DATABASE_URL`
   (אם השם שונה, צור משתנה `DATABASE_URL` והעתק אליו את מחרוזת החיבור).

---

## משתני סביבה (Environment Variables)

| משתנה | ערך | חובה? |
|---|---|---|
| `DATABASE_URL` | מחרוזת חיבור Postgres | ✅ |
| `NEXTAUTH_SECRET` | מחרוזת אקראית ארוכה — הרץ `openssl rand -base64 32`, או כתוב טקסט אקראי ארוך | ✅ |
| `NEXTAUTH_URL` | כתובת האתר שלך, למשל `https://bizos.vercel.app` — ראה הערה למטה | ✅ |
| `OPENAI_API_KEY` | להחלפת ה-AI המובנה במודל אמיתי | ✖️ רשות |

**לגבי `NEXTAUTH_URL`:** בפריסה הראשונה עדיין אין לך את הכתובת הסופית.
- פרוס פעם ראשונה (גם בלי המשתנה הזה),
- העתק את הכתובת ש-Vercel נותן (מופיעה בראש הפרויקט),
- הוסף אותה כ-`NEXTAUTH_URL`,
- לחץ **Redeploy**.

---

## מה קורה בפריסה

- ה-build מריץ אוטומטית `prisma db push` → **יוצר את כל הטבלאות** ב-Postgres.
- אין נתוני דמו בפרודקשן — אתה נרשם ומקים עסק אמיתי דרך ה-Onboarding.

## אחרי הפריסה — התחלת שימוש

1. פתח את כתובת האתר.
2. **הרשמה** → אשף ה-Onboarding → בחר סוג עסק (למשל "ניקוי ספות") → מלא פרטים.
3. מתחילים: לקוחות, לידים, הצעות מחיר, יומן, תשלומים, AI — הכל נשמר ב-Postgres וזמין מכל מכשיר.

---

## פתרון תקלות

| תסמין | סיבה נפוצה | פתרון |
|---|---|---|
| ה-build נכשל על `prisma db push` | `DATABASE_URL` שגוי/חסר | ודא שהמשתנה קיים ותקין, ופרוס מחדש |
| התחברות נכשלת / חוזר למסך login | `NEXTAUTH_URL` לא תואם לכתובת | הגדר `NEXTAUTH_URL` לכתובת המדויקת ולחץ Redeploy |
| "שגיאת שרת" בפעולות | `NEXTAUTH_SECRET` חסר | הוסף אותו ופרוס מחדש |

> הערה על עומסים: חיבור `DATABASE_URL` ישיר מספיק ל-MVP. אם בעתיד יש הרבה תעבורה,
> עוברים לחיבור מאגר (pooled) של Vercel Postgres — לא נדרש עכשיו.
