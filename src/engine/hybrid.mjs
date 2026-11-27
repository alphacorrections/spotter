// Hybrid training: cardio targets that sit beside a lifting plan.
// The shape follows the common ground between Alex Viada's hybrid method and the
// concurrent-training research: mostly easy minutes, a small capped dose of hard work,
// one longer session, slow weekly growth with a lighter fourth week, and hard cardio kept off leg days.
export const HARD_CAP = 45;   // minutes of hard intervals a week, at most
export const GOALS = {
  general: { name: "General fitness", why: "Build an engine while you get stronger.", easy: 60, hard: 10, long: 25 },
  first5k: { name: "Run a first 5K", why: "All easy to start. Speed comes later.", easy: 60, hard: 0, long: 20 },
  faster: { name: "A faster 5K or 10K", why: "More easy volume, plus one interval day.", easy: 90, hard: 15, long: 35 },
  half: { name: "Half marathon", why: "The long session does most of the work.", easy: 120, hard: 15, long: 50 },
  race: { name: "Hyrox or a conditioning race", why: "Mixed machines, a bit more hard work.", easy: 80, hard: 20, long: 35 },
};
const r5 = (n) => Math.round(n / 5) * 5;

/** Weekly cardio targets, in minutes, for week n (1-based) of a goal. Every fourth week is lighter. */
export function hybridWeek(goalKey, week) {
  const g = GOALS[goalKey] || GOALS.general, w = Math.max(1, Math.floor(week || 1));
  const light = w % 4 === 0, steps = (w - 1) - Math.floor((w - 1) / 4);       // growth steps so far, light weeks not counted
  const grow = Math.min(2.2, Math.pow(1.1, steps));                           // about 10% a week, capped at just over double
  const easy = Math.max(20, r5(g.easy * grow * (light ? 0.7 : 1)));
  const hard = g.hard ? Math.min(HARD_CAP, r5(g.hard * (1 + 0.15 * steps) * (light ? 0.6 : 1))) : 0;
  const long = Math.min(r5(g.long * grow * (light ? 0.7 : 1)), r5(easy * 0.5) || 20);
  return { week: w, light, easy, hard, long: Math.max(15, long) };
}

/**
 * What kind of cardio fits today.
 *   day: "legs" | "upper" | "rest"   what the lifting plan has today
 *   left: { easy, hard, long }       minutes still to do this week (long = 0 once the long session is done)
 */
export function cardioToday(day, left) {
  if (left.easy <= 0 && left.hard <= 0 && left.long <= 0) return { type: "done", minutes: 0, text: "This week's cardio is done. Anything more is a bonus, keep it easy." };
  if (day === "legs") return { type: "easy", minutes: Math.min(20, Math.max(10, left.easy || 10)), text: "Leg day. Keep cardio short and easy, after you lift, or leave it for tomorrow. No intervals today." };
  if (day === "rest") {
    if (left.long > 0) return { type: "long", minutes: left.long, text: "No lifting today, so this is the day for your long easy session." };
    return { type: "easy", minutes: Math.min(40, Math.max(20, left.easy)), text: "No lifting today. An easy session fits well." };
  }
  if (left.hard > 0) return { type: "hard", minutes: Math.min(left.hard, 20), text: "Upper day, so your legs are fresh for intervals. Warm up 10 minutes first." };
  return { type: "easy", minutes: Math.min(30, Math.max(15, left.easy)), text: "Upper day. An easy session after lifting, or later in the day." };
}
