// Draws the app icon and writes the PNG sizes phones ask for.
// The mark: a spotlight on a dumbbell. Navy ground, gold light. "Spot", both ways.
import { createRequire } from "module"; const require = createRequire("/usr/lib/node_modules/");
let pw; try { pw = require("playwright"); } catch (e) { pw = (await import("playwright")).default; }
const G = "#F5C451";
const bell = `<rect x="64" y="113" width="112" height="14" rx="7" fill="${G}"/><rect x="60" y="76" width="26" height="88" rx="10" fill="${G}"/><rect x="154" y="76" width="26" height="88" rx="10" fill="${G}"/><rect x="36" y="92" width="18" height="56" rx="8" fill="${G}"/><rect x="186" y="92" width="18" height="56" rx="8" fill="${G}"/>`;
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#173a78"/><stop offset=".55" stop-color="#0e2450"/><stop offset="1" stop-color="#0a1730"/></linearGradient>
  <radialGradient id="glowA" cx="0.22" cy="0.2" r="0.62"><stop offset="0" stop-color="#4f8be0" stop-opacity=".6"/><stop offset="1" stop-color="#4f8be0" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowB" cx="0.86" cy="0.9" r="0.55"><stop offset="0" stop-color="#b08a2e" stop-opacity=".5"/><stop offset="1" stop-color="#b08a2e" stop-opacity="0"/></radialGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${G}" stop-opacity=".5"/><stop offset="1" stop-color="${G}" stop-opacity=".22"/></linearGradient></defs>
  <rect width="240" height="240" fill="url(#g)"/><rect width="240" height="240" fill="url(#glowA)"/><rect width="240" height="240" fill="url(#glowB)"/><rect width="240" height="240" fill="url(#sheen)"/>
  <g transform="translate(120 120) scale(${pad}) translate(-120 -120)">
    <polygon points="64,40 92,30 222,196 52,204" fill="url(#beam)"/><ellipse cx="137" cy="200" rx="86" ry="15" fill="${G}" opacity=".45"/>
    <rect x="50" y="22" width="52" height="26" rx="9" fill="${G}" transform="rotate(-18 76 35)"/>
    <g transform="translate(77 108) scale(.5)">${bell}</g>
  </g></svg>`;
const b = await pw.chromium.launch();
for (const [file, size, pad, radius] of [["icon-192.png", 192, 1, 0], ["icon-512.png", 512, 1, 0], ["icon-maskable-512.png", 512, 0.72, 0], ["apple-touch-icon.png", 180, 0.92, 0]]) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0">${svg(pad).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
}
await b.close();
console.log("icons written");
