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
fs.writeFileSync('DATA-VERIFY.md', L.join('\n'));
console.log('DATA-VERIFY.md', L.length, 'lines');
