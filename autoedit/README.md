# AutoEdit – עורך וידאו אוטומטי שלומד בעצמו

מעלים ערימת חומר גולמי (תמונות, סרטונים, הקלטות), כותבים משפט אחד אם רוצים, ומקבלים 3 גרסאות ערוכות לבחירה, מוכנות ל-TikTok, ל-Reels, ל-Shorts, ל-Facebook, ל-YouTube ול-LinkedIn.
המערכת רצה מקומית על המחשב שלך, והכלים שלה חינמיים או בקוד פתוח. ה-API של Claude ושאר המפתחות הם אופציונליים.

---

## איך מוציאים סרטון ב-3 קליקים

1. **גוררים** תיקייה או קבצים לאזור הגרירה. מהטלפון: "בחירה מהגלריה".
2. **כותבים משפט אחד** (לא חובה), למשל `סרטון למכירת דירה, אנרגטי`.
3. **לוחצים "צור".**

מקבלים 3 גרסאות זו לצד זו, כל אחת עם ציון מהמבקר. בוחרים אחת, ואז אפשר:

- לשנות כל דבר בצ'אט, למשל "תקצר את ההתחלה", "מוזיקה יותר שקטה", "תוסיף כתובית בשנייה 12: מבצע!"
- ללחוץ על **ייצא**: מקבלים קובץ לכל פלטפורמה, 3 תמונות ממוזערות, וכותרת, תיאור והאשטגים לכל רשת.
- אחרי שפרסמתם, להדביק את הקישור ב"פרסמתי". המערכת תמשוך ביצועים ותלמד מהם.

---

## התקנה והפעלה

### Mac / Linux
```bash
cd autoedit
./setup.sh      # מתקין הכול: ffmpeg, Python, מודלים, פונטים, אפקטים קוליים ומוזיקה
./start.sh      # מפעיל ופותח את הדפדפן בכתובת http://localhost:8765
```

### Windows או כל מחשב עם Docker
```bash
cd autoedit
docker compose up --build
```
אחר כך פותחים את http://localhost:8765. ל-GPU של NVIDIA מבטלים את ההערה בקובץ `docker-compose.yml`.

### מהטלפון (PWA)
`start.sh` מדפיס כתובת וקוד QR. סורקים מהטלפון (באותה רשת WiFi), ובדפדפן בוחרים "הוסף למסך הבית". מעלים מהגלריה ומורידים סרטון מוכן לשיתוף.

---

## מפתחות API, צעד אחר צעד

המפתחות נכנסים לקובץ `autoedit/.env`, שנוצר אוטומטית מ-`.env.example`. **כולם אופציונליים**, ובלעדיהם כל חלק עובד עם חלופה מקומית. מצב המפתחות מופיע בלשונית "הגדרות".

| מפתח | מה הוא נותן | בלי המפתח |
|---|---|---|
| `ANTHROPIC_API_KEY` | במאי ומבקר שמבינים את הסיפור, עריכה בצ'אט בשפה חופשית, כותרות ותסריטים | החלטות לפי כללים וחוקי עריכה |
| `YOUTUBE_API_KEY` | חיפוש אוטומטי של סרטונים מצליחים ב-YouTube וב-Shorts | חיפוש דרך yt-dlp בלבד, פחות יציב |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` | B-roll חינמי כשחסר חומר | הספרייה המקומית `assets/broll/` |
| `ELEVENLABS_API_KEY` | קריינות טבעית ושכפול הקול שלך | MMS-TTS מקומי, אם מותקן |

**Claude (Anthropic)**
1. נכנסים ל-https://console.anthropic.com ונרשמים.
2. Settings ← Billing: מוסיפים אמצעי תשלום.
3. API Keys ← Create Key, ומעתיקים את המפתח.
4. ב-`.env` כותבים: `ANTHROPIC_API_KEY=sk-ant-...`

**YouTube Data API v3 (חינם, 10,000 יחידות ביום)**
1. נכנסים ל-https://console.cloud.google.com ויוצרים פרויקט חדש.
2. APIs & Services ← Library ← מחפשים **YouTube Data API v3** ← Enable.
3. APIs & Services ← Credentials ← Create credentials ← **API key**, ומעתיקים.
4. ב-`.env` כותבים: `YOUTUBE_API_KEY=AIza...`
5. *(אופציונלי, בשביל retention של הסרטונים שלך)*: מפעילים גם את **YouTube Analytics API**. ב-Credentials יוצרים **OAuth client ID** מסוג *Desktop app*, מורידים את קובץ ה-JSON ומריצים פעם אחת:
   `autoedit auth-youtube client_secret.json`

**Pexels**: נרשמים ב-https://www.pexels.com/api/ ← Your API Key ← `PEXELS_API_KEY=...`

**Pixabay**: https://pixabay.com/api/docs/ ← המפתח מופיע בעמוד אחרי התחברות ← `PIXABAY_API_KEY=...`

**ElevenLabs**: https://elevenlabs.io ← Profile ← API Keys ← `ELEVENLABS_API_KEY=...`. לשכפול הקול שלך מעלים דגימה של 1–2 דקות בלשונית "המותג שלי".

**Metricool** (תזמון פרסום, אופציונלי): צריך מנוי עם גישה ל-API. ב-Account settings ← API מעתיקים token, ואת userId ו-blogId מה-URL.

אחרי שינוי ב-`.env` מפעילים מחדש את `./start.sh`.

---

## מה קורה מאחורי הקלעים

```
חומר גולמי → Ingest: כל פורמט כולל HEIC, HDR, 60fps ואנכי, וניתוח איכות, רגש, דיבור וסצנות
           → Director (Claude או כללים): הבנת הסיפור והנישה, וכתיבת EDL בפורמט JSON
           → 3 גרסאות: hook ראשי, hook חלופי, וגרסה קצרה וקצבית
           → Critic: מרנדר טיוטה, נותן ציון לפי ספר כללי העריכה ומחזיר תיקונים, עד ציון 90 או 5 סבבים
           → דירוג לפי המבקר ולפי המודל שלמד
           → רינדור סופי בקידוד אחד, בלי דחיסה כפולה
```

- **דיבור למצלמה**:
  - תמלול Whisper (לעברית: מודל ivrit.ai)
  - חיתוך שתיקות, "אממ", חזרות וברכות פתיחה
  - העברת ה-hook להתחלה
  - מעקב פנים ל-9:16, וזום על מילות מפתח
  - כתוביות מילה-אחר-מילה עם RTL מלא
  - חומר נוסף שהעליתם הופך ל-B-roll
- **מונטאז' מתמונות או קליפים בלי קול**:
  - חיתוך על הביט של המוזיקה, שנבחרת לפי מצב הרוח ונגמרת בדיוק עם הסרטון
  - Ken Burns לפי הנושא בתמונה, ופרלקסה 2.5D
  - speed ramps ו-match cuts
  - כותרות קינטיות, מוני נתונים מונפשים ("120 מ״ר"), כרטיס מיקום וכרטיס סיום
- **אודיו**: ניקוי רעשים, compressor ו-de-esser, ducking של המוזיקה מתחת לדיבור, SFX (whoosh, pop, ding, riser, impact) ו-mastering ל-‎-14 LUFS.
- **צבע**: תיקון אוטומטי, LUT לפי הנישה, והתאמת צבע בין שוטים כאילו צולמו באותה מצלמה.
- **ספר כללי העריכה** (`autoedit/studio/editing_principles.md`): הבמאי והמבקר עובדים לפיו. כל אפקט צריך סיבה, אין לוגו או ברכה בפתיחה, והקצב מותאם לסוג התוכן. אפשר לערוך את הקובץ.

### מודלים מתקדמים: אם קיימים, הם בשימוש. אם לא, יש חלופה
| יכולת | מנוע מועדף | חלופה |
|---|---|---|
| ייצוב | vidstab | deshake |
| הגדלה ל-4K | Real-ESRGAN (`realesrgan-ncnn-vulkan`) | Lanczos דו-שלבי + חידוד |
| שחזור פנים | GFPGAN (`pip install gfpgan` + משקלים ב-`assets/models`) | דילוג |
| הילוך איטי | RIFE (`rife-ncnn-vulkan`) | minterpolate |
| עומק לפרלקסה | Depth-Anything-V2 (מותקן ב-setup) | עומק משוער לפי saliency |
| ניקוי קול | DeepFilterNet | afftdn + EQ |
| קריינות | ElevenLabs ← MMS-TTS ← Piper | espeak, רק כשמבקשים במפורש |

GPU מזוהה אוטומטית ומשמש את Whisper, את NVENC ואת ה-ONNX.

**החלטה טכנית:** את ה-motion graphics בניתי במנוע מובנה ב-Python במקום Remotion. כך אין תלות בדפדפן ובקידוד נוסף, והרינדור מהיר יותר. עברית מעוצבת דרך libraqm.

---

## מנוע הלמידה העצמית

| שלב | מה קורה |
|---|---|
| **Scout** (כל יום) | מחפש לפי מילות מפתח והאשטגים, ש-Claude מייצר ומרחיב עם הזמן. הסינון לפי הצלחה **יחסית**: צפיות ביחס לעוקבים, engagement ומהירות צמיחה, עד 90 יום אחורה. נשמרת גם קבוצת "רגילים" להשוואה. אין כפילויות, ו-rate limits נשמרים: כשמקור נחסם, עוברים למקור הבא. |
| **Learner** (כל שבוע) | כל סרטון מקבל וקטור תכונות: קצב, hook, כתוביות, זומים, מוזיקה ו-BPM, אורך, צבע, טקסט ונושא. מודל ML (LightGBM, או רגרסיה לוגיסטית כשיש מעט נתונים) מפיק "חשיבות תכונות". Claude מחלץ תבניות hook, פתיחות ו-CTA. |
| **פרופיל עם גרסאות** | כל גרסה נשמרת. גרסה חדשה **מופעלת רק אם** המודל שלה מנצח את הפעיל על אותו סט בדיקה. בנוסף, כל שינוי בפרופיל עובר **בדיקה נגדית**: הוא נשמר רק אם המודל צופה שהוא משפר הצלחה. |
| **משוב** (כל יום) | הסרטונים שלך נמדדים אחרי 24 שעות, 72 שעות ו-7 ימים: צפיות, engagement, ו-retention דרך YouTube Analytics. הם נכנסים לאימון במשקל ×3. |
| **A/B** | כל עריכה יוצאת ב-3 גרסאות. נרשם איזו גרסה פורסמה ואיך היא הצליחה. בעריכת דיבור, המודל גם בוחר את ה-hook החזק מבין החלופות. |

**כל ההגדרות נמצאות בקובץ `config.yaml`**: נישות, פלטפורמות, ספים, מכסות ותזמון ב-cron.
**לוגים**: `workspace/logs/autoedit.log`. כששלב נכשל, השאר ממשיכים והשגיאה מופיעה ב"יומן ריצות" בדשבורד.

```bash
autoedit cycle --niche fitness          # מחזור מלא עכשיו
autoedit scout --niche food
autoedit learn --niche realestate
autoedit versions --niche fitness       # היסטוריה
autoedit rollback --niche fitness v0002 # חזרה לגרסה (או: default)
autoedit add-post https://youtube.com/shorts/... --niche fitness --plan plan.json
autoedit daemon                         # רק אוטומציה, בלי ממשק
```

---

## הוספת נישה או סרטוני רפרנס

**נישה חדשה**: מוסיפים את השם ל-`niches` ב-`config.yaml`, למשל `beauty`. המערכת תיצור מילות מפתח, תחפש ותלמד. אפשר גם לנתח רפרנסים ידנית:

```bash
autoedit analyze https://www.tiktok.com/@user/video/123 https://youtube.com/shorts/abc  --niche beauty
autoedit analyze ./my_refs/*.mp4 --niche beauty
```
כל רפרנס נשמר כ-`profiles/<niche>/refs/<id>.json`, והפרופיל של הנישה מתעדכן. הוא כולל קצב חיתוכים, סוג hook, סגנון כתוביות, זומים, מעברים, מוזיקה ו-BPM, SFX, B-roll, צבעוניות ומבנה.

**מוזיקה משלך**: קבצים ב-`assets/music/<niche>/`. אם שם הקובץ כולל BPM, למשל `upbeat_120bpm.mp3`, ההתאמה מדויקת יותר. ספריות חינמיות: YouTube Audio Library, Pixabay Music.
**B-roll משלך**: `assets/broll/<niche>/`. שם הקובץ משמש כמילות חיפוש.

---

## המותג שלי (Brand Kit)

בלשונית "המותג שלי" מגדירים פעם אחת לוגו, צבעים, פונטים, intro/outro וסגנון כתוביות, וזה מוחל על כל סרטון. הלוגו לא מופיע בפתיחה. ה-intro מוצג אחרי ה-hook ומקוצר ל-1.5 שניות.
המערכת זוכרת העדפות סגנון מהצ'אט, למשל "מוזיקה יותר שקטה" או "כתוביות גדולות", ומחילה אותן מעכשיו.

---

## CLI לעריכה קלאסית

```bash
edit video.mp4 --niche fitness --platform tiktok
edit video.mp4 --niche business --platform youtube --bg blur --remove-logo auto
edit --plan plan.json -o out.mp4           # רינדור מחדש של תוכנית ערוכה
autoedit serve                              # ממשק ווב
```

---

## בדיקות

```bash
pytest                                        # בדיקות יחידה ומקצה לקצה
tests/fetch_exam_media.sh exam_media          # חומר למבחן העורך
python tests/editor_exam.py exam_media out    # 5 תרחישים + דוח HTML לפני ואחרי
python tests/demo_learning_cycle.py out 36    # מחזור למידה מלא מול שרת YouTube מדומה
```

## מגבלות, בשקיפות

- חיפוש ב-TikTok וב-Instagram בלי API רשמי עובד דרך yt-dlp, הוא best-effort ונחסם לעתים קרובות. במקרה כזה המערכת עוברת למקור אחר. ל-Instagram אין חיפוש האשטגים בלי התחברות.
- retention זמין רק ל-YouTube, אחרי `auth-youtube`. ב-TikTok וב-Instagram נמדדים צפיות, לייקים ותגובות.
- בלי מפתח Claude, המבקר מבוסס כללים. ציון 90+ אומר שהסרטון עומד בכללי העריכה, ולא שהוא מבטיח ויראליות.
- המודל הנלמד טוב כמו הנתונים שלו. עם עשרות סרטונים הוא רועש, ולכן יש את מנגנון הבדיקה הנגדית ואת כלל "גרסה חדשה רק אם משפרת".
