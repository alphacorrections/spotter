// Everything that is not lifting: cardio, steps, yoga, mobility, and the
// body numbers. All of it lands in the same activity model as a strength session.
import MOBILITY from "../data/mobility.json";
import MOVES from "../data/calisthenics.json";
import { S, touch, save, uid, ymd, ex, finished, openSession, activeBlock, isKg, gear } from "./store.js";
import { ACT, CHG, VIEWS, R, go, render, backTop, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, chips, field, val, numVal } from "./ui.js";
import { todayState, startSession, startFreeSession, stepGoal, stepsByDay } from "./train.js";
import { hrZone, maxHr, ZONES } from "../engine/coach.mjs";
import { CARDIO, YOGA } from "./words.js";
import { openHowTo } from "./v-log.js";
import { latestWeight } from "./v-coach.js";

// Mobility routines, calisthenics circuits and HIIT all play in the same follow-along screen.
export const ROUTINES = MOBILITY.map((r) => ({ ...r, kind: "mobility", rounds: 1 })).concat(MOVES);
const KIND = { mobility: "mobility", calisthenics: "calisthenics", hiit: "HIIT" };
const nowIso = () => new Date().toISOString();
function addActivity(domain, title, minutes, efforts, extra) {
  const end = new Date(), start = new Date(end - (minutes || 0) * 60000);
  const a = touch(Object.assign({ id: uid(), domain, title, block_id: null, week: null, session_key: null, started_at: start.toISOString(), ended_at: end.toISOString(),
    duration_s: Math.round((minutes || 0) * 60), efforts: efforts.map((e, i) => ({ id: uid(), seq: i, logged_at: nowIso(), ...e })) }, extra || {}));
  S.activities.push(a); save();
  return a;
}

/** The routine that fits what you last trained. */
export function suggestRoutine() {
  const last = finished("strength").slice(-1)[0];
  let key = "full";
  if (last && ymd(new Date(last.started_at)) >= ymd(new Date(Date.now() - 2 * 86400000))) {
    const lower = (last.efforts || []).filter((e) => ex(e.exercise_id).region === "lower").length;
    key = lower > (last.efforts || []).length / 2 ? "hips" : "shoulders";
  }
  return ROUTINES.find((r) => r.key === key);
}
/** Something different to try today: a calisthenics or HIIT routine you can do with what you have, rotating daily. */
export function suggestTry() {
  const have = gear(), bars = !have || have.includes("pullup_bar");
  const pool = MOVES.filter((r) => bars || r.needs === "No equipment");
  return pool[Math.floor(Date.now() / 86400000) % pool.length];
}

// ---------------------------------------------------------------- the + menu
ACT.addMenu = () => {
  const st = todayState(), open = openSession();
  const lift = open ? row({ tile: icon("play"), title: `Resume ${open.title}`, sub: "Your session in progress", act: "menuResume" })
    : st.kind === "session" ? row({ tile: icon("dumbbell"), title: `Start ${st.session.title}`, sub: "Next session in your plan", act: "menuStart" }) : "";
  sheet("Log something", `<div class="glass">${lift}` +
    row({ tile: icon("dumbbell"), title: "A workout, off plan", sub: "Pick lifts as you go", act: "menuFree" }) +
    row({ tile: icon("run"), title: "Cardio", sub: "Run, bike, row, swim, anything", act: "logCardio" }) +
    row({ tile: icon("steps"), title: "Steps", sub: "Today's count", act: "logWalk" }) +
    row({ tile: icon("flame"), title: "Calisthenics and HIIT", sub: "Bodyweight circuits to follow along", act: "pickRoutine", data: { kind: "move" } }) +
    row({ tile: icon("stretch"), title: "Mobility", sub: "Six short routines", act: "pickRoutine", data: { kind: "mobility" } }) +
    row({ tile: icon("lotus"), title: "Yoga", sub: "A class or your own flow", act: "logYoga" }) +
    row({ tile: icon("scale"), title: "Body", sub: "Weight, sleep, a measurement", act: "logBody" }) +
    row({ tile: icon("link"), title: "Save a workout to try", sub: "A reel or video you want to remember", act: "savedAdd" }) + `</div>`);
};
ACT.menuResume = () => { closeSheet(); go("log"); };
ACT.menuStart = () => { const st = todayState(); closeSheet(); if (st.kind === "session") { startSession(st.block, st.session.key); go("log"); } };
ACT.menuFree = () => { closeSheet(); if (!openSession()) startFreeSession(); go("log"); };

// ---------------------------------------------------------------- cardio
const C = { type: "Run", zone: 2 };
ACT.logCardio = () => {
  C.type = "Run"; C.zone = 2;
  sheet("Log cardio", `<div id="ctype">${chips("cardioType", CARDIO.map((c) => [c, c]), C.type)}</div>
    <div class="fgrid">${field("cmin", "Minutes", "", "e.g. 30", "text", "decimal")}${field("cdist", `Distance (${isKg() ? "km" : "miles"})`, "", "optional", "text", "decimal")}</div>
    ${field("chr", "Average heart rate", "", "optional, from your watch", "text", "numeric")}
    <label class="tp-label">How hard was it?</label>
    <div class="seg" id="czone">${[1, 2, 3, 4, 5].map((z) => `<button type="button" data-act="cardioZone" data-v="${z}" class="${z === C.zone ? "on" : ""}">${z}</button>`).join("")}</div>
    <p class="small muted mt" id="zcue"><b>Zone ${C.zone}: ${ZONES[C.zone].name}.</b> ${ZONES[C.zone].cue}</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="cardioSave">Save</button></div>`);
};
ACT.cardioType = (d, el) => { C.type = d.v; [].forEach.call(el.parentNode.children, (x) => x.classList.toggle("on", x === el)); };
ACT.cardioZone = (d) => { C.zone = +d.v; document.getElementById("zcue").innerHTML = `<b>Zone ${C.zone}: ${ZONES[C.zone].name}.</b> ${ZONES[C.zone].cue}`; };
ACT.cardioSave = () => {
  const min = numVal("cmin"), dist = numVal("cdist"), hr = numVal("chr");
  if (!min || min <= 0) return toast("Enter how many minutes");
  if (hr && (hr < 40 || hr > 230)) return toast("That heart rate looks off");
  let zone = C.zone, fromHr = false;
  if (hr && S.me.birth_year) { zone = hrZone(hr, maxHr(new Date().getFullYear() - S.me.birth_year)); fromHr = true; }
  addActivity("cardio", C.type, min, [{ kind: "steady", duration_s: Math.round(min * 60), distance_m: dist ? Math.round(dist * (isKg() ? 1000 : 1609.34)) : null, avg_hr: hr || null, hr_zone: zone, extra: { type: C.type } }]);
  closeSheet(); render();
  toast(`${C.type} logged · zone ${zone}${fromHr ? " from your heart rate" : ""}`);
};
/** Minutes of cardio in the last 7 days, easy (zones 1-2) and hard (3-5). */
export function cardioWeek() {
  const from = new Date(Date.now() - 7 * 86400000).toISOString();
  let easy = 0, hard = 0;
  for (const a of finished("cardio")) if (a.started_at >= from) for (const e of a.efforts || []) ((e.hr_zone || 2) <= 2 ? (easy += (e.duration_s || 0) / 60) : (hard += (e.duration_s || 0) / 60));
  return { easy: Math.round(easy), hard: Math.round(hard) };
}

// ---------------------------------------------------------------- steps
ACT.logWalk = () => {
  const today = ymd(), have = stepsByDay().find(([d]) => d === today)?.[1] || "", goal = stepGoal();
  sheet("Steps today", `<p class="small muted">Your target is <b>${goal.toLocaleString()}</b>: your recent average plus 10 percent. It moves with you, up or down.</p>
    ${field("wsteps", "Steps so far today", have, "from your phone or watch", "text", "numeric")}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="walkSave">Save</button></div>`);
};
ACT.walkSave = () => {
  const steps = numVal("wsteps");
  if (!steps || steps < 0 || steps > 100000) return toast("Enter your step count");
  const today = ymd(), a = finished("walking").find((x) => ymd(new Date(x.started_at)) === today);
  if (a) { a.efforts[0].steps = Math.round(steps); touch(a); }
  else addActivity("walking", "Walking", 0, [{ kind: "day", steps: Math.round(steps) }]);
  closeSheet(); render();
  toast(steps >= stepGoal() ? "Target hit" : "Steps saved");
};

// ---------------------------------------------------------------- yoga
const Y = { style: "Vinyasa" };
ACT.logYoga = () => {
  Y.style = "Vinyasa";
  sheet("Log yoga", `${chips("yogaStyle", YOGA.map((c) => [c, c]), Y.style)}
    ${field("ymin", "Minutes", "", "e.g. 45", "text", "decimal")}
    ${field("ylink", "Class link (optional)", "", "paste the class you followed", "url")}
    ${field("ynote", "A line for your friends (optional)", "", "")}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="yogaSave">Save</button></div>`);
};
ACT.yogaStyle = (d, el) => { Y.style = d.v; [].forEach.call(el.parentNode.children, (x) => x.classList.toggle("on", x === el)); };
ACT.yogaSave = () => {
  const min = numVal("ymin"), link = val("ylink");
  if (!min || min <= 0) return toast("Enter how many minutes");
  if (link && !/^https?:\/\//i.test(link)) return toast("The link should start with https://");
  addActivity("yoga", `${Y.style} yoga`, min, [{ kind: "flow", duration_s: Math.round(min * 60), extra: { style: Y.style } }], { link_url: link || null, note: val("ynote") || null });
  closeSheet(); render(); toast("Yoga logged");
};

// ---------------------------------------------------------------- body
ACT.logBody = () => {
  const w = latestWeight(), u = S.me.units, len = isKg() ? "cm" : "in";
  sheet("Body", `<p class="small muted">Private. None of this is ever shown to a group.</p>
    <div class="fgrid">${field("bw", `Weight (${u})`, "", w ? `last ${w.value}` : "", "text", "decimal")}${field("bsleep", "Sleep last night (hours)", "", "e.g. 7.5", "text", "decimal")}</div>
    <div class="fgrid">${field("bwaist", `Waist (${len})`, "", "optional", "text", "decimal")}${field("barm", `Arm (${len})`, "", "optional", "text", "decimal")}</div>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="bodySave">Save</button></div>`);
};
function setMetric(kind, value, u) {
  const same = S.body.find((x) => x.kind === kind && x.measured_on === ymd());
  const r = Object.assign(same || { kind, measured_on: ymd() }, { value, unit: u });
  if (!same) S.body.push(r);
  touch(r);
}
ACT.bodySave = () => {
  const w = numVal("bw"), sl = numVal("bsleep"), waist = numVal("bwaist"), arm = numVal("barm"), len = isKg() ? "cm" : "in";
  if (w == null && sl == null && waist == null && arm == null) return toast("Enter at least one number");
  if (sl != null && (sl < 0 || sl > 24)) return toast("Sleep is in hours");
  if (w) setMetric("weight", w, S.me.units);
  if (waist) setMetric("waist", waist, len);
  if (arm) setMetric("arm", arm, len);
  if (sl != null) {
    const same = S.health.find((h) => h.day === ymd() && (h.source || "manual") === "manual");
    const r = Object.assign(same || { day: ymd(), source: "manual" }, { sleep_minutes: Math.round(sl * 60) });
    if (!same) S.health.push(r);
    touch(r);
  }
  closeSheet(); render(); toast("Saved");
};

// ---------------------------------------------------------------- mobility
const M = { done: {}, started: 0, timer: null, rounds: 1 };
ACT.pickRoutine = (d) => {
  const move = d.kind === "move", list = ROUTINES.filter((r) => (r.kind === "mobility") !== move);
  sheet(move ? "Calisthenics and HIIT" : "Mobility", `<p class="small muted">${move ? "Bodyweight circuits you follow along with. Calisthenics builds strength with your own weight. HIIT is short, hard intervals. Good for days you want something different." : "Each routine has three parts: controlled reps, active holds, then one long hold. Mobility is strength at the end of your range, so move with control."}</p><div class="glass">` +
    list.map((r) => row({ tile: String(r.minutes), title: r.title, sub: move ? `${r.minutes} min ${KIND[r.kind]} · ${r.needs}` : `${r.minutes} min · ${r.why}`, act: "openRoutine", data: { key: r.key } })).join("") + `</div>`);
};
ACT.openRoutine = (d) => { closeSheet(); const r = ROUTINES.find((x) => x.key === d.key); M.done = {}; M.started = Date.now(); M.rounds = r.rounds || 1; go("mobility", { key: d.key }); };
ACT.mobRounds = (d) => { const r = ROUTINES.find((x) => x.key === R.params.key); M.rounds = Math.max(1, Math.min((r.rounds || 1) + 3, M.rounds + +d.d)); document.getElementById("mobrounds").textContent = M.rounds; };
const dose = (it) => (it.seconds ? `${it.seconds} sec` : `${it.reps} reps`) + (it.per_side ? " each side" : "");
VIEWS.mobility = (p) => {
  const r = ROUTINES.find((x) => x.key === p.key) || ROUTINES[0];
  let h = backTop(r.title, `${r.minutes} minutes · ${KIND[r.kind]}`, "goToday"), n = 0;
  if (r.rounds > 1) h += `<div class="glass pad"><div class="flex"><div class="grow"><b>${r.rounds} rounds</b><div class="small muted">${esc(r.needs)} · ${esc(r.why)}</div></div><div class="stepper"><button data-act="mobRounds" data-d="-1" aria-label="Fewer rounds">−</button><span class="v" id="mobrounds">${M.rounds}</span><button data-act="mobRounds" data-d="1" aria-label="More rounds">+</button></div></div><div class="small muted mt">Set this to the rounds you actually finish.</div></div>`;
  for (const part of r.parts) {
    h += sect(part.part) + `<div class="glass">` + `<div class="liftnote">${esc(part.note)}</div>` + part.items.map((it) => {
      const id = n++;
      return `<div class="tp-row static"><input type="checkbox" class="tick" id="mb${id}" data-chg="mobTick" data-i="${id}"${M.done[id] ? " checked" : ""} aria-label="Done"><label class="tp-t" for="mb${id}"><b>${esc(ex(it.exercise).name)}</b><span>${esc(dose(it))}</span></label>` +
        (it.seconds ? `<button class="pillbtn" data-act="mobTimer" data-s="${it.seconds}" data-i="${id}">${it.seconds}s</button>` : "") +
        `<button class="ibtn sm" data-act="mobHow" data-id="${esc(it.exercise)}" aria-label="How to do it">${icon("info")}</button></div>`;
    }).join("") + `</div>`;
  }
  return h + `<button class="tp-btn big1 tp-block mt" data-act="mobDone" data-key="${r.key}">Finish routine</button>`;
};
ACT.mobHow = (d) => openHowTo(d.id);
CHG.mobTick = (v, d, el) => { M.done[d.i] = el.checked; };
ACT.mobTimer = (d, el) => {
  clearInterval(M.timer);
  let left = +d.s;
  el.textContent = left + "s"; el.classList.add("on");
  M.timer = setInterval(() => {
    left -= 1;
    if (!document.body.contains(el)) return clearInterval(M.timer);
    if (left <= 0) {
      clearInterval(M.timer); el.textContent = "Done"; el.classList.remove("on");
      const box = document.getElementById("mb" + d.i);
      if (box) { box.checked = true; M.done[d.i] = true; }
      try { navigator.vibrate && navigator.vibrate(150); } catch (e) { /* no vibration here */ }
    } else el.textContent = left + "s";
  }, 1000);
};
ACT.mobDone = (d) => {
  clearInterval(M.timer);
  const r = ROUTINES.find((x) => x.key === d.key), items = r.parts.flatMap((p) => p.items);
  const did = items.filter((_, i) => M.done[i]);
  const list = did.length ? did : items;   // finishing without ticking counts as the whole routine
  const minutes = Math.min(90, Math.max(1, Math.round((Date.now() - M.started) / 60000)));
  if (r.kind === "mobility") {
    addActivity("mobility", `${r.title} mobility`, minutes, list.map((it) => ({ kind: it.seconds ? "hold" : "movement", exercise_id: it.exercise, reps: it.reps || null, duration_s: it.seconds || null, per_side: !!it.per_side })));
  } else {
    // One effort per move per round. Calisthenics counts as strength work, HIIT as hard cardio.
    const hiit = r.kind === "hiit", efforts = [];
    for (let round = 1; round <= M.rounds; round++) for (const it of list) {
      efforts.push(hiit ? { kind: "interval", exercise_id: it.exercise, set_number: round, duration_s: it.seconds || null, hr_zone: 4, extra: { type: "HIIT" } }
        : { kind: it.seconds ? "hold" : "work", exercise_id: it.exercise, set_number: round, reps: it.reps || null, duration_s: it.seconds || null, per_side: !!it.per_side });
    }
    addActivity(hiit ? "cardio" : "strength", r.title, hiit ? Math.max(minutes, Math.round(efforts.reduce((t, e) => t + (e.duration_s || 0), 0) / 60)) : minutes, efforts);
  }
  go("today"); toast(`${r.title} done`);
};
