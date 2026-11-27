// The coaching copy. Plain words, short sentences. If a screen explains
// something, the explanation lives here so it reads the same everywhere.

export const FOCUS = {
  hypertrophy: { name: "Hypertrophy", line: "Build muscle size",
    how: "Moderate weights, sets taken close to failure, and a little more work each week. You add reps until you reach the top of the range, then add weight and start again at the bottom." },
  strength: { name: "Strength", line: "Lift the most you can",
    how: "Heavier weights, fewer reps, long rests. One heavy top set shows where you are. Back-off sets at a lighter load build the work without grinding. Weight goes up before reps do." },
  maintain: { name: "Maintain", line: "Hold what you have on less work",
    how: "The loads you already lift, about a third of the sets. Nothing to beat. Matching last time is the win. Good for busy stretches, travel and cuts." },
  general: { name: "Just move more", line: "Build the habit",
    how: "Short sessions, steps and a little mobility. No performance target. Showing up is the goal." },
};

export const PHASE = {
  cut: { name: "Cut", line: "Lose fat, keep muscle", scale: "The scale should drop 0.5 to 1 percent of your bodyweight a week." },
  bulk: { name: "Bulk", line: "Gain muscle with a small surplus", scale: "The scale should rise 0.25 to 0.5 percent of your bodyweight a week." },
  maintain: { name: "Maintain", line: "Stay where you are", scale: "The scale should stay about flat." },
  recomp: { name: "Recomp", line: "Same weight, more muscle", scale: "The scale stays about flat while your lifts keep rising." },
};

export const TECH = {
  drop_set: { name: "Drop set", how: "On your last set, go to failure. Cut the weight by about 20 percent and go again right away, no rest." },
  double_drop: { name: "Double drop set", how: "On your last set, go to failure, drop the weight about 20 percent, go again, then drop once more. No rest between." },
  rest_pause: { name: "Rest-pause", how: "On your last set, go to failure. Rest 15 seconds. Go again with the same weight. Repeat once more." },
  rest_pause_stretch: { name: "Rest-pause + stretch", how: "On your last set, go to failure, rest 15 seconds, go again. Then hold the bottom, stretched position for 20 to 30 seconds." },
  myo_reps: { name: "Myo-reps", how: "After your last set, rest 5 deep breaths, then do 3 to 5 more reps. Repeat until you cannot get 3. Usually 3 or 4 rounds." },
  lengthened_partials: { name: "Lengthened partials", how: "When you cannot finish another full rep on your last set, keep going with half reps in the stretched half of the movement until those fail too." },
};

/** Why the app is asking for this weight and these reps. */
export function whyTarget(t, spec, last, u) {
  const range = Array.isArray(spec.reps) ? `${spec.reps[0]} to ${spec.reps[1]}` : "";
  const lastTxt = last ? (last.weight != null ? `${last.weight} ${u} for ${last.reps}` : `${last.reps} reps`) : "";
  switch (t.move) {
    case "calibrate": return `No history for this lift yet. Pick a weight you could move for about ${spec.reps[1] + 2} clean reps and do ${spec.reps[0]} to ${spec.reps[1]}. What you log today sets next week's target.`;
    case "add_weight": return t.flag === "overshoot"
      ? `Last time you did ${lastTxt}. That is far past the top of the ${range} range, so the weight was too light. The jump is double the usual one to catch up.`
      : `Last time you did ${lastTxt}, the top of the ${range} range. So the weight goes up and the reps restart at the bottom. That is progressive overload.`;
    case "add_rep": return spec.load === "bodyweight"
      ? `Last time you did ${lastTxt}. Add one rep. Bodyweight lifts progress by reps until you outgrow the range.`
      : `Last time you did ${lastTxt}. You are inside the ${range} range, so keep the weight and beat it by one rep. When you reach ${spec.reps[1]}, the weight goes up.`;
    case "repeat": return t.flag === "top_of_range"
      ? `You are at the top of the ${range} range. Time for a harder version of this move, or added weight. Swap it when you are ready.`
      : `Last time you did ${lastTxt}, under the ${range} range. Keep the weight and get into the range before adding anything.`;
    case "top_set": return `Your top set. Last time: ${lastTxt}. Same weight, one more rep. When you reach ${spec.reps[1]}, the weight goes up.`;
    case "backoff": return `A back-off set: about ${spec.progression?.backoff?.percent_drop ?? 10} percent lighter than your top set. It adds practice and volume without the strain of another heavy set.`;
    case "hold": return `Maintain block. Match last time: ${lastTxt}. Nothing to beat.`;
    case "amrap": return "As many good reps as you can. Stop when your form breaks down.";
    default: return "";
  }
}

export const RATING = [null, "Rough", "Hard going", "Solid", "Good", "Great"];

export const GLOSSARY = [
  ["Progressive overload", "Doing a little more over time: one more rep, or a little more weight. It is the single thing that makes muscle and strength grow. The Next Target on every set is the app doing this for you."],
  ["Rep range", "The low and high number of reps a set should land between, like 8 to 10. Under it, the weight is too heavy. Over it, too light."],
  ["Double progression", "Add reps first, then weight. Stay at one weight until every rep in the range is there, then go heavier and start from the bottom of the range."],
  ["Reps in reserve (RIR)", "How many more reps you could have done. 2 in reserve means you stopped with two good reps left. 0 is failure."],
  ["Failure", "The point where you cannot finish another rep with good form. Useful on last sets of small lifts. Costly on big ones."],
  ["Top set and back-off sets", "One heavy set first, then a few lighter ones. The top set tests strength. The back-off sets build it."],
  ["Estimated 1RM", "The most you could likely lift once, worked out from a set of several reps. It lets a 185 x 10 day be compared with a 205 x 6 day."],
  ["Stall", "Three sessions in a row with no new best on a lift. Normal, and a signal to change one thing: drop the weight and rebuild, add a set, or rest it."],
  ["Deload", "A planned easy week: same exercises, same weights, about two thirds of the sets. It lets fatigue clear so progress can restart."],
  ["Superset", "Two exercises back to back with no rest between, then rest. Saves time on small lifts like curls and pushdowns."],
  ["AMRAP", "As many reps as possible. Used for finishers."],
  ["Drop set", TECH.drop_set.how], ["Rest-pause", TECH.rest_pause.how], ["Myo-reps", TECH.myo_reps.how], ["Lengthened partials", TECH.lengthened_partials.how],
  ["Zone 2", "Easy cardio where you can still hold a conversation. Most of your cardio should be here. It builds the engine without eating into recovery."],
  ["Maintenance calories", "What you eat to stay the same weight. A cut goes under it, a bulk goes over."],
];

export const EQUIPMENT = [["barbell", "Barbell"], ["dumbbell", "Dumbbells"], ["cable", "Cables"], ["machine", "Machines"], ["bench", "Bench"], ["pullup_bar", "Pull-up bar"], ["dip_bars", "Dip bars"], ["kettlebell", "Kettlebell"], ["bands", "Bands"], ["landmine", "Landmine"]];
export const CARDIO = ["Run", "Bike", "Row", "Swim", "Elliptical", "Stairs", "Hike", "Other"];
export const YOGA = ["Vinyasa", "Power", "Yin", "Restorative", "Mobility flow", "Other"];
