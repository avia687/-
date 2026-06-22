# פריסה ל‑Railway — קבלת קישור לאתר 🚀

מדריך לחיצה‑אחר‑לחיצה. בסוף תקבל כתובת כמו `https://xxxx.up.railway.app`
שאפשר לפתוח מכל מקום (גם מהטלפון).

> חשוב: ה‑repo כבר מכיל אפליקציה אחרת שמתפרסת מהשורש. לכן את אתר Polymarket
> פורסים כ**שירות נפרד** עם **Root Directory = `polymarket`**. ככה השניים לא
> מתנגשים.

## שלבים

1. **כניסה ל‑Railway**
   - היכנס ל‑https://railway.app ולחץ **Login** → התחבר עם **GitHub**.

2. **פרויקט חדש מה‑repo**
   - לחץ **New Project** → **Deploy from GitHub repo**.
   - בחר את המאגר **`avia687/-`**. (אם זו הפעם הראשונה, אשר ל‑Railway גישה
     ל‑GitHub שלך.)

3. **חיבור התיקייה הנכונה** (הצעד הכי חשוב)
   - אחרי שהשירות נוצר, פתח אותו → **Settings**.
   - תחת **Source / Root Directory** הקלד: `polymarket`
   - תחת **Branch** בחר את הענף שבו הקוד יושב:
     - כרגע: `claude/upbeat-noether-jcte1p`
     - או אחרי שתמזג ל‑`main`: `main`

4. **בנייה והרצה** — אוטומטי
   - Railway יזהה Node, יריץ `npm install` ואז `npm start`.
   - לא צריך להגדיר `PORT` — Railway מזריק אותו לבד.

5. **יצירת הקישור**
   - **Settings → Networking → Generate Domain**.
   - מקבלים כתובת ציבורית. פתח אותה — האתר עולה. ✅

## מתי יוצגו נתונים חיים מ‑Polymarket?

ברגע שהאתר רץ על Railway (שיש לו גישה חופשית לאינטרנט) הוא ימשוך נתונים
**אמיתיים** מ‑Polymarket לבד. התווית בראש העמוד תשתנה מ"מצב הדגמה" ל"נתונים
חיים". אם בכל זאת תרצה לכפות דמו — הוסף ב‑Railway משתנה סביבה:

```
DATA_MODE = demo
```

(Settings → **Variables** → New Variable)

## משתני סביבה אופציונליים

| משתנה | ברירת מחדל | מה זה |
|-------|------------|-------|
| `DATA_MODE` | (live) | `demo` כדי לכפות נתוני דמו |
| `CACHE_TTL_MS` | `60000` | כל כמה זמן לרענן מ‑Polymarket |
| `PM_TIMEOUT_MS` | `15000` | timeout לקריאות ל‑Polymarket |

זהו — אחרי השלבים האלה יש לך קישור חי לאתר.
