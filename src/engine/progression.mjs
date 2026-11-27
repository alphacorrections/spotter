// The strength coach, as pure functions. No database, no screen: give it
// what was lifted and what the plan asks for, it says what comes next.
// These are the spreadsheet's rules, moved out of cell formulas.

/** Estimated one-rep max (Epley), same formula as the sheet's EST 1RM column. */
export function e1rm(weight, reps) {
  return Math.round(weight * (1 + reps / 30));
}

/** Which phase a week belongs to. */
export function phaseForWeek(template, week) {
  const phase = template.phases.find((p) => week >= p.weeks[0] && week <= p.weeks[1]);
  if (!phase) throw new Error(`week ${week} is outside this ${template.weeks}-week block`);
  return phase;
}

/**
 * Everything one slot asks for in a given week, with the block's and the
 * role's defaults folded in. `reps` is [low, high], "amrap", or "skip".
 */
export function slotSpec(template, slotKey, week) {
  const phase = phaseForWeek(template, week);
  for (const session of template.sessions) {
    const slot = session.slots.find((s) => s.key === slotKey);
    if (!slot) continue;
    const role = template.roles?.[slot.role] ?? {};
    const reps = slot.reps[phase.key];
    const active = reps !== "skip" && (!role.phases || role.phases.includes(phase.key));
    const intensifier = slot.intensifier?.phases.includes(phase.key) ? slot.intensifier : null;
    return {
      slotKey,
      session: session.key,
      exercise: slot.exercise,
      name: slot.display_name ?? null,
      role: slot.role,
      phase: phase.key,
      active,
      sets: slot.sets ?? role.sets ?? 3,
      reps,
      measure: slot.measure ?? "reps",
      load: slot.load ?? "external",
      increment: slot.increment ?? null,
      effort: slot.effort ?? role.effort ?? null,
      restS: slot.rest_s ?? role.rest_s ?? null,
      superset: slot.superset ?? null,
      intensifier,
      progression: slot.progression ?? template.progression,
    };
  }
  throw new Error(`no slot ${slotKey} in this template`);
}

/**
 * Next Target for one set (double progression).
 *   last      { weight, reps }   the same set, last time it was done
 *   range     [low, high]        the rep range of the session being planned
 *   increment number             load to add when the top of the range is hit
 *   overshoot { reps_over, increments }  optional: jump further when the
 *             load was clearly too light
 * Returns { weight, reps, move, flag }.
 */
export function nextTarget(last, { range, increment, overshoot = null }) {
  const [low, high] = range;
  const done = Math.floor(last.reps); // a half rep is not a rep
  if (done >= high) {
    const far = overshoot && done >= high + overshoot.reps_over;
    const steps = far ? overshoot.increments : 1;
    return { weight: last.weight + increment * steps, reps: low, move: "add_weight", flag: far ? "overshoot" : null };
  }
  if (done < low) {
    // Below the range: hold the load, aim for the bottom of the range, and say so.
    return { weight: last.weight, reps: low, move: "repeat", flag: "below_range" };
  }
  return { weight: last.weight, reps: Math.min(done + 1, high), move: "add_rep", flag: null };
}

/**
 * The verdict on a set just logged, against the same set last time.
 * Weight and reps are judged together: a heavier set with fewer reps is a
 * win as long as the reps are still inside the range.
 *   opts.nutritionPhase  on a cut, holding your numbers counts as a win.
 *   opts.progression     "hold" (maintain blocks): same.
 */
export function verdict(now, prev, range, opts = {}) {
  if (!prev) return { code: "first", text: "First time", tone: "hold" };
  const [low] = range;
  // Holding is the whole point on a cut and in a maintain block.
  const heldTone = opts.nutritionPhase === "cut" || opts.progression === "hold" ? "ok" : "hold";
  if (now.weight > prev.weight) {
    return now.reps < low
      ? { code: "big_jump", text: "Big jump", tone: "hold" }
      : { code: "beat", text: "Beat it", tone: "ok" };
  }
  if (now.weight === prev.weight) {
    if (now.reps > prev.reps) return { code: "beat", text: "Beat it", tone: "ok" };
    if (now.reps === prev.reps) return { code: "held", text: "Held", tone: heldTone };
  }
  return { code: "down", text: "Down", tone: "bad" };
}

/** Round a load to something you can actually put on a bar or pick off a rack. */
export function roundLoad(weight, step = 5) {
  return Math.round(weight / step) * step;
}

/**
 * Targets for every set of one slot in the session being planned.
 *   spec      from slotSpec()
 *   lastSets  the work sets of this exercise from the last session it was done,
 *             in order: [{ weight, reps }, ...]. Empty when there is no history.
 *   opts.loadFactor  scale every load (0.9 after a two-week gap)
 *   opts.step        rounding step for loads (5 lb, 2.5 kg)
 * Returns one entry per set: { weight, reps, low, high, move, flag }.
 *   move: calibrate | add_weight | add_rep | repeat | top_set | backoff | hold | amrap
 */
export function planSets(spec, lastSets = [], opts = {}) {
  const step = opts.step ?? 5;
  const factor = opts.loadFactor ?? 1;
  const n = spec.sets;
  if (spec.reps === "amrap") {
    return Array.from({ length: n }, () => ({ weight: null, reps: null, low: null, high: null, move: "amrap", flag: null }));
  }
  const [low, high] = spec.reps;
  const base = { low, high };
  const bodyweight = spec.load === "bodyweight";
  const scale = (w) => (w == null ? null : factor === 1 ? w : roundLoad(w * factor, step));
  if (!lastSets.length) {
    return Array.from({ length: n }, () => ({ ...base, weight: null, reps: low, move: "calibrate", flag: null }));
  }
  const lastFor = (i) => lastSets[Math.min(i, lastSets.length - 1)];
  const type = spec.progression?.type ?? "double_progression";

  if (bodyweight) {
    return Array.from({ length: n }, (_, i) => {
      const done = Math.floor(lastFor(i).reps ?? 0);
      if (type === "hold") return { ...base, weight: null, reps: Math.max(low, Math.min(done, high)), move: "hold", flag: null };
      if (done >= high) return { ...base, weight: null, reps: high, move: "repeat", flag: "top_of_range" };
      return { ...base, weight: null, reps: Math.max(low, done + 1), move: "add_rep", flag: done < low ? "below_range" : null };
    });
  }

  if (type === "hold") {
    return Array.from({ length: n }, (_, i) => {
      const l = lastFor(i);
      return { ...base, weight: scale(l.weight), reps: Math.max(low, Math.min(Math.floor(l.reps), high)), move: "hold", flag: null };
    });
  }

  const rule = { range: spec.reps, increment: spec.increment ?? step, overshoot: spec.progression?.overshoot ?? null };

  if (type === "top_set_backoff") {
    const top = nextTarget(lastSets[0], rule);
    const drop = (spec.progression.backoff?.percent_drop ?? 10) / 100;
    const topW = scale(top.weight);
    return Array.from({ length: n }, (_, i) =>
      i === 0
        ? { ...base, weight: topW, reps: top.reps, move: top.move === "add_weight" ? "add_weight" : "top_set", flag: top.flag }
        : { ...base, weight: roundLoad(topW * (1 - drop), step), reps: high, move: "backoff", flag: null });
  }

  return Array.from({ length: n }, (_, i) => {
    const t = nextTarget(lastFor(i), rule);
    return { ...base, weight: scale(t.weight), reps: t.reps, move: t.move, flag: t.flag };
  });
}

/** Where a block stands. Missed days shift it forward, so this is a count, not a date. */
export function blockPosition(template, position) {
  const len = template.rotation.length;
  const week = Math.floor(position / len) + 1;
  const index = position % len;
  return { week, index, entry: template.rotation[index], done: week > template.weeks };
}
