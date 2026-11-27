// Notifications: off until you turn them on, and you pick which ones.
import { ACT, CHG, VIEWS, go, render, backTop, sect, row, note, icon, pill, toast, chips } from "./ui.js";
import { CLOUD } from "./cloud.js";
import { S, touchMe } from "./store.js";

const LS = "spotter.push";
// Each kind has its own time: mobility in the morning, the training nudge after work, the recap on Sunday evening.
const DEF = { train: true, train_hour: 17, mobility: false, mobility_hours: [7], friends: true, weekly: true, weekly_day: 0, weekly_hour: 18 };
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
const hours = (id, cur, from, to) => `<select id="${id}" class="tp-input" data-chg="${id}">${Array.from({ length: to - from + 1 }, (_, i) => from + i).map((i) => `<option value="${i}"${+cur === i ? " selected" : ""}>${hourName(i)}</option>`).join("")}</select>`;
const MOB_TIMES = [[7, "7 am"], [9, "9 am"], [11, "11 am"], [13, "1 pm"], [15, "3 pm"], [17, "5 pm"], [20, "8 pm"]];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function kind(k, ic, title, sub, body) {
  const on = N.prefs[k];
  return `<div class="glass">` + row({ tile: icon(ic), title, sub, act: "pushFlip", data: { k }, chev: false, right: pill(on ? "On" : "Off", on ? "ok" : "plain") }) + (on && body ? `<div style="padding:0 16px 16px">${body}</div>` : "") + `</div>`;
}

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
  const p = N.prefs;
  h += `<div class="glass hero"><span class="shine"></span><div class="label">This phone</div><div class="heroT">${N.here ? "Notifications are on" : "Notifications are off"}</div>
    <div class="small muted">${N.here ? "You get only what is switched on below, at the times you pick." : "Nothing is sent until you turn this on. You choose what you hear about, and when."}</div>
    <div class="flex mt">${N.here
      ? `<button class="tp-btn" data-act="pushTest">Send a test</button><button class="tp-btn tp-ghost" data-act="pushOff">Turn off</button>`
      : `<button class="tp-btn big1" data-act="pushOn"${N.busy ? " disabled" : ""}>${icon("bell")} Turn on</button>`}</div></div>`;
  h += sect("Training") + kind("train", "dumbbell", "Training nudge", "Only when it has been two days since you lifted. Stops after two weeks.",
    `<label class="tp-label" for="pushTrainHour">Around when you usually train</label>${hours("pushTrainHour", p.train_hour, 5, 22)}`);
  h += sect("Mobility") + kind("mobility", "stretch", "Mobility reminders", "A short routine. Morning gets blood moving; a couple more break up a day of sitting.",
    `<div class="tp-label">Remind me at</div>${chips("pushMob", MOB_TIMES.map(([v, l]) => [String(v), l]), p.mobility_hours.map(String), true)}<p class="small muted mt">Pick as many as you want. One is skipped if you did a routine in the two hours before it.</p>`);
  const g = S.me.settings.notify || {}, grow = (k, ic, title, sub) => row({ tile: icon(ic), title, sub, act: "pushGroup", data: { k }, chev: false, right: pill(g[k] === false ? "Off" : "On", g[k] === false ? "plain" : "ok") });
  h += sect("Your groups") + `<div class="glass">` +
    row({ tile: icon("dumbbell"), title: "A friend finishes a workout", sub: "Arrives when it happens", act: "pushFlip", data: { k: "friends" }, chev: false, right: pill(p.friends ? "On" : "Off", p.friends ? "ok" : "plain") }) +
    grow("join", "plus", "Someone joins your group", "So you know who is in") +
    grow("react", "heart", "Someone reacts to your workout", "The 💪 🔥 👏 on your sessions") +
    grow("comment", "pencil", "Someone comments on your workout", "With what they wrote") + `</div>
    <p class="small muted mt">These also show under the bell on Today, whether or not this phone gets notifications.</p>`;
  h += sect("Recap") + kind("weekly", "chart", "Weekly recap", "What you logged over the last seven days.",
    `<div class="flex"><div style="flex:1"><label class="tp-label" for="pushWeekDay">Day</label><select id="pushWeekDay" class="tp-input" data-chg="pushWeekDay">${DAYS.map((d, i) => `<option value="${i}"${+p.weekly_day === i ? " selected" : ""}>${d}</option>`).join("")}</select></div>
     <div style="flex:1"><label class="tp-label" for="pushWeekHour">Time</label>${hours("pushWeekHour", p.weekly_hour, 5, 22)}</div></div>`);
  return h;
};

async function sendPrefs() { keep(); if (N.here) { try { await fn({ action: "prefs", tz: tz(), prefs: N.prefs }); } catch (e) { toast("Could not save that. Check your signal."); } } }
ACT.goNotify = () => go("notify");
ACT.pushGroup = (d) => { const g = (S.me.settings.notify = S.me.settings.notify || {}); g[d.k] = g[d.k] === false; touchMe(); render(); };
ACT.pushFlip = (d) => { N.prefs[d.k] = !N.prefs[d.k]; render(); sendPrefs(); };
CHG.pushTrainHour = (v) => { N.prefs.train_hour = +v; sendPrefs(); };
CHG.pushWeekHour = (v) => { N.prefs.weekly_hour = +v; sendPrefs(); };
CHG.pushWeekDay = (v) => { N.prefs.weekly_day = +v; sendPrefs(); };
ACT.pushMob = (d) => {
  const g = N.prefs.mobility_hours, v = +d.v, i = g.indexOf(v);
  if (i >= 0) { if (g.length > 1) g.splice(i, 1); else return toast("Keep at least one time, or switch mobility reminders off."); } else g.push(v);
  g.sort((a, b) => a - b); render(); sendPrefs();
};
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
