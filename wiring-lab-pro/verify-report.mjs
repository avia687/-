// verify-report.mjs – מפיק את DATA-VERIFY.md מתוך dist/models.json (אחרי build)
import fs from 'node:fs';
const J = JSON.parse(fs.readFileSync('dist/models.json', 'utf8'));
const pro = JSON.parse(fs.readFileSync('src/pro-data.json', 'utf8'));
const I = { ok: '✅', typ: '⚠️', unk: '❓' };
const NAMES = { brand: 'יצרן', kind: 'סוג', battery: 'סוללה', motor: 'מנוע', controller: 'בקר', tires: 'צמיגים', brakes: 'בלמים', suspension: 'שיכוך', weight: 'משקל', range: 'טווח', speed: 'מהירות', charging: 'טעינה', display: 'צג', lights: 'תאורה', extras: 'תוספות' };
const L = ['# נתונים שדורשים אימות מול יצרן', '', 'נוצר אוטומטית מ-`dist/models.json` (`node verify-report.mjs`). ✅ מאומת · ⚠️ טיפוסי/משוער · ❓ לא ידוע.', ''];
L.push('## ערכים גלובליים (כל הדגמים)', '');
L.push('- ⚠️ אספקת חיישנים 4.8–5.2V, אות מצערת 0.6–1.1V במנוחה ו-3.4–4.3V בפתיחה מלאה, התנגדות פאזות 0.1–1Ω – טיפוסי לקטגוריה.');
L.push('- ⚠️ רצף Hall ‏120° (101→100→110→010→011→001) – טיפוסי; אף יצרן לא פרסם לדגמים האלה.');
L.push('- ❓ מתח יציאת התאורה (6V / 12V / מתח סוללה) – לא פורסם לאף דגם. למדוד לפני החלפת פנס.');
L.push('- ⚠️ צבעי חוטים ו-pinout של Julet/Higo – סטנדרט נפוץ, לא מאומת לדגם ספציפי.');
L.push('- ⚠️ משקלי ההסתברות במנוע האבחון – הערכה הנדסית, לא סטטיסטיקת שירות.');
L.push('- מומנטי הידוק: ' + Object.values(pro.torqueRef).map(t => `${I[t.conf]} ${t.part} ${t.nm}`).join(' · '));
L.push('- קודי שגיאה לפי משפחה: ' + Object.entries(pro.codeConfidence).map(([k, c]) => `${I[c]} ${k}`).join(' · ') + '. לא הומצאו קודים לדגמים שאין להם קודים מפורסמים.', '');
for (const [id, m] of Object.entries(J.models)) {
  const rows = [];
  Object.entries(m.dataConfidence).forEach(([k, c]) => { if (c !== 'ok') rows.push(`${I[c]} ${NAMES[k] || k}: ${k === 'battery' ? `${m.voltage}V ${m.ah}Ah` : k === 'motor' ? `${m.motor.nominal} / שיא ${m.motor.peak}` : k === 'controller' ? m.controller.amps : (m[k] || '')}`); });
  Object.entries(m.connectors || {}).forEach(([k, v]) => { if (v.conf !== 'ok') rows.push(`${I[v.conf]} מחבר ${({ power: 'הספק', charge: 'טעינה', motor: 'מנוע', display: 'צג' })[k]}: ${v.v}`); });
  if (m.displayProtocol && m.displayProtocol.conf !== 'ok') rows.push(`${I[m.displayProtocol.conf]} פרוטוקול צג: ${m.displayProtocol.v}`);
  if (m.errorCodes && m.errorCodes.conf !== 'ok') rows.push(`${I[m.errorCodes.conf]} קודי שגיאה: ${m.errorCodes.families.length ? m.errorCodes.families.join(', ') : 'אין במאגר'} – ${m.errorCodes.note}`);
  (m.specFlags || []).forEach(f => rows.push(`${I[f.sev]} **חשד במפרט – ${f.field}:** ${f.issue}`));
  L.push(`## ${m.name} (\`${id}\`)`, '', ...rows.map(r => '- ' + r), '');
}
// ״בנה בעצמך״, הצעות מחיר, כרטיסי כלי – הערכות שנוספו בשלבים G–H
const C = JSON.parse(fs.readFileSync('dist/components.json', 'utf8'));
L.push('## ״בנה בעצמך״ – ערכי חישוב', '');
L.push(`- ⚠️ תא 18650 לחישוב: ${C.cell18650.ah}Ah, ${C.cell18650.maxA}A, ${C.cell18650.weightKg * 1000} גרם – טיפוסי. להחליף בגיליון הנתונים של התא.`);
L.push('- ⚠️ צריכה בסיסית 9/12/16 Wh לק״מ (מישורי/מעורב/הררי), מותאם למשקל; מרווח 20%; 80% אנרגיה שמישה – הערכה הנדסית.');
L.push('- ⚠️ טבלת חתך כבל: ' + C.wireGauge.rows.map(r => `עד ${r.maxA}A → ${r.awg}AWG`).join(', ') + ` – ${C.wireGauge.note}.`);
L.push('- ⚠️ נתיך = הגודל התקני הראשון מעל זרם הבקר × 1.25 – כלל אצבע.');
L.push('- ⚠️ מהירות משוערת לפי הספק מנוע (250W≈27, 500W≈32, 1000W≈40 קמ״ש בשטח פרטי) – טיפוסי, תלוי בגלגל ובמתח.');
L.push('- ⚠️ כל רכיבי הקטלוג גנריים (' + C.items.length + ') – ערכי מפרט טיפוסיים, לא מוצר ספציפי.', '');
L.push('## כלים לטכנאי – ערכי ברירת מחדל', '');
L.push('- ⚠️ שעות עבודה בהצעת מחיר לפי קושי 1–5: 0.5/1/1.5/2.5/4 שעות – הערכה, הטכנאי עורך.');
L.push('- ⚠️ מע״מ 18% – לאמת את השיעור העדכני.');
L.push('- ⚠️ ספי Sag בגרף בריאות סוללה: 10% תקין, 20% לבדיקה – טיפוסי.');
L.push('- ⚠️ תזכורות תחזוקה בסיסיות (ק״מ/ימים) – ברירת מחדל כללית, לא הוראות יצרן.', '');
fs.writeFileSync('DATA-VERIFY.md', L.join('\n'));

// מחירים שדורשים אימות
const P = ['# מחירים שדורשים אימות', '', `מקור: \`src/components.json\` (עודכן ${C.updatedAt}, מטבע ${C.currency}). כל הטווחים הם **הערכה כללית לקטגוריה** – לא הצעת מחיר, לא ספק, לא דגם.`, '',
  'לעדכון: משנים `price.min`/`price.max`, `price.updatedAt`, `price.source` (`supplier`/`quote`/`receipt`) ו-`price.verified: true`, ומוסיפים `note` עם שם הספק והתאריך. בגרסת ה-Web הקובץ נטען מחדש אוטומטית.', '',
  '| קטגוריה | טווח (₪) | מקור | מאומת | עודכן | הערה |', '|---|---|---|---|---|---|'];
for (const [k, c] of Object.entries(C.categories)) P.push(`| ${c.name} (\`${k}\`) | ${c.price.min}–${c.price.max} | ${C.sourceTypes[c.price.source] || c.price.source} | ${c.price.verified ? 'כן' : '**לא**'} | ${c.price.updatedAt} | ${c.price.note || ''} |`);
P.push('', `סה״כ ${Object.values(C.categories).filter(c => !c.price.verified).length} מתוך ${Object.keys(C.categories).length} טווחים לא מאומתים.`);
fs.writeFileSync('PRICES-VERIFY.md', P.join('\n') + '\n');
console.log('PRICES-VERIFY.md', P.length, 'lines');
console.log('DATA-VERIFY.md', L.length, 'lines');
