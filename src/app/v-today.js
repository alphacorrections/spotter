// Today: the one screen that answers "what do I do now?"
import { S, ex, ymd, nice, finished, activeBlock, fmtW, unit } from "./store.js";
import { ACT, VIEWS, go, render, top, sect, row, note, icon, esc, pill, toast } from "./ui.js";
import { todayState, startSession, startFreeSession, specFor, targetsFor, skipRest, gap, stalls, deload, stepGoal, stepsByDay, pos, phaseForWeek, nextSession } from "./train.js";
import { FOCUS, TECH } from "./words.js";
import { currentTarget } from "./v-coach.js";
import { suggestRoutine, suggestTry } from "./v-more.js";

const topIcons = () => `<button class="ibtn" data-act="goCoach" aria-label="Coach">${icon("bulb")}</button><button class="ibtn" data-act="goSettings" aria-label="Settings">${icon("gear")}</button>`;
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
  const n = currentTarget();
  if (n) lines.push(`Eating target: <b>${n.target_kcal} calories</b>, ${n.protein_g} g protein.`);
  if (!lines.length) return "";
  return note(`<div class="tipcard"><span class="tp-tile">${icon("bulb")}</span><div>${lines.join("<br>")}</div></div>`);
}

function alsoToday() {
  const today = ymd(), steps = stepsByDay().find(([d]) => d === today)?.[1] || 0, goal = stepGoal();
  const done = (domain) => finished(domain).some((a) => ymd(new Date(a.started_at)) === today);
  const r = suggestRoutine(), t = suggestTry(), toTry = S.saved.filter((l) => !l.tried_on).length;
  return sect("Also today") + `<div class="glass">` +
    row({ tile: icon("steps"), title: steps ? `${steps.toLocaleString()} steps` : "Log your steps", sub: `Target ${goal.toLocaleString()}, based on what you actually walk`, act: "logWalk",
      right: steps >= goal ? pill("Hit", "ok") : "" }) +
    row({ tile: icon("stretch"), title: r.title, sub: `${r.minutes} min mobility · ${r.why}`, act: "openRoutine", data: { key: r.key }, right: done("mobility") ? pill("Done", "ok") : "" }) +
    row({ tile: icon("run"), title: "Cardio", sub: done("cardio") ? "Logged today" : "Run, bike, row, anything", act: "logCardio", right: done("cardio") ? pill("Done", "ok") : "" }) +
    row({ tile: icon("lotus"), title: "Yoga", sub: done("yoga") ? "Logged today" : "A class or your own flow", act: "logYoga", right: done("yoga") ? pill("Done", "ok") : "" }) + `</div>` +
    sect("Try something different", `<button data-act="pickRoutine" data-kind="move">See all</button>`) + `<div class="glass">` +
    row({ tile: icon("flame"), title: t.title, sub: `${t.minutes} min ${t.kind === "hiit" ? "HIIT" : "calisthenics"} · ${t.needs.toLowerCase()}`, act: "openRoutine", data: { key: t.key } }) +
    row({ tile: icon("link"), title: toTry ? `${toTry} saved workout${toTry === 1 ? "" : "s"} to try` : "Save a workout to try", sub: toTry ? "The reels and links you meant to get to" : "Paste a reel or video link so it is here when you train", act: toTry ? "goSaved" : "savedAdd" }) + `</div>`;
}

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
      <div class="flex mt"><button class="tp-btn big1" data-act="resume">${icon("play")} Resume</button></div></div>`;
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
      <div class="flex mt"><button class="tp-btn big1" data-act="start">${icon("play")} Start session</button></div></div>`;
    body = sect("The session", `<button data-act="editPlan">Edit plan</button>`) + sessionPreview(b, s, wk);
  }
  return top("Today", sub, topIcons()) + hero + coachCard(st) + body + alsoToday();
};

ACT.goPlans = () => go("plans");
ACT.start = () => { const st = todayState(); if (st.kind === "session") { startSession(st.block, st.session.key); go("log"); } };
ACT.resume = () => go("log");
ACT.freeSession = () => { startFreeSession(); go("log"); };
ACT.trainAnyway = () => { const b = activeBlock(); if (b) { skipRest(b); b.last_done = null; render(); } };
ACT.startNext = () => { const b = activeBlock(); if (!b) return; const nx = nextSession(b); if (!nx) return; b.position = nx.position; b.last_done = null; startSession(b, nx.session.key); go("log"); };
ACT.editPlan = () => { const b = activeBlock(); if (b) go("editor", { id: b.id }); };
