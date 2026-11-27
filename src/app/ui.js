// Screens are plain functions that return HTML. Buttons carry data-act="name";
// one click listener looks the name up in ACT and runs it. Same pattern as Tally.
import { esc, TP, TG } from "./kit.js";
export { esc, TP, TG };

export const ACT = {};     // click handlers:  ACT.name = (data, element, event) => {}
export const CHG = {};     // change handlers for inputs with data-chg="name"
export const VIEWS = {};   // screens:  VIEWS.name = (params) => html
export const R = { name: "today", params: {}, last: {} };

const NAV = [
  { id: "today", name: "Today", icon: "home" },
  { id: "plans", name: "Plans", icon: "list" },
  { id: "progress", name: "Progress", icon: "trend" },
  { id: "friends", name: "Friends", icon: "people" },
  { id: "add", plus: 1, name: "Log something" },
];
const NO_NAV = { log: 1, onboard: 1, mobility: 1, editor: 1, saved: 1 };

export function go(name, params) {
  R.name = name; R.params = params || {}; R.last[name] = R.params;
  if (location.hash !== "#" + name) { try { history.pushState(null, "", "#" + name); } catch (e) { location.hash = name; } }
  render();
  scrollTo(0, 0);
}
export function render() {
  const view = VIEWS[R.name] || VIEWS.today;
  const app = document.getElementById("app");
  const y = scrollY;
  app.innerHTML = `<div class="tp-wrap${NO_NAV[R.name] ? " ckflow" : ""}">${view(R.params)}</div>` + (NO_NAV[R.name] ? "" : TG.nav(NAV, R.name));
  scrollTo(0, y);
}
addEventListener("popstate", () => {
  const name = (location.hash || "#today").slice(1);
  if (VIEWS[name]) { R.name = name; R.params = R.last[name] || {}; TG.closeSheet(); render(); }
});

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { const id = nav.getAttribute("data-nav"); return id === "add" ? ACT.addMenu() : go(id); }
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACT[el.getAttribute("data-act")];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-chg]");
  if (el && CHG[el.getAttribute("data-chg")]) CHG[el.getAttribute("data-chg")](el.value, el.dataset, el);
});
// A segment control keeps its own highlight; the handler reads data-v.
document.addEventListener("click", (e) => {
  const b = e.target.closest(".seg button");
  if (b) [].forEach.call(b.parentNode.children, (x) => x.classList.toggle("on", x === b));
});

// ---------------------------------------------------------------- pieces
export const icon = (name, w) => TP.svg(name, w);
export function top(title, sub, right) { return TG.topBar(title, sub, right || ""); }
export function backTop(title, sub, act, right) {
  return `<div class="top"><button class="ibtn" data-act="${act || "back"}" aria-label="Back">${icon("back")}</button><div class="who"><span>${esc(sub || "")}</span><b>${esc(title)}</b></div>${right || ""}</div>`;
}
ACT.back = () => history.back();
export function sect(title, right) { return `<div class="tp-sect"><span>${esc(title)}</span><span class="sp"></span>${right || ""}</div>`; }
export function pill(text, tone) { return `<span class="tp-pill tp-${tone || "plain"}">${esc(text)}</span>`; }
export function tone(t) { return t === "ok" ? "ok" : t === "bad" ? "bad" : t === "warn" ? "warn" : "plain"; }
export function row(o) {
  const attrs = o.act ? ` data-act="${o.act}"` + Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("") : "";
  const tag = o.act ? "button" : "div";
  return `<${tag} class="tp-row${o.act ? "" : " static"}"${attrs}>` +
    (o.tile != null ? `<span class="tp-tile">${o.tile}</span>` : "") +
    `<span class="tp-t"><b>${esc(o.title)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ""}</span>` +
    (o.right || "") + (o.act && o.chev !== false ? `<span class="tp-chev">${icon("chev")}</span>` : "") + `</${tag}>`;
}
export function note(html, cls) { return `<div class="solid ${cls || ""}">${html}</div>`; }
export function sheet(title, body) { TG.sheet(TG.sheetHead(title) + body); }
export const closeSheet = () => TG.closeSheet();
// One toast at a time: a new one replaces whatever is showing.
export const toast = (m) => { document.querySelectorAll(".toast").forEach((t) => t.remove()); TG.toast(m); };
export const gearName = (e) => (e === "none" ? "bodyweight" : String(e || "other").replace(/_/g, " "));
export function chips(name, opts, cur, multi) {
  const on = (v) => (multi ? (cur || []).includes(v) : cur === v);
  return `<div class="chips">${opts.map(([v, label]) => `<button type="button" class="chip${on(v) ? " on" : ""}" data-act="${name}" data-v="${esc(v)}" aria-pressed="${on(v)}">${esc(label)}</button>`).join("")}</div>`;
}
export function field(id, label, v, ph, type, mode) {
  return `<div><label class="tp-label" for="${id}">${esc(label)}</label><input class="tp-input" id="${id}" type="${type || "text"}"${mode ? ` inputmode="${mode}"` : ""} value="${esc(v == null ? "" : v)}" placeholder="${esc(ph || "")}"></div>`;
}
export const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
export const numVal = (id) => { const v = parseFloat(val(id)); return isFinite(v) ? v : null; };

/** A small line chart. points: [{ x: label, y: number }]. */
export function lineChart(points, unitLabel) {
  if (points.length < 2) return `<div class="empty">Two sessions make a line. One more to go.</div>`;
  const W = 320, H = 150, L = 34, B = 20, T = 10;
  const ys = points.map((p) => p.y), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo || 1) * 0.15;
  const y0 = lo - pad, y1 = hi + pad;
  const X = (i) => L + (i * (W - L - 8)) / (points.length - 1), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi].filter((v, i, a) => a.indexOf(v) === i);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unitLabel || "Trend")}"><g class="grid">` +
    ticks.map((t) => `<line x1="${L}" x2="${W - 8}" y1="${Y(t)}" y2="${Y(t)}"></line><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join("") +
    `</g><path class="ln draw" d="${path}" style="stroke:var(--c2)"></path>` +
    points.map((p, i) => `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="${i === points.length - 1 ? 4 : 2.5}" style="fill:var(--c2)"></circle>`).join("") +
    `<text x="${L}" y="${H - 4}">${esc(points[0].x)}</text><text x="${W - 8}" y="${H - 4}" text-anchor="end">${esc(points[points.length - 1].x)}</text></svg></div>`;
}
