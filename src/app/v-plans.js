// Plans: the block you are running, the library to pick from, and the editor
// that lets you change anything about a plan once it is yours.
import { S, touch, save, uid, ex, templates, activeBlock, openSession, nice, gear } from "./store.js";
import { ACT, CHG, VIEWS, R, go, render, top, backTop, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, chips, field, val } from "./ui.js";
import { startBlock, endBlock, resumeBlock, pos, phaseForWeek } from "./train.js";
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
    const p = pos(b), wk = Math.min(p.week, b.plan.weeks), len = b.plan.rotation.length;
    const pct = Math.min(100, Math.round((b.position / (b.plan.weeks * len)) * 100));
    h += `<div class="glass hero tp-rise"><div class="label">Running now</div><div class="heroT">${esc(b.title)}</div>
      <div class="small muted">Week ${wk} of ${b.plan.weeks} · ${esc(phaseForWeek(b.plan, wk).name)} · ${esc(FOCUS[b.focus].name)}</div>
      <div class="bar" style="margin-top:12px"><i style="width:${pct}%"></i></div>
      <div class="flex mt"><button class="tp-btn tp-sm" data-act="editPlan">Edit plan</button><button class="tp-btn tp-ghost tp-sm" data-act="planDetail" data-id="${b.id}" data-block="1">See it all</button><button class="tp-btn tp-ghost tp-sm" data-act="endAsk" data-id="${b.id}">End</button></div></div>`;
  }
  const old = S.blocks.filter((x) => x.status !== "active").sort((a, c) => (c.started_on || "").localeCompare(a.started_on || "")).slice(0, 5);
  if (old.length) {
    h += sect("Earlier blocks") + `<div class="glass">` + old.map((x) => row({ tile: icon("calendar"), title: x.title, sub: `${x.status === "done" ? "Finished" : "Paused"} · started ${nice(x.started_on)}`, act: "resumeAsk", data: { id: x.id }, chev: false, right: pill(x.status === "done" ? "Done" : "Paused", x.status === "done" ? "ok" : "plain") })).join("") + `</div>`;
  }
  h += sect("Find a plan") + chips("planFocus", [["all", "All"], ["hypertrophy", "Hypertrophy"], ["strength", "Strength"], ["maintain", "Maintain"], ["general", "Just move"]], F.focus);
  const list = allPlans().filter((t) => F.focus === "all" || t.focus === F.focus);
  h += `<div class="glass mt">` + list.map((t) => row({
    tile: String(t.days_per_week), title: t.title, sub: `${t.days_per_week} days a week · ${t.weeks} weeks · ${FOCUS[t.focus].name}`,
    act: "planDetail", data: { id: t.mine || t.slug }, right: t.mine ? pill("Yours", "plain") : fits(t) ? pill("Fits you", "ok") : "",
  })).join("") + `</div>`;
  h += note(`<b>Every plan can be changed.</b> Start one, then use Edit plan to swap lifts, change sets and reps, or add your own. Mid-session swaps work too.`);
  return h;
};
ACT.planFocus = (d) => { F.focus = d.v; render(); };

function planBody(t) {
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
  sheet(t.title, planBody(t) + (b ? `<p class="small muted mt">Starting this pauses ${esc(b.title)}. It stays in your list and you can go back to it.</p>` : "") +
    `<div class="acts"><button class="tp-btn tp-ghost" data-close>Not now</button><button class="tp-btn" data-act="planStart" data-id="${esc(d.id)}">Start this plan</button></div>`);
};
ACT.planStart = (d) => {
  if (openSession()) return toast("Finish the session you have open first");
  const t = allPlans().find((x) => (x.mine || x.slug) === d.id);
  const tpl = { ...t }; delete tpl.mine;
  startBlock(tpl, { nutritionPhase: currentTarget()?.phase, programId: t.mine || null });
  closeSheet(); go("today"); toast(`${t.title} started`);
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
const ED = { session: null, slot: null };
const edBlock = () => S.blocks.find((x) => x.id === R.params.id) || activeBlock();
function edPhase(b) { return phaseForWeek(b.plan, Math.min(pos(b).week, b.plan.weeks)).key; }
function findSlot(b, key) { for (const s of b.plan.sessions) { const i = s.slots.findIndex((x) => x.key === key); if (i >= 0) return { s, i, slot: s.slots[i] }; } return null; }

VIEWS.editor = () => {
  const b = edBlock();
  if (!b) return backTop("Edit plan", "", "goPlans") + `<div class="glass"><div class="empty">No plan to edit yet.</div></div>`;
  const ph = edPhase(b), phName = b.plan.phases.find((p) => p.key === ph).name;
  let h = backTop("Edit plan", b.title, "goToday", `<button class="tp-btn tp-sm" data-act="goToday">Done</button>`) +
    note(`Changes are yours alone and apply from your next session. Rep ranges shown are for the current phase: <b>${esc(phName)}</b>.`);
  for (const s of b.plan.sessions) {
    h += sect(s.title, `<button data-act="edAdd" data-s="${s.key}">+ Add a lift</button>`) + `<div class="glass">`;
    s.slots.forEach((sl, i) => {
      const r = sl.reps[ph], sets = sl.sets ?? b.plan.roles?.[sl.role]?.sets ?? 3, ranged = Array.isArray(r);
      h += `<div class="edrow"><div class="edname"><b>${esc(sl.display_name || ex(sl.exercise).name)}</b><span>${esc(sl.role)}${sl.superset ? " · superset " + sl.superset : ""}${r === "skip" ? " · not in this phase" : ""}</span></div>
        <div class="edctl"><label><span>Sets</span><input class="tp-input" inputmode="numeric" data-chg="edSets" data-k="${sl.key}" value="${sets}" aria-label="Sets"></label>
        ${ranged ? `<label><span>Reps from</span><input class="tp-input" inputmode="numeric" data-chg="edLow" data-k="${sl.key}" value="${r[0]}" aria-label="Lowest reps"></label><label><span>to</span><input class="tp-input" inputmode="numeric" data-chg="edHigh" data-k="${sl.key}" value="${r[1]}" aria-label="Highest reps"></label>` : `<span class="small muted grow">${r === "amrap" ? "To failure" : ""}</span>`}
        </div><div class="edbtns"><button class="ibtn sm" data-act="edMove" data-k="${sl.key}" data-d="-1" aria-label="Move up"${i ? "" : " disabled"}>${icon("up")}</button><button class="ibtn sm" data-act="edMove" data-k="${sl.key}" data-d="1" aria-label="Move down"${i < s.slots.length - 1 ? "" : " disabled"}>${icon("down")}</button>
        <button class="ibtn sm" data-act="edSwap" data-k="${sl.key}" aria-label="Change exercise">${icon("swap")}</button><button class="ibtn sm" data-act="edRemove" data-k="${sl.key}" aria-label="Remove">${icon("trash")}</button></div></div>`;
    });
    h += `</div>`;
  }
  h += `<button class="tp-btn tp-ghost tp-block mt" data-act="edSaveAs">Save as my own plan</button>`;
  return h;
};
const clampInt = (v, lo, hi, fallback) => { const n = parseInt(v, 10); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
CHG.edSets = (v, d, el) => { const b = edBlock(), f = findSlot(b, d.k); f.slot.sets = clampInt(v, 1, 12, 3); el.value = f.slot.sets; touch(b); };
CHG.edLow = (v, d, el) => { const b = edBlock(), r = findSlot(b, d.k).slot.reps[edPhase(b)]; r[0] = clampInt(v, 1, r[1], r[0]); el.value = r[0]; touch(b); };
CHG.edHigh = (v, d, el) => { const b = edBlock(), r = findSlot(b, d.k).slot.reps[edPhase(b)]; r[1] = clampInt(v, r[0], 999, r[1]); el.value = r[1]; touch(b); };
ACT.edMove = (d) => { const b = edBlock(), f = findSlot(b, d.k), j = f.i + +d.d; if (j < 0 || j >= f.s.slots.length) return; f.s.slots.splice(j, 0, f.s.slots.splice(f.i, 1)[0]); touch(b); render(); };
ACT.edRemove = (d, el) => {
  if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.classList.add("sure"); return toast("Tap again to remove"); }
  const b = edBlock(), f = findSlot(b, d.k);
  f.s.slots.splice(f.i, 1); touch(b); render();
};
ACT.edSwap = (d) => { ED.slot = d.k; openPicker("Change exercise", "edPick"); };
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
ACT.edSaveAs = () => sheet("Save as my own plan", `<p class="small muted">It shows under Find a plan as yours. You can start it again later, or share it with a group.</p>${field("pname", "Name", edBlock().title + " (mine)")}
  <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="edSaveDo">Save</button></div>`);
ACT.edSaveDo = () => { const p = saveAsProgram(edBlock(), val("pname")); closeSheet(); toast(`Saved as ${p.title}`); };
export function saveAsProgram(b, title) {
  const tpl = JSON.parse(JSON.stringify(b.plan));
  tpl.title = title || b.title; tpl.slug = "my-" + uid().slice(0, 8); tpl.author = S.me.display_name || "Me";
  const p = touch({ id: uid(), slug: tpl.slug, version: 1, title: tpl.title, focus: tpl.focus, weeks: tpl.weeks, days_per_week: tpl.days_per_week, template: tpl });
  S.programs.push(p); save();
  return p;
}
