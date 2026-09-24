// מייצר אייקוני PNG מה-SVG. PW=$(npm root -g)/playwright node tools/make-icons.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const D = path.join(__dirname, '..', 'src', 'icons');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [src, out, size] of [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['maskable.svg', 'maskable-512.png', 512], ['maskable.svg', 'apple-180.png', 180]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync(path.join(D, src), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(D, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close(); console.log('icons ok');
})();
