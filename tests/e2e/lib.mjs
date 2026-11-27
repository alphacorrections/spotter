// Shared helpers for the browser tests.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startStandin, startStatic, sql } from "./standin.mjs";
export const { chromium } = createRequire(import.meta.url)("playwright");
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const API = "http://127.0.0.1:54321", APP = "http://127.0.0.1:4173/";
export { sql, fs, path };

let passed = 0;
export const count = () => passed;
export function ok(label) { passed++; console.log("ok - " + label); }
export function check(cond, label, detail) {
  if (!cond) throw new Error(`NOT OK - ${label}${detail ? " :: " + detail : ""}`);
  ok(label);
}

/** Builds the app pointed at the stand-in and serves it, with the other files a phone asks for. */
export async function serveApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spotter-app-"));
  execFileSync("node", [path.join(ROOT, "tools/build.mjs"), "--url", API, "--key", "test-publishable-key", "--out", path.join(dir, "index.html")], { stdio: "pipe" });
  for (const f of ["version.json", "manifest.webmanifest", "sw.js", "icon-192.png"]) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  const [standin, stat] = await Promise.all([startStandin(54321), startStatic(4173, dir, fs, path)]);
  return { dir, close: () => { standin.close(); stat.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** A fresh phone: its own storage, 390 wide unless told otherwise. Any page error fails the run. */
export async function phone(browser, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: opts.sw ? "allow" : "block", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|fonts\.g|raw\.githubusercontent/.test(m.text())) page.errors.push(`${name} console: ${m.text()}`); });
  await page.goto(APP);
  return page;
}
export const tap = (page, sel) => page.locator(sel).first().click();
export const tapText = (page, text) => page.getByText(text, { exact: false }).first().click();
export const act = (page, name, extra = "") => page.locator(`[data-act="${name}"]${extra}`).first().click();
export const see = (page, text, timeout = 6000) => page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
// Saves are batched for 60 ms, so give the last one a moment to land before reading.
export const state = async (page) => { await page.waitForTimeout(150); return page.evaluate(() => JSON.parse(localStorage.getItem("spotter.v1"))); };
export async function setState(page, fn, arg) {
  await page.waitForTimeout(150);
  await page.evaluate(([src, a]) => { const s = JSON.parse(localStorage.getItem("spotter.v1")); new Function("s", "a", src)(s, a); localStorage.setItem("spotter.v1", JSON.stringify(s)); }, [`(${fn.toString()})(s, a)`, arg]);
  await page.reload();
}
export async function shot(page, name, dir) {
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, name + ".png"), fullPage: false });
}

export async function onboard(page, name, { focus = "hypertrophy", days = 5, gear = "obGym", start = true } = {}) {
  await page.fill("#obname", name);
  await act(page, "obNext");
  await act(page, "obFocus", `[data-v="${focus}"]`);
  await act(page, "obDays", `[data-v="${days}"]`);
  await act(page, gear);
  await act(page, "obNext");
  if (start) await act(page, "obStart"); else await act(page, "obSkip");
}
export async function signIn(page, email) {
  await page.fill("#sgemail", email);
  await act(page, "signSend");
  await page.locator("#sgcode").waitFor();
  const { code } = await (await fetch(`${API}/__test/code?email=${encodeURIComponent(email)}`)).json();
  await page.fill("#sgcode", code);
  await act(page, "signVerify");
  await page.locator("#sheet").waitFor({ state: "detached", timeout: 10000 });
}
/** Logs every set of every lift in the open session: weight w (if asked for), reps as given. */
export async function logAll(page, weightFor, repsFor) {
  for (let guard = 0; guard < 80; guard++) {
    const btn = page.locator('[data-act="logSet"]').first();
    if (!(await btn.count())) break;
    const i = await btn.getAttribute("data-i"), n = await btn.getAttribute("data-n");
    const row = page.locator(`#lift${i} .setrow.next`);
    const w = row.locator('input[data-f="weight"]'), r = row.locator('input[data-f="reps"]');
    if (await w.count()) { const v = weightFor(+i, +n, await w.inputValue()); if (v != null) { await w.fill(String(v)); await w.blur(); } }
    const rv = repsFor(+i, +n, await r.inputValue());
    if (rv != null) { await r.fill(String(rv)); await r.blur(); }
    await btn.click();
  }
}
