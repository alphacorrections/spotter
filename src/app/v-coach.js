// Coach: what you are training for, what the app has noticed, the eating
// target, and plain-language explanations of every term the app uses.
import { S, touch, touchMe, save, uid, ymd, daysBetween, activeBlock, isKg } from "./store.js";
import { ACT, VIEWS, go, render, backTop, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, field, val, numVal } from "./ui.js";
import { stalls, deload, gap } from "./train.js";
import { FOCUS, PHASE, GLOSSARY } from "./words.js";
import { estimateMaintenance, restingKcal, calorieTarget, adjustMaintenance } from "../engine/nutrition.mjs";

export function currentTarget() {
  const today = ymd();
  return S.nutrition.filter((n) => n.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null;
}
export function latestWeight() {
  const w = S.body.filter((b) => b.kind === "weight").sort((a, b) => b.measured_on.localeCompare(a.measured_on))[0];
  return w ? { value: w.value, unit: w.unit, on: w.measured_on } : null;
}
const toLb = (w) => (w.unit === "kg" ? w.value * 2.2046 : w.value);

/** After two weeks of weigh-ins, is the scale moving the way the phase expects? */
function scaleCheck(n) {
  const ws = S.body.filter((b) => b.kind === "weight" && b.measured_on >= n.effective_from).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  if (ws.length < 4) return null;
  const days = daysBetween(ws[0].measured_on, ws[ws.length - 1].measured_on);
  if (days < 14) return null;
  const weeklyPct = (((toLb(ws[ws.length - 1]) - toLb(ws[0])) / toLb(ws[0])) * 100) / (days / 7);
  return { weeklyPct, ...adjustMaintenance({ phase: n.phase, maintenanceKcal: n.maintenance_kcal, weeklyPct }) };
}

VIEWS.coach = () => {
  const b = activeBlock(), focus = b?.focus || S.me.settings.focus;
  let h = backTop("Coach", "What the app is doing, and why", "goToday");
  if (focus) {
    h += `<div class="glass hero tp-rise"><div class="label">You are training for</div><div class="heroT">${esc(FOCUS[focus].name)}</div><div class="small muted">${esc(FOCUS[focus].how)}</div></div>`;
  }
  const d = deload(), stuck = stalls(), g = gap();
  const flags = [];
  if (g.text) flags.push(`<b>Welcome back.</b> ${esc(g.text)}`);
  if (d.due) flags.push(`<b>Take an easy week.</b> ${esc(d.reasons.join(", and "))}. Keep the same exercises and weights, do two thirds of the sets, and stop every set well short of failure. One week, then back to normal.`);
  for (const e of stuck) flags.push(`<b>${esc(e.name)} has stalled.</b> No new best in three sessions. Pick one: drop the weight 10 percent and build the reps back up, add one set at the same weight, or leave it for a week. Log what you choose and the targets follow.`);
  h += sect("What the app has noticed");
  h += flags.length ? flags.map((f) => note(f)).join("") : `<div class="glass"><div class="empty">Nothing to flag. Keep beating last time by a rep.</div></div>`;

  const n = currentTarget();
  h += sect("Eating target", n ? `<button data-act="eatOpen">Change</button>` : "");
  if (n) {
    const chk = scaleCheck(n), ph = PHASE[n.phase];
    h += `<div class="glass pad"><div class="tp-stats mb0"><div class="tp-stat"><span>Calories a day</span><b>${n.target_kcal}</b></div><div class="tp-stat"><span>Protein</span><b>${n.protein_g} g</b></div><div class="tp-stat"><span>Phase</span><b>${esc(ph.name)}</b></div></div>
      <p class="small muted mt">${esc(ph.scale)} Maintenance is set at ${n.maintenance_kcal}${n.maintenance_source === "estimated" ? ", an estimate" : ""}. Log your weight a few times a week and the app checks this number after two weeks.</p>
      ${chk && chk.reason ? `<div class="liftnote hi"><b>The ${esc(chk.reason)}.</b> Your weight is moving ${chk.weeklyPct >= 0 ? "+" : ""}${chk.weeklyPct.toFixed(2)} percent a week.<br><button class="tp-btn tp-sm mt" data-act="eatAdjust" data-m="${chk.maintenanceKcal}">Update the target</button></div>` : chk ? `<p class="small okt">On track: ${chk.weeklyPct >= 0 ? "+" : ""}${chk.weeklyPct.toFixed(2)} percent a week.</p>` : ""}</div>`;
  } else {
    h += `<div class="glass"><div class="empty">Cutting, bulking or holding steady? Get one calorie number and one protein number. No food logging.<br><button class="tp-btn tp-sm" data-act="eatOpen">Set an eating target</button></div></div>`;
  }
  h += sect("What the words mean") + `<div class="glass">` + GLOSSARY.map(([t], i) => row({ tile: icon("info"), title: t, act: "gloss", data: { i } })).join("") + `</div>`;
  return h;
};
ACT.gloss = (d) => { const [t, body] = GLOSSARY[+d.i]; sheet(t, `<p>${esc(body)}</p><div class="acts"><button class="tp-btn" data-close>Got it</button></div>`); };

// ---------------------------------------------------------------- eating target
const EAT = { phase: "maintain", know: "yes" };
ACT.eatOpen = () => {
  const n = currentTarget(), w = latestWeight(), me = S.me;
  EAT.phase = n?.phase || "maintain"; EAT.know = n && n.maintenance_source !== "estimated" ? "yes" : n ? "no" : "yes";
  const age = me.birth_year ? new Date().getFullYear() - me.birth_year : "";
  const hIn = me.height_cm ? Math.round(me.height_cm / 2.54) : null;
  sheet("Eating target", `<label class="tp-label">Phase</label>
    <div class="seg" id="eatphase">${Object.entries(PHASE).map(([k, p]) => `<button type="button" data-v="${k}" class="${k === EAT.phase ? "on" : ""}">${p.name}</button>`).join("")}</div>
    <label class="tp-label">Maintenance calories</label>
    <div class="seg" id="eatknow"><button type="button" data-act="eatKnow" data-v="yes" class="${EAT.know === "yes" ? "on" : ""}">I know mine</button><button type="button" data-act="eatKnow" data-v="no" class="${EAT.know === "no" ? "on" : ""}">Estimate it</button></div>
    <div id="eatyes"${EAT.know === "yes" ? "" : " hidden"}>${field("eatm", "Calories a day that hold your weight steady", n && n.maintenance_source !== "estimated" ? n.maintenance_kcal : "", "e.g. 2800", "text", "numeric")}</div>
    <div id="eatno"${EAT.know === "no" ? "" : " hidden"}>
      <label class="tp-label">Sex, for the estimate</label><div class="seg" id="eatsex"><button type="button" data-v="male" class="${me.sex_for_estimate !== "female" ? "on" : ""}">Male</button><button type="button" data-v="female" class="${me.sex_for_estimate === "female" ? "on" : ""}">Female</button></div>
      <div class="fgrid">${field("eatage", "Age", age, "", "text", "numeric")}${isKg() ? field("eatcm", "Height (cm)", me.height_cm || "", "", "text", "decimal") : field("eatft", "Height (ft)", hIn ? Math.floor(hIn / 12) : "", "", "text", "numeric") + field("eatin", "and inches", hIn ? hIn % 12 : "", "", "text", "numeric")}</div>
      <label class="tp-label">Day to day, outside training</label><div class="seg" id="eatact">${[["sedentary", "Desk"], ["light", "Some"], ["moderate", "Active"], ["very", "Very"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(me.activity_level || "moderate") === v ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    ${field("eatw", `Bodyweight (${me.units})`, w ? w.value : "", "", "text", "decimal")}
    <p class="small muted mt">A starting point, not medical advice. The number is checked against your weigh-ins after two weeks and never goes below your estimated resting needs.</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="eatSave">Get my target</button></div>`);
};
ACT.eatKnow = (d) => { EAT.know = d.v; document.getElementById("eatyes").hidden = d.v !== "yes"; document.getElementById("eatno").hidden = d.v !== "no"; };
const segVal = (id) => document.querySelector(`#${id} .on`)?.getAttribute("data-v");
function writeTarget(phase, maintenance, source, weightLb, floor) {
  const t = calorieTarget({ phase, maintenanceKcal: maintenance, weightLb, restingKcal: floor });
  const today = ymd(), same = S.nutrition.find((x) => x.effective_from === today);
  const rowN = Object.assign(same || { id: uid() }, { effective_from: today, phase, maintenance_kcal: Math.round(maintenance), maintenance_source: source, target_kcal: t.targetKcal, protein_g: t.proteinG });
  if (!same) S.nutrition.push(rowN);
  touch(rowN);
  const b = activeBlock();
  if (b) { b.nutrition_phase = phase; touch(b); }
  return t;
}
ACT.eatSave = () => {
  const me = S.me, phase = segVal("eatphase"), w = numVal("eatw");
  if (!w) return toast("Enter your bodyweight");
  const weightLb = isKg() ? w * 2.2046 : w, weightKg = isKg() ? w : w / 2.2046;
  let maintenance, source, floor = null;
  if (EAT.know === "yes") {
    maintenance = numVal("eatm"); source = "entered";
    if (!maintenance || maintenance < 1000 || maintenance > 7000) return toast("Enter maintenance calories, between 1000 and 7000");
  } else {
    const age = numVal("eatage"), cm = isKg() ? numVal("eatcm") : ((numVal("eatft") || 0) * 12 + (numVal("eatin") || 0)) * 2.54;
    if (!age || age < 18 || age > 100) return toast("Enter your age (18 or over)");
    if (!cm || cm < 120 || cm > 230) return toast("Enter your height");
    me.sex_for_estimate = segVal("eatsex"); me.birth_year = new Date().getFullYear() - age; me.height_cm = Math.round(cm * 10) / 10; me.activity_level = segVal("eatact");
    const person = { sex: me.sex_for_estimate, weightKg, heightCm: cm, age, activity: me.activity_level };
    maintenance = estimateMaintenance(person); floor = restingKcal(person); source = "estimated";
    touchMe();
  }
  const last = latestWeight();
  if (!last || last.on !== ymd() || last.value !== w) {
    const same = S.body.find((x) => x.kind === "weight" && x.measured_on === ymd());
    const rowB = Object.assign(same || { kind: "weight", measured_on: ymd() }, { value: w, unit: me.units });
    if (!same) S.body.push(rowB);
    touch(rowB);
  }
  const t = writeTarget(phase, maintenance, source, weightLb, floor);
  closeSheet(); render();
  toast(`${t.targetKcal} calories, ${t.proteinG} g protein`);
};
ACT.eatAdjust = (d) => {
  const n = currentTarget(), w = latestWeight();
  writeTarget(n.phase, +d.m, "adjusted", w ? toLb(w) : 180, null);
  render(); toast("Target updated from your weigh-ins");
};
