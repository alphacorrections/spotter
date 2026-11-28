// Warm-up and cool-down for a session, picked from the muscles that session trains.
// Pure: give it the lifts (primary and secondary muscles, sets) and the move table, get moves back.

/** Score each body area by how much of the session it carries. */
export function areaLoad(lifts, table) {
  const load = {};
  for (const l of lifts) {
    const sets = l.sets || 1;
    (l.muscles || []).forEach((m) => { const a = table.muscles[m]; if (a) load[a] = (load[a] || 0) + sets; });
    (l.secondary || []).forEach((m) => { const a = table.muscles[m]; if (a) load[a] = (load[a] || 0) + sets * 0.4; });
  }
  return Object.entries(load).sort((x, y) => y[1] - x[1]).map(([area, score]) => ({ area, score }));
}

/**
 * kind "warm": dynamic moves before lifting. kind "cool": held stretches after.
 * The busiest areas get the most moves. Returns { areas: [names], moves: [{ area, name, dose, cue }] }.
 */
export function prepFor(lifts, table, kind, max = 5) {
  const ranked = areaLoad(lifts, table).slice(0, 4), pool = table[kind] || {}, moves = [], seen = new Set();
  const take = (area, i) => { const m = (pool[area] || [])[i]; if (m && !seen.has(m[0]) && moves.length < max) { seen.add(m[0]); moves.push({ area, name: m[0], dose: m[1], cue: m[2] }); } };
  ranked.forEach((r) => take(r.area, 0));          // one for each of the main areas
  ranked.slice(0, 2).forEach((r) => take(r.area, 1)); // a second for the two busiest
  if (ranked[0]) take(ranked[0].area, 2);
  const order = ranked.map((r) => r.area);
  moves.sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));
  return { areas: ranked.slice(0, 3).map((r) => table.areas[r.area]), moves };
}
