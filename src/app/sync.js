// Offline first. Every change is saved on the phone at once and marked dirty.
// When there is a connection and a signed-in account, dirty rows go up and
// anything newer comes down. A dropped connection never loses a set.
import { S, save, saveNow, onSave } from "./store.js";
import { CLOUD } from "./cloud.js";

const ACTIVITY_COLS = ["id", "domain", "title", "block_id", "week", "session_key", "started_at", "ended_at", "duration_s", "link_url", "note", "source", "external_id"];
const EFFORT_COLS = ["id", "seq", "exercise_id", "slot_key", "set_number", "kind", "parent_id", "weight", "weight_unit", "reps", "rir", "per_side",
  "duration_s", "distance_m", "steps", "avg_hr", "hr_zone", "target_weight", "target_reps_low", "target_reps_high", "verdict", "extra", "note", "logged_at"];
const BLOCK_COLS = ["id", "program_id", "program_slug", "group_block_id", "title", "focus", "nutrition_phase", "plan", "status", "position", "started_on", "finished_on"];
const PRIVATE_COLS = ["units", "days_per_week", "session_minutes", "equipment", "no_go", "increments", "sex_for_estimate", "birth_year", "height_cm", "activity_level", "settings"];
// Efforts must all carry the same keys in one request, so missing ones go up as null.
const pick = (row, cols, extra) => Object.assign(Object.fromEntries(cols.map((c) => [c, row[c] === undefined ? null : row[c]])), extra);
const clean = (rows) => rows.forEach((r) => { delete r._d; r.pushed = 1; });

export const SYNC = { busy: false, queued: false, listeners: [] };
function emit() { SYNC.listeners.forEach((fn) => fn()); }

/** Rows deleted on this phone come off the server before anything is pulled, so they cannot come back. */
async function pushDeletes() {
  for (const d of S.dels.slice()) {
    await CLOUD.del(d.t, "id=eq." + d.id);
    S.dels.splice(S.dels.indexOf(d), 1);
  }
}

async function push() {
  const uid = CLOUD.uid();
  const me = S.me;
  if (me._d && me.display_name) {
    await CLOUD.upsert("profiles", [{ id: uid, display_name: me.display_name, avatar: me.avatar || null }]);
    await CLOUD.upsert("profile_private", [pick(me, PRIVATE_COLS, { user_id: uid })], "user_id");
    delete me._d;
  }
  let dirty = S.exercises.filter((x) => x._d);
  if (dirty.length) {
    await CLOUD.upsert("exercises", dirty.map((x) => ({
      id: x.id, name: x.name, domain: x.domain || "strength", source: "user", owner_id: uid, equipment: x.equipment || null,
      primary_muscles: x.primary_muscles || [], region: x.region || null, load_type: x.load_type || "external", measure: x.measure || "reps",
    })));
    clean(dirty);
  }
  dirty = S.programs.filter((x) => x._d);
  if (dirty.length) {
    await CLOUD.upsert("programs", dirty.map((p) => ({ id: p.id, slug: p.slug, version: p.version || 1, owner_id: uid, title: p.title, focus: p.focus, weeks: p.weeks, days_per_week: p.days_per_week, template: p.template })));
    clean(dirty);
  }
  dirty = S.blocks.filter((x) => x._d);
  if (dirty.length) { await CLOUD.upsert("blocks", dirty.map((b) => pick(b, BLOCK_COLS, { user_id: uid }))); clean(dirty); }
  dirty = S.changes.filter((x) => x._d);
  if (dirty.length) {
    await CLOUD.upsert("block_changes", dirty.map((c) => ({ id: c.id, block_id: c.block_id, user_id: uid, slot_key: c.slot_key, from_exercise: c.from_exercise, to_exercise: c.to_exercise, scope: c.scope, reason: c.reason, note: c.note || null, changed_at: c.changed_at })));
    clean(dirty);
  }
  // Sessions go up once they are finished. One still open stays on the phone.
  for (const a of S.activities.filter((x) => x._d && !x.open)) {
    await CLOUD.upsert("activities", [pick(a, ACTIVITY_COLS, { user_id: uid, source: a.source || "manual" })]);
    const efforts = (a.efforts || []).map((e) => pick(e, EFFORT_COLS, { activity_id: a.id, user_id: uid, kind: e.kind || "work", per_side: !!e.per_side, extra: e.extra || {} }));
    // Parents before children: a drop set points at the set it extends.
    await CLOUD.upsert("efforts", efforts.filter((e) => !e.parent_id));
    await CLOUD.upsert("efforts", efforts.filter((e) => e.parent_id));
    const keep = efforts.map((e) => e.id);
    await CLOUD.del("efforts", `activity_id=eq.${a.id}` + (keep.length ? `&id=not.in.(${keep.join(",")})` : ""));
    if (a.checkin) await CLOUD.upsert("session_checkins", [{ activity_id: a.id, user_id: uid, rating: a.checkin.rating, note: a.checkin.note || null }], "activity_id");
    a.pushed = 1;
    delete a._d;
  }
  dirty = S.body.filter((x) => x._d);
  if (dirty.length) { await CLOUD.upsert("body_metrics", dirty.map((b) => ({ user_id: uid, measured_on: b.measured_on, kind: b.kind, value: b.value, unit: b.unit })), "user_id,measured_on,kind"); clean(dirty); }
  dirty = S.health.filter((x) => x._d);
  if (dirty.length) {
    await CLOUD.upsert("daily_health", dirty.map((h) => ({ user_id: uid, day: h.day, source: h.source || "manual", steps: h.steps ?? null, sleep_minutes: h.sleep_minutes ?? null, sleep_score: h.sleep_score ?? null, readiness: h.readiness ?? null, resting_hr: h.resting_hr ?? null, hrv_ms: h.hrv_ms ?? null })), "user_id,day,source");
    clean(dirty);
  }
  dirty = S.saved.filter((x) => x._d);
  if (dirty.length) { await CLOUD.upsert("saved_links", dirty.map((l) => ({ id: l.id, user_id: uid, url: l.url, title: l.title, tag: l.tag || null, note: l.note || null, tried_on: l.tried_on || null, created_at: l.created_at }))); clean(dirty); }
  dirty = S.nutrition.filter((x) => x._d);
  if (dirty.length) {
    await CLOUD.upsert("nutrition_targets", dirty.map((n) => ({ id: n.id, user_id: uid, effective_from: n.effective_from, phase: n.phase, maintenance_kcal: n.maintenance_kcal, maintenance_source: n.maintenance_source, target_kcal: n.target_kcal, protein_g: n.protein_g })));
    clean(dirty);
  }
}

/** Server rows replace clean local rows. A local row with unsent changes wins and goes up next. */
function merge(local, remote, key = (r) => r.id) {
  const mine = new Map(local.map((r) => [key(r), r]));
  const seen = new Set();
  for (const r of remote) {
    const k = key(r);
    seen.add(k);
    const l = mine.get(k);
    if (!l) local.push(r);
    else if (!l._d) Object.assign(l, r);
  }
  // Gone from the server and never changed here: it was deleted on another device.
  for (let i = local.length - 1; i >= 0; i--) {
    const l = local[i];
    if (!seen.has(key(l)) && !l._d && l.pushed) local.splice(i, 1);
  }
}

async function pull() {
  const uid = CLOUD.uid();
  const own = "user_id=eq." + uid;
  const [prof, priv, exs, progs, blocks, changes, acts, checks, body, health, nutr, saved] = await Promise.all([
    CLOUD.get("profiles?id=eq." + uid), CLOUD.get("profile_private?" + own),
    CLOUD.get("exercises?owner_id=eq." + uid), CLOUD.get("programs?owner_id=eq." + uid),
    CLOUD.get("blocks?" + own), CLOUD.get("block_changes?" + own),
    CLOUD.get(`activities?${own}&select=*,efforts(*)&order=started_at`),
    CLOUD.get("session_checkins?" + own), CLOUD.get("body_metrics?" + own),
    CLOUD.get("daily_health?" + own), CLOUD.get("nutrition_targets?" + own), CLOUD.get("saved_links?" + own),
  ]);
  if (prof[0] && !S.me._d) {
    S.me.display_name = prof[0].display_name; S.me.avatar = prof[0].avatar || null;
    if (priv[0]) for (const c of PRIVATE_COLS) if (priv[0][c] != null) S.me[c] = priv[0][c];
  }
  const byAct = new Map(checks.map((c) => [c.activity_id, c]));
  for (const a of acts) {
    a.pushed = 1;
    a.efforts = (a.efforts || []).sort((x, y) => x.seq - y.seq).map((e) => { delete e.activity_id; delete e.user_id; return e; });
    const c = byAct.get(a.id);
    if (c) a.checkin = { rating: c.rating, note: c.note };
    delete a.user_id;
  }
  const mark = (rows) => rows.map((r) => { r.pushed = 1; delete r.user_id; return r; });
  merge(S.activities, acts);
  merge(S.blocks, mark(blocks));
  merge(S.changes, mark(changes));
  merge(S.programs, mark(progs));
  merge(S.exercises, mark(exs).map((x) => { delete x.owner_id; return x; }));
  merge(S.body, mark(body), (r) => r.measured_on + r.kind);
  merge(S.health, mark(health), (r) => r.day + (r.source || "manual"));
  merge(S.nutrition, mark(nutr));
  merge(S.saved, mark(saved));
  // Only one block can be the active one. If two devices each started one, keep the newest.
  const active = S.blocks.filter((b) => b.status === "active").sort((a, b) => (b.started_on || "").localeCompare(a.started_on || ""));
  active.slice(1).forEach((b) => { b.status = "paused"; b._d = 1; });
}

export async function syncNow() {
  if (!CLOUD.ready() || !CLOUD.on()) return false;
  // This phone's data belongs to one account. It is never synced into a different one.
  if (!S.owner) { S.owner = CLOUD.uid(); S.owner_email = CLOUD.email(); save(); }
  else if (S.owner !== CLOUD.uid()) return false;
  if (SYNC.busy) { SYNC.queued = true; return false; }
  SYNC.busy = true; emit();
  try {
    await pushDeletes();
    await pull();
    await push();
    S.sync.at = Date.now(); S.sync.error = null;
  } catch (e) {
    S.sync.error = e.message || "Could not sync";
  }
  SYNC.busy = false;
  saveNow(); emit();
  if (SYNC.queued) { SYNC.queued = false; return syncNow(); }
  return !S.sync.error;
}

function hasDirty() {
  return S.me._d || S.dels.length || [S.exercises, S.programs, S.blocks, S.changes, S.body, S.health, S.nutrition, S.saved].some((t) => t.some((r) => r._d)) || S.activities.some((a) => a._d && !a.open);
}

let timer = null;
export function startSync() {
  onSave(() => {
    if (!CLOUD.on() || !hasDirty()) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 1500);
  });
  addEventListener("online", () => syncNow());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
  if (CLOUD.on()) setTimeout(syncNow, 600);
}
