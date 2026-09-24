// עזרי בדיקה: שרת סטטי קטן + דפדפן Playwright (PW=$(npm root -g)/playwright)
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const DIST = path.join(__dirname, '..', 'dist');
function serve(dir = path.join(DIST, 'web'), port = 0, opts = {}) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, path.normalize(p));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || (opts.offline && opts.offline())) { rsp.writeHead(opts.offline && opts.offline() ? 503 : 404); rsp.end(); return; }
      const h = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
      if (opts.headers !== false && path.extname(f) === '.html') {
        const hdr = fs.existsSync(path.join(dir, '_headers')) ? fs.readFileSync(path.join(dir, '_headers'), 'utf8') : '';
        const m = hdr.match(/Content-Security-Policy: (.*)/); if (m) h['Content-Security-Policy'] = m[1].trim();
      }
      if (opts.gzip && /gzip/.test(req.headers['accept-encoding'] || '') && /\.(html|js|css|json|svg|webmanifest)$/.test(f)) {
        h['Content-Encoding'] = 'gzip'; rsp.writeHead(200, h); rsp.end(require('zlib').gzipSync(fs.readFileSync(f), { level: 9 })); return;
      }
      rsp.writeHead(200, h); fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(port, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}
async function launch() {
  const { chromium } = require(process.env.PW || 'playwright');
  return chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
}
function watch(page, errors, tag = '') {
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(`${tag}[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`${tag}[pageerror] ${e.message} ${(e.stack || '').split('\n')[1] || ''}`));
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); console.log('  ✓ ' + msg); }
/** אחרי טעינה: מאשר תנאים (כמו משתמש שכבר אישר) ומאשר מראש פעולות מסוכנות לסשן – לבדיקות רגרסיה */
async function prep(page) {
  await page.evaluate(async () => { await window.__testReady(); if (typeof ModelData !== 'undefined') await ModelData.all(); if (typeof Consent !== 'undefined') { if (!Consent.hasTerms()) Consent.record('terms'); Legal.close(); Consent.preapprove(['battery', 'hv', 'buildPack', 'speed']); } });
}
module.exports = { serve, launch, watch, assert, prep, DIST };
