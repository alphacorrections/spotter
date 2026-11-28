// How to eat a calorie and protein target: the rest of the macros, protein per meal, and a sample day.
// Guidance, not a food log. Sources for the ranges: Helms, Aragon and Fitschen (2014), J Int Soc Sports Nutr 11:20
// (fat 15 to 30 percent of calories, carbs take what is left, 3 to 6 meals, 20 g or more protein a meal,
// 0.4 to 0.5 g per kg before and after training).

const r5 = (n) => Math.round(n / 5) * 5;

/** Fat and carbs around a fixed calorie and protein target. Fat is 25 percent of calories, never under 0.25 g per lb. */
export function macros({ kcal, proteinG, weightLb }) {
  let fat = Math.max((kcal * 0.25) / 9, (weightLb || 0) * 0.25);
  let carbs = (kcal - proteinG * 4 - fat * 9) / 4;
  if (carbs < 50) { fat = Math.max((kcal * 0.15) / 9, 30); carbs = Math.max(0, (kcal - proteinG * 4 - fat * 9) / 4); }   // a tight cut: fat gives way first
  return { proteinG, fatG: r5(fat), carbsG: r5(carbs), proteinPct: Math.round((proteinG * 4 * 100) / kcal) };
}

/** Protein and calories per meal, and the dose to put either side of training. */
export function perMeal({ kcal, proteinG, weightLb, meals }) {
  const kg = (weightLb || 0) / 2.2046;
  return { protein: r5(proteinG / meals), kcal: Math.round(kcal / meals / 50) * 50, aroundTraining: kg ? [r5(kg * 0.4), r5(kg * 0.5)] : null, thin: proteinG / meals < 20 };
}

export const DIETS = { any: [], vegetarian: ["meat"], vegan: ["meat", "dairy", "egg"], nodairy: ["dairy"] };

/**
 * One day of food that lands near the target. Fixed, familiar portions, picked to fit, not scaled.
 *   meals 3 to 5 (breakfast, lunch, dinner, then snacks); diet a key of DIETS; seed rotates the picks.
 * Returns { items: [{ slot, name, portion, kcal, protein }], kcal, protein, leftKcal, shortProtein }.
 */
export function sampleDay({ kcal, proteinG, phase, meals = 4, diet = "any", seed = 0 }, foods) {
  const out = DIETS[diet] || [], ok = (f) => !f.has.some((t) => out.includes(t));
  const pool = foods.meals.filter(ok), used = new Set(), items = [];
  let k = 0, p = 0;
  const slots = ["Breakfast", "Lunch", "Dinner"].concat(Array.from({ length: Math.max(0, meals - 3) }, () => "Snack"));
  const nMain = 3, snackShare = 0.12 * (slots.length - nMain);
  const budget = (slot) => (slot === "Snack" ? { k: kcal * 0.12, p: proteinG * 0.12 } : { k: (kcal * (1 - snackShare)) / nMain, p: (proteinG * (1 - snackShare)) / nMain });
  const pick = (slot, i) => {
    const kind = slot === "Breakfast" ? "b" : slot === "Snack" ? "s" : "m", b = budget(slot);
    const cands = pool.filter((f) => f.slot === kind && !used.has(f.name)).map((f) => ({ f, score: Math.abs(f.protein - b.p) / b.p + Math.max(0, (f.kcal - b.k) / b.k) * 1.5 + (phase === "bulk" ? Math.max(0, (b.k - f.kcal) / b.k) * 0.6 : 0) + (f.plant && !out.includes("meat") ? 0.5 : 0) }))
      .sort((x, y) => x.score - y.score || x.f.name.localeCompare(y.f.name));
    if (!cands.length) return;
    const f = cands[(seed + i) % Math.min(3, cands.length)].f;
    used.add(f.name); items.push({ slot, name: f.name, portion: f.portion, kcal: f.kcal, protein: f.protein }); k += f.kcal; p += f.protein;
  };
  slots.forEach(pick);
  // Over on calories (small targets): swap the heaviest meals for leaner ones, then drop snacks.
  const kindOf = (slot) => (slot === "Breakfast" ? "b" : slot === "Snack" || slot === "Add" ? "s" : "m");
  for (let n = 0; n < 8 && k > kcal + 50; n++) {
    let best = null;
    for (const it of items) for (const f of pool) {
      if (f.slot !== kindOf(it.slot) || used.has(f.name) || f.kcal >= it.kcal) continue;
      const gain = (it.kcal - f.kcal) - Math.max(0, it.protein - f.protein) * 6;   // calories saved, less protein given up
      if (!best || gain > best.gain) best = { it, f, gain };
    }
    if (best && best.gain > 0) { const { it, f } = best; used.delete(it.name); used.add(f.name); k += f.kcal - it.kcal; p += f.protein - it.protein; Object.assign(it, { name: f.name, portion: f.portion, kcal: f.kcal, protein: f.protein }); continue; }
    const i = items.map((x) => x.slot).lastIndexOf("Snack"); if (i < 0) break;
    k -= items[i].kcal; p -= items[i].protein; used.delete(items[i].name); items.splice(i, 1);
  }
  // Top up protein with the leanest snacks that still fit the calories.
  const snacks = () => pool.filter((f) => f.slot === "s" && !used.has(f.name) && !(f.plant && !out.includes("meat") && !out.includes("dairy")));
  for (let n = 0; n < 3 && p < proteinG - 10; n++) {
    const c = snacks().filter((f) => k + f.kcal <= kcal + 50).sort((x, y) => y.protein / y.kcal - x.protein / x.kcal || x.name.localeCompare(y.name))[0];
    if (!c) break;
    used.add(c.name); items.push({ slot: "Add", name: c.name, portion: c.portion, kcal: c.kcal, protein: c.protein }); k += c.kcal; p += c.protein;
  }
  // On a surplus with a big gap, add the calorie-dense snacks first.
  for (let n = 0; n < 2 && phase === "bulk" && kcal - k > 450; n++) {
    const c = snacks().filter((f) => k + f.kcal <= kcal + 25).sort((x, y) => y.kcal - x.kcal || x.name.localeCompare(y.name))[0];
    if (!c) break;
    used.add(c.name); items.push({ slot: "Add", name: c.name, portion: c.portion, kcal: c.kcal, protein: c.protein }); k += c.kcal; p += c.protein;
  }
  // Protein is covered: spend most of what is left on easy carbs and fats, so the day adds up.
  for (let n = 0; n < (phase === "bulk" ? 4 : 3) && kcal - k > 180; n++) {
    const c = pool.filter((f) => f.slot === "x" && !used.has(f.name) && k + f.kcal <= kcal + 25).sort((x, y) => y.kcal - x.kcal || x.name.localeCompare(y.name));
    if (!c.length) break;
    const f = c[(seed + n) % Math.min(2, c.length)];
    used.add(f.name); items.push({ slot: "Add", name: f.name, portion: f.portion, kcal: f.kcal, protein: f.protein }); k += f.kcal; p += f.protein;
  }
  return { items, kcal: k, protein: p, leftKcal: kcal - k, shortProtein: Math.max(0, proteinG - p) };
}

/** Plain tips for the phase. */
export const TIPS = {
  cut: ["Build each meal around a lean protein first, then add vegetables, then starch with what is left.", "Eat foods that fill you up for few calories: potatoes, fruit, vegetables, soups, Greek yogurt.", "Drink water, coffee or diet drinks. Liquid calories are the easiest ones to drop.", "Keep protein even across the day. It is the thing that protects muscle while calories are low.", "Put most of your carbs in the meals before and after training, so the lifting stays strong."],
  bulk: ["Add calories you can drink: milk, a shake with a banana and peanut butter.", "Add a fourth or fifth meal before making meals bigger.", "Use calorie-dense sides: rice, pasta, olive oil, nuts, granola, dried fruit.", "A small surplus is enough. If the scale climbs faster than half a percent a week, you are adding fat, not muscle.", "Eat on a schedule. Waiting for hunger is how a bulk stalls."],
  maintain: ["Hit protein first. Let carbs and fat land wherever your day takes them.", "Weigh in a few times a week. If the average drifts for two weeks, shift a snack in or out.", "Keep two or three default meals you can repeat without thinking.", "Eat more on training days and less on rest days if that suits you. The weekly total is what counts."],
  recomp: ["Protein is the lever. Hit it every day, including rest days.", "Keep calories close to the target. A recomp is slow, so consistency beats precision.", "Put carbs around training to keep the lifting strong.", "Judge it by your lifts and the mirror, not the scale. The scale should stay about flat."],
};
export const BASICS = ["Daily totals matter most. Timing is a small extra.", "Three to six meals all work. Pick the number you can keep doing.", "Aim for 20 g of protein or more at every meal. 30 to 40 g is a good target.", "A protein shake is food. Use one when a meal comes up short.", "Weigh portions for a week or two. After that you can eyeball them."];
