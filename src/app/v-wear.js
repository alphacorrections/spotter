// Wearables: link Oura so sleep, readiness, resting heart rate, HRV and steps arrive on their own.
import { S, ago } from "./store.js";
import { ACT, VIEWS, go, render, backTop, sect, row, note, icon, pill, toast } from "./ui.js";
import { CLOUD } from "./cloud.js";
import { syncNow } from "./sync.js";

const W = { loaded: false, linked: false, last: null, error: null, busy: false };
const fn = (body) => CLOUD.api("POST", "/functions/v1/oura", body);
async function load(force) {
  if ((W.loaded && !force) || !CLOUD.on()) return;
  W.loaded = true;
  try { const j = await fn({ action: "status" }); Object.assign(W, { linked: !!j.linked, last: j.last_sync, error: j.error }); render(); } catch (e) { W.loaded = false; }
}
/* Last night's numbers from a wearable, if any arrived in the last two days. */
export function recovery() {
  const cut = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const r = S.health.filter((h) => h.source === "oura" && h.day >= cut && (h.sleep_minutes || h.readiness)).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  if (!r) return null;
  const parts = [];
  if (r.sleep_minutes) parts.push(`slept ${Math.floor(r.sleep_minutes / 60)}h ${r.sleep_minutes % 60}m`);
  if (r.readiness) parts.push(`readiness ${r.readiness}`);
  if (r.resting_hr) parts.push(`resting HR ${r.resting_hr}`);
  return { row: r, text: parts.join(" · "), low: r.readiness != null && r.readiness < 65 };
}

VIEWS.wear = () => {
  let h = backTop("Wearables", "Sleep and recovery, without typing it in");
  if (!CLOUD.ready() || !CLOUD.on()) return h + note("Sign in first. A wearable is linked to your account.") + `<div class="acts"><button class="tp-btn" data-act="goSettings">Open Settings</button></div>`;
  const q = new URLSearchParams(location.search).get("oura");
  if (q && !W.seen) { W.seen = true; setTimeout(() => { toast(q === "linked" ? "Oura is linked" : "Oura did not link. Try again."); try { history.replaceState(null, "", location.pathname + "#wear"); } catch (e) { /* fine */ } if (q === "linked") syncNow(); }, 50); }
  load();
  const rec = recovery();
  h += `<div class="glass">` + row({ tile: icon("moon"), title: "Oura", sub: W.linked ? (W.error ? W.error : `Linked${W.last ? " · synced " + ago(W.last) : ""}`) : "Sleep, readiness, resting heart rate, HRV, steps", chev: false,
    right: pill(W.linked ? (W.error ? "Check" : "On") : "Off", W.linked ? (W.error ? "warn" : "ok") : "plain") }) +
    `<div style="padding:0 16px 16px">${W.linked
      ? `${rec ? `<p class="small muted">Latest: ${rec.text}</p>` : ""}<div class="flex mt"><button class="tp-btn tp-sm" data-act="ouraSync"${W.busy ? " disabled" : ""}>Sync now</button><button class="tp-btn tp-ghost tp-sm" data-act="ouraOff">Disconnect</button></div>`
      : `<p class="small muted">You approve this on Oura's own page. Spotter never sees your Oura password, and friends never see this data.</p><div class="flex mt"><button class="tp-btn" data-act="ouraOn"${W.busy ? " disabled" : ""}>Connect Oura</button></div>`}</div></div>`;
  h += `<div class="glass mt">` + row({ tile: icon("run"), title: "Garmin", sub: "Waiting on Garmin to approve developer access", chev: false, right: pill("Soon", "plain") }) + `</div>`;
  h += note("Wearable data stays private to you. It feeds the Coach: poor sleep is one of the signs it uses to suggest an easy week.");
  return h;
};
ACT.goWear = () => go("wear");
ACT.ouraOn = async () => {
  W.busy = true; render();
  try { const j = await fn({ action: "start" }); if (!j.ok) throw new Error(j.error); location.href = j.url; }
  catch (e) { W.busy = false; render(); toast(e.message || "Could not reach Oura"); }
};
ACT.ouraSync = async () => {
  W.busy = true; render();
  try { const j = await fn({ action: "sync" }); toast(j.ok ? `Synced ${j.days} days from Oura` : j.error); await syncNow(); } catch (e) { toast("Could not sync. Check your signal."); }
  W.busy = false; await load(true); render();
};
ACT.ouraOff = async () => {
  try { await fn({ action: "unlink" }); Object.assign(W, { linked: false, last: null, error: null }); toast("Oura disconnected. Data already synced stays in your history."); } catch (e) { toast("Could not disconnect. Check your signal."); }
  render();
};
