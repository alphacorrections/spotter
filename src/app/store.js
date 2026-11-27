// Everything the app knows lives in one object, S, saved to this browser on
// every change. Rows use the database's column names, so syncing is a copy,
// not a translation. A row with _d set has changes the server has not seen.
import LIBRARY from "../data/exercises.json";
import TEMPLATES from "../data/templates.json";
import { e1rm } from "../engine/progression.mjs";

const KEY = "spotter.v1";

function blank() {
  return {
    v: 1,
    me: {
      display_name: "", units: "lb", days_per_week: null, session_minutes: 60,
      equipment: [], no_go: [], increments: { upper: 5, lower: 10 },
      sex_for_estimate: null, birth_year: null, height_cm: null, activity_level: null,
      settings: { onboarded: false, focus: null },
    },
    exercises: [],   // lifts you made up
    programs: [],    // plans you saved or shared
    blocks: [],      // your runs of a plan
    changes: [],     // why a slot changed
    activities: [],  // every session, any domain, with its efforts inside
    body: [], health: [], nutrition: [],
    saved: [],       // workouts seen elsewhere, saved to try
    dels: [],        // rows deleted here that the server still has
    sync: { at: 0, error: null },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(blank(), JSON.parse(raw));
  } catch (e) { /* storage blocked or corrupt: start clean, in memory */ }
  return blank();
}

export const S = load();
let saveTimer = null;
const listeners = [];
export function onSave(fn) { listeners.push(fn); }
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* full or blocked: keep running from memory */ }
    listeners.forEach((fn) => fn());
  }, 60);
}
export function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* see above */ }
}
export function replaceState(next) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, blank(), next);
  saveNow();
}
export function touch(row) { row._d = 1; save(); return row; }
export function touchMe() { S.me._d = 1; save(); }

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

// ---------------------------------------------------------------- dates
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function daysBetween(a, b) {
  const A = new Date(a.length === 10 ? a + "T12:00:00" : a), B = new Date(b.length === 10 ? b + "T12:00:00" : b);
  return Math.round((new Date(ymd(B) + "T12:00:00") - new Date(ymd(A) + "T12:00:00")) / 86400000);
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function nice(iso) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}
export function ago(iso) {
  const n = daysBetween(iso, ymd());
  return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 7 ? `${n} days ago` : nice(iso);
}

// ---------------------------------------------------------------- library
const LIB = new Map(LIBRARY.map((x) => [x.id, x]));
export const library = LIBRARY;
export const templates = TEMPLATES;
export function ex(id) {
  return LIB.get(id) || S.exercises.find((x) => x.id === id) ||
    { id, name: String(id || "Exercise").replace(/^u_/, "").replace(/_/g, " "), muscles: [], secondary: [], equipment: "other", region: "upper", load_type: "external", measure: "reps", domain: "strength" };
}
export function allExercises() { return S.exercises.map((x) => ({ ...x, muscles: x.primary_muscles || x.muscles || [] })).concat(LIBRARY); }
export function template(slug) { return TEMPLATES.find((t) => t.slug === slug) || S.programs.find((p) => p.slug === slug)?.template || null; }
export function imageUrl(id, n = 0) {
  const e = LIB.get(id);
  return e && e.img ? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${encodeURIComponent(id)}/${n}.jpg` : null;
}
export function howToUrl(id) {
  return LIB.get(id)?.img ? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${encodeURIComponent(id)}.json` : null;
}

/** The equipment to plan around: null means "everything", an empty list means "none". */
export function gear() { return S.me.settings.gear === "none" ? [] : S.me.equipment.length ? S.me.equipment : null; }

// ---------------------------------------------------------------- units
export const isKg = () => S.me.units === "kg";
export const unit = () => S.me.units;
export const loadStep = () => (isKg() ? 2.5 : 5);
/** Template increments are written in pounds. In kilos, halve them: 5 lb -> 2.5 kg. */
export const incFor = (inc) => (inc == null ? null : isKg() ? inc / 2 : inc);
export function fmtW(w) { return w == null ? "BW" : String(Math.round(w * 100) / 100); }
export function fmtN(n) { return n == null ? "" : String(Math.round(n * 10) / 10); }

// ---------------------------------------------------------------- blocks
export function activeBlock() { return S.blocks.find((b) => b.status === "active") || null; }
export function openSession() { return S.activities.find((a) => a.open) || null; }
export function finished(domain) {
  return S.activities.filter((a) => !a.open && (!domain || a.domain === domain)).sort((a, b) => a.started_at.localeCompare(b.started_at));
}

// ---------------------------------------------------------------- history
/** Every finished session that included this lift, oldest first, with its work sets and best e1RM. */
export function historyFor(exerciseId) {
  const out = [];
  for (const a of finished("strength")) {
    const sets = (a.efforts || []).filter((e) => e.exercise_id === exerciseId && e.kind === "work" && e.reps != null)
      .sort((x, y) => x.seq - y.seq).map((e) => ({ weight: e.weight, reps: e.reps }));
    if (!sets.length) continue;
    const best = Math.max(...sets.map((s) => (s.weight ? e1rm(s.weight, s.reps) : s.reps)));
    out.push({ id: a.id, at: a.started_at, title: a.title, sets, best });
  }
  return out;
}
export function lastSets(exerciseId) {
  const h = historyFor(exerciseId);
  return h.length ? h[h.length - 1].sets : [];
}
export function lastStrengthDay() {
  const f = finished("strength");
  return f.length ? f[f.length - 1].started_at : null;
}

// ---------------------------------------------------------------- deleting
export function removeActivity(id) {
  const i = S.activities.findIndex((a) => a.id === id);
  if (i < 0) return;
  const [a] = S.activities.splice(i, 1);
  if (a.pushed) S.dels.push({ t: "activities", id });
  save();
}

export function exportData() { return JSON.stringify(S, null, 1); }
