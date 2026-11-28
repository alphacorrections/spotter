// Ask Coach: a chat with Claude about your own training and eating.
// Each question goes to the server with a summary of your plan, recent sessions and eating target.
// Coach can propose a plan change or a day of eating. Nothing changes until you tap Apply.
import { S, ex, ymd, nice, finished, activeBlock, openSession, allExercises, gear, unit, fmtW, touchMe, template } from "./store.js";
import { ACT, CHG, VIEWS, go, render, backTop, sect, note, icon, esc, toast } from "./ui.js";
import { CLOUD } from "./cloud.js";
import { pos, phaseForWeek, nextSession, stalls, deload, isNoGo, sizeName, hasSizes } from "./train.js";
import { currentTarget, latestWeight } from "./v-coach.js";
import { recovery } from "./v-wear.js";
import { describeChanges, applyPlanChanges } from "./v-plans.js";

const KEY = "spotter.ask";
const A = { msgs: [], busy: false, left: null, draft: "", status: null };
try { A.msgs = JSON.parse(localStorage.getItem(KEY) || "[]").slice(-30); } catch (e) { A.msgs = []; }
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(A.msgs.slice(-30))); } catch (e) { /* storage is a convenience here */ } };
const fn = (body) => CLOUD.api("POST", "/functions/v1/coach", body);

const STARTERS = ["How is my training going?", "Which lift should I focus on this week?", "My shoulder is sore. Rework my next upper day.", "Make my next session fit in 45 minutes.", "Write me a day of eating with no fish.", "Should I take an easy week?"];
const wantsPlan = (t) => /swap|chang|replac|\badd\b|remov|rework|custom|short|long|plan|workout|session|sore|hurt|pain|injur|minutes|equipment|substitut|instead|lift/i.test(t);

/** What Coach gets to see. Small on purpose: the plan, the last sessions, the targets. */
function context(question) {
  const b = activeBlock(), w = latestWeight(), n = currentTarget(), rec = recovery(), c = { me: { units: unit(), daysPerWeek: S.me.days_per_week, goal: S.me.settings.focus || b?.focus || null, equipment: gear() || "full gym", noGo: S.me.no_go.map((x) => ex(x.exercise_id).name), weight: w ? `${w.value} ${w.unit}` : null } };
  if (n) c.target = { kcal: n.target_kcal, protein: n.protein_g, phase: n.phase };
  c.eat = Object.assign({ meals: 4, diet: "any" }, S.me.settings.eat || {}); delete c.eat.custom;
  if (b) {
    const p = pos(b), wk = Math.min(p.week, b.plan.weeks), ph = phaseForWeek(b.plan, wk), nx = nextSession(b);
    c.plan = { title: b.title, week: wk, weeks: b.plan.weeks, phase: ph.name, size: b.plan.size ? sizeName(b.plan.size) : null, sizes: !!(template(b.program_slug) && hasSizes(template(b.program_slug))), upNext: nx?.session?.key || nx?.key || null,
      sessions: b.plan.sessions.map((s) => ({ key: s.key, title: s.title, slots: s.slots.map((x) => { const r = x.reps[ph.key] ?? Object.values(x.reps)[0]; return { slot: x.key, exercise: x.exercise, sets: x.sets ?? b.plan.roles?.[x.role]?.sets ?? 3, reps: Array.isArray(r) ? r : String(r) }; }) })) };
  }
  c.recent = finished("strength").slice(-8).map((a) => {
    const by = new Map();
    for (const e of a.efforts || []) { if (e.kind !== "work" || e.reps == null) continue; const cur = by.get(e.exercise_id); if (!cur || (e.weight || 0) * e.reps > (cur.weight || 0) * cur.reps) by.set(e.exercise_id, e); }
    return { date: ymd(new Date(a.started_at)), title: a.title, felt: a.checkin?.rating || null, best: [...by].map(([id, e]) => `${ex(id).name}: ${fmtW(e.weight)} x ${e.reps}`) };
  });
  const since = new Date(Date.now() - 14 * 864e5).toISOString(), other = {};
  for (const a of finished()) if (a.domain !== "strength" && a.started_at >= since) other[a.domain] = (other[a.domain] || 0) + 1;
  c.last14days = other;
  const st = stalls(), dl = deload();
  if (st.length) c.levelledOff = st.map((e) => e.name);
  if (dl.due) c.easyWeekDue = dl.reasons;
  if (rec) c.recovery = rec.text;
  if (b && wantsPlan(question)) {
    const have = gear(), fits = (e) => e.equipment === "none" || e.equipment === "other" || !have || have.includes(e.equipment), lib = {};
    for (const e of allExercises()) { if (e.domain !== "strength" || isNoGo(e.id) || !fits(e)) continue; (lib[(e.muscles || [])[0] || "other"] ||= []).push(e.id); }
    c.library = lib;
  }
  return c;
}

function parse(text) {
  let action = null;
  const clean = text.replace(/```spotter-action\s*([\s\S]*?)```/g, (_, j) => { try { const o = JSON.parse(j); if (o && (o.type === "plan_change" || o.type === "eat_day")) action = o; } catch (e) { /* a block the app cannot read is dropped */ } return ""; }).trim();
  return { text: clean, action };
}
const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*] /gm, "• ").replace(/^#+\s*(.+)$/gm, "<b>$1</b>").replace(/\n/g, "<br>");

function actionCard(m, i) {
  const a = m.action;
  if (a.type === "plan_change") {
    const b = activeBlock(); if (!b) return "";
    const lines = describeChanges(b, a.changes || []), good = lines.filter((l) => l.ok).length;
    return `<div class="glass pad askcard"><div class="label">Proposed change</div><b>${esc(a.summary || "Plan change")}</b>
      <ul class="tips mt">${lines.map((l) => `<li class="${l.ok ? "" : "muted"}">${esc(l.text)}${l.why ? ` <em class="small muted">${esc(l.why)}</em>` : ""}${l.ok ? "" : ` <em class="small warnt">(${esc(l.problem)})</em>`}</li>`).join("")}</ul>
      ${m.applied ? `<p class="small okt mt">Applied ${esc(m.applied)}. Change it back any time in Plans, Edit plan.</p>` : good ? `<div class="acts"><button class="tp-btn tp-ghost" data-act="askSkip" data-i="${i}">Not now</button><button class="tp-btn" data-act="askApply" data-i="${i}">Apply ${good} change${good === 1 ? "" : "s"}</button></div>` : `<p class="small muted mt">None of these can be applied as written. Ask again with more detail.</p>`}</div>`;
  }
  const items = (a.items || []).slice(0, 8), k = items.reduce((t, x) => t + (+x.kcal || 0), 0), p = items.reduce((t, x) => t + (+x.protein || 0), 0);
  return `<div class="glass askcard"><div class="pad" style="padding-bottom:0"><div class="label">A day of eating</div><b>${esc(a.title || "Your day")}</b></div>
    ${items.map((x) => `<div class="tp-row static"><span class="tp-t"><b>${esc(x.slot || "")}: ${esc(x.name || "")}</b><span>${esc(x.portion || "")}</span></span><span class="amt small">${+x.protein || 0} g<br><em class="muted">${+x.kcal || 0} cal</em></span></div>`).join("")}
    <div class="tp-row static"><span class="tp-t"><b>Total</b></span><span class="amt small">${p} g<br><em class="muted">${k} cal</em></span></div>
    <div class="pad" style="padding-top:0">${m.applied ? `<p class="small okt">Saved. It is on the How to eat it page.</p>` : `<div class="acts"><button class="tp-btn tp-ghost" data-act="askSkip" data-i="${i}">Not now</button><button class="tp-btn" data-act="askApply" data-i="${i}">Save this day</button></div>`}</div></div>`;
}

VIEWS.ask = () => {
  let h = backTop("Ask Coach", A.left != null ? `${A.left} question${A.left === 1 ? "" : "s"} left today` : "Your training, in plain words", "back", A.msgs.length ? `<button class="tp-btn tp-ghost tp-sm" data-act="askClear">Clear</button>` : "");
  if (!CLOUD.ready() || !CLOUD.on()) return h + `<div class="glass"><div class="empty">Sign in to use Ask Coach. It needs your account to know who is asking.<br><button class="tp-btn tp-sm" data-act="goSettings">Sign in</button></div></div>`;
  if (A.status === null) { A.status = "loading"; fn({ action: "status", day: ymd() }).then((j) => { A.status = j; if (j && j.left != null) A.left = j.left; render(); }).catch(() => { A.status = {}; }); }
  if (A.status && A.status.allowed === false) return h + `<div class="glass"><div class="empty">Ask Coach is for members of the group. Join with an invite code on the Friends tab.</div></div>`;
  if (A.status && A.status.ready === false) h += note("<b>Not switched on yet.</b> Ask Coach needs its API key saved on the server. Questions will work as soon as that is done.");
  if (!A.msgs.length) {
    h += `<div class="glass pad"><p class="muted" style="margin:0">Ask about your plan, a stalled lift, what to eat, or have Coach rework a session. Coach sees your plan, your last eight sessions and your eating target. It proposes changes and you approve them.</p></div>` +
      sect("Try one") + `<div class="glass">` + STARTERS.map((s, i) => `<button class="tp-row" data-act="askStarter" data-i="${i}"><span class="tp-t"><b>${esc(s)}</b></span><span class="tp-chev">${icon("chev")}</span></button>`).join("") + `</div>`;
  }
  h += `<div class="askthread">` + A.msgs.map((m, i) => m.role === "user" ? `<div class="askq">${esc(m.content)}</div>` : `<div class="aska">${rich(m.text ?? m.content)}</div>${m.action ? actionCard(m, i) : ""}`).join("") +
    (A.busy ? `<div class="aska muted">Coach is thinking…</div>` : "") + `</div>`;
  h += `<div class="askbar"><textarea class="tp-input" id="askbox" rows="2" placeholder="Ask Coach" aria-label="Ask Coach" data-chg="askDraft">${esc(A.draft)}</textarea><button class="tp-btn" data-act="askSend" ${A.busy ? "disabled" : ""}>Send</button></div>
    <p class="small muted">Coach is an AI and can be wrong. It is not a doctor or dietitian. Each question sends a summary of your training to Anthropic to get the answer.</p>`;
  return h;
};

async function send(text) {
  text = String(text || "").trim();
  if (!text || A.busy) return;
  A.msgs.push({ role: "user", content: text }); A.draft = ""; A.busy = true; keep(); render(); scrollTo(0, document.body.scrollHeight);
  try {
    const j = await fn({ day: ymd(), messages: A.msgs.map((m) => ({ role: m.role, content: m.content })), context: context(text) });
    if (j && j.left != null) A.left = j.left;
    if (!j || !j.ok) { A.msgs.pop(); A.draft = text; toast((j && j.error) || "Coach could not answer. Try again."); }
    else { const p = parse(j.text); A.msgs.push({ role: "assistant", content: j.text, text: p.text, action: p.action }); }
  } catch (e) { A.msgs.pop(); A.draft = text; toast("Could not reach Coach. Check your connection."); }
  A.busy = false; keep(); render(); scrollTo(0, document.body.scrollHeight);
}
ACT.askSend = () => send(document.getElementById("askbox")?.value);
ACT.askStarter = (d) => send(STARTERS[+d.i]);
ACT.askClear = () => { A.msgs = []; keep(); render(); };
ACT.askSkip = (d) => { const m = A.msgs[+d.i]; if (m) { delete m.action; keep(); render(); } };
ACT.askApply = (d) => {
  const m = A.msgs[+d.i]; if (!m || !m.action || m.applied) return;
  if (m.action.type === "plan_change") {
    if (openSession()) return toast("Finish the session you have open first");
    const b = activeBlock(); if (!b) return toast("Start a plan first");
    const n = applyPlanChanges(b, m.action.changes || []);
    if (!n) return toast("Nothing could be applied");
    m.applied = `${n} change${n === 1 ? "" : "s"} on ${nice(ymd())}`; toast("Plan updated");
  } else {
    const items = (m.action.items || []).slice(0, 8).map((x) => ({ slot: String(x.slot || "").slice(0, 20), name: String(x.name || "").slice(0, 80), portion: String(x.portion || "").slice(0, 160), kcal: Math.max(0, Math.round(+x.kcal || 0)), protein: Math.max(0, Math.round(+x.protein || 0)) }));
    S.me.settings.eat = Object.assign({ meals: 4, diet: "any" }, S.me.settings.eat || {}, { custom: { title: String(m.action.title || "Your day").slice(0, 60), items, on: ymd() } }); touchMe();
    m.applied = "saved"; toast("Day saved");
  }
  keep(); render();
};
ACT.goAsk = (d) => { if (d && d.q) A.draft = d.q; go("ask"); };
CHG.askDraft = (v) => { A.draft = v; };
