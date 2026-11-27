// Today: the one screen that answers "what do I do now?"
import { S, ex, ymd, nice, finished, activeBlock, fmtW, unit } from "./store.js";
import { ACT, VIEWS, go, render, top, sect, row, note, icon, esc, pill, toast, sheet, closeSheet } from "./ui.js";
import { todayState, startSession, startFreeSession, specFor, targetsFor, skipRest, gap, stalls, deload, stepGoal, stepsByDay, pos, phaseForWeek, nextSession } from "./train.js";
import { FOCUS, TECH } from "./words.js";
import { currentTarget } from "./v-coach.js";
import { CLOUD } from "./cloud.js";
import { bell } from "./v-inbox.js";
import { suggestRoutine, suggestTry } from "./v-more.js";
import { recovery } from "./v-wear.js";

const topIcons = () => `<button class="coachbtn" data-act="goCoach">${icon("spark")}Coach</button>${bell()}<button class="ibtn" data-act="goSettings" aria-label="Settings">${icon("gear")}</button>`;
ACT.goCoach = () => go("coach");
ACT.goSettings = () => go("prefs");   // "settings" is a reserved address on some hosts

function targetLine(spec) {
  if (spec.reps === "amrap") return `${spec.sets} rounds to failure`;
  const t = targetsFor(spec)[0];
  const u = spec.measure === "seconds" ? " sec" : "";
  const range = `${spec.sets} × ${spec.reps[0]}–${spec.reps[1]}${u}`;
  if (t.move === "calibrate") return spec.load === "bodyweight" ? range : `${range} · find your weight`;
  return `${range} · start ${t.weight != null ? fmtW(t.weight) + " × " : ""}${t.reps}${u}`;
}

function sessionPreview(b, session, week) {
  const specs = session.slots.map((s) => specFor(b.plan, s.key, week)).filter((s) => s.active);
  return `<div class="glass">` + specs.map((spec) => {
    const e = ex(spec.exercise);
    return row({ tile: spec.role === "finisher" ? icon("flame") : spec.superset ? esc(spec.superset) : icon("dumbbell"), title: spec.name || e.name, sub: targetLine(spec),
      right: spec.intensifier ? pill(TECH[spec.intensifier.type].name, "warn") : "" });
  }).join("") + `</div>`;
}

function coachCard(st) {
  const lines = [];
  const g = gap();
  if (g.text && st.kind === "session") lines.push(g.text);
  const d = deload();
  if (d.due) lines.push(`<b>Consider an easy week.</b> ${esc(d.reasons.join(" and "))}. Same lifts and weights, two thirds of the sets.`);
  const stuck = stalls();
  if (stuck.length && !d.due) lines.push(`<b>${esc(stuck[0].name)} has stalled.</b> Three sessions with no new best. Open Coach for what to try.`);
  if (st.block && st.pos && !st.pos.done) {
    const ph = phaseForWeek(st.block.plan, Math.min(st.pos.week, st.block.plan.weeks));
    if (ph.note && !lines.length) lines.push(`<b>${esc(ph.name)}.</b> ${esc(ph.note)}`);
  }
  const rec = recovery();
  if (rec) lines.push(`Oura: ${esc(rec.text)}.${rec.low && st.kind === "session" ? " <b>Recovery is low.</b> Keep the weights, drop a set per lift if it feels heavy." : ""}`);
  const n = currentTarget();
  if (n) lines.push(`Eating target: <b>${n.target_kcal} calories</b>, ${n.protein_g} g protein.`);
  if (!lines.length) return "";
  return note(`<div class="tipcard"><span class="tp-tile">${icon("spark")}</span><div><div class="coachlbl">Coach</div>${lines.join("<br>")}</div></div>`);
}

function alsoToday() {
  const today = ymd(), steps = stepsByDay().find(([d]) => d === today)?.[1] || 0, goal = stepGoal();
  const done = (domain) => finished(domain).some((a) => ymd(new Date(a.started_at)) === today);
  const r = suggestRoutine(), t = suggestTry(), toTry = S.saved.filter((l) => !l.tried_on).length;
  return sect("Also today") + `<div class="glass">` +
    row({ tile: icon("steps"), title: steps ? `${steps.toLocaleString()} steps` : "Log your steps", sub: `Target ${goal.toLocaleString()}, based on what you actually walk`, act: "logWalk",
      right: steps >= goal ? pill("Hit", "ok") : "" }) +
    row({ tile: icon("stretch"), title: r.title, sub: `${r.minutes} min mobility · ${r.why}`, act: "goRoutines", right: done("mobility") ? pill("Done", "ok") : "" }) +
    row({ tile: icon("run"), title: "Cardio", sub: done("cardio") ? "Logged today" : "Run, bike, row, anything", act: "logCardio", right: done("cardio") ? pill("Done", "ok") : "" }) +
    row({ tile: icon("lotus"), title: "Yoga", sub: done("yoga") ? "Logged today" : "A class or your own flow", act: "logYoga", right: done("yoga") ? pill("Done", "ok") : "" }) + `</div>` +
    sect("Try something different", `<button data-act="pickRoutine" data-kind="move">See all</button>`) + `<div class="glass">` +
    row({ tile: icon("flame"), title: t.title, sub: `${t.minutes} min ${t.kind === "hiit" ? "HIIT" : "calisthenics"} · ${t.needs.toLowerCase()}`, act: "openRoutine", data: { key: t.key } }) +
    row({ tile: icon("link"), title: toTry ? `${toTry} saved workout${toTry === 1 ? "" : "s"} to try` : "Save a workout to try", sub: toTry ? "The reels and links you meant to get to" : "Paste a reel or video link so it is here when you train", act: toTry ? "goSaved" : "savedAdd" }) + `</div>`;
}

// The week at a glance: one tab per day of the plan's week. Tap a day to see its lifts.
const WK = { sel: null, block: null, week: null };
function weekCard(st) {
  const b = st.block;
  if (!b) return "";
  const p = pos(b);
  if (p.done) return "";
  const rot = b.plan.rotation, wk = Math.min(p.week, b.plan.weeks), base = b.position - p.index;
  if (WK.block !== b.id || WK.week !== wk || WK.sel == null || WK.sel >= rot.length) Object.assign(WK, { block: b.id, week: wk, sel: p.index });
  const did = (key) => S.activities.find((a) => a.block_id === b.id && a.week === wk && a.session_key === key && a.ended_at);
  let dayNo = 0, done = 0, total = 0;
  const tabs = rot.map((e, i) => {
    const ses = e.session ? b.plan.sessions.find((x) => x.key === e.session) : null;
    if (ses) { dayNo++; total++; }
    const a = ses && did(ses.key);
    if (a) done++;
    const state = a ? "done" : i === p.index ? "now" : i < p.index ? "past" : "";
    return `<button type="button" class="wkday ${state}${WK.sel === i ? " sel" : ""}" data-act="weekPick" data-i="${i}"><span>${ses ? "Day " + dayNo : "Rest"}</span><b>${ses ? esc(ses.title) : "Recover"}</b><i>${a ? "Done" : i === p.index ? "Up next" : i < p.index ? (ses ? "Skipped" : "") : ""}</i></button>`;
  }).join("");
  const since = new Date(Date.now() - 6 * 864e5), other = finished().filter((a) => a.domain !== "strength" && new Date(a.started_at) >= since).length;
  const e = rot[WK.sel], ses = e.session ? b.plan.sessions.find((x) => x.key === e.session) : null, a = ses && did(ses.key);
  let detail;
  if (!ses) detail = `<div class="glass"><div class="empty">Rest day. Walk, stretch, eat, sleep.</div></div>`;
  else detail = sessionPreview(b, ses, wk) + (a ? `<p class="small muted mt">Done ${nice(a.started_at)}.</p>` : WK.sel !== p.index && st.kind !== "open" ? `<div class="acts mt"><button class="tp-btn tp-ghost tp-sm" data-act="weekStart" data-i="${WK.sel}">Do this one today instead</button></div>` : "");
  return sect(`Week ${wk}`, `<button data-act="goCalendar">Calendar</button> <button data-act="editPlan">Edit plan</button>`) +
    `<div class="wkstats"><span><b>${done}</b> of ${total} sessions</span><span><b>${other}</b> other in 7 days</span><span><b>${stepGoal().toLocaleString()}</b> step target</span></div>` +
    `<div class="wkstrip">${tabs}</div>` + detail;
}
ACT.weekPick = (d) => { WK.sel = +d.i; render(); };
// Doing a different day keeps your place: the suggested session is still up next afterwards.
ACT.weekStart = (d) => { const b = activeBlock(); if (!b) return; const e = b.plan.rotation[+d.i]; if (!e || !e.session) return; closeSheet(); startSession(b, e.session); go("log"); };
ACT.otherDay = () => {
  const b = activeBlock(); if (!b) return;
  const p = pos(b), wk = Math.min(p.week, b.plan.weeks);
  const rows = b.plan.rotation.map((e, i) => {
    if (!e.session || i === p.index) return "";
    const ses = b.plan.sessions.find((x) => x.key === e.session), done = S.activities.some((a) => a.block_id === b.id && a.week === wk && a.session_key === e.session && a.ended_at);
    return row({ tile: icon("dumbbell"), title: ses.title, sub: done ? "Already done this week" : ses.subtitle || "", act: "weekStart", data: { i } });
  }).join("");
  sheet("Do a different day", `<p class="muted">Sore, short on time, or want a change? Pick another day. The suggested session stays up next.</p><div class="glass">${rows}` +
    row({ tile: icon("plus"), title: "Something else", sub: "Log a workout that is not in your plan", act: "freeSession" }) + `</div><div class="acts"><button class="tp-btn tp-ghost" data-close>Never mind</button></div>`);
};

VIEWS.today = () => {
  const st = todayState();
  const b = st.block;
  const name = S.me.display_name ? S.me.display_name.split(" ")[0] : "";
  let sub = name ? `Hi ${name}` : "Spotter", hero = "", body = "";
  if (b && st.pos && !st.pos.done) {
    const wk = Math.min(st.pos.week, b.plan.weeks);
    sub = `Week ${wk} of ${b.plan.weeks} · ${phaseForWeek(b.plan, wk).name}`;
  }
  if (st.kind === "none") {
    hero = `<div class="glass hero tp-rise"><span class="shine"></span><div class="label">No plan yet</div><div class="heroT">Pick a plan and the app tells you what to lift</div>
      <div class="small muted">Ten plans to start from. Every one can be edited.</div>
      <div class="flex mt"><button class="tp-btn" data-act="goPlans">Browse plans</button><button class="tp-btn tp-ghost" data-act="freeSession">Just log a workout</button></div></div>`;
  } else if (st.kind === "open") {
    const a = st.activity, n = a.efforts.filter((e) => e.kind === "work").length;
    hero = `<div class="glass hero tp-rise"><span class="shine"></span><div class="label">In progress</div><div class="heroT">${esc(a.title)}</div>
      <div class="small muted">${n} set${n === 1 ? "" : "s"} logged so far. Everything is saved on this phone.</div>
      <div class="flex mt"><button class="tp-btn big1" data-act="resume">${icon("play")} Resume</button><button class="tp-btn tp-ghost" data-act="cancelAsk">Cancel session</button></div></div>`;
  } else if (st.kind === "complete") {
    hero = `<div class="glass hero tp-rise"><span class="shine"></span><div class="label">Block complete</div><div class="heroT">${esc(b.title)}: done</div>
      <div class="small muted">${b.plan.weeks} weeks finished. Take an easy week, then run it again or pick something new. Your history carries over.</div>
      <div class="flex mt"><button class="tp-btn" data-act="runAgain" data-id="${b.id}">Run it again</button><button class="tp-btn tp-ghost" data-act="goPlans">Pick a new plan</button></div></div>`;
  } else if (st.kind === "done_today") {
    const nx = st.next;
    hero = `<div class="glass hero tp-rise"><span class="shine"></span><div class="label">Done for today</div><div class="heroT">Session logged</div>
      <div class="small muted">${nx ? `Next up: ${esc(nx.session.title)}.` : "That was the last session of the block."} Rest, eat, sleep.</div>
      ${nx ? `<div class="flex mt"><button class="tp-btn tp-ghost tp-sm" data-act="startNext">Train again today</button></div>` : ""}</div>`;
  } else if (st.kind === "rest") {
    hero = `<div class="glass hero tp-rise"><span class="shine"></span><div class="label">Rest day</div><div class="heroT">Recover today</div>
      <div class="small muted">Muscle is built between sessions, not in them. ${st.next ? `Next up: ${esc(st.next.session.title)}.` : ""}</div>
      <div class="flex mt"><button class="tp-btn tp-ghost tp-sm" data-act="trainAnyway">Train anyway</button></div></div>`;
  } else {
    const s = st.session, wk = Math.min(st.pos.week, b.plan.weeks);
    const count = s.slots.filter((x) => specFor(b.plan, x.key, wk).active).length;
    hero = `<div class="glass hero tp-rise"><span class="shine"></span><div class="label">Up next</div><div class="heroT">${esc(s.title)}</div>
      <div class="small muted">${esc(s.subtitle || "")} · ${count} lifts · ${esc(FOCUS[b.focus].name)}</div>
      <div class="flex mt"><button class="tp-btn big1" data-act="start">${icon("play")} Start session</button><button class="tp-btn tp-ghost" data-act="otherDay">Do a different day</button></div></div>`;
  }
  const backup = CLOUD.ready() && !CLOUD.on() ? `<div class="glass" style="margin-bottom:12px">` + row({ tile: icon("cloud"), title: "Not backed up yet", sub: "Sign in with your email to save your training and join a group", act: "signIn" }) + `</div>` : "";
  return top("Today", sub, topIcons()) + backup + hero + coachCard(st) + weekCard(st) + body + alsoToday();
};

ACT.goPlans = () => go("plans");
ACT.start = () => { const st = todayState(); if (st.kind === "session") { startSession(st.block, st.session.key); go("log"); } };
ACT.resume = () => go("log");
ACT.cancelAsk = () => {
  const st = todayState();
  if (st.kind !== "open") return;
  const n = st.activity.efforts.filter((e) => e.kind === "work").length;
  sheet("Cancel this session?", `<p class="muted">${n ? `The ${n} set${n === 1 ? "" : "s"} you logged will be deleted.` : "Nothing is logged yet, so nothing is lost."} Your plan stays on the same day.</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Keep it</button><button class="tp-btn tp-danger" data-act="discard">Cancel session</button></div>`);
};
ACT.freeSession = () => { closeSheet(); startFreeSession(); go("log"); };
ACT.trainAnyway = () => { const b = activeBlock(); if (b) { skipRest(b); b.last_done = null; render(); } };
ACT.startNext = () => { const b = activeBlock(); if (!b) return; const nx = nextSession(b); if (!nx) return; b.position = nx.position; b.last_done = null; startSession(b, nx.session.key); go("log"); };
ACT.editPlan = () => { const b = activeBlock(); if (b) go("editor", { id: b.id }); };
