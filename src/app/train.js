// Where the plan, the history and the coaching rules meet. Screens call these;
// nothing here touches the page.
import { S, touch, save, uid, ymd, daysBetween, ex, activeBlock, openSession, finished, historyFor, lastSets, lastStrengthDay, loadStep, incFor, unit, gear } from "./store.js";
import { slotSpec, planSets, blockPosition, verdict, e1rm, phaseForWeek } from "../engine/progression.mjs";
import { stalled, deloadCheck, gapRule, stepTarget } from "../engine/coach.mjs";

// ---------------------------------------------------------------- blocks
// Plan sizes. Every slot carries a tier (1 Starter, 2 Standard, 3 Full); a plan run at size N keeps tiers up to N.
export const SIZES = [[1, "Starter", "The essentials. Shortest sessions."], [2, "Standard", "The full plan most people should run."], [3, "Full", "Extra work for lagging areas. Longest sessions."]];
export const sizeName = (n) => (SIZES.find((s) => s[0] === n) || [])[1] || "";
export const hasSizes = (plan) => plan.sessions.some((s) => s.slots.some((x) => (x.tier || 1) > 1));
export function sizePlan(plan, n) {
  const p = JSON.parse(JSON.stringify(plan));
  if (!hasSizes(p)) return p;
  p.sessions.forEach((s) => { s.slots = s.slots.filter((x) => (x.tier || 1) <= n); });
  p.size = n;
  return p;
}
/** Lifts per day and rough minutes per session at a size. */
export function sizeFacts(plan, n) {
  const p = sizePlan(plan, n), per = p.sessions.map((s) => s.slots.length);
  const secs = p.sessions.map((s) => s.slots.reduce((t, x) => { const r = p.roles?.[x.role] || {}; return t + (x.sets ?? r.sets ?? 3) * ((x.rest_s ?? r.rest_s ?? 90) + 45); }, 0));
  const lo = Math.min(...per), hi = Math.max(...per), avg = secs.reduce((a, c) => a + c, 0) / secs.length / 60;
  return { lifts: lo === hi ? String(lo) : `${lo} to ${hi}`, minutes: Math.round(avg / 5) * 5 };
}
/**
 * Change the size of a running block. Lifts you swapped keep your swap, lifts you added yourself stay,
 * history is untouched. Lifts you removed by hand come back if the new size includes them.
 */
export function resizeBlock(b, tpl, n) {
  const want = sizePlan(tpl, n);
  for (const s of b.plan.sessions) {
    const ws = want.sessions.find((x) => x.key === s.key); if (!ws) continue;
    const mine = new Map(s.slots.map((x) => [x.key, x])), all = new Set(tpl.sessions.find((x) => x.key === s.key).slots.map((x) => x.key));
    s.slots = ws.slots.map((x) => (mine.has(x.key) ? Object.assign(mine.get(x.key), { tier: x.tier }) : x)).concat(s.slots.filter((x) => !all.has(x.key)));
  }
  for (const [k, v] of Object.entries(want.roles || {})) if (!b.plan.roles[k]) b.plan.roles[k] = v;
  b.plan.size = n; touch(b);
  return b;
}
export function startBlock(tpl, opts = {}) {
  S.blocks.filter((b) => b.status === "active").forEach((b) => { b.status = "paused"; touch(b); });
  const b = {
    id: uid(), title: tpl.title, focus: tpl.focus, nutrition_phase: opts.nutritionPhase || null,
    program_slug: tpl.slug, program_id: opts.programId || null, group_block_id: opts.groupBlockId || null,
    plan: hasSizes(tpl) ? sizePlan(tpl, opts.size || tpl.size || 2) : JSON.parse(JSON.stringify(tpl)), status: "active", position: opts.position || 0,
    started_on: ymd(), finished_on: null, last_done: null,
  };
  S.blocks.push(b);
  touch(b);
  return b;
}
export function endBlock(b, status) { b.status = status || "done"; b.finished_on = ymd(); touch(b); }
export function resumeBlock(b) {
  S.blocks.filter((x) => x.status === "active").forEach((x) => { x.status = "paused"; touch(x); });
  b.status = "active"; b.finished_on = null; touch(b);
}
export function pos(b) { return blockPosition(b.plan, b.position); }
export function sessionOf(b, key) { return b.plan.sessions.find((s) => s.key === key); }

/** How many rest entries sit at the block's current position. */
function restRun(b) {
  let n = 0;
  const len = b.plan.rotation.length;
  while (n < len && b.plan.rotation[(b.position + n) % len].rest) n++;
  return n;
}

/**
 * What Today should show. Missed days shift the block forward: a rest day only
 * holds you back on the day it falls on.
 */
export function todayState() {
  const open = openSession();
  if (open) return { kind: "open", activity: open, block: activeBlock() };
  const b = activeBlock();
  if (!b) return { kind: "none" };
  // A session done out of order this week is not asked for again when its turn comes.
  for (let p0 = pos(b), n = 0; !p0.done && p0.entry.session && n < b.plan.rotation.length && S.activities.some((a) => a.block_id === b.id && a.week === p0.week && a.session_key === p0.entry.session && a.ended_at); p0 = pos(b), n++) { b.position += 1; touch(b); }
  let p = pos(b);
  if (p.done) return { kind: "complete", block: b };
  const since = b.last_done ? daysBetween(b.last_done, ymd()) : null;
  if (since === 0) {
    const next = nextSession(b);
    return { kind: "done_today", block: b, pos: p, next };
  }
  if (p.entry.rest) {
    const run = restRun(b);
    if (since != null && since <= run) return { kind: "rest", block: b, pos: p, entry: b.plan.rotation[(b.position + since - 1) % b.plan.rotation.length], next: nextSession(b) };
    b.position += run; touch(b);       // rest days already passed on the calendar
    p = pos(b);
    if (p.done) return { kind: "complete", block: b };
  }
  return { kind: "session", block: b, pos: p, session: sessionOf(b, p.entry.session) };
}
export function nextSession(b) {
  const len = b.plan.rotation.length;
  for (let i = 0; i < len; i++) {
    const position = b.position + i, p = blockPosition(b.plan, position);
    if (p.done) return null;
    if (p.entry.session) return { session: sessionOf(b, p.entry.session), week: p.week, position };
  }
  return null;
}
export function skipRest(b) { b.position += restRun(b); touch(b); }

// ---------------------------------------------------------------- planning a session
export function gap() {
  const last = lastStrengthDay();
  return gapRule(last ? daysBetween(last, ymd()) : null);
}

/** The spec for a slot this week, with any swap applied and the increment in the user's units. */
export function specFor(plan, slotKey, week, exerciseId) {
  const spec = slotSpec(plan, slotKey, Math.min(week, plan.weeks));
  if (exerciseId && exerciseId !== spec.exercise) { spec.exercise = exerciseId; spec.name = null; }
  const e = ex(spec.exercise);
  if (e.load_type === "bodyweight" && spec.load === "external" && !spec.increment) spec.load = "bodyweight";
  if (e.measure === "seconds") spec.measure = "seconds";
  spec.increment = spec.load === "bodyweight" ? null : incFor(spec.increment) ?? incFor(e.region === "lower" ? S.me.increments.lower : S.me.increments.upper);
  return spec;
}
export function targetsFor(spec) {
  return planSets(spec, lastSets(spec.exercise), { loadFactor: gap().loadFactor, step: loadStep() });
}
/** A plain spec for a lift added on the fly, outside any plan. */
export function adhocSpec(exerciseId) {
  const e = ex(exerciseId);
  const bw = e.load_type === "bodyweight";
  return {
    slotKey: null, exercise: exerciseId, name: null, role: "accessory", active: true, sets: 3,
    reps: e.measure === "seconds" ? [30, 60] : [8, 12], measure: e.measure || "reps", load: bw ? "bodyweight" : "external",
    increment: bw ? null : incFor(e.region === "lower" ? S.me.increments.lower : S.me.increments.upper),
    effort: { text: "Stop 1 to 2 reps short of failure" }, restS: 90, superset: null, intensifier: null,
    progression: { type: "double_progression" },
  };
}

export function startSession(b, sessionKey) {
  const p = pos(b), session = sessionOf(b, sessionKey);
  const a = {
    id: uid(), domain: "strength", title: session.title, block_id: b.id, week: Math.min(p.week, b.plan.weeks), session_key: sessionKey,
    started_at: new Date().toISOString(), ended_at: null, open: 1, efforts: [], swaps: {}, draft: {},
    items: session.slots.filter((s) => slotSpec(b.plan, s.key, Math.min(p.week, b.plan.weeks)).active).map((s) => ({ slot_key: s.key, exercise_id: s.exercise })),
  };
  S.activities.push(a); save();
  return a;
}
export function startFreeSession() {
  const a = { id: uid(), domain: "strength", title: "Workout", block_id: null, week: null, session_key: null,
    started_at: new Date().toISOString(), ended_at: null, open: 1, efforts: [], swaps: {}, draft: {}, items: [] };
  S.activities.push(a); save();
  return a;
}
/** Spec and targets for one card of the open session. */
export function itemPlan(a, item) {
  const b = a.block_id ? S.blocks.find((x) => x.id === a.block_id) : null;
  const spec = item.slot_key && b ? specFor(b.plan, item.slot_key, a.week, item.exercise_id) : adhocSpec(item.exercise_id);
  if (item.sets) spec.sets = item.sets;
  return { spec, targets: targetsFor(spec), block: b };
}
export const itemKey = (item) => item.slot_key || "x:" + item.exercise_id;
export function setsLogged(a, item) {
  return a.efforts.filter((e) => (item.slot_key ? e.slot_key === item.slot_key : !e.slot_key && e.exercise_id === item.exercise_id) && e.kind === "work").sort((x, y) => x.set_number - y.set_number);
}

export function logSet(a, item, n, weight, reps) {
  const { spec, targets, block } = itemPlan(a, item);
  const t = targets[Math.min(n - 1, targets.length - 1)] || {};
  const prev = lastSets(spec.exercise);
  const before = prev.length ? prev[Math.min(n - 1, prev.length - 1)] : null;
  const range = Array.isArray(spec.reps) ? spec.reps : [1, 999];
  const v = verdict({ weight: weight ?? 0, reps }, before ? { weight: before.weight ?? 0, reps: before.reps } : null, range,
    { nutritionPhase: block?.nutrition_phase, progression: spec.progression?.type });
  const e = {
    id: uid(), seq: 0, exercise_id: spec.exercise, slot_key: item.slot_key || null, set_number: n, kind: "work",
    weight: spec.load === "bodyweight" ? null : weight, weight_unit: spec.load === "bodyweight" ? null : unit(), reps,
    target_weight: t.weight ?? null, target_reps_low: t.low ?? null, target_reps_high: t.high ?? null,
    verdict: v.code, logged_at: new Date().toISOString(),
  };
  a.efforts.push(e);
  a.efforts.forEach((x, i) => { x.seq = i; });
  save();
  return { effort: e, verdict: v };
}
export function addExtra(a, parent, kind, weight, reps) {
  const e = { id: uid(), seq: a.efforts.length, exercise_id: parent.exercise_id, slot_key: parent.slot_key, set_number: parent.set_number, kind,
    parent_id: parent.id, weight, weight_unit: parent.weight_unit, reps, logged_at: new Date().toISOString() };
  a.efforts.push(e); save();
  return e;
}
export function unlog(a, effortId) {
  a.efforts = a.efforts.filter((e) => e.id !== effortId && e.parent_id !== effortId);
  a.efforts.forEach((x, i) => { x.seq = i; });
  save();
}

export function finishSession(a, rating, note) {
  a.ended_at = new Date().toISOString();
  a.duration_s = Math.max(0, Math.round((new Date(a.ended_at) - new Date(a.started_at)) / 1000));
  if (rating) a.checkin = { rating, note: null };
  a.note = note || null;
  delete a.open; delete a.draft; delete a.items; delete a.swaps; delete a.warm;
  touch(a);
  const b = a.block_id ? S.blocks.find((x) => x.id === a.block_id) : null;
  if (b && b.status === "active") {
    const p = pos(b);
    if (p.entry.session === a.session_key) b.position += 1;
    b.last_done = ymd();
    if (pos(b).done) { b.status = "done"; b.finished_on = ymd(); }
    touch(b);
  }
}
export function discardSession(a) { S.activities.splice(S.activities.indexOf(a), 1); save(); }

// ---------------------------------------------------------------- swapping
export function swapNow(a, item, toId, scope, reason) {
  const from = item.exercise_id;
  item.exercise_id = toId;
  const b = a.block_id ? S.blocks.find((x) => x.id === a.block_id) : null;
  if (b && item.slot_key) {
    if (scope === "block") {
      for (const s of b.plan.sessions) for (const sl of s.slots) if (sl.key === item.slot_key) { sl.exercise = toId; delete sl.display_name; delete sl.alternates; }
      touch(b);
    }
    S.changes.push({ id: uid(), block_id: b.id, slot_key: item.slot_key, from_exercise: from, to_exercise: toId, scope, reason, changed_at: new Date().toISOString(), _d: 1 });
  }
  // Pain means this lift should not come back by itself, in this block or the next.
  if (reason === "pain" && !S.me.no_go.some((n) => n.exercise_id === from)) {
    S.me.no_go.push({ exercise_id: from, reason: "pain", since: ymd() });
    S.me._d = 1;
  }
  save();
}
export function isNoGo(id) { return S.me.no_go.some((n) => n.exercise_id === id); }

/** Stand-ins for a lift: same main muscle, doable with the user's equipment, nothing on the no-go list. */
export function alternatives(exerciseId, pool, filter) {
  const base = ex(exerciseId);
  const muscle = base.muscles?.[0];
  const have = gear();
  const fits = (e) => e.equipment === "none" || e.equipment === "other" || !have || have.includes(e.equipment);
  return pool.filter((e) => e.id !== exerciseId && e.domain === "strength" && e.muscles?.[0] === muscle && !isNoGo(e.id) && (filter !== "gym" || fits(e)) && (filter !== "bodyweight" || e.load_type === "bodyweight"))
    .map((e) => ({ e, score: (e.mechanic === base.mechanic ? 2 : 0) + (e.equipment === base.equipment ? 1 : 0) + (fits(e) ? 2 : 0) + (e.tags?.includes("low_back_friendly") ? 0.5 : 0) }))
    .sort((x, y) => y.score - x.score || x.e.name.localeCompare(y.e.name)).map((x) => x.e);
}

// ---------------------------------------------------------------- coaching signals
/** Lifts in the active block whose best estimated 1RM has not moved in three sessions. */
export function stalls() {
  const b = activeBlock();
  if (!b) return [];
  const ids = [...new Set(b.plan.sessions.flatMap((s) => s.slots.filter((sl) => sl.role !== "finisher").map((sl) => sl.exercise)))];
  return ids.filter((id) => ex(id).load_type !== "bodyweight" && stalled(historyFor(id).map((h) => h.best))).map((id) => ex(id));
}
export function deload() {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const ratings = finished().filter((a) => a.started_at >= weekAgo && a.checkin).map((a) => a.checkin.rating);
  const day = (n) => ymd(new Date(Date.now() - n * 86400000));
  const sleep = (from, to) => { const xs = S.health.filter((h) => h.sleep_minutes && h.day <= day(from) && h.day > day(to)).map((h) => h.sleep_minutes); return xs.length >= 3 ? xs.reduce((a, c) => a + c, 0) / xs.length : null; };
  return deloadCheck({ stalledCount: stalls().length, ratings, sleepRecent: sleep(0, 7), sleepBaseline: sleep(7, 35) });
}

// ---------------------------------------------------------------- walking
export function stepsByDay() {
  const m = new Map();
  for (const h of S.health) if (h.steps) m.set(h.day, Math.max(m.get(h.day) || 0, h.steps));
  for (const a of finished("walking")) for (const e of a.efforts || []) if (e.steps) { const d = ymd(new Date(a.started_at)); m.set(d, Math.max(m.get(d) || 0, e.steps)); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
export function stepGoal() {
  const days = stepsByDay().filter(([d]) => d < ymd()).slice(-14).map(([, n]) => n);
  return stepTarget(days);
}

export { e1rm, phaseForWeek };
