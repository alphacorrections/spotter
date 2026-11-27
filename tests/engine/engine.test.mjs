import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { e1rm, nextTarget, slotSpec, verdict, phaseForWeek, planSets, blockPosition, roundLoad } from "../../src/engine/progression.mjs";
import { stalled, deloadCheck, gapRule, stepTarget, hrZone, maxHr } from "../../src/engine/coach.mjs";
import { restingKcal, estimateMaintenance, calorieTarget, adjustMaintenance } from "../../src/engine/nutrition.mjs";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const block2 = load("../../templates/block-2-hypertrophy-strength-lean.json");
const strength4 = load("../../templates/strength-4.json");
const maintain2 = load("../../templates/maintain-2.json");
const bodyweight = load("../../templates/bodyweight-basics-3.json");
const sheet = load("./block2-sheet.fixture.json");

test("replay: the engine reproduces the sheet's NEXT TARGET column from the template alone", () => {
  let same = 0;
  const differs = [];
  const skipped = [];
  for (const [slot, set, lastWeek, weight, reps, sheetSays] of sheet.rows) {
    if (reps == null) { skipped.push(`${slot} set ${set}: sheet says "${sheetSays}" from a weight with no reps`); continue; }
    const spec = slotSpec(block2, slot, lastWeek + 1);       // the session being planned
    const t = nextTarget({ weight, reps }, { range: spec.reps, increment: spec.increment });
    const mine = `${t.weight} × ${t.reps}`;
    if (mine === sheetSays) same++;
    else differs.push(`${slot} set ${set}: ${weight} × ${reps} -> engine "${mine}", sheet "${sheetSays}"`);
  }
  console.log(`  ${sheet.rows.length} sets in the sheet · ${same} identical · ${differs.length} differ · ${skipped.length} skipped`);
  for (const d of differs) console.log("  differs:", d);
  for (const s of skipped) console.log("  skipped:", s);
  // The only allowed difference: the engine does not hand out half-rep targets.
  assert.deepEqual(differs, ['upper_1.incline_press set 2: 140 × 6.5 -> engine "140 × 7", sheet "140 × 7.5"']);
  assert.equal(skipped.length, 4);
  assert.equal(same, sheet.rows.length - 5);
});

test("phases and slot defaults resolve from the template", () => {
  assert.equal(phaseForWeek(block2, 4).key, "base");
  assert.equal(phaseForWeek(block2, 5).key, "heavy");
  assert.throws(() => phaseForWeek(block2, 9));
  const w2 = slotSpec(block2, "upper_2.bench", 2);
  assert.deepEqual([w2.sets, w2.reps, w2.increment, w2.intensifier], [4, [6, 8], 5, null]);
  const w6 = slotSpec(block2, "upper_1.lateral", 6);
  assert.deepEqual([w6.reps, w6.intensifier.type], [[10, 12], "double_drop"]);
  assert.equal(slotSpec(block2, "upper_1.lateral", 2).intensifier, null, "no drop sets in weeks 1-4");
  assert.equal(slotSpec(block2, "upper_1.finisher", 3).active, true);
  assert.equal(slotSpec(block2, "upper_1.finisher", 6).active, false, "finishers stop after week 4");
  assert.equal(slotSpec(block2, "upper_1.curl", 1).superset, slotSpec(block2, "upper_1.pushdown", 1).superset);
  assert.equal(slotSpec(block2, "upper_1.curl", 1).effort.last_set, "to_failure");
});

test("next target: below the range holds the load and flags it", () => {
  assert.deepEqual(nextTarget({ weight: 225, reps: 3 }, { range: [6, 8], increment: 5 }),
    { weight: 225, reps: 6, move: "repeat", flag: "below_range" });
});

test("next target: the optional overshoot rule jumps further when the load was far too light", () => {
  const rule = { reps_over: 4, increments: 2 };
  // Chest supported row, week 5: 70 x 18 against a 6-8 range
  assert.deepEqual(nextTarget({ weight: 70, reps: 18 }, { range: [6, 8], increment: 10, overshoot: rule }),
    { weight: 90, reps: 6, move: "add_weight", flag: "overshoot" });
  assert.equal(nextTarget({ weight: 210, reps: 8 }, { range: [4, 6], increment: 5, overshoot: rule }).weight, 215);
});

test("verdict: weight and reps are judged together", () => {
  const range = [8, 10];
  // The hip thrust case: up in weight, fewer reps, still in range. Not red.
  assert.equal(verdict({ weight: 195, reps: 8 }, { weight: 185, reps: 10 }, range).code, "beat");
  assert.equal(verdict({ weight: 195, reps: 6 }, { weight: 185, reps: 10 }, range).code, "big_jump");
  assert.equal(verdict({ weight: 185, reps: 11 }, { weight: 185, reps: 10 }, range).code, "beat");
  assert.equal(verdict({ weight: 185, reps: 10 }, { weight: 185, reps: 10 }, range).code, "held");
  assert.equal(verdict({ weight: 185, reps: 9 }, { weight: 185, reps: 10 }, range).code, "down");
  assert.equal(verdict({ weight: 175, reps: 12 }, { weight: 185, reps: 10 }, range).code, "down");
  assert.equal(verdict({ weight: 185, reps: 10 }, null, range).code, "first");
});

test("verdict: on a cut, holding your numbers is a win", () => {
  const held = [{ weight: 185, reps: 10 }, { weight: 185, reps: 10 }, [8, 10]];
  assert.equal(verdict(...held).tone, "hold");
  assert.equal(verdict(...held, { nutritionPhase: "cut" }).tone, "ok");
});

test("e1rm matches the sheet's EST 1RM column", () => {
  assert.equal(e1rm(185, 10), 247);   // hip thrust set 1
  assert.equal(e1rm(210, 8), 266);    // bench set 1
  assert.equal(e1rm(140, 6.5), 170);  // incline press set 2
});

test("calories: Mifflin-St Jeor, then a phase", () => {
  const person = { sex: "male", weightKg: 90, heightCm: 180, age: 35, activity: "moderate" };
  assert.equal(restingKcal(person), 10 * 90 + 6.25 * 180 - 5 * 35 + 5);            // 1855
  assert.equal(restingKcal({ ...person, sex: "female" }), 1855 - 166);
  assert.equal(estimateMaintenance(person), 2900);                                  // 1855 x 1.55 = 2875
  const base = { maintenanceKcal: 2900, weightLb: 198 };
  assert.deepEqual(calorieTarget({ phase: "cut", ...base }),
    { targetKcal: 2300, deltaKcal: -600, proteinG: 200, expectedWeeklyPct: [-1.0, -0.5], floorApplied: false });
  assert.equal(calorieTarget({ phase: "bulk", ...base }).targetKcal, 3200);
  assert.equal(calorieTarget({ phase: "maintain", ...base }).targetKcal, 2900);
  assert.equal(calorieTarget({ phase: "recomp", ...base }).targetKcal, 2750);
  assert.equal(calorieTarget({ phase: "bulk", ...base }).proteinG, 160);
});

test("calories: the target never drops below resting needs", () => {
  const t = calorieTarget({ phase: "cut", maintenanceKcal: 1700, weightLb: 130, restingKcal: 1420 });
  assert.deepEqual([t.targetKcal, t.floorApplied], [1450, true]);
});

test("calories: the scale corrects a wrong maintenance guess", () => {
  const cut = { phase: "cut", maintenanceKcal: 2900 };
  assert.equal(adjustMaintenance({ ...cut, weeklyPct: -0.7 }).maintenanceKcal, 2900, "on track, no change");
  assert.equal(adjustMaintenance({ ...cut, weeklyPct: -0.1 }).maintenanceKcal, 2750, "barely losing: guess was high");
  assert.equal(adjustMaintenance({ ...cut, weeklyPct: -1.6 }).maintenanceKcal, 3050, "losing too fast: guess was low");
  assert.equal(adjustMaintenance({ phase: "bulk", maintenanceKcal: 2900, weeklyPct: 0.9 }).maintenanceKcal, 2750);
});

test("plan: first time on a lift is a calibration, not a guess", () => {
  const sets = planSets(slotSpec(block2, "upper_2.bench", 1), []);
  assert.equal(sets.length, 4);
  assert.deepEqual([sets[0].move, sets[0].weight, sets[0].reps], ["calibrate", null, 6]);
});

test("plan: double progression, each set against the same set last time", () => {
  const spec = slotSpec(block2, "legs_a.hip_thrust", 4);
  const sets = planSets(spec, [{ weight: 185, reps: 10 }, { weight: 225, reps: 8 }, { weight: 228, reps: 10 }]);
  assert.deepEqual(sets.map((s) => `${s.weight} x ${s.reps}`), ["195 x 8", "225 x 9", "238 x 8", "238 x 8"]);
});

test("plan: built-in overshoot rule takes the chest supported row from 70 to 90", () => {
  const sets = planSets(slotSpec(block2, "upper_2.row", 6), [{ weight: 70, reps: 18 }]);
  assert.deepEqual([sets[0].weight, sets[0].reps, sets[0].flag], [90, 6, "overshoot"]);
});

test("plan: strength blocks get one top set and lighter back-off sets", () => {
  const spec = slotSpec(strength4, "squat_day.squat", 2);
  assert.equal(spec.progression.type, "top_set_backoff");
  const hit = planSets(spec, [{ weight: 300, reps: 6 }, { weight: 270, reps: 6 }]);
  assert.deepEqual(hit.map((s) => [s.weight, s.reps, s.move]), [[310, 4, "add_weight"], [280, 6, "backoff"], [280, 6, "backoff"], [280, 6, "backoff"]]);
  const building = planSets(spec, [{ weight: 300, reps: 4 }]);
  assert.deepEqual([building[0].weight, building[0].reps, building[0].move], [300, 5, "top_set"]);
  // an accessory in the same block still uses double progression
  assert.equal(slotSpec(strength4, "squat_day.rdl", 2).progression.type, "double_progression");
});

test("plan: maintain blocks hold the load, and holding reads as a win", () => {
  const spec = slotSpec(maintain2, "keep_a.squat", 3);
  const sets = planSets(spec, [{ weight: 225, reps: 8 }]);
  assert.deepEqual([sets[0].weight, sets[0].reps, sets[0].move], [225, 8, "hold"]);
  assert.equal(verdict({ weight: 225, reps: 8 }, { weight: 225, reps: 8 }, spec.reps, { progression: "hold" }).tone, "ok");
});

test("plan: bodyweight lifts progress by reps and say when the range is outgrown", () => {
  const spec = slotSpec(bodyweight, "move_b.pushup", 1);
  assert.equal(spec.load, "bodyweight");
  assert.deepEqual(planSets(spec, [{ weight: null, reps: 9 }])[0], { low: 5, high: 15, weight: null, reps: 10, move: "add_rep", flag: null });
  assert.equal(planSets(spec, [{ weight: null, reps: 15 }])[0].flag, "top_of_range");
});

test("plan: after two weeks off, loads come back 10 percent lighter, rounded", () => {
  const spec = slotSpec(block2, "upper_2.bench", 3);
  const sets = planSets(spec, [{ weight: 205, reps: 7 }], { loadFactor: gapRule(14).loadFactor });
  assert.deepEqual([sets[0].weight, sets[0].reps], [185, 8]);
  assert.equal(gapRule(5).loadFactor, 1);
  assert.equal(gapRule(30).calibrate, true);
  assert.equal(roundLoad(183.6, 2.5), 182.5);
});

test("block position: a count through the rotation, not a calendar", () => {
  assert.deepEqual(blockPosition(block2, 0).entry.session, "legs_a");
  assert.equal(blockPosition(block2, 2).entry.rest, true);
  assert.equal(blockPosition(block2, 7).week, 2);
  assert.equal(blockPosition(block2, 55).done, false);
  assert.equal(blockPosition(block2, 56).done, true);
});

test("stall: three sessions with no new best", () => {
  assert.equal(stalled([240, 250, 250, 248, 250]), true);
  assert.equal(stalled([240, 250, 250, 248, 252]), false);
  assert.equal(stalled([250, 250, 250]), false, "needs four sessions before it can call a stall");
});

test("deload: any two of three signals", () => {
  assert.equal(deloadCheck({ stalledCount: 2, ratings: [4, 4] }).due, false);
  assert.equal(deloadCheck({ stalledCount: 2, ratings: [2, 3, 2] }).due, true);
  assert.equal(deloadCheck({ stalledCount: 0, ratings: [2, 2], sleepRecent: 350, sleepBaseline: 450 }).due, true);
  assert.equal(deloadCheck({ stalledCount: 3, ratings: [5], sleepRecent: 440, sleepBaseline: 450 }).due, false);
});

test("walking and cardio targets", () => {
  assert.equal(stepTarget([]), 7000);
  assert.equal(stepTarget([4000, 5000, 4500, 5200]), 5000);
  assert.equal(stepTarget([15000, 16000, 14000]), 12000);
  assert.equal(maxHr(33), 185);
  assert.deepEqual([100, 120, 140, 160, 175].map((hr) => hrZone(hr, 185)), [1, 2, 3, 4, 5]);
});
