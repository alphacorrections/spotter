// Plans: the block you are running, the library to pick from, and the editor
// that lets you change anything about a plan once it is yours.
import { S, touch, save, uid, ex, allExercises, templates, template, activeBlock, openSession, nice, gear } from "./store.js";
import { ACT, CHG, VIEWS, R, go, render, top, backTop, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, chips, field, val } from "./ui.js";
import { startBlock, endBlock, resumeBlock, pos, phaseForWeek, nextSession, SIZES, sizeName, hasSizes, sizePlan, sizeFacts, resizeBlock, isCustom, ensureSize, isNoGo, reorderDays, sessionOf } from "./train.js";
import { FOCUS, TECH, EQUIPMENT } from "./words.js";
import { openPicker } from "./v-log.js";
import { currentTarget } from "./v-coach.js";

const F = { focus: "all" };
const eqName = (k) => (EQUIPMENT.find(([v]) => v === k) || [k, k])[1];
function missing(t) { const have = gear(); return have ? (t.equipment || []).filter((e) => !have.includes(e)) : []; }
// Seven days means "every day": the 6-day lifting plans fit, with the seventh left for other training.
const dayFit = (t) => !S.me.days_per_week || t.days_per_week === Math.min(6, S.me.days_per_week);
function fits(t) { return dayFit(t) && !missing(t).length && (!S.me.settings.focus || t.focus === S.me.settings.focus); }
const allPlans = () => S.programs.map((p) => ({ ...p.template, mine: p.id })).concat(templates);

export function recommended() {
  const want = S.me.settings.focus, days = Math.min(6, S.me.days_per_week || 3);
  return templates.map((t) => ({ t, score: (want && t.focus === want ? 10 : 0) - Math.abs(t.days_per_week - days) * 2 - missing(t).length * 3 - (t.author === "Kevin" ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)[0].t;
}

VIEWS.plans = () => {
  const b = activeBlock();
  let h = top("Plans", b ? "What you are running, and what else there is" : "Pick what you train for");
  if (b) {
    ensureSize(b, template(b.program_slug));
    const p = pos(b), wk = Math.min(p.week, b.plan.weeks), len = b.plan.rotation.length;
    const pct = Math.min(100, Math.round((b.position / (b.plan.weeks * len)) * 100));
    h += `<div class="glass hero tp-rise"><div class="label">Running now</div><div class="heroT">${esc(b.title)}</div>
      <div class="small muted">Week ${wk} of ${b.plan.weeks} · ${esc(phaseForWeek(b.plan, wk).name)} · ${esc(FOCUS[b.focus].name)}${b.plan.size ? " · " + sizeName(b.plan.size) + (isCustom(b, template(b.program_slug)) ? ", customized" : "") : ""}</div>
      <div class="bar" style="margin-top:12px"><i style="width:${pct}%"></i></div>
      <div class="flex mt"><button class="tp-btn tp-sm" data-act="editPlan">Edit plan</button>${template(b.program_slug) && hasSizes(template(b.program_slug)) ? `<button class="tp-btn tp-ghost tp-sm" data-act="sizeAsk">Size</button>` : ""}<button class="tp-btn tp-ghost tp-sm" data-act="orderAsk">Day order</button><button class="tp-btn tp-ghost tp-sm" data-act="planDetail" data-id="${b.id}" data-block="1">See it all</button><button class="tp-btn tp-ghost tp-sm" data-act="endAsk" data-id="${b.id}">End</button></div>
      <button class="tp-btn tp-ghost tp-block mt" data-act="goAsk" data-q="Change my plan: ">${icon("spark")} Ask Coach to change it</button></div>`;
  }
  const old = S.blocks.filter((x) => x.status !== "active").sort((a, c) => (c.started_on || "").localeCompare(a.started_on || "")).slice(0, 5);
  if (old.length) {
    h += sect("Earlier blocks") + `<div class="glass">` + old.map((x) => row({ tile: icon("calendar"), title: x.title, sub: `${x.status === "done" ? "Finished" : "Paused"} · started ${nice(x.started_on)}`, act: "resumeAsk", data: { id: x.id }, chev: false, right: pill(x.status === "done" ? "Done" : "Paused", x.status === "done" ? "ok" : "plain") })).join("") + `</div>`;
  }
  h += sect("Find a plan") + chips("planFocus", [["all", "All"], ["hypertrophy", "Hypertrophy"], ["strength", "Strength"], ["maintain", "Maintain"], ["general", "Just move"]], F.focus);
  const list = allPlans().filter((t) => F.focus === "all" || t.focus === F.focus);
  h += `<div class="glass mt">` + list.map((t) => row({
    tile: String(t.days_per_week), title: t.title, sub: `${t.days_per_week} days a week · ${t.weeks} weeks · ${FOCUS[t.focus].name}${hasSizes(t) ? " · 3 sizes" : ""}`,
    act: "planDetail", data: { id: t.mine || t.slug }, right: t.mine ? pill("Yours", "plain") : fits(t) ? pill("Fits you", "ok") : "",
  })).join("") + `</div>`;
  h += note(`<b>Every plan comes in three sizes.</b> Starter is the essentials, Standard is the plan as written, Full adds extra work. Pick one when you start and change it any time.<br><br><b>Every plan can be changed.</b> Start one, then use Edit plan to swap lifts, change sets and reps, or add your own. Mid-session swaps work too.`);
  return h;
};
ACT.planFocus = (d) => { F.focus = d.v; render(); };

// Size picker: Starter, Standard, Full. Shows what each one costs in lifts and time.
const PS = { size: 2, id: null };
function sizePick(t, cur, act) {
  return `<div class="sizes">` + SIZES.map(([n, name, why]) => { const f = sizeFacts(t, n); return `<button type="button" class="sizeopt${n === cur ? " on" : ""}" data-act="${act}" data-v="${n}" aria-pressed="${n === cur}"><b>${name}</b><span>${f.lifts} lifts a day · about ${f.minutes} min</span><em>${why}</em></button>`; }).join("") + `</div>`;
}
function planBody(t0, size) {
  const t = size && hasSizes(t0) ? sizePlan(t0, size) : t0;
  const miss = missing(t);
  return `<p class="muted">${esc(t.summary || "")}</p>
    <div class="kv"><span>Goal</span><b>${esc(FOCUS[t.focus].name)}</b></div>
    <div class="kv"><span>Schedule</span><b>${t.days_per_week} days a week, ${t.weeks} weeks</b></div>
    <div class="kv"><span>Needs</span><b>${esc((t.equipment || []).map(eqName).join(", ") || "Nothing")}</b></div>
    ${miss.length ? `<p class="small warnt">Your equipment list is missing: ${esc(miss.map(eqName).join(", "))}. You can swap those lifts as you go.</p>` : ""}
    <p class="small muted mt">${esc(FOCUS[t.focus].how)}</p>` +
    t.sessions.map((s) => sect(s.title + (s.subtitle ? " · " + s.subtitle : "")) + `<div class="deep">` + s.slots.map((sl) => {
      const first = Object.values(sl.reps)[0], sets = sl.sets ?? t.roles?.[sl.role]?.sets ?? 3;
      const reps = Array.isArray(first) ? `${first[0]}–${first[1]}` : first === "amrap" ? "to failure" : "";
      return `<div class="kv"><span>${esc(sl.display_name || ex(sl.exercise).name)}${sl.intensifier ? ` <em class="small muted">+ ${esc(TECH[sl.intensifier.type].name.toLowerCase())}</em>` : ""}</span><b>${sets} × ${reps}</b></div>`;
    }).join("") + `</div>`).join("");
}
ACT.planDetail = (d) => {
  if (d.block) { const b = S.blocks.find((x) => x.id === d.id); return sheet(b.title, planBody(b.plan) + `<div class="acts"><button class="tp-btn" data-close>Close</button></div>`); }
  const t = allPlans().find((x) => (x.mine || x.slug) === d.id);
  const b = activeBlock();
  PS.id = d.id; PS.size = t.size || 2;
  sheet(t.title, `<div id="planbody">${hasSizes(t) ? sect("How much work") + sizePick(t, PS.size, "planSize") : ""}${planBody(t, PS.size)}</div>` + (b ? `<p class="small muted mt">Starting this pauses ${esc(b.title)}. It stays in your list and you can go back to it.</p>` : "") +
    `<div class="acts"><button class="tp-btn tp-ghost" data-close>Not now</button><button class="tp-btn" data-act="planStart" data-id="${esc(d.id)}">Start this plan</button></div><div class="acts"><button class="tp-btn tp-ghost tp-sm" data-act="planWeekAsk" data-id="${esc(d.id)}">Already part-way through it?</button></div>`);
};
ACT.planSize = (d) => {
  PS.size = +d.v; const t = allPlans().find((x) => (x.mine || x.slug) === PS.id), el = document.getElementById("planbody");
  el.innerHTML = sect("How much work") + sizePick(t, PS.size, "planSize") + planBody(t, PS.size);
};
// Change the order of the days in your week.
const OD = { order: [] };
function orderList() {
  const b = activeBlock(), rot = b.plan.rotation;
  return OD.order.map((ri, i) => { const e = rot[ri], s = e.session ? sessionOf(b, e.session) : null;
    return `<div class="tp-row static"><span class="tp-tile">${i + 1}</span><span class="tp-t"><b>${esc(s ? s.title : "Rest day")}</b>${s && s.subtitle ? `<span>${esc(s.subtitle)}</span>` : ""}</span>
      <button class="ibtn sm" data-act="orderMove" data-i="${i}" data-d="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("up")}</button><button class="ibtn sm" data-act="orderMove" data-i="${i}" data-d="1" aria-label="Move down"${i === OD.order.length - 1 ? " disabled" : ""}>${icon("down")}</button></div>`; }).join("");
}
ACT.orderAsk = () => {
  const b = activeBlock(); OD.order = b.plan.rotation.map((_, i) => i);
  sheet("Order of your days", `<p class="small muted">Set the order you usually train in. It applies from now on. Days you already did this week stay done, and the next one up is the first you have not done.</p>
    <div class="glass" id="orderlist">${orderList()}</div>
    <p class="small muted mt">For a one-off change, leave this alone and use "Do a different day" on Today.</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="orderSave">Save order</button></div>`);
};
ACT.orderMove = (d) => { const i = +d.i, j = i + +d.d; if (j < 0 || j >= OD.order.length) return; [OD.order[i], OD.order[j]] = [OD.order[j], OD.order[i]]; document.getElementById("orderlist").innerHTML = orderList(); };
ACT.orderSave = () => {
  if (openSession()) return toast("Finish the session you have open first");
  const b = activeBlock(); if (!reorderDays(b, OD.order)) return toast("That order could not be saved");
  closeSheet(); render(); toast("Day order saved");
};
// Change the size of the plan you are running.
ACT.sizeAsk = () => {
  const b = activeBlock(), t = template(b.program_slug);
  if (!t || !hasSizes(t)) return toast("This plan has one size. Use Edit plan to add or remove lifts.");
  ensureSize(b, t);
  const custom = isCustom(b, t);
  sheet("How much work", `<p class="small muted">Changes the lifts in each day from your next session. Your history, your swaps and any lifts you added yourself all stay.</p>
    ${custom ? `<p class="small muted"><b>You have customized this plan.</b> It is closest to ${sizeName(b.plan.size)}. If you pick a size, lifts you removed that belong to it come back.</p>` : ""}${sizePick(t, b.plan.size || 0, "sizeDo")}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Close</button></div>`);
};
ACT.sizeDo = (d) => {
  if (openSession()) return toast("Finish the session you have open first");
  const b = activeBlock(); resizeBlock(b, template(b.program_slug), +d.v); closeSheet(); render(); toast(`${b.title} is now ${sizeName(+d.v)}`);
};
ACT.planStart = (d) => {
  if (openSession()) return toast("Finish the session you have open first");
  const t = allPlans().find((x) => (x.mine || x.slug) === d.id);
  const tpl = { ...t }; delete tpl.mine;
  startBlock(tpl, { nutritionPhase: currentTarget()?.phase, programId: t.mine || null, size: PS.id === d.id ? PS.size : undefined });
  closeSheet(); go("today"); toast(`${t.title} started`);
};
// Joining a plan you are already running elsewhere: pick the week, and sessions you logged for it count.
ACT.planWeekAsk = (d) => {
  const t = allPlans().find((x) => (x.mine || x.slug) === d.id);
  sheet("Which week are you on?", `<p class="muted">Start ${esc(t.title)} from the week you are really in. Your logged history sets the targets.</p>
    <div class="chips">${Array.from({ length: t.weeks }, (_, i) => `<button type="button" class="chip" data-act="planStartAt" data-id="${esc(d.id)}" data-w="${i + 1}">Week ${i + 1}</button>`).join("")}</div>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Never mind</button></div>`);
};
ACT.planStartAt = (d) => {
  if (openSession()) return toast("Finish the session you have open first");
  const t = allPlans().find((x) => (x.mine || x.slug) === d.id), w = +d.w;
  const tpl = { ...t }; delete tpl.mine;
  const b = startBlock(tpl, { nutritionPhase: currentTarget()?.phase, programId: t.mine || null, position: (w - 1) * tpl.rotation.length, size: PS.id === d.id ? PS.size : undefined });
  const keys = tpl.sessions.map((x) => x.key), cut = new Date(Date.now() - 9 * 864e5).toISOString();
  let n = 0;
  for (const a of S.activities) if (!a.block_id && a.ended_at && a.week === w && keys.includes(a.session_key) && a.started_at >= cut) { a.block_id = b.id; touch(a); n++; }
  closeSheet(); go("today"); toast(`${t.title} started at week ${w}${n ? `. ${n} session${n === 1 ? "" : "s"} this week already counted` : ""}`);
};
ACT.runAgain = (d) => {
  const b = S.blocks.find((x) => x.id === d.id);
  startBlock(b.plan, { nutritionPhase: currentTarget()?.phase, programId: b.program_id });
  go("today"); toast("Block restarted at week 1. Your history carries over.");
};
ACT.endAsk = (d) => sheet("End this block?", `<p class="muted">It moves to Earlier blocks. Everything you logged stays, and you can resume it later.</p>
  <div class="acts"><button class="tp-btn tp-ghost" data-close>Keep going</button><button class="tp-btn tp-danger" data-act="endDo" data-id="${d.id}">End block</button></div>`);
ACT.endDo = (d) => { endBlock(S.blocks.find((x) => x.id === d.id), "paused"); closeSheet(); render(); };
ACT.resumeAsk = (d) => {
  const b = S.blocks.find((x) => x.id === d.id), cur = activeBlock();
  sheet(b.title, `<p class="muted">Pick up where you left off, at week ${Math.min(pos(b).week, b.plan.weeks)}.${cur ? ` This pauses ${esc(cur.title)}.` : ""}</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-act="runAgain" data-id="${b.id}" data-close>Restart at week 1</button><button class="tp-btn" data-act="resumeDo" data-id="${b.id}">Resume</button></div>`);
};
ACT.resumeDo = (d) => { const b = S.blocks.find((x) => x.id === d.id); if (pos(b).done) b.position = 0; resumeBlock(b); closeSheet(); go("today"); };

// ---------------------------------------------------------------- editor
const ED = { session: null, slot: null, open: null, block: null };   // open: which days are unfolded in the editor
const edBlock = () => S.blocks.find((x) => x.id === R.params.id) || activeBlock();
function edPhase(b) { return phaseForWeek(b.plan, Math.min(pos(b).week, b.plan.weeks)).key; }
function findSlot(b, key) { for (const s of b.plan.sessions) { const i = s.slots.findIndex((x) => x.key === key); if (i >= 0) return { s, i, slot: s.slots[i] }; } return null; }

VIEWS.editor = () => {
  const b = edBlock();
  if (!b) return backTop("Edit plan", "", "goPlans") + `<div class="glass"><div class="empty">No plan to edit yet.</div></div>`;
  const ph = edPhase(b), phName = b.plan.phases.find((p) => p.key === ph).name;
  let h = backTop("Edit plan", b.title, "goToday", `<button class="tp-btn tp-sm" data-act="goToday">Done</button>`) +
    note(`Changes are yours alone and apply from your next session. Rep ranges shown are for the current phase: <b>${esc(phName)}</b>. Tap <b>primary</b> or <b>accessory</b> under a lift to switch it.`);
  // Days start folded, except the one that is up next, so the page is a short list you open as needed.
  if (ED.block !== b.id || !ED.open) { ED.block = b.id; const p = pos(b); ED.open = new Set([(!p.done && p.entry.session) || nextSession(b)?.session.key || b.plan.sessions[0].key]); }
  for (const s of b.plan.sessions) {
    const open = ED.open.has(s.key);
    h += `<div class="glass edday">` + row({ tile: icon("dumbbell"), title: s.title, sub: `${s.slots.length} lift${s.slots.length === 1 ? "" : "s"}${s.subtitle ? " · " + s.subtitle : ""}`, act: "edFold", data: { s: s.key }, chev: false, right: `<span class="edchev${open ? " open" : ""}">${icon("chev")}</span>` }) + `</div>`;
    if (!open) continue;
    h += `<div class="edopen"><div class="acts" style="justify-content:flex-end;margin:8px 0"><button class="tp-btn tp-ghost tp-sm" data-act="edAdd" data-s="${s.key}">+ Add a lift</button></div><div class="glass">`;
    s.slots.forEach((sl, i) => {
      const r = sl.reps[ph], sets = sl.sets ?? b.plan.roles?.[sl.role]?.sets ?? 3, ranged = Array.isArray(r);
      h += `<div class="edrow"><div class="edname"><b>${esc(sl.display_name || ex(sl.exercise).name)}</b><span>${sl.role === "finisher" ? "finisher" : `<button type="button" class="rolebtn" data-act="edRole" data-k="${sl.key}" aria-label="Change between primary and accessory">${icon("swap")}${esc(sl.role)}</button>`}${sl.superset ? " · superset " + sl.superset : ""}${r === "skip" ? " · not in this phase" : ""}</span></div>
        <div class="edctl"><label><span>Sets</span><input class="tp-input" inputmode="numeric" data-chg="edSets" data-k="${sl.key}" value="${sets}" aria-label="Sets"></label>
        ${ranged ? `<label><span>Reps from</span><input class="tp-input" inputmode="numeric" data-chg="edLow" data-k="${sl.key}" value="${r[0]}" aria-label="Lowest reps"></label><label><span>to</span><input class="tp-input" inputmode="numeric" data-chg="edHigh" data-k="${sl.key}" value="${r[1]}" aria-label="Highest reps"></label>` : `<span class="small muted grow">${r === "amrap" ? "To failure" : ""}</span>`}
        </div><div class="edbtns"><button class="ibtn sm" data-act="edMove" data-k="${sl.key}" data-d="-1" aria-label="Move up"${i ? "" : " disabled"}>${icon("up")}</button><button class="ibtn sm" data-act="edMove" data-k="${sl.key}" data-d="1" aria-label="Move down"${i < s.slots.length - 1 ? "" : " disabled"}>${icon("down")}</button>
        <button class="ibtn sm" data-act="edSwap" data-k="${sl.key}" aria-label="Change exercise">${icon("swap")}</button><button class="ibtn sm" data-act="edRemove" data-k="${sl.key}" aria-label="Remove">${icon("trash")}</button></div></div>`;
    });
    h += `</div></div>`;
  }
  h += `<button class="tp-btn tp-ghost tp-block mt" data-act="edSaveAs">Save as my own plan</button>`;
  return h;
};
const clampInt = (v, lo, hi, fallback) => { const n = parseInt(v, 10); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
CHG.edSets = (v, d, el) => { const b = edBlock(), f = findSlot(b, d.k); f.slot.sets = clampInt(v, 1, 12, 3); el.value = f.slot.sets; touch(b); };
CHG.edLow = (v, d, el) => { const b = edBlock(), r = findSlot(b, d.k).slot.reps[edPhase(b)]; r[0] = clampInt(v, 1, r[1], r[0]); el.value = r[0]; touch(b); };
CHG.edHigh = (v, d, el) => { const b = edBlock(), r = findSlot(b, d.k).slot.reps[edPhase(b)]; r[1] = clampInt(v, r[0], 999, r[1]); el.value = r[1]; touch(b); };
// Primary or accessory. The role sets the default sets, rest and how hard to push, so switching it resets the set count to that role's.
ACT.edRole = (d) => {
  const b = edBlock(), f = findSlot(b, d.k), to = f.slot.role === "primary" ? "accessory" : "primary", r = b.plan.roles?.[to] || {};
  f.slot.role = to; delete f.slot.sets; touch(b); render();
  toast(`Now ${to === "primary" ? "a primary" : "an accessory"} lift: ${r.sets ?? 3} sets${r.rest_s ? `, ${r.rest_s >= 60 ? Math.round(r.rest_s / 6) / 10 + " min" : r.rest_s + " s"} rest` : ""}${r.effort?.text ? ". " + r.effort.text : ""}`);
};
ACT.edMove = (d) => { const b = edBlock(), f = findSlot(b, d.k), j = f.i + +d.d; if (j < 0 || j >= f.s.slots.length) return; f.s.slots.splice(j, 0, f.s.slots.splice(f.i, 1)[0]); touch(b); render(); };
ACT.edRemove = (d, el) => {
  if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.classList.add("sure"); return toast("Tap again to remove"); }
  const b = edBlock(), f = findSlot(b, d.k);
  f.s.slots.splice(f.i, 1); touch(b); render();
};
ACT.edSwap = (d) => { ED.slot = d.k; openPicker("Change exercise", "edPick"); };
ACT.edFold = (d) => { if (ED.open.has(d.s)) ED.open.delete(d.s); else ED.open.add(d.s); render(); };
ACT.edPick = (d) => { const b = edBlock(), f = findSlot(b, ED.slot); f.slot.exercise = d.id; delete f.slot.display_name; delete f.slot.alternates; applyLoad(f.slot, d.id); touch(b); closeSheet(); render(); };
ACT.edAdd = (d) => { ED.session = d.s; openPicker("Add a lift", "edAddPick"); };
function applyLoad(slot, id) {
  const e = ex(id);
  if (e.load_type === "bodyweight") { slot.load = "bodyweight"; delete slot.increment; }
  else { delete slot.load; slot.increment = e.region === "lower" ? 10 : 5; }
  if (e.measure === "seconds") slot.measure = "seconds"; else delete slot.measure;
}
ACT.edAddPick = (d) => {
  const b = edBlock(), s = b.plan.sessions.find((x) => x.key === ED.session);
  const slot = { key: `${s.key}.x${uid().slice(0, 6)}`, role: "accessory", exercise: d.id, reps: Object.fromEntries(b.plan.phases.map((p) => [p.key, ex(d.id).measure === "seconds" ? [30, 60] : [8, 12]])) };
  applyLoad(slot, d.id);
  s.slots.push(slot); touch(b); closeSheet(); render();
};
// ---- Changes proposed by Ask Coach. Checked against the plan and the library, shown to you, and only then applied.
const SIZE_OK = (b) => { const t = template(b.program_slug); return t && hasSizes(t) ? t : null; };
/** One line per proposed change: what it would do, and whether it can be done. */
export function describeChanges(b, changes) {
  const known = new Set(allExercises().map((e) => e.id)), out = [];
  const range = (r) => Array.isArray(r) && r.length === 2 && r.every((n) => Number.isFinite(+n) && +n >= 1 && +n <= 300) && +r[0] <= +r[1];
  for (const c of (Array.isArray(changes) ? changes : []).slice(0, 12)) {
    const f = c.slot ? findSlot(b, String(c.slot)) : null, s = c.session ? b.plan.sessions.find((x) => x.key === c.session) : null, why = typeof c.why === "string" ? c.why.slice(0, 120) : "";
    const name = (id) => ex(id).name, at = f ? f.s.title : s ? s.title : "";
    let text = "", problem = "";
    if (c.op === "swap") { text = `${at}: ${f ? name(f.slot.exercise) : c.slot} → ${name(c.to)}`; problem = !f ? "that lift is not in your plan" : !known.has(c.to) ? "not a lift in the library" : isNoGo(c.to) ? "on your no-go list" : f.slot.exercise === c.to ? "already that lift" : ""; }
    else if (c.op === "remove") { text = `${at}: remove ${f ? name(f.slot.exercise) : c.slot}`; problem = !f ? "that lift is not in your plan" : f.s.slots.length <= 1 ? "a day needs at least one lift" : ""; }
    else if (c.op === "add") { text = `${at || c.session}: add ${name(c.exercise)}${c.sets ? `, ${c.sets} × ${range(c.reps) ? c.reps[0] + "–" + c.reps[1] : "8–12"}` : ""}`; problem = !s ? "that day is not in your plan" : !known.has(c.exercise) ? "not a lift in the library" : isNoGo(c.exercise) ? "on your no-go list" : s.slots.some((x) => x.exercise === c.exercise) ? "already in that day" : s.slots.length >= 12 ? "that day is full" : c.sets != null && !(+c.sets >= 1 && +c.sets <= 6) ? "sets out of range" : ""; }
    else if (c.op === "sets") { text = `${at}: ${f ? name(f.slot.exercise) : c.slot}, ${c.sets} sets`; problem = !f ? "that lift is not in your plan" : !(Number.isInteger(+c.sets) && +c.sets >= 1 && +c.sets <= 8) ? "sets out of range" : ""; }
    else if (c.op === "reps") { text = `${at}: ${f ? name(f.slot.exercise) : c.slot}, ${range(c.reps) ? c.reps[0] + "–" + c.reps[1] : "?"} reps`; problem = !f ? "that lift is not in your plan" : !range(c.reps) ? "reps out of range" : ""; }
    else if (c.op === "size") { text = `Change the plan size to ${sizeName(+c.size) || "?"}`; problem = !SIZE_OK(b) ? "this plan has one size" : ![1, 2, 3].includes(+c.size) ? "not a size" : ""; }
    else { text = "A change the app does not know how to make"; problem = "skipped"; }
    out.push({ ok: !problem, text, problem, why, c });
  }
  return out;
}
/** Apply the changes that passed the check. Returns how many were made. History is never touched. */
export function applyPlanChanges(b, changes) {
  let n = 0;
  for (const c of (Array.isArray(changes) ? changes : []).slice(0, 12)) {
    const line = describeChanges(b, [c])[0]; if (!line || !line.ok) continue;   // re-checked one at a time: an earlier change can rule out a later one
    const f = c.slot ? findSlot(b, String(c.slot)) : null;
    if (c.op === "swap") { f.slot.exercise = c.to; delete f.slot.display_name; delete f.slot.alternates; applyLoad(f.slot, c.to); }
    else if (c.op === "remove") f.s.slots.splice(f.i, 1);
    else if (c.op === "add") {
      const s = b.plan.sessions.find((x) => x.key === c.session), secs = ex(c.exercise).measure === "seconds", r = Array.isArray(c.reps) && c.reps.length === 2 ? [+c.reps[0], +c.reps[1]] : secs ? [30, 60] : [8, 12];
      const slot = { key: `${s.key}.x${uid().slice(0, 6)}`, role: "accessory", exercise: c.exercise, reps: Object.fromEntries(b.plan.phases.map((p) => [p.key, r])) };
      if (c.sets) slot.sets = +c.sets;
      applyLoad(slot, c.exercise); s.slots.push(slot);
    }
    else if (c.op === "sets") f.slot.sets = +c.sets;
    else if (c.op === "reps") { for (const k of Object.keys(f.slot.reps)) if (Array.isArray(f.slot.reps[k])) f.slot.reps[k] = [+c.reps[0], +c.reps[1]]; }
    else if (c.op === "size") resizeBlock(b, SIZE_OK(b), +c.size);
    n++;
  }
  if (n) touch(b);
  return n;
}
ACT.edSaveAs = () => sheet("Save as my own plan", `<p class="small muted">It shows under Find a plan as yours. You can start it again later, or share it with a group.</p>${field("pname", "Name", edBlock().title + " (mine)")}
  <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="edSaveDo">Save</button></div>`);
ACT.edSaveDo = () => { const p = saveAsProgram(edBlock(), val("pname")); closeSheet(); toast(`Saved as ${p.title}`); };
export function saveAsProgram(b, title) {
  const tpl = JSON.parse(JSON.stringify(b.plan));
  delete tpl.size; tpl.sessions.forEach((s) => s.slots.forEach((x) => delete x.tier));   // a plan you saved is exactly what you built: one size
  tpl.title = title || b.title; tpl.slug = "my-" + uid().slice(0, 8); tpl.author = S.me.display_name || "Me";
  const p = touch({ id: uid(), slug: tpl.slug, version: 1, title: tpl.title, focus: tpl.focus, weeks: tpl.weeks, days_per_week: tpl.days_per_week, template: tpl });
  S.programs.push(p); save();
  return p;
}
