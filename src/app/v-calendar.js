// Calendar: a month of training at a glance. Tap a day for what happened, any bests, and how you slept.
import { S, ex, ymd, finished, fmtW } from "./store.js";
import { ACT, VIEWS, go, render, backTop, sect, note, esc, sheet } from "./ui.js";
import { e1rm, stepsByDay, stepGoal } from "./train.js";

const C = { ym: null };
const KIND = { strength: ["#F5C451", "Lifting"], cardio: ["#FF7A59", "Cardio"], yoga: ["#B48CFF", "Yoga"], mobility: ["#3CCFCF", "Mobility"], walking: ["#6FD08C", "Walk"] };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayOf = (a) => ymd(new Date(a.started_at));
const dist = (m) => (S.me.units === "kg" ? `${(m / 1000).toFixed(1)} km` : `${(m / 1609.34).toFixed(1)} mi`);

/* Every best lift, by the day it happened: the first time an estimated max beat everything before it. */
function bests() {
  const top = {}, out = {};
  for (const a of finished("strength")) for (const e of a.efforts || []) {
    if (e.kind !== "work" || !e.exercise_id || !e.reps) continue;
    const v = e1rm(e.weight || 0, e.reps), had = top[e.exercise_id];
    if (had != null && v > had + 0.01 && e.weight) { (out[dayOf(a)] ||= {})[e.exercise_id] = e; }
    if (had == null || v > had) top[e.exercise_id] = v;
  }
  return out;
}
const health = (day) => S.health.filter((h) => h.day === day && h.source === "oura")[0] || null;
const beatRate = (a) => { const w = (a.efforts || []).filter((e) => e.kind === "work" && e.verdict); return w.length ? w.filter((e) => e.verdict === "beat").length / w.length : null; };

/* Does recovery line up with performance? Only said once there is enough of your own data. */
function insight() {
  const pts = [];
  for (const a of finished("strength")) { const h = health(dayOf(a)), r = beatRate(a); if (h && h.readiness && r != null) pts.push([h.readiness, r, h.sleep_minutes]); }
  if (pts.length < 6) return `Once Oura is linked and you have six lifting sessions with sleep data, this shows whether your better days follow better recovery. So far: ${pts.length}.`;
  const sorted = pts.map((p) => p[0]).sort((a, b) => a - b), mid = sorted[Math.floor(sorted.length / 2)];
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((n, x) => n + x[1], 0) / xs.length) * 100) : null);
  const hi = avg(pts.filter((p) => p[0] >= mid)), lo = avg(pts.filter((p) => p[0] < mid));
  if (hi == null || lo == null) return `Your readiness has barely moved across ${pts.length} sessions, so there is nothing to compare yet.`;
  const gap = hi - lo;
  return `<b>Recovery and performance.</b> On days your readiness was ${mid} or higher you beat last time on <b>${hi}%</b> of sets. On lower days: <b>${lo}%</b>. ${Math.abs(gap) < 8 ? "That is close: so far your lifting holds up either way." : gap > 0 ? "Better recovery has gone with better sessions for you." : "Oddly, your lower-readiness days have gone better so far."} Based on ${pts.length} sessions, so treat it as a hint.`;
}

VIEWS.calendar = () => {
  const now = new Date();
  if (!C.ym) C.ym = [now.getFullYear(), now.getMonth()];
  const [y, m] = C.ym, first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = first.getDay(), today = ymd();
  const by = {}; for (const a of finished()) (by[dayOf(a)] ||= []).push(a);
  const pr = bests(), steps = new Map(stepsByDay()), goal = stepGoal();
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal0"></span>`;
  let trained = 0;
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, m, d)), acts = by[key] || [], kinds = [...new Set(acts.map((a) => a.domain))].filter((k) => KIND[k]);
    if (kinds.some((k) => k !== "walking")) trained++;
    const any = kinds.length || pr[key] || health(key) || steps.get(key);
    cells += `<button type="button" class="cald${key === today ? " today" : ""}${kinds.includes("strength") ? " lift" : ""}${key > today ? " future" : ""}" ${any ? `data-act="calDay" data-d="${key}"` : "disabled"}>
      <b>${d}</b><span class="cdots">${kinds.map((k) => `<i style="background:${KIND[k][0]}"></i>`).join("")}${(steps.get(key) || 0) >= goal && !kinds.includes("walking") ? `<i style="background:${KIND.walking[0]}"></i>` : ""}</span>${pr[key] ? `<em>★</em>` : ""}</button>`;
  }
  const isNow = y === now.getFullYear() && m === now.getMonth();
  let h = backTop("Calendar", `${trained} training day${trained === 1 ? "" : "s"} in ${MONTHS[m]}`, "goProgress");
  h += `<div class="calhead"><button class="ibtn" data-act="calMove" data-n="-1" aria-label="Previous month">‹</button><b>${MONTHS[m]} ${y}</b><button class="ibtn" data-act="calMove" data-n="1" aria-label="Next month"${isNow ? " disabled" : ""}>›</button></div>`;
  h += `<div class="glass pad"><div class="calgrid calwk">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calgrid">${cells}</div>
    <div class="callegend">${Object.values(KIND).map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}<span><em>★</em>New best</span></div></div>`;
  h += note(insight());
  return h;
};
ACT.goCalendar = () => { C.ym = null; go("calendar"); };
ACT.goProgress = () => go("progress");
ACT.calMove = (d) => { const t = new Date(C.ym[0], C.ym[1] + +d.n, 1); C.ym = [t.getFullYear(), t.getMonth()]; render(); };
ACT.calDay = (d) => {
  const day = d.d, acts = finished().filter((a) => dayOf(a) === day), pr = bests()[day] || {}, hl = health(day), st = new Map(stepsByDay()).get(day);
  const line = (c, t, s) => `<div class="calrow"><i style="background:${c}"></i><div><b>${t}</b>${s ? `<span>${s}</span>` : ""}</div></div>`;
  let h = "";
  for (const a of acts) {
    const k = KIND[a.domain] || ["#888", ""], ef = a.efforts || [], mins = Math.round((a.duration_s || 0) / 60);
    if (a.domain === "strength") { const w = ef.filter((e) => e.kind === "work"), beat = w.filter((e) => e.verdict === "beat").length; h += line(k[0], esc(a.title), `${w.length} sets${beat ? ` · ${beat} beat last time` : ""}${mins ? ` · ${mins} min` : ""}`); }
    else { const m = ef.reduce((n, e) => n + (e.distance_m || 0), 0); h += line(k[0], esc(a.title), [m ? dist(m) : "", mins ? mins + " min" : ""].filter(Boolean).join(" · ")); }
  }
  for (const [id, e] of Object.entries(pr)) h += line("#F5C451", `★ New best: ${esc(ex(id).name)}`, `${fmtW(e.weight)} × ${e.reps}`);
  if (st) h += line(KIND.walking[0], `${st.toLocaleString()} steps`, st >= stepGoal() ? "Target hit" : "");
  if (hl) {
    const p = [];
    if (hl.sleep_minutes) p.push(`slept ${Math.floor(hl.sleep_minutes / 60)}h ${hl.sleep_minutes % 60}m`);
    if (hl.readiness) p.push(`readiness ${hl.readiness}`);
    if (hl.resting_hr) p.push(`resting HR ${hl.resting_hr}`);
    if (hl.hrv_ms) p.push(`HRV ${hl.hrv_ms}`);
    if (p.length) h += line("#8FA8FF", "Recovery (Oura)", p.join(" · "));
  }
  const dt = new Date(day + "T12:00:00");
  sheet(dt.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }), (h || `<p class="muted">Nothing logged.</p>`) + `<div class="acts"><button class="tp-btn" data-close>Done</button></div>`);
};
