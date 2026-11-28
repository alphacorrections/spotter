// Progress: is it working? Lifts over time, the week at a glance, body numbers, history.
import { S, ex, ymd, nice, ago, finished, historyFor, removeActivity, fmtW, fmtN, unit, touch } from "./store.js";
import { ACT, VIEWS, render, top, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, lineChart, field, val, numVal, chips } from "./ui.js";
import { stepsByDay, stepGoal } from "./train.js";
import { stalled } from "../engine/coach.mjs";
import { cardioWeek } from "./v-more.js";
import { latestWeight } from "./v-coach.js";
import { RATING } from "./words.js";

const P = { all: false };
const ICON = { strength: "dumbbell", cardio: "run", yoga: "lotus", mobility: "stretch", walking: "steps", recovery: "heat" };
const DAY = ["S", "M", "T", "W", "T", "F", "S"];

function subline(a) {
  const ef = a.efforts || [];
  if (a.domain === "strength") { const n = ef.filter((e) => e.kind === "work").length; return `${n} sets${a.duration_s ? " · " + Math.round(a.duration_s / 60) + " min" : ""}`; }
  if (a.domain === "walking") return `${(ef[0]?.steps || 0).toLocaleString()} steps`;
  if (a.domain === "cardio") { const e = ef[0] || {}; return `${Math.round((a.duration_s || 0) / 60)} min${e.distance_m ? " · " + fmtN(e.distance_m / (S.me.units === "kg" ? 1000 : 1609.34)) + (S.me.units === "kg" ? " km" : " mi") : ""}${e.hr_zone ? " · zone " + e.hr_zone : ""}`; }
  if (a.domain === "recovery") { const x = (ef[0] || {}).extra || {}; return `${Math.round((a.duration_s || 0) / 60)} min${x.temp ? " · " + x.temp + "°" + (x.temp_unit || "F") : ""}`; }
  return `${Math.round((a.duration_s || 0) / 60)} min`;
}
export { subline, ICON };

function lifts() {
  const ids = new Map();
  for (const a of finished("strength")) for (const e of a.efforts || []) if (e.kind === "work" && e.exercise_id) ids.set(e.exercise_id, a.started_at);
  return [...ids.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => ({ id, h: historyFor(id) })).filter((x) => x.h.length);
}

VIEWS.progress = () => {
  const all = finished(), since = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const s28 = all.filter((a) => a.started_at >= since(28) && a.domain !== "walking").length;
  const sets7 = finished("strength").filter((a) => a.started_at >= since(7)).reduce((n, a) => n + (a.efforts || []).filter((e) => e.kind === "work").length, 0);
  const steps = stepsByDay().slice(-7).map(([, n]) => n), avgSteps = steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0;
  let h = top("Progress", "Is it working?", `<button class="coachbtn" data-act="goCalendar">${icon("calendar")}Calendar</button>`);
  if (!all.length) return h + `<div class="glass"><div class="empty">Log your first session and your numbers start showing here: every lift over time, your week, your body.</div></div>`;
  h += `<div class="tp-stats tp-rise"><div class="tp-stat"><span>Sessions, 4 weeks</span><b>${s28}</b></div><div class="tp-stat"><span>Sets, 7 days</span><b>${sets7}</b></div><div class="tp-stat"><span>Avg steps</span><b>${avgSteps ? avgSteps.toLocaleString() : "—"}</b></div></div>`;

  // The last seven days, one column each
  h += `<div class="glass pad week">` + [6, 5, 4, 3, 2, 1, 0].map((n) => {
    const d = new Date(Date.now() - n * 86400000), key = ymd(d);
    const doms = [...new Set(all.filter((a) => ymd(new Date(a.started_at)) === key).map((a) => a.domain))];
    return `<div class="wd${n === 0 ? " now" : ""}"><span>${DAY[d.getDay()]}</span><div class="wdots">${doms.map((x) => `<i title="${x}">${icon(ICON[x])}</i>`).join("") || `<i class="none"></i>`}</div></div>`;
  }).join("") + `</div>`;

  const ls = lifts();
  if (ls.length) {
    h += sect("Lifts", ls.length > 8 ? `<button data-act="liftsAll">${P.all ? "Show fewer" : "Show all " + ls.length}</button>` : "") + `<div class="glass">` +
      (P.all ? ls : ls.slice(0, 8)).map(({ id, h: hist }) => {
        const first = hist[0].best, last = hist[hist.length - 1].best, diff = last - first, bw = ex(id).load_type === "bodyweight";
        return row({ tile: icon("trend"), title: ex(id).name, sub: bw ? `Best set ${last} reps` : `Est. 1RM ${last} ${unit()}${hist.length > 1 ? ` · ${diff >= 0 ? "+" : ""}${diff} since you started` : ""}`,
          act: "liftOpen", data: { id }, right: stalled(hist.map((x) => x.best)) ? pill("Stalled", "warn") : hist.length > 1 && diff > 0 ? pill("Up", "ok") : "" });
      }).join("") + `</div>`;
  }

  const cw = cardioWeek();
  if (cw.easy + cw.hard > 0) {
    const tot = cw.easy + cw.hard, pe = Math.round((cw.easy / tot) * 100);
    h += sect("Cardio, last 7 days") + `<div class="glass pad"><div class="hbar"><div class="hl"><span>Easy, zones 1–2</span><b>${cw.easy} min <em>${pe}%</em></b></div><div class="bar thin"><i style="width:${pe}%"></i></div></div>
      <div class="hbar"><div class="hl"><span>Hard, zones 3–5</span><b>${cw.hard} min <em>${100 - pe}%</em></b></div><div class="bar thin"><i style="width:${100 - pe}%"></i></div></div>
      <p class="small muted mt">${pe >= 75 ? "A good mix. About four fifths easy is the target." : "Heavy on the hard side. Aim for about four fifths easy so it does not eat into your lifting."}</p></div>`;
  }

  const ws = S.body.filter((b) => b.kind === "weight").sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  h += sect("Body", `<button data-act="logBody">+ Log</button>`);
  if (ws.length) {
    const w = latestWeight();
    h += `<div class="glass pad"><div class="kv"><span>Weight, ${esc(ago(w.on).toLowerCase())}</span><b>${w.value} ${esc(w.unit)}</b></div>${ws.length > 1 ? lineChart(ws.slice(-30).map((x) => ({ x: nice(x.measured_on), y: x.value })), "Bodyweight") : `<p class="small muted">Log it again another day and a trend line appears.</p>`}</div>`;
  } else h += `<div class="glass"><div class="empty">Weight, sleep and measurements. Private to you.</div></div>`;

  // History: everything you have logged. Filter by kind, tap one to see it, edit it or delete it.
  const KINDS = [["", "All"], ["strength", "Lifting"], ["cardio", "Cardio"], ["yoga", "Yoga"], ["mobility", "Mobility"], ["walking", "Walks"], ["recovery", "Heat and cold"]].filter(([k]) => !k || all.some((a) => a.domain === k));
  if (P.kind && !KINDS.some(([k]) => k === P.kind)) P.kind = "";
  const shown = all.filter((a) => !P.kind || a.domain === P.kind), cut = P.hist ? shown.length : 15;
  h += sect("History", shown.length > 15 ? `<button data-act="histAll">${P.hist ? "Show fewer" : "Show all " + shown.length}</button>` : "") +
    (KINDS.length > 2 ? `<div class="chips" style="margin-bottom:10px">${KINDS.map(([k, l]) => `<button type="button" class="chip${(P.kind || "") === k ? " on" : ""}" data-act="histKind" data-v="${k}">${l}</button>`).join("")}</div>` : "") +
    `<div class="glass">` + shown.slice(-cut).reverse().map((a) => {
    const d = new Date(a.started_at);
    return `<button class="tp-row" data-act="actOpen" data-id="${a.id}"><span class="datebox"><b>${d.getDate()}</b>${nice(a.started_at).split(" ")[0]}</span><span class="tp-t"><b>${esc(a.title)}</b><span>${esc(subline(a))}</span></span><span class="tp-chev">${icon("chev")}</span></button>`;
  }).join("") + `</div>`;
  return h;
};
ACT.liftsAll = () => { P.all = !P.all; render(); };
ACT.histAll = () => { P.hist = !P.hist; render(); };
ACT.histKind = (d) => { P.kind = d.v; P.hist = false; render(); };
const setTxt = (s) => (s.weight != null ? `${fmtW(s.weight)} × ` : "") + fmtN(s.reps);
ACT.liftOpen = (d) => {
  const hist = historyFor(d.id), e = ex(d.id), bw = e.load_type === "bodyweight";
  sheet(e.name, `<p class="small muted">${bw ? "Best set each session, in reps." : `Estimated one-rep max each session, in ${unit()}. It lets heavy low-rep days and lighter high-rep days sit on one line.`}</p>` +
    lineChart(hist.map((x) => ({ x: nice(x.at), y: x.best })), "Estimated one-rep max") + sect("Sessions") + `<div class="deep">` +
    hist.slice(-8).reverse().map((x) => `<div class="kv"><span>${esc(nice(x.at))}</span><b>${esc(x.sets.map(setTxt).join(" · "))}</b></div>`).join("") + `</div><div class="acts"><button class="tp-btn" data-close>Close</button></div>`);
};
ACT.actOpen = (d) => {
  const a = S.activities.find((x) => x.id === d.id), ef = a.efforts || [];
  let body = `<div class="kv"><span>When</span><b>${esc(nice(a.started_at))}</b></div><div class="kv"><span>Summary</span><b>${esc(subline(a))}</b></div>`;
  if (a.checkin) body += `<div class="kv"><span>How it felt (private)</span><b>${a.checkin.rating} · ${RATING[a.checkin.rating]}</b></div>`;
  if (a.note) body += `<div class="kv"><span>Note</span><b>${esc(a.note)}</b></div>`;
  if (a.link_url) body += `<div class="kv"><span>Class</span><b><a href="${esc(a.link_url)}" target="_blank" rel="noopener">Open link</a></b></div>`;
  if (a.domain === "strength" || a.domain === "mobility") {
    const by = new Map();
    for (const e of ef) { if (!e.exercise_id) continue; if (!by.has(e.exercise_id)) by.set(e.exercise_id, []); by.get(e.exercise_id).push(e); }
    body += `<div class="deep mt">` + [...by.entries()].map(([id, es]) => `<div class="kv"><span>${esc(ex(id).name)}</span><b>${esc(es.map((e) => (e.kind === "skip" ? "skipped" + (e.note ? ` (${e.note})` : "") : e.reps != null ? setTxt(e) : `${e.duration_s}s`)).join(" · "))}</b></div>`).join("") + `</div>`;
  }
  sheet(a.title, body + `<button class="tp-btn tp-ghost tp-block mt" data-act="actEdit" data-id="${a.id}">${icon("pencil")} Edit</button><div class="acts"><button class="tp-btn tp-danger" data-act="actDelete" data-id="${a.id}">Delete</button><button class="tp-btn" data-close>Close</button></div>`);
};
// Fix what you entered: the name, the day, how long, how far, how hard, and the note.
const E = { id: null, zone: 2 };
const miles = () => S.me.units !== "kg";
ACT.actEdit = (d) => {
  const a = S.activities.find((x) => x.id === d.id), e0 = (a.efforts || [])[0] || {}, lift = a.domain === "strength", cardio = a.domain === "cardio";
  E.id = a.id; E.zone = (e0.hr_zone || 2) <= 2 ? 2 : 4;
  const mins = Math.round((a.duration_s || e0.duration_s || 0) / 60), dist = e0.distance_m ? Math.round((e0.distance_m / (miles() ? 1609.34 : 1000)) * 100) / 100 : "";
  sheet("Edit " + a.title, `${field("aetitle", "Name", a.title, "")}${field("aedate", "Day", ymd(new Date(a.started_at)), "", "date")}
    ${lift ? `<p class="small muted mt">To change the sets of a lifting session, delete it and log it again. Name, day and note can be changed here.</p>` : field("aemin", "Minutes", mins || "", "", "text", "numeric")}
    ${cardio ? field("aedist", `Distance (${miles() ? "miles" : "km"}), optional`, dist, "", "text", "decimal") + `<label class="tp-label">Effort</label>${chips("aeZone", [["2", "Easy"], ["4", "Hard"]], String(E.zone))}` : ""}
    ${field("aenote", "Note (friends can see it)", a.note || "", "")}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="actSave">Save changes</button></div>`);
};
ACT.aeZone = (d, el) => { E.zone = +d.v; [].forEach.call(el.parentNode.children, (x) => x.classList.toggle("on", x === el)); };
ACT.actSave = () => {
  const a = S.activities.find((x) => x.id === E.id); if (!a) return closeSheet();
  const title = val("aetitle").trim(), day = val("aedate"), lift = a.domain === "strength";
  if (!title) return toast("Give it a name");
  if (!/^\d{4}-\d\d-\d\d$/.test(day) || day > ymd()) return toast("Pick a day that is today or earlier");
  const old = new Date(a.started_at), [y, m, dd] = day.split("-").map(Number), start = new Date(old); start.setFullYear(y, m - 1, dd);
  let secs = a.duration_s || 0;
  if (!lift) { const mins = numVal("aemin"); if (!mins || mins < 1 || mins > 600) return toast("Enter the minutes, between 1 and 600"); secs = Math.round(mins * 60); }
  a.title = title.slice(0, 80); a.note = val("aenote").slice(0, 500) || null; a.started_at = start.toISOString(); a.duration_s = secs; a.ended_at = new Date(start.getTime() + secs * 1000).toISOString();
  const e0 = (a.efforts || [])[0];
  if (!lift && e0) {
    e0.duration_s = secs; e0.logged_at = a.started_at;
    if (a.domain === "cardio") { const dv = numVal("aedist"); e0.distance_m = dv ? Math.round(dv * (miles() ? 1609.34 : 1000)) : null; e0.hr_zone = E.zone; }
  }
  touch(a); closeSheet(); render(); toast("Changes saved");
};
ACT.actDelete = (d, el) => {
  if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.textContent = "Tap again to delete"; return; }
  removeActivity(d.id); closeSheet(); render(); toast("Deleted");
};
