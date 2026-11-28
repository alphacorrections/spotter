// How to eat it: turns the calorie and protein target into macros, a per-meal number,
// a sample day of food, and tips for the phase. Guidance only. Nothing here is logged.
import { S, touchMe } from "./store.js";
import { ACT, VIEWS, go, render, backTop, sect, note, icon, esc, chips } from "./ui.js";
import { PHASE } from "./words.js";
import { currentTarget, latestWeight } from "./v-coach.js";
import { macros, perMeal, sampleDay, TIPS, BASICS } from "../engine/eating.mjs";
import FOODS from "../data/foods.json";

const E = { seed: 0 };
const prefs = () => Object.assign({ meals: 4, diet: "any" }, S.me.settings.eat || {});
const setPref = (k, v) => { S.me.settings.eat = Object.assign(prefs(), { [k]: v }); touchMe(); };
const DIET_NAMES = [["any", "I eat everything"], ["nodairy", "No dairy"], ["vegetarian", "Vegetarian"], ["vegan", "Vegan"]];

VIEWS.eat = () => {
  const n = currentTarget();
  let h = backTop("How to eat it", n ? `${n.target_kcal} calories · ${n.protein_g} g protein` : "Set a target first", "back");
  if (!n) return h + `<div class="glass"><div class="empty">Set an eating target on the Coach page first.<br><button class="tp-btn tp-sm" data-act="goCoach">Go to Coach</button></div></div>`;
  const w = latestWeight(), lb = w ? (w.unit === "kg" ? w.value * 2.2046 : w.value) : n.protein_g, p = prefs();
  const m = macros({ kcal: n.target_kcal, proteinG: n.protein_g, weightLb: lb }), pm = perMeal({ kcal: n.target_kcal, proteinG: n.protein_g, weightLb: w ? lb : 0, meals: p.meals });
  const day = sampleDay({ kcal: n.target_kcal, proteinG: n.protein_g, phase: n.phase, meals: p.meals, diet: p.diet, seed: E.seed }, FOODS);

  h += `<div class="glass pad tp-rise"><div class="label">${esc(PHASE[n.phase].name)} · ${esc(PHASE[n.phase].line)}</div>
    <div class="tp-stats mb0 mt"><div class="tp-stat"><span>Protein</span><b>${m.proteinG} g</b></div><div class="tp-stat"><span>Carbs</span><b>${m.carbsG} g</b></div><div class="tp-stat"><span>Fat</span><b>${m.fatG} g</b></div></div>
    <p class="small muted">Protein and calories are the two numbers that matter. Carbs and fat are a sensible split of what is left: fat at about a quarter of your calories, carbs take the rest. Trade them either way if you prefer.</p></div>`;

  h += sect("Meals a day") + chips("eatMeals", [["3", "3"], ["4", "4"], ["5", "5"]], String(p.meals)) +
    `<div class="glass pad mt"><div class="kv"><span>Protein at each meal</span><b>about ${pm.protein} g</b></div><div class="kv"><span>Calories at each meal</span><b>about ${pm.kcal}</b></div>
    ${pm.aroundTraining ? `<div class="kv"><span>Before and after training</span><b>${pm.aroundTraining[0]} to ${pm.aroundTraining[1]} g protein</b></div>` : ""}
    <p class="small muted mt">${pm.protein > 60 ? "That is a lot of protein in one sitting. Four or five meals will be easier to eat." : "Even meals are the simple way to get there. Uneven is fine if the day's total lands."}</p></div>`;

  if (p.custom && p.custom.items?.length) {
    const ck = p.custom.items.reduce((t, x) => t + x.kcal, 0), cp = p.custom.items.reduce((t, x) => t + x.protein, 0);
    h += sect("Your day from Coach", `<button data-act="eatCustomDrop">Remove</button>`) + `<div class="glass">` + p.custom.items.map((it) => `<div class="tp-row static"><span class="tp-t"><b>${esc(it.slot)}: ${esc(it.name)}</b><span>${esc(it.portion)}</span></span><span class="amt small">${it.protein} g<br><em class="muted">${it.kcal} cal</em></span></div>`).join("") +
      `<div class="tp-row static"><span class="tp-t"><b>Total</b><span>${esc(p.custom.title)}</span></span><span class="amt small">${cp} g<br><em class="muted">${ck} cal</em></span></div></div>`;
  }
  h += `<button class="tp-btn tp-ghost tp-block mt" data-act="goAsk" data-q="Write me a day of eating that hits my target. I don't eat ">${icon("spark")} Ask Coach for a day built around you</button>`;
  h += sect("A day that hits it", `<button data-act="eatAnother">Show another</button>`) + chips("eatDiet", DIET_NAMES, p.diet) +
    `<div class="glass mt">` + day.items.map((it) => `<div class="tp-row static"><span class="tp-t"><b>${esc(it.slot === "Add" ? "Add: " : it.slot + ": ")}${esc(it.name)}</b><span>${esc(it.portion)}</span></span><span class="amt small">${it.protein} g<br><em class="muted">${it.kcal} cal</em></span></div>`).join("") +
    `<div class="tp-row static"><span class="tp-t"><b>Total</b><span>${day.shortProtein > 10 ? `About ${Math.round(day.shortProtein / 5) * 5} g of protein short. Add a shake or a bigger portion of the protein at dinner.` : "Protein target met."}</span></span><span class="amt small">${day.protein} g<br><em class="muted">${day.kcal} cal</em></span></div></div>` +
    (day.leftKcal > 75 ? note(`<b>${Math.round(day.leftKcal / 25) * 25} calories left over.</b> Spend them on what you like: more rice or potatoes, fruit, olive oil on the vegetables, or dessert.`) : day.leftKcal < -75 ? note(`<b>${Math.round(-day.leftKcal / 25) * 25} calories over.</b> Trim a starch portion or swap a meal for a leaner one.`) : "") +
    `<p class="small muted mt">An example, not a prescription. Portions are cooked weights and the numbers are close estimates. Swap any meal for one with similar protein.</p>`;

  h += sect(`Tips for a ${PHASE[n.phase].name.toLowerCase()}`) + `<div class="glass pad"><ul class="tips">${TIPS[n.phase].map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  h += sect("The basics") + `<div class="glass pad"><ul class="tips">${BASICS.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  h += sect("Protein cheat sheet") + `<div class="glass pad">` + FOODS.staples.map(([name, portion, kcal, g]) => `<div class="kv"><span>${esc(name)} <em class="small muted">${esc(portion)}</em></span><b>${g} g · ${kcal} cal</b></div>`).join("") + `</div>`;
  h += `<p class="small muted mt">General guidance for healthy adults who lift. If you have a medical condition, a history of disordered eating, or are pregnant, work with a doctor or dietitian instead.</p>`;
  return h;
};
ACT.eatMeals = (d) => { setPref("meals", +d.v); render(); };
ACT.eatDiet = (d) => { setPref("diet", d.v); E.seed = 0; render(); };
ACT.eatAnother = () => { E.seed++; render(); };
ACT.goEat = () => go("eat");
ACT.eatCustomDrop = () => { const e = prefs(); delete e.custom; S.me.settings.eat = e; touchMe(); render(); };
