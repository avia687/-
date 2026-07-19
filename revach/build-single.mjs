// Combine index.html + styles.css + app.js into one self-contained file
// for publishing as an Artifact (body content only — no doctype/head/body).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const html = read('index.html');
const css = read('styles.css');
const js = read('app.js');

// Extract body inner markup, drop the <script src> line
let body = html.split('<body>')[1].split('</body>')[0];
body = body.replace(/<script src="app\.js"><\/script>/, '').trim();

const themeOverrides = `
/* Explicit theme-toggle support (Artifact stamps data-theme on :root) */
:root[data-theme="light"]{--bg:#f3f4f6;--card:#fff;--card-2:#f9fafb;--text:#111827;--text-soft:#6b7280;--text-faint:#9ca3af;--border:#e5e7eb;--green-soft:#def7ec;--amber-soft:#fdf6b2;--red-soft:#fde8e8;--shadow:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);--shadow-lg:0 10px 25px rgba(0,0,0,.12);}
:root[data-theme="dark"]{--bg:#0b0f14;--card:#161b22;--card-2:#1c232c;--text:#f3f4f6;--text-soft:#9ba3af;--text-faint:#6b7280;--border:#2a323c;--green-soft:#04372a;--amber-soft:#3a2f04;--red-soft:#3a1414;--shadow:0 1px 3px rgba(0,0,0,.4);--shadow-lg:0 10px 30px rgba(0,0,0,.5);}
:root[data-theme="dark"] .bg-blue{background:#0b2a5b;}:root[data-theme="dark"] .bg-purple{background:#2a1259;}
:root[data-theme="dark"] .status-paid{color:#34d399;}:root[data-theme="dark"] .status-unpaid{color:#fbbf24;}
:root[data-theme="dark"] .toggle-opt.on{color:#34d399;}
:root[data-theme="light"] .bg-blue{background:#e1effe;}:root[data-theme="light"] .bg-purple{background:#f0e6fd;}
`;

const out = `<div id="revach-root">
${body}
</div>
<style>
${css}
${themeOverrides}
/* keep app contained within artifact frame */
#revach-root #app{min-height:100vh;}
</style>
<script>
${js}
</script>
`;

fs.writeFileSync(path.join(dir, 'revach-app.html'), out);
console.log('Wrote revach-app.html (' + out.length + ' bytes)');
