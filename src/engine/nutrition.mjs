// One calorie number and one protein number. A target, not a food log.

const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 };

// Change against maintenance, and what the scale should then do (% of bodyweight per week).
export const PHASES = {
  cut:      { delta: -0.20, weekly: [-1.0, -0.5],   proteinPerLb: 1.0 },
  recomp:   { delta: -0.05, weekly: [-0.25, 0.25],  proteinPerLb: 1.0 },
  maintain: { delta:  0.00, weekly: [-0.25, 0.25],  proteinPerLb: 0.8 },
  bulk:     { delta:  0.10, weekly: [0.25, 0.5],    proteinPerLb: 0.8 },
};

const round50 = (n) => Math.round(n / 50) * 50;

/** Resting energy, Mifflin-St Jeor (1990). kg, cm, years. */
export function restingKcal({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** For people who do not know their maintenance: resting energy times an activity factor. */
export function estimateMaintenance(person) {
  return round50(restingKcal(person) * ACTIVITY[person.activity]);
}

/**
 * The daily target for a phase.
 *   maintenanceKcal  entered by the user, or from estimateMaintenance
 *   weightLb         for the protein number
 *   restingKcal      optional floor: the target never goes below it
 */
export function calorieTarget({ phase, maintenanceKcal, weightLb, restingKcal: floor = null }) {
  const p = PHASES[phase];
  if (!p) throw new Error(`unknown phase ${phase}`);
  let target = round50(maintenanceKcal * (1 + p.delta));
  let floorApplied = false;
  if (floor != null && target < floor) {
    target = round50(Math.ceil(floor / 50) * 50);
    floorApplied = true;
  }
  return {
    targetKcal: target,
    deltaKcal: target - maintenanceKcal,
    proteinG: Math.round((weightLb * p.proteinPerLb) / 5) * 5,
    expectedWeeklyPct: p.weekly,
    floorApplied,
  };
}

/**
 * After two or more weeks of weigh-ins: if the scale is not moving at the
 * expected rate, the maintenance guess was off. Nudge it and re-derive.
 *   weeklyPct  measured change, % of bodyweight per week (negative = losing)
 */
export function adjustMaintenance({ phase, maintenanceKcal, weeklyPct }) {
  const [low, high] = PHASES[phase].weekly;
  if (weeklyPct > high) return { maintenanceKcal: maintenanceKcal - 150, reason: "scale is running above the expected range" };
  if (weeklyPct < low) return { maintenanceKcal: maintenanceKcal + 150, reason: "scale is running below the expected range" };
  return { maintenanceKcal, reason: null };
}
