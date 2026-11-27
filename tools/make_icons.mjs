// Draws the app icon and writes the PNG sizes phones ask for.
// The mark: a spotlight on a dumbbell. Navy ground, gold light. "Spot", both ways.
import { createRequire } from "module"; const require = createRequire("/usr/lib/node_modules/");
let pw; try { pw = require("playwright"); } catch (e) { pw = (await import("playwright")).default; }
const G = "#F5C451";
const bell = `<rect x="64" y="113" width="112" height="14" rx="7" fill="${G}"/><rect x="60" y="76" width="26" height="88" rx="10" fill="${G}"/><rect x="154" y="76" width="26" height="88" rx="10" fill="${G}"/><rect x="36" y="92" width="18" height="56" rx="8" fill="${G}"/><rect x="186" y="92" width="18" height="56" rx="8" fill="${G}"/>`;
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27468a"/><stop offset="1" stop-color="#101c38"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${G}" stop-opacity=".62"/><stop offset="1" stop-color="${G}" stop-opacity=".3"/></linearGradient></defs>
  <rect width="240" height="240" fill="url(#g)"/><circle cx="60" cy="40" r="120" fill="#fff" opacity=".05"/>
  <g transform="translate(120 120) scale(${pad}) translate(-120 -120)">
    <polygon points="58,42 94,29 226,198 40,206" fill="url(#beam)"/><ellipse cx="133" cy="202" rx="93" ry="16" fill="${G}" opacity=".6"/>
    <rect x="50" y="22" width="52" height="26" rx="9" fill="${G}" transform="rotate(-18 76 35)"/>
    <g transform="translate(73 118) scale(.43) rotate(-20 120 120)">${bell}</g>
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
