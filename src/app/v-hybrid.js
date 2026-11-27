// Hybrid: cardio targets beside the lifting plan. Off until you add it, and yours to change.
import { S, ex, ymd, finished, activeBlock, touch } from "./store.js";
import { ACT, render, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, chips } from "./ui.js";
import { todayState } from "./train.js";
import { GOALS, HARD_CAP, hybridWeek, cardioToday } from "../engine/hybrid.mjs";
import { currentTarget } from "./v-coach.js";

const MODES = [["run", "Run"], ["bike", "Bike"], ["row", "Row"], ["swim", "Swim"], ["other", "Other"]];
const H = { goal: "general", modes: [] };
const cfg = () => { const b = activeBlock(); return b && b.plan.hybrid && b.plan.hybrid.on ? b.plan.hybrid : null; };
const monday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const isLegs = (ses) => { const ids = ((ses && ses.slots) || []).map((x) => x.exercise).filter(Boolean); return ids.filter((id) => ex(id).region === "lower").length > ids.length / 2; };

/** This week's targets, what is done, and what fits today. Null when hybrid is off. */
export function hybridState() {
  const c = cfg(); if (!c) return null;
  const week = Math.floor((monday() - new Date(c.started + "T00:00:00")) / (7 * 864e5)) + 1;
  const t = hybridWeek(c.goal, week), from = monday().toISOString();
  let easy = 0, hard = 0, longest = 0;
  for (const a of finished("cardio")) if (a.started_at >= from) { let m = 0; for (const e of a.efforts || []) { const mins = (e.duration_s || 0) / 60; m += mins; if ((e.hr_zone || 2) <= 2) easy += mins; else hard += mins; } longest = Math.max(longest, m); }
  easy = Math.round(easy); hard = Math.round(hard);
  const longDone = longest >= t.long * 0.9, st = todayState();
  const ses = st.kind === "session" ? st.session : st.kind === "open" && st.block ? st.block.plan.sessions.find((x) => x.key === st.activity.session_key) : null;
  const day = st.kind === "rest" || st.kind === "none" || st.kind === "complete" ? "rest" : ses ? (isLegs(ses) ? "legs" : "upper") : "upper";
  const today = cardioToday(day, { easy: Math.max(0, t.easy - easy), hard: Math.max(0, t.hard - hard), long: longDone ? 0 : t.long });
  return { c, t, easy, hard, longDone, today, cut: currentTarget()?.phase === "cut" };
}
const bar = (label, done, goal, unit) => `<div class="hyb"><div><span>${label}</span><b>${done}${goal ? " / " + goal : ""} ${unit}</b></div><div class="hybbar"><i style="width:${goal ? Math.min(100, Math.round((done / goal) * 100)) : 0}%"></i></div></div>`;

export function hybridCard() {
  const b = activeBlock(); if (!b) return "";
  const s = hybridState();
  if (!s) return `<div class="glass" style="margin-top:12px">` + row({ tile: icon("run"), title: "Add cardio to this plan", sub: "Hybrid: weekly cardio targets that fit around your lifting", act: "hybridSetup" }) + `</div>`;
  const kind = { easy: "Easy", hard: "Intervals", long: "Long and easy", done: "Done" }[s.today.type], mode = s.c.modes.length ? MODES.find((m) => m[0] === s.c.modes[(new Date().getDay()) % s.c.modes.length])[1] : "";
  return sect(`Cardio, week ${s.t.week}${s.t.light ? " (lighter week)" : ""}`, `<button data-act="hybridSetup">Change</button>`) + `<div class="glass pad">
    ${bar("Easy minutes", s.easy, s.t.easy, "min")}${s.t.hard ? bar("Hard minutes", s.hard, s.t.hard, "min") : ""}
    <div class="hyb"><div><span>Long session</span><b>${s.longDone ? "Done" : s.t.long + " min, easy"}</b></div></div>
    <div class="tipcard mt"><span class="tp-tile">${icon("run")}</span><div><div class="coachlbl">Today: ${kind}${s.today.minutes ? " · " + s.today.minutes + " min" : ""}${mode && s.today.type !== "done" ? " · " + mode.toLowerCase() : ""}</div>${esc(s.today.text)}${s.hard > HARD_CAP ? "<br><b>You are past " + HARD_CAP + " hard minutes this week.</b> Keep the rest easy." : ""}${s.cut ? "<br>You are on a cut. Hybrid training works best fed, so keep cardio easy and watch your lifts." : ""}</div></div>
    <div class="flex mt"><button class="tp-btn tp-sm" data-act="logCardio">Log cardio</button></div></div>`;
}
function openSetup() {
  const c = cfg() || {};
  sheet("Hybrid: cardio beside lifting", `<p class="muted">Mostly easy minutes, a little hard work, one longer session. It grows about 10 percent a week with a lighter fourth week, and keeps hard cardio off leg days.</p>
    <label class="tp-label">What are you training for?</label><div class="glass">${Object.entries(GOALS).map(([k, g]) => row({ tile: icon(k === H.goal ? "check" : "target"), title: g.name, sub: `${g.why} Starts at ${g.easy} easy min${g.hard ? " and " + g.hard + " hard" : ""} a week.`, act: "hybridGoal", data: { k }, chev: false, right: k === H.goal ? pill("Picked", "ok") : "" })).join("")}</div>
    <label class="tp-label">What do you do for cardio?</label>${chips("hybridMode", MODES, H.modes, true)}
    <div class="acts">${c.on ? `<button class="tp-btn tp-ghost" data-act="hybridOff">Turn off</button>` : `<button class="tp-btn tp-ghost" data-close>Not now</button>`}<button class="tp-btn" data-act="hybridSave">${c.on ? "Save" : "Add cardio targets"}</button></div>`);
}
ACT.hybridSetup = () => { const c = cfg() || {}; H.goal = c.goal || "general"; H.modes = (c.modes || ["run"]).slice(); openSetup(); };
ACT.hybridGoal = (d) => { H.goal = d.k; openSetup(); };
ACT.hybridMode = (d, el) => { const i = H.modes.indexOf(d.v); if (i >= 0) H.modes.splice(i, 1); else H.modes.push(d.v); el.classList.toggle("on", i < 0); };
ACT.hybridSave = () => {
  const b = activeBlock(), old = b.plan.hybrid || {};
  b.plan.hybrid = { on: true, goal: H.goal, modes: H.modes.slice(), started: old.on && old.goal === H.goal && old.started ? old.started : ymd(new Date(new Date().setDate(new Date().getDate() - ((new Date().getDay() + 6) % 7)))) };
  touch(b); closeSheet(); render(); toast(`Cardio targets added: ${GOALS[H.goal].name}`);
};
ACT.hybridOff = () => { const b = activeBlock(); if (b.plan.hybrid) b.plan.hybrid.on = false; touch(b); closeSheet(); render(); toast("Cardio targets turned off"); };
