// Draws the app icon and writes the PNG sizes phones ask for.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12305A"/><stop offset="1" stop-color="#081322"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/><circle cx="110" cy="90" r="190" fill="#2D6FD0" opacity=".35"/>
<g transform="translate(256 256) scale(${pad}) translate(-256 -256)" fill="#F5C451">
<rect x="92" y="206" width="52" height="150" rx="20"/><rect x="368" y="206" width="52" height="150" rx="20"/><rect x="140" y="258" width="232" height="46" rx="16"/>
<path d="M256 96l74 78h-48v40h-52v-40h-48z"/></g></svg>`;
const b = await chromium.launch();
for (const [file, size, pad, radius] of [["icon-192.png", 192, 1, 0], ["icon-512.png", 512, 1, 0], ["icon-maskable-512.png", 512, 0.72, 0], ["apple-touch-icon.png", 180, 0.92, 0]]) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0">${svg(pad).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
}
await b.close();
console.log("icons written");
