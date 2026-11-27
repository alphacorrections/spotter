// The rules that sit above a single set: stalls, deloads, coming back after
// time off, and the simple targets for walking and cardio. Pure functions.

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * A lift has stalled when none of its last three sessions beat the best
 * estimated 1RM that came before them.
 *   bests  best e1RM per session, oldest first
 */
export function stalled(bests) {
  if (bests.length < 4) return false;
  const before = Math.max(...bests.slice(0, -3));
  return bests.slice(-3).every((b) => b <= before);
}

/**
 * A deload is suggested when any two of three things are true in the same week.
 *   stalledCount   lifts currently stalled
 *   ratings        this week's session ratings, 1..5
 *   sleepRecent    average sleep minutes, last 7 days (or null)
 *   sleepBaseline  average sleep minutes, the 4 weeks before that (or null)
 */
export function deloadCheck({ stalledCount = 0, ratings = [], sleepRecent = null, sleepBaseline = null }) {
  const reasons = [];
  if (stalledCount >= 2) reasons.push(`${stalledCount} lifts have stalled`);
  if (ratings.length >= 2 && avg(ratings) < 3) reasons.push("sessions have felt rough this week");
  if (sleepRecent != null && sleepBaseline && sleepRecent < sleepBaseline * 0.85) reasons.push("sleep is down more than 15 percent");
  return { due: reasons.length >= 2, reasons };
}

/** Coming back after time off. Under 10 days: nothing. 10 to 21: 10 percent lighter. Longer: recalibrate. */
export function gapRule(days) {
  if (days == null || days < 10) return { loadFactor: 1, calibrate: false, text: null };
  if (days <= 21) return { loadFactor: 0.9, calibrate: false, text: `It has been ${days} days. Targets are 10 percent lighter today.` };
  return { loadFactor: 0.8, calibrate: true, text: `It has been ${days} days. Treat this week as a re-start: lighter loads, then real targets again.` };
}

/** A step target that follows what you actually walk: your recent average plus 10 percent. */
export function stepTarget(recentDays) {
  const days = recentDays.filter((n) => n > 0).slice(-14);
  if (days.length < 3) return 7000;
  const raw = avg(days) * 1.1;
  return Math.round(Math.min(12000, Math.max(3000, raw)) / 500) * 500;
}

/** Estimated max heart rate (Tanaka): 208 - 0.7 x age. */
export function maxHr(age) {
  return Math.round(208 - 0.7 * age);
}

/** Heart rate zone 1..5 from average heart rate, as a share of max. */
export function hrZone(avgHr, max) {
  const pct = avgHr / max;
  return pct < 0.6 ? 1 : pct < 0.7 ? 2 : pct < 0.8 ? 3 : pct < 0.9 ? 4 : 5;
}

export const ZONES = [
  null,
  { n: 1, name: "Very easy", cue: "A stroll. You could do this all day." },
  { n: 2, name: "Easy", cue: "You can hold a full conversation. Most cardio belongs here." },
  { n: 3, name: "Steady", cue: "Talking in short sentences. Comfortably hard." },
  { n: 4, name: "Hard", cue: "A few words at a time. Sustainable for minutes, not hours." },
  { n: 5, name: "All out", cue: "No talking. Short efforts only." },
];
