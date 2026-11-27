// Notifications: off until you turn them on, and you pick which ones.
import { ACT, CHG, VIEWS, go, render, backTop, sect, row, note, icon, pill, toast } from "./ui.js";
import { CLOUD } from "./cloud.js";

const LS = "spotter.push";
const DEF = { hour: 17, train: true, mobility: false, friends: true, weekly: true };
const N = { here: false, busy: false, checked: false, prefs: load() };
function load() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(LS) || "{}")); } catch (e) { return Object.assign({}, DEF); } }
function keep() { try { localStorage.setItem(LS, JSON.stringify(N.prefs)); } catch (e) { /* fine */ } }

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; } catch (e) { return "America/New_York"; } };
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const fn = (body) => CLOUD.api("POST", "/functions/v1/push", body);
function keyBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
async function current() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }

async function check() {
  if (N.checked || !supported() || !CLOUD.on()) return;
  N.checked = true;
  try {
    const sub = await current();
    if (!sub) return;
    const j = await fn({ action: "status", endpoint: sub.endpoint });
    N.here = !!j.here;
    if (j.prefs) { Object.assign(N.prefs, j.prefs); keep(); }
    render();
  } catch (e) { N.checked = false; }
}

const hourName = (h) => (h % 12 || 12) + (h < 12 ? " am" : " pm");
const KINDS = [
  ["train", "dumbbell", "Training nudge", "Only when it has been two days since you lifted. Stops after two weeks."],
  ["mobility", "stretch", "Mobility reminder", "Once a day, if you have not done a routine yet."],
  ["friends", "heart", "Friends", "When someone in one of your groups finishes a workout."],
  ["weekly", "chart", "Weekly recap", "Sunday: what you logged this week."],
];

VIEWS.notify = () => {
  let h = backTop("Notifications", "Off until you turn them on");
  if (!CLOUD.ready() || !CLOUD.on()) return h + note("Sign in first. Notifications are sent to your account's phones.") + `<div class="acts"><button class="tp-btn" data-act="goSettings">Open Settings</button></div>`;
  if (!supported()) {
    return h + note(isIphone() && !standalone()
      ? "<b>On iPhone, notifications only work from the Home Screen icon.</b><br>In Safari tap Share, then Add to Home Screen. Open Spotter from the new icon and come back here."
      : "This browser cannot show notifications. On a phone, add Spotter to your Home Screen and open it from the icon.");
  }
  if (Notification.permission === "denied") return h + note("<b>Notifications are blocked for Spotter on this phone.</b><br>Open the phone's Settings, find Spotter under Notifications, and allow them. Then come back here.");
  check();
  h += `<div class="glass hero"><span class="shine"></span><div class="label">This phone</div><div class="heroT">${N.here ? "Notifications are on" : "Notifications are off"}</div>
    <div class="small muted">${N.here ? "You get only what is switched on below." : "Nothing is sent until you turn this on. You choose what you hear about."}</div>
    <div class="flex mt">${N.here
      ? `<button class="tp-btn" data-act="pushTest">Send a test</button><button class="tp-btn tp-ghost" data-act="pushOff">Turn off</button>`
      : `<button class="tp-btn big1" data-act="pushOn"${N.busy ? " disabled" : ""}>${icon("bell")} Turn on</button>`}</div></div>`;
  h += sect("What you get") + `<div class="glass">` + KINDS.map(([k, ic, title, sub]) =>
    row({ tile: icon(ic), title, sub, act: "pushFlip", data: { k }, chev: false, right: pill(N.prefs[k] ? "On" : "Off", N.prefs[k] ? "ok" : "plain") })).join("") + `</div>`;
  h += sect("When") + `<div class="glass pad"><label class="small muted" for="pushHour">Reminders arrive around</label>
    <select id="pushHour" class="tp-input" data-chg="pushHour">${Array.from({ length: 24 }, (_, i) => `<option value="${i}"${+N.prefs.hour === i ? " selected" : ""}>${hourName(i)}</option>`).join("")}</select>
    <p class="small muted mt">Friend activity arrives when it happens. Everything else waits for this hour.</p></div>`;
  return h;
};

async function sendPrefs() { keep(); if (N.here) { try { await fn({ action: "prefs", tz: tz(), prefs: N.prefs }); } catch (e) { toast("Could not save that. Check your signal."); } } }
ACT.goNotify = () => go("notify");
ACT.pushFlip = (d) => { N.prefs[d.k] = !N.prefs[d.k]; render(); sendPrefs(); };
CHG.pushHour = (v) => { N.prefs.hour = +v; sendPrefs(); };
ACT.pushOn = async () => {
  if (N.busy) return;
  N.busy = true;
  try {
    const perm = await Notification.requestPermission();      // must be the first thing after the tap on iPhone
    if (perm !== "granted") { N.busy = false; render(); return toast("Notifications were not allowed."); }
    const reg = await navigator.serviceWorker.ready, k = await fn({ action: "key" });
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) }));
    const j = await fn({ action: "sub", endpoint: sub.endpoint, ua: navigator.userAgent, tz: tz(), prefs: N.prefs });
    if (!j.ok) throw new Error(j.error || "Could not turn on");
    N.here = true; keep(); toast("Notifications are on");
  } catch (e) { toast(e.message || "Could not turn notifications on"); }
  N.busy = false; render();
};
ACT.pushOff = async () => {
  try { const sub = await current(); if (sub) { await fn({ action: "unsub", endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } } catch (e) { /* already off */ }
  N.here = false; render(); toast("Notifications are off on this phone");
};
ACT.pushTest = async () => {
  try { const j = await fn({ action: "test" }); toast(j.ok ? "Sent. It should arrive in a few seconds." : j.error); } catch (e) { toast("Could not send. Check your signal."); }
};

/* Tell friends a workout is done. Quiet on failure: the workout is saved either way. */
export function tellFriends(title) { if (CLOUD.ready() && CLOUD.on()) fn({ action: "done", title }).catch(() => {}); }
