// Builds the whole app into one file, index.html, the same shape as Tally:
// CSS at the top, JavaScript at the bottom, nothing else to host.
//   node tools/build.mjs                       -> ./index.html, using spotter.config.json
//   node tools/build.mjs --url U --key K --out F   (used by the tests)
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : null; };
const read = (p) => readFileSync(path.join(root, p), "utf8");
const cfg = JSON.parse(read("spotter.config.json"));
const version = JSON.parse(read("version.json")).version;
const url = arg("url") ?? cfg.url, key = arg("key") ?? cfg.key;

const out = await build({
  entryPoints: [path.join(root, "src/app/main.js")],
  bundle: true, format: "iife", target: ["es2020", "safari14"], minify: !process.argv.includes("--debug"), write: false, legalComments: "none",
  loader: { ".json": "json" },
  define: { __SPOTTER_URL__: JSON.stringify(url.replace(/\/+$/, "")), __SPOTTER_KEY__: JSON.stringify(key), __SPOTTER_VERSION__: JSON.stringify(version) },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = read("src/ui/tally-glass.css") + "\n" + read("src/ui/spotter.css");
// --preview writes a page fragment for sharing a look at the app before it has a home.
const template = process.argv.includes("--preview") ? "src/ui/preview.template.html" : "src/ui/index.template.html";
const html = read(template).replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js);
const file = arg("out") ? path.resolve(arg("out")) : path.join(root, "index.html");
writeFileSync(file, html);
console.log(`built ${path.relative(process.cwd(), file)} · ${Math.round(html.length / 1024)} KB · version ${version} · accounts ${url ? "on (" + url + ")" : "off"}`);
