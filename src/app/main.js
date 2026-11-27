// Boot: pick the first screen, start syncing, watch for a newer version.
import { S } from "./store.js";
import { ACT, VIEWS, R, go, render, toast, esc, TG } from "./ui.js";
import { CONFIG } from "./config.js";
import { SYNC, startSync } from "./sync.js";
import "./v-today.js";
import "./v-log.js";
import "./v-plans.js";
import "./v-coach.js";
import "./v-more.js";
import "./v-progress.js";
import "./v-friends.js";
import "./v-saved.js";
import "./v-settings.js";
import { openSave, firstUrl } from "./v-saved.js";

/* ---------- update check: version.json next to the page says what is live (same as Tally) ---------- */
const UPD = { last: 0, shown: "" };
function verCmp(a, b) {
  const x = String(a).split("."), y = String(b).split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (+x[i] || 0) - (+y[i] || 0); if (d) return d; }
  return 0;
}
function checkUpdate(manual) {
  if (!/^https?:/.test(location.protocol) || (!manual && Date.now() - UPD.last < 60000)) return;
  UPD.last = Date.now();
  fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.version || verCmp(j.version, CONFIG.version) <= 0) { if (manual) toast("You are on the latest version"); return; }
    if (UPD.shown === j.version) return;
    UPD.shown = j.version;
    const b = document.createElement("button");
    b.className = "updbar"; b.setAttribute("data-act", "doUpdate"); b.setAttribute("data-v", j.version);
    b.innerHTML = "<b>Update ready</b><span>" + esc(j.note || "Tap to refresh") + "</span><i>Refresh</i>";
    document.body.appendChild(b);
  }).catch(() => { if (manual) toast("Could not check. Are you online?"); });
}
ACT.doUpdate = (d) => location.replace(location.pathname + "?v=" + encodeURIComponent(d.v));
ACT.updateTap = () => checkUpdate(true);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
setInterval(checkUpdate, 30 * 60000);
setTimeout(checkUpdate, 2500);

/* ---------- boot ---------- */
TG.look.apply();
const hash = (location.hash || "").slice(1);
if (!S.me.settings.onboarded) go("onboard");
else go(VIEWS[hash] && hash !== "onboard" && hash !== "mobility" && hash !== "editor" ? hash : "today");

// On Android, Share > Spotter from another app lands here with the link in the address.
// Open the save sheet with it filled in, then tidy the address bar.
(function () {
  const q = new URLSearchParams(location.search), shared = firstUrl(q.get("url") || "") || firstUrl(q.get("text") || "");
  if (!shared || !S.me.settings.onboarded) return;
  const title = q.get("title") || "";
  try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* leave it */ }
  setTimeout(() => openSave({ url: shared, title: /^https?:/.test(title) ? "" : title }), 50);
})();

// When a sync lands new data, refresh the screen, unless you are mid-tap in a sheet or typing.
SYNC.listeners.push(() => {
  if (SYNC.busy || document.getElementById("sheet") || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
  if (R.name === "onboard" && S.me.settings.onboarded) return go("today");
  if (R.name !== "log" && R.name !== "mobility") render();
});
startSync();

// Lets the app open with no signal. The page itself is always fetched fresh when online.
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
