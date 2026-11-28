// The session screen: one card per lift, the next set ready to log with the
// target already filled in. Also the swap, how-to and add-exercise sheets.
import { tellFriends } from "./v-notify.js";
import { S, save, touch, uid, ex, allExercises, openSession, lastSets, historyFor, fmtW, fmtN, unit, loadStep, imageUrl, howToUrl, nice } from "./store.js";
import { ACT, CHG, VIEWS, go, render, backTop, sect, row, note, icon, esc, pill, tone, sheet, closeSheet, toast, chips, field, val, numVal, TP, gearName } from "./ui.js";
import { itemPlan, itemKey, setsLogged, setsSkipped, skipSet, logSet, addExtra, unlog, finishSession, discardSession, swapNow, alternatives, isNoGo } from "./train.js";
import { TECH, RATING, whyTarget, EQUIPMENT } from "./words.js";
import { verdict } from "../engine/progression.mjs";
import { prepFor } from "../engine/prep.mjs";
import PREP from "../data/prep.json";

// Warm-up and cool-down, picked from the muscles in this session.
let COOL = null;
function sessionLifts(a) { return (a.items || []).map((it) => { const e = ex(it.exercise_id), p = it.slot_key ? itemPlan(a, it) : null; return { muscles: e.muscles || [], secondary: e.secondary || [], sets: it.sets || p?.spec?.sets || 3 }; }); }
function prepList(p) { return `<div class="glass">` + p.moves.map((m, i) => `<div class="tp-row static"><span class="tp-tile">${i + 1}</span><span class="tp-t"><b>${esc(m.name)} · ${esc(m.dose)}</b><span>${esc(m.cue)}</span></span></div>`).join("") + `</div>`; }
function warmRow(a) {
  if (!a.items.length) return "";
  const p = prepFor(sessionLifts(a), PREP, "warm");
  if (!p.moves.length) return "";
  return `<div class="glass">` + row({ tile: icon("flame"), title: "Warm-up", sub: a.warm ? "Done" : `${p.moves.length} moves for your ${p.areas.join(", ")} · about 5 min`, act: "warmOpen", right: a.warm ? pill("Done", "ok") : "" }) + `</div>`;
}
ACT.warmOpen = () => {
  const a = openSession(), p = prepFor(sessionLifts(a), PREP, "warm"), first = a.items[0] ? ex(a.items[0].exercise_id) : null;
  sheet("Warm-up", `<p class="small muted">Moving, not holding. These wake up the ${esc(p.areas.join(", "))} you are about to train. Save the long stretches for after.</p>${prepList(p)}
    ${first && first.load_type !== "bodyweight" ? `<p class="small muted mt"><b>Then ramp up on ${esc(first.name)}:</b> about half your working weight for 8 reps, then three quarters for 4. Those do not count as sets.</p>` : ""}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Close</button><button class="tp-btn" data-act="warmDone">Done, start lifting</button></div>`);
};
ACT.warmDone = () => { const a = openSession(); if (a) { a.warm = 1; save(); } closeSheet(); render(); };
ACT.coolOpen = () => {
  if (!COOL || !COOL.moves.length) return closeSheet();
  sheet("Cool-down", `<p class="small muted">Slow holds for the ${esc(COOL.areas.join(", "))} you just trained. Breathe out long and let each one settle. About 5 minutes.</p>${prepList(COOL)}
    <div class="acts"><button class="tp-btn" data-close>Done</button></div>`);
};

const VERDICT = { first: ["First time", "plain"], beat: ["Beat it", "ok"], held: ["Held", "plain"], big_jump: ["Big jump", "warn"], down: ["Down", "bad"] };
const EXTRA_KIND = { drop_set: "drop", double_drop: "drop", rest_pause: "rest_pause", rest_pause_stretch: "rest_pause", myo_reps: "myo", lengthened_partials: "partials" };
const REST = { until: 0, timer: null };

function draft(a, item, n, targets) {
  const d = (a.draft[itemKey(item)] ||= {});
  if (!d[n]) {
    const logged = setsLogged(a, item), prev = logged[logged.length - 1];
    const t = targets[Math.min(n - 1, targets.length - 1)] || {};
    // After the first set, carry what was just lifted forward when there is no target to go on.
    d[n] = { weight: t.weight ?? (prev ? prev.weight : null), reps: t.reps ?? null };
  }
  return d[n];
}
const measureWord = (spec) => (spec.measure === "seconds" ? "sec" : "reps");
function setText(e, spec) { return (e.weight != null ? `${fmtW(e.weight)} × ` : "") + fmtN(e.reps) + (spec.measure === "seconds" ? " sec" : e.weight == null ? " reps" : ""); }

function stepper(k, n, f, v, label) {
  return `<div class="stp"><button type="button" data-act="stp" data-k="${esc(k)}" data-n="${n}" data-f="${f}" data-d="-1" aria-label="Less ${label}">−</button>` +
    `<label><input class="stpv" inputmode="decimal" data-chg="draft" data-k="${esc(k)}" data-n="${n}" data-f="${f}" value="${v == null ? "" : f === "weight" && v === 0 ? "BW" : fmtN(v)}" placeholder="–" aria-label="${label}"><span>${label}</span></label>` +
    `<button type="button" data-act="stp" data-k="${esc(k)}" data-n="${n}" data-f="${f}" data-d="1" aria-label="More ${label}">+</button></div>`;
}

function card(a, item, idx) {
  const { spec, targets, block } = itemPlan(a, item);
  const e = ex(spec.exercise), k = itemKey(item);
  const logged = setsLogged(a, item), skipped = setsSkipped(a, item), total = Math.max(spec.sets, ...logged.concat(skipped).map((x) => x.set_number || 0)), bw = spec.load === "bodyweight";
  const last = lastSets(spec.exercise);
  const amrap = spec.reps === "amrap";
  // A finished lift folds down to one line so the next one is right there. Tap it to open it again.
  const handled = new Set(logged.concat(skipped).map((x) => x.set_number)), allDone = total > 0 && Array.from({ length: total }, (_, i) => i + 1).every((n) => handled.has(n));
  const lastDone = logged.find((x) => x.set_number === total), extraDue = !!(spec.intensifier && lastDone && !a.efforts.some((x) => x.parent_id === lastDone.id));
  const fold = (a.fold ||= {}), folded = allDone && (fold[k] === "shut" || (fold[k] !== "open" && !extraDue));
  if (folded) {
    const sum = logged.length ? logged.map((s) => setText(s, spec)).join(" · ") : "Skipped";
    return `<div class="glass lift folded" id="lift${idx}"><button type="button" class="lifthead foldbtn" data-act="liftFold" data-i="${idx}" aria-expanded="false" aria-label="Open ${esc(spec.name || e.name)}"><span class="tp-tile done">${icon("check", 2.6)}</span><div class="grow"><b>${esc(spec.name || e.name)}</b><span>${esc(sum)}${skipped.length && logged.length ? ` · ${skipped.length} skipped` : ""}</span></div><span class="edchev">${icon("chev")}</span></button></div>`;
  }
  const rangeTxt = amrap ? `${spec.sets} rounds, as many as you can` : `${spec.sets} × ${spec.reps[0]}–${spec.reps[1]} ${measureWord(spec)}`;
  const tile = spec.role === "finisher" ? icon("flame") : spec.superset ? esc(spec.superset) : String(idx + 1);
  let h = `<div class="glass lift" id="lift${idx}"><div class="lifthead"><span class="tp-tile">${tile}</span><div class="grow"><b>${esc(spec.name || e.name)}</b>` +
    `<span>${esc(rangeTxt)}${spec.superset ? " · superset " + esc(spec.superset) : ""}</span></div>` +
    `<button class="ibtn sm" data-act="how" data-i="${idx}" aria-label="How to do it">${icon("info")}</button><button class="ibtn sm" data-act="swapOpen" data-i="${idx}" aria-label="Swap exercise">${icon("swap")}</button></div>`;
  if (isNoGo(spec.exercise)) h += `<div class="liftnote warn">This lift is on your no-go list. Swap it, or carry on if it feels fine now.</div>`;
  h += `<div class="liftnote">${last.length ? "Last time: " + esc(last.map((s) => setText(s, spec)).join(" · ")) : "First time on this lift. Today sets your starting point."}` +
    (spec.effort?.text ? `<br>${esc(spec.effort.text)}.` : "") + (e.equipment === "dumbbell" && !bw ? `<br>Weight is both dumbbells added together.` : "") + `</div>`;
  // The last-set technique is shown from the first set, so you know it is coming before you rack the weight.
  if (spec.intensifier && !(lastDone && !extraDue)) h += `<div class="liftnote hi"><b>Coming on your last set: ${esc(TECH[spec.intensifier.type].name.toLowerCase())}.</b> ${esc(TECH[spec.intensifier.type].how)}</div>`;
  let nextShown = false;
  for (let n = 1; n <= total; n++) {
    const done = logged.find((x) => x.set_number === n);
    if (done) {
      const [txt, t] = VERDICT[done.verdict] || VERDICT.first;
      const vtone = done.verdict === "held" && (block?.nutrition_phase === "cut" || spec.progression?.type === "hold") ? "ok" : t;
      const extras = a.efforts.filter((x) => x.parent_id === done.id);
      h += `<div class="setrow done"><i>${n}</i><b class="num">${esc(setText(done, spec))}</b>${amrap ? "" : pill(txt, vtone)}<span class="grow"></span>` +
        `<button class="ibtn sm" data-act="unlog" data-id="${done.id}" aria-label="Undo set ${n}">${icon("pencil")}</button></div>` +
        extras.map((x) => `<div class="setrow done extra"><i>+</i><b class="num">${esc(setText(x, spec))}</b>${pill(TECH[spec.intensifier?.type]?.name || "Extra", "plain")}</div>`).join("");
    } else if (skipped.find((x) => x.set_number === n)) {
      const sk = skipped.find((x) => x.set_number === n);
      h += `<div class="setrow done skipped"><i>${n}</i><span class="grow"><b>Skipped</b>${sk.note ? `<span class="small muted"> · ${esc(sk.note)}</span>` : ""}</span><button class="ibtn sm" data-act="unlog" data-id="${sk.id}" aria-label="Undo skip of set ${n}">${icon("pencil")}</button></div>`;
    } else if (!nextShown) {
      nextShown = true;
      const d = draft(a, item, n, targets), t = targets[Math.min(n - 1, targets.length - 1)] || {};
      const lastOne = n === total && spec.intensifier;
      h += `<div class="setrow next"><i>${n}</i><div class="grow">` +
        `<div class="steppers">${bw ? "" : stepper(k, n, "weight", d.weight, unit())}${stepper(k, n, "reps", d.reps, measureWord(spec))}</div>` +
        (t.move === "backoff" ? `<div class="small muted">Back-off set</div>` : "") + (lastOne ? `<div class="small hi">Last set. Do not rack it yet: ${esc(TECH[spec.intensifier.type].name.toLowerCase())} comes straight after.</div>` : "") +
        `<button type="button" class="skipbtn" data-act="skipAsk" data-i="${idx}" data-n="${n}">Skip this set</button>` +
        `</div><button class="tp-btn logbtn" data-act="logSet" data-i="${idx}" data-n="${n}" aria-label="Log set ${n}">${icon("check", 2.6)}</button></div>`;
    } else {
      const t = targets[Math.min(n - 1, targets.length - 1)] || {};
      const txt = t.move === "calibrate" || amrap ? "" : (t.weight != null ? fmtW(t.weight) + " × " : "") + (t.reps ?? "");
      h += `<div class="setrow later"><i>${n}</i><span class="muted num">${esc(txt || "—")}</span></div>`;
    }
  }
  const lastSet = logged.find((x) => x.set_number === total);
  if (spec.intensifier && lastSet && !a.efforts.some((x) => x.parent_id === lastSet.id)) {
    const tech = TECH[spec.intensifier.type];
    h += `<div class="liftnote hi"><b>Now the ${esc(tech.name.toLowerCase())}.</b> Stay where you are and keep going, then log what you got.<br><button class="tp-btn tp-sm mt" data-act="extraOpen" data-i="${idx}" data-id="${lastSet.id}">Log the extra reps</button></div>`;
  }
  h += `<div class="liftfoot">${allDone ? `<button class="pillbtn" data-act="liftFold" data-i="${idx}" data-shut="1">Done, fold it</button>` : `<button class="pillbtn" data-act="why" data-i="${idx}">Why this target?</button>`}<button class="pillbtn" data-act="addSet" data-i="${idx}">+ Set</button>` +
    (item.slot_key ? "" : `<button class="pillbtn" data-act="dropItem" data-i="${idx}">Remove</button>`) + `</div></div>`;
  return h;
}

VIEWS.log = () => {
  const a = openSession();
  if (!a) return backTop("No session open", "", "goToday") + `<div class="glass"><div class="empty">Start a session from Today.<br><button class="tp-btn tp-sm" data-act="goToday">Go to Today</button></div></div>`;
  const n = a.efforts.filter((e) => e.kind === "work").length;
  return backTop(a.title, (a.week ? `Week ${a.week} · ` : "") + `${n} set${n === 1 ? "" : "s"} logged`, "goToday", `<button class="tp-btn tp-sm" data-act="finishAsk">Finish</button>`) +
    warmRow(a) +
    (a.items.length ? a.items.map((it, i) => card(a, it, i)).join("") : `<div class="glass"><div class="empty">Add your first exercise to start logging.</div></div>`) +
    `<button class="tp-btn tp-ghost tp-block" data-act="addExercise">${icon("plus")} Add an exercise</button>` +
    `<div class="restspace"></div><div class="restchip" id="restchip" hidden></div>`;
};
// The session screen is redrawn on every tap; put the countdown straight back.
const drawLog = VIEWS.log;
VIEWS.log = () => { if (REST.until > Date.now()) setTimeout(tickRest, 0); return drawLog(); };
ACT.goToday = () => go("today");

// ---------------------------------------------------------------- logging
function ctx(d) { const a = openSession(); const item = a.items[+d.i]; return { a, item, ...itemPlan(a, item) }; }
function findItem(a, k) { return a.items.find((it) => itemKey(it) === k); }

ACT.stp = (d, el) => {
  const a = openSession(), item = findItem(a, d.k), { spec, targets } = itemPlan(a, item);
  const cur = draft(a, item, +d.n, targets);
  const step = d.f === "weight" ? loadStep() : spec.measure === "seconds" ? 5 : 1;
  const base = cur[d.f] ?? (d.f === "weight" ? 0 : Array.isArray(spec.reps) ? spec.reps[0] - (+d.d > 0 ? 1 : 0) : 0);
  cur[d.f] = Math.max(0, Math.round((base + step * +d.d) * 100) / 100);
  el.parentNode.querySelector("input").value = d.f === "weight" && cur[d.f] === 0 ? "BW" : fmtN(cur[d.f]);
  save();
};
// Hold + or − to keep stepping. A short tap is still one step (the normal click).
const HOLD = { timer: null, wait: null, ran: false };
const holdStop = () => { clearTimeout(HOLD.wait); clearInterval(HOLD.timer); HOLD.wait = HOLD.timer = null; };
document.addEventListener("pointerdown", (e) => {
  const b = e.target && e.target.closest && e.target.closest('[data-act="stp"]'); if (!b) return;
  holdStop(); HOLD.ran = false;
  HOLD.wait = setTimeout(() => { HOLD.ran = true; let n = 0; HOLD.timer = setInterval(() => { if (!document.contains(b)) return holdStop(); ACT.stp(b.dataset, b); if (++n === 12) { clearInterval(HOLD.timer); HOLD.timer = setInterval(() => (document.contains(b) ? ACT.stp(b.dataset, b) : holdStop()), 45); } }, 110); }, 380);
});
["pointerup", "pointercancel", "pointerleave", "scroll"].forEach((t) => document.addEventListener(t, holdStop, true));
// The click that ends a hold must not add one more step. Long-press must not open the copy menu either.
document.addEventListener("click", (e) => { if (HOLD.ran && e.target.closest && e.target.closest('[data-act="stp"]')) { HOLD.ran = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".stp")) e.preventDefault(); });
CHG.draft = (v, d) => {
  const a = openSession(), item = findItem(a, d.k), { targets } = itemPlan(a, item);
  const x = d.f === "weight" && /^\s*(bw|body)/i.test(v) ? 0 : parseFloat(v);   // typing BW means body weight
  draft(a, item, +d.n, targets)[d.f] = isFinite(x) && x >= 0 ? x : null;
  save();
};
ACT.logSet = (d) => {
  const { a, item, spec, targets } = ctx(d), n = +d.n, cur = draft(a, item, n, targets), bw = spec.load === "bodyweight";
  if (cur.reps == null || cur.reps <= 0) return toast(spec.measure === "seconds" ? "Enter how many seconds" : "Enter your reps first");
  if (!bw && cur.weight == null) return toast("Enter the weight first. Tap − for body weight.");
  logSet(a, item, n, bw ? null : cur.weight, cur.reps);
  delete a.draft[itemKey(item)][n];
  render();
  startRest(spec.restS);
};
ACT.unlog = (d) => { unlog(openSession(), d.id); render(); };
ACT.liftFold = (d) => { const a = openSession(), k = itemKey(a.items[+d.i]); (a.fold ||= {})[k] = d.shut ? "shut" : "open"; save(); render(); };
// Skip a set, or the rest of a lift, and say why. The reason stays with the session.
const SKIP = { i: 0, n: 1, why: "" }, SKIP_WHY = ["Out of time", "Pain or discomfort", "Too tired", "Equipment busy", "Other"];
ACT.skipAsk = (d) => {
  Object.assign(SKIP, { i: +d.i, n: +d.n, why: "" });
  const { a, item, spec } = ctx(d), left = Math.max(spec.sets, SKIP.n) - SKIP.n + 1;
  sheet(`Skip set ${SKIP.n}`, `<p class="small muted">${esc(spec.name || ex(spec.exercise).name)}. Skipped sets are kept with the session and never count against you. Your next target is based on the sets you did.</p>
    <label class="tp-label">Why? (optional)</label>${chips("skipWhy", SKIP_WHY.map((w) => [w, w]), "")}
    ${field("skipnote", "Note (optional)", "", "e.g. Left shoulder pinched on the way down")}
    <div class="acts">${left > 1 ? `<button class="tp-btn tp-ghost" data-act="skipDo" data-all="1">Skip the last ${left} sets</button>` : `<button class="tp-btn tp-ghost" data-close>Cancel</button>`}<button class="tp-btn" data-act="skipDo">Skip this set</button></div>`);
};
ACT.skipWhy = (d, el) => { SKIP.why = SKIP.why === d.v ? "" : d.v; [].forEach.call(el.parentNode.children, (x) => x.classList.toggle("on", x === el && !!SKIP.why)); };
ACT.skipDo = (d) => {
  const a = openSession(), item = a.items[SKIP.i], { spec } = itemPlan(a, item), noteTxt = val("skipnote");
  const done = new Set(setsLogged(a, item).concat(setsSkipped(a, item)).map((x) => x.set_number)), last = d.all ? Math.max(spec.sets, SKIP.n) : SKIP.n;
  for (let n = SKIP.n; n <= last; n++) if (!done.has(n)) skipSet(a, item, n, SKIP.why, noteTxt);
  closeSheet(); render(); toast(d.all && last > SKIP.n ? "Sets skipped" : "Set skipped");
};
ACT.addSet = (d) => { const { a, item, spec } = ctx(d); item.sets = (item.sets || spec.sets) + 1; delete (a.fold ||= {})[itemKey(item)]; save(); render(); };
ACT.dropItem = (d) => { const a = openSession(), item = a.items[+d.i]; a.efforts = a.efforts.filter((e) => !(e.exercise_id === item.exercise_id && !e.slot_key)); a.items.splice(+d.i, 1); save(); render(); };

ACT.extraOpen = (d) => {
  const { a, spec } = ctx(d), parent = a.efforts.find((e) => e.id === d.id), tech = TECH[spec.intensifier.type];
  const w = parent.weight != null && /drop/.test(spec.intensifier.type) ? Math.round((parent.weight * 0.8) / loadStep()) * loadStep() : parent.weight;
  sheet(tech.name, `<p class="small muted">${esc(tech.how)}</p><div class="fgrid">${parent.weight != null ? field("xw", `Weight (${unit()})`, w, "", "text", "decimal") : ""}${field("xr", "Extra reps", "", "e.g. 6", "text", "numeric")}</div>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Skip</button><button class="tp-btn" data-act="extraSave" data-i="${d.i}" data-id="${d.id}">Save</button></div>`);
};
ACT.extraSave = (d) => {
  const { a, spec } = ctx(d), parent = a.efforts.find((e) => e.id === d.id), reps = numVal("xr");
  if (!reps) return toast("Enter the extra reps");
  addExtra(a, parent, EXTRA_KIND[spec.intensifier.type] || "drop", parent.weight != null ? numVal("xw") ?? parent.weight : null, reps);
  closeSheet(); render();
};

// ---------------------------------------------------------------- rest timer
function startRest(seconds) {
  if (!seconds) return;
  REST.until = Date.now() + seconds * 1000;
  clearInterval(REST.timer);
  REST.timer = setInterval(tickRest, 500);
  tickRest();
}
function tickRest() {
  const el = document.getElementById("restchip"), left = Math.ceil((REST.until - Date.now()) / 1000);
  if (left <= 0) {
    clearInterval(REST.timer); REST.until = 0;
    if (el) el.hidden = true;
    try { navigator.vibrate && navigator.vibrate(200); } catch (e) { /* no vibration here */ }
    return;
  }
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `${icon("timer")}<b class="num">${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</b><span>rest</span><button data-act="restSkip" aria-label="Skip rest">Skip</button>`;
}
ACT.restSkip = () => { REST.until = 0; tickRest(); };

// ---------------------------------------------------------------- why and how
ACT.why = (d) => {
  const { a, item, spec, targets } = ctx(d), e = ex(spec.exercise);
  const n = Math.min(setsLogged(a, item).length, targets.length - 1), t = targets[n] || { move: "calibrate" };
  const last = lastSets(spec.exercise), before = last.length ? last[Math.min(n, last.length - 1)] : null;
  const hist = historyFor(spec.exercise).slice(-4).reverse();
  const tgt = t.move === "calibrate" || t.move === "amrap" ? "" : `<div class="kv"><span>Set ${n + 1} target</span><b>${t.weight != null ? fmtW(t.weight) + " " + unit() + " × " : ""}${t.reps}</b></div>`;
  sheet(spec.name || e.name, `${tgt}${before ? `<div class="kv"><span>Same set last time</span><b>${esc(setText(before, spec))}</b></div>` : ""}
    <p class="mt">${esc(whyTarget(t, spec, before, unit()))}</p>
    ${hist.length ? sect("Recent sessions") + `<div class="deep">` + hist.map((s) => `<div class="kv"><span>${esc(nice(s.at))}</span><b>${esc(s.sets.map((x) => setText(x, spec)).join(" · "))}</b></div>`).join("") + `</div>` : ""}
    <div class="acts"><button class="tp-btn" data-close>Got it</button></div>`);
};
ACT.how = (d) => {
  const { spec } = ctx(d);
  openHowTo(spec.exercise, spec.name);
};
export function openHowTo(id, name) {
  const e = ex(id), img = imageUrl(id, 0), img2 = imageUrl(id, 1);
  sheet(name || e.name, `${img ? `<div class="howimgs"><img src="${img}" alt="Start position" loading="lazy" onerror="this.remove()"><img src="${img2}" alt="End position" loading="lazy" onerror="this.remove()"></div>` : ""}
    <div class="kv"><span>Works</span><b>${esc((e.muscles || []).concat(e.secondary || []).slice(0, 4).join(", ") || "—")}</b></div>
    <div class="kv"><span>Equipment</span><b>${esc(gearName(e.equipment))}</b></div>
    <div id="howsteps" class="mt small muted">${howToUrl(id) ? "Loading the steps…" : "No written steps for this one yet."}</div>
    <div class="acts"><button class="tp-btn" data-close>Close</button></div>`);
  const url = howToUrl(id);
  if (!url) return;
  fetch(url).then((r) => r.json()).then((j) => {
    const el = document.getElementById("howsteps");
    if (el) { el.className = "mt"; el.innerHTML = `<ol class="steps">${(j.instructions || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`; }
  }).catch(() => { const el = document.getElementById("howsteps"); if (el) el.textContent = "The steps load when you are online."; });
}

// ---------------------------------------------------------------- swap
const SW = { i: 0, filter: "all", to: null, reason: "equipment" };
function swapList() {
  const a = openSession(), item = a.items[SW.i], { spec, block } = itemPlan(a, item);
  const slot = block && item.slot_key ? block.plan.sessions.flatMap((s) => s.slots).find((s) => s.key === item.slot_key) : null;
  const picked = (slot?.alternates || []).filter((x) => x.exercise !== item.exercise_id && !isNoGo(x.exercise));
  const rest = alternatives(item.exercise_id, allExercises(), SW.filter === "all" ? null : SW.filter).filter((e) => !picked.some((p) => p.exercise === e.id)).slice(0, 14);
  const line = (id, sub, first) => { const e = ex(id); return row({ tile: icon("dumbbell"), title: e.name, sub, act: "swapPick", data: { id }, chev: false, right: `<span class="tp-pill tp-${first ? "ok" : "plain"}">Use</span>` }); };
  return `<p class="small muted">Stand-ins for ${esc(spec.name || ex(item.exercise_id).name)} that train the same muscle. Your history for the original stays put.</p>` +
    chips("swapFilter", [["all", "All matches"], ["gym", "In my gym"], ["bodyweight", "Bodyweight"]], SW.filter) +
    `<div class="glass mt">` + (picked.map((p) => line(p.exercise, p.why, true)).join("") + rest.map((e) => line(e.id, `${gearName(e.equipment)} · ${e.mechanic || "isolation"}`)).join("") ||
      `<div class="empty">Nothing matches that filter.</div>`) + `</div>` +
    `<div class="acts"><button class="tp-btn tp-ghost" data-act="swapSearch">Search every exercise</button></div>`;
}
ACT.swapOpen = (d) => { SW.i = +d.i; SW.filter = "all"; SW.to = null; sheet("Swap exercise", `<div id="swapbody">${swapList()}</div>`); };
ACT.swapFilter = (d) => { SW.filter = d.v; document.getElementById("swapbody").innerHTML = swapList(); };
ACT.swapSearch = () => openPicker("Swap to", "swapPick");
ACT.swapPick = (d) => {
  SW.to = d.id; SW.reason = "equipment";
  const a = openSession(), item = a.items[SW.i], inPlan = !!(item.slot_key && a.block_id);
  sheet(`Use ${ex(d.id).name}`, `<label class="tp-label">Why the swap?</label>${chips("swapReason", [["equipment", "Machine busy or missing"], ["pain", "It hurts"], ["preference", "I prefer this"]], SW.reason)}
    <p class="small muted mt" id="swapnote">Pick how long it lasts.</p>
    <div class="acts">${inPlan ? `<button class="tp-btn tp-ghost" id="swapToday" data-act="swapDo" data-scope="today">Today only</button><button class="tp-btn" data-act="swapDo" data-scope="block">Rest of block</button>` : `<button class="tp-btn" data-act="swapDo" data-scope="today">Swap</button>`}</div>`);
};
ACT.swapReason = (d, el) => {
  SW.reason = d.v;
  [].forEach.call(el.parentNode.children, (x) => { x.classList.toggle("on", x === el); x.setAttribute("aria-pressed", x === el); });
  const pain = d.v === "pain", t = document.getElementById("swapToday"), n = document.getElementById("swapnote");
  if (t) t.hidden = pain;
  if (n) n.textContent = pain ? "A swap for pain lasts the rest of the block, and the lift goes on your no-go list so it never comes back unasked." : "Pick how long it lasts.";
};
ACT.swapDo = (d) => {
  const a = openSession(), item = a.items[SW.i];
  swapNow(a, item, SW.to, SW.reason === "pain" && item.slot_key && a.block_id ? "block" : d.scope, SW.reason);
  delete a.draft[itemKey(item)];
  closeSheet(); render();
  toast(`Swapped to ${ex(SW.to).name}`);
};

// ---------------------------------------------------------------- exercise picker (shared)
const PICK = { act: "", q: "" };
function pickList() {
  const q = PICK.q.toLowerCase().trim();
  const pool = allExercises().filter((e) => e.domain === "strength" || !e.domain);
  const hits = (q ? pool.filter((e) => e.name.toLowerCase().includes(q) || (e.muscles || []).some((m) => m.includes(q))) : pool.filter((e) => ["Barbell_Squat", "Barbell_Bench_Press_-_Medium_Grip", "Barbell_Deadlift", "Pullups", "Dumbbell_Shoulder_Press", "Seated_Cable_Rows", "Leg_Press", "Barbell_Curl", "Triceps_Pushdown", "Pushups"].includes(e.id) || e.id.startsWith("u_"))).slice(0, 30);
  return hits.map((e) => row({ tile: icon("dumbbell"), title: e.name, sub: `${(e.muscles || [])[0] || "custom"} · ${gearName(e.equipment)}`, act: PICK.act, data: { id: e.id }, chev: false })).join("") ||
    `<div class="empty">No exercise by that name.<br><button class="tp-btn tp-sm" data-act="newExercise">Create “${esc(PICK.q)}”</button></div>`;
}
export function openPicker(title, act) {
  PICK.act = act; PICK.q = "";
  sheet(title, `<input class="tp-input" id="exq" type="search" placeholder="Search 880 exercises, or a muscle" autocomplete="off"><div class="glass mt" id="exlist">${pickList()}</div>`);
}
document.addEventListener("input", (e) => {
  if (e.target.id !== "exq") return;
  PICK.q = e.target.value;
  const el = document.getElementById("exlist");
  if (el) el.innerHTML = pickList();
});
ACT.addExercise = () => openPicker("Add an exercise", "addPick");
ACT.addPick = (d) => { const a = openSession(); if (!a.items.some((it) => !it.slot_key && it.exercise_id === d.id)) a.items.push({ slot_key: null, exercise_id: d.id }); save(); closeSheet(); render(); };
ACT.newExercise = () => {
  sheet("New exercise", `${field("nxn", "Name", PICK.q, "e.g. Pendulum Squat")}
    <label class="tp-label">Body area</label><div class="seg" id="nxr">${[["upper", "Upper"], ["lower", "Lower"], ["core", "Core"]].map(([v, l], i) => `<button type="button" data-v="${v}" class="${i ? "" : "on"}">${l}</button>`).join("")}</div>
    <label class="tp-label">Loaded with</label><div class="seg" id="nxl"><button type="button" data-v="external" class="on">Weight</button><button type="button" data-v="bodyweight">Bodyweight</button></div>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="newExerciseSave">Save</button></div>`);
};
ACT.newExerciseSave = () => {
  const name = val("nxn");
  if (!name) return toast("Give it a name");
  const pickv = (id) => document.querySelector(`#${id} .on`).getAttribute("data-v");
  const e = touch({ id: "u_" + uid().replace(/-/g, "").slice(0, 16), name, domain: "strength", equipment: "other", primary_muscles: [], muscles: [], secondary: [], region: pickv("nxr"), load_type: pickv("nxl"), measure: "reps" });
  S.exercises.push(e); save();
  (ACT[PICK.act] || (() => {}))({ id: e.id });
};

// ---------------------------------------------------------------- finishing
ACT.finishAsk = () => {
  const a = openSession(), n = a.efforts.filter((e) => e.kind === "work").length;
  if (!n) return sheet("Nothing logged yet", `<p class="muted">No sets are logged in this session.</p><div class="acts"><button class="tp-btn tp-ghost" data-close>Keep going</button><button class="tp-btn tp-danger" data-act="discard">Discard session</button></div>`);
  sheet("How did that feel?", `<p class="small muted">One tap. Only you see it. A run of rough sessions is how the app knows to suggest an easy week.</p>
    <div class="rate" id="rate">${[1, 2, 3, 4, 5].map((r) => `<button type="button" data-act="rate" data-v="${r}" class="${r === 3 ? "on" : ""}"><b>${r}</b><span>${RATING[r]}</span></button>`).join("")}</div>
    ${field("fnote", "A line for your friends (optional)", "", "e.g. Hip thrust PR")}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Keep going</button><button class="tp-btn" data-act="finishDo">Finish session</button></div>`);
};
ACT.rate = (d, el) => [].forEach.call(el.parentNode.children, (x) => x.classList.toggle("on", x === el));
ACT.finishDo = () => {
  const a = openSession(), rating = +(document.querySelector("#rate .on")?.getAttribute("data-v") || 3), noteTxt = val("fnote");
  const work = a.efforts.filter((e) => e.kind === "work"), beat = work.filter((e) => e.verdict === "beat").length, title = a.title;
  COOL = prepFor(sessionLifts(a), PREP, "cool");
  finishSession(a, rating, noteTxt);
  REST.until = 0; clearInterval(REST.timer);
  go("today");
  sheet("", TP.done(`${title} logged`, `${work.length} sets${beat ? ` · ${beat} beat last time` : ""}. Saved on this phone${S.sync.at ? " and syncing to your account" : ""}.`) + `<div class="acts">${COOL.moves.length ? `<button class="tp-btn tp-ghost" data-act="coolOpen">${icon("stretch")} Cool-down stretches</button>` : ""}<button class="tp-btn" data-close>Done</button></div>`);
};
ACT.discard = () => { discardSession(openSession()); closeSheet(); go("today"); toast("Session discarded"); };

export { verdict };
