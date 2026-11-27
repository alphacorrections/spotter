// Settings, the account sign-in, and the first-run setup.
import { S, save, saveNow, touchMe, replaceState, exportData, ex, templates, ago } from "./store.js";
import { ACT, CHG, VIEWS, go, render, backTop, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, chips, field, val, TG } from "./ui.js";
import { CLOUD } from "./cloud.js";
import { CONFIG } from "./config.js";
import { SYNC, syncNow } from "./sync.js";
import { startBlock } from "./train.js";
import { FOCUS, EQUIPMENT } from "./words.js";
import { recommended } from "./v-plans.js";
import { resetFriends } from "./v-friends.js";

const ALL_GEAR = EQUIPMENT.map(([k]) => k);

VIEWS.prefs = () => {
  const me = S.me, mode = TG.look.get().mode || "dark";
  let h = backTop("Settings", "Spotter " + CONFIG.version, "goToday");
  h += sect("Account");
  if (!CLOUD.ready()) h += `<div class="glass"><div class="empty">Accounts are not switched on in this build. Your data is saved on this phone only.</div></div>`;
  else if (CLOUD.on()) {
    h += `<div class="glass">` + row({ tile: icon("cloud"), title: CLOUD.email(), sub: S.sync.error ? `Sync problem: ${S.sync.error}` : S.sync.at ? `Synced ${new Date(S.sync.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not synced yet", right: S.sync.error ? pill("Check", "warn") : pill("On", "ok") }) +
      `</div><div class="flex mt"><button class="tp-btn tp-ghost tp-sm" data-act="syncTap">Sync now</button><button class="tp-btn tp-ghost tp-sm" data-act="signOutAsk">Sign out</button></div>`;
  } else {
    h += `<div class="glass">` + row({ tile: icon("cloud"), title: "Sign in with email", sub: CLOUD.lost ? "You were signed out. Sign in again to keep syncing." : "Back up your training and join groups. A 6-digit code, no password.", act: "signIn" }) + `</div>`;
  }
  h += sect("You") + `<div class="glass pad">${field("setname", "Name your friends see", me.display_name, "First name")}
    <label class="tp-label">Units</label><div class="seg">${[["lb", "Pounds"], ["kg", "Kilos"]].map(([v, l]) => `<button type="button" data-act="setUnits" data-v="${v}" class="${me.units === v ? "on" : ""}">${l}</button>`).join("")}</div>
    <label class="tp-label">Usual weight jump (${me.units})</label><div class="fgrid">${field("setup", "Upper body", me.increments.upper, "", "text", "decimal")}${field("setlow", "Lower body", me.increments.lower, "", "text", "decimal")}</div>
    <button class="tp-btn tp-sm mt" data-act="setSave">Save</button></div>`;
  h += sect("Your gym") + `<div class="glass pad"><p class="small muted">Used to mark plans that fit and to filter swaps. Leave it empty if you have everything.</p>${chips("setGear", EQUIPMENT, me.equipment, true)}
    <label class="tp-label">Training days a week</label>${chips("setDays", [2, 3, 4, 5, 6].map((n) => [String(n), String(n)]), String(me.days_per_week || ""))}</div>`;
  h += sect("No-go list") + (me.no_go.length ? `<div class="glass">` + me.no_go.map((n, i) => row({ tile: icon("close"), title: ex(n.exercise_id).name, sub: `${n.reason === "pain" ? "Swapped for pain" : "Avoid"} · since ${n.since || "a while ago"}`, act: "noGoDrop", data: { i }, chev: false, right: `<span class="tp-pill tp-plain">Allow again</span>` })).join("") + `</div>`
    : `<div class="glass"><div class="empty">Lifts you swap out for pain land here, so no plan brings them back unasked.</div></div>`);
  h += sect("Look") + `<div class="glass pad"><div class="seg">${[["dark", "Dark"], ["light", "Light"], ["auto", "Match phone"]].map(([v, l]) => `<button type="button" data-act="setMode" data-v="${v}" class="${mode === v ? "on" : ""}">${l}</button>`).join("")}</div><div class="dotsrow mt"><span class="small">Color</span>${TG.dots()}</div></div>`;
  h += sect("This phone") + `<div class="glass">` +
    row({ tile: icon("home"), title: "Add Spotter to your Home Screen", sub: "Opens like an app, works with no signal", act: "installHelp" }) +
    row({ tile: icon("spark"), title: "Check for an update", sub: "Version " + CONFIG.version, act: "updateTap" }) +
    row({ tile: icon("doc"), title: "Download my data", sub: "Everything on this phone, as one file", act: "exportTap" }) +
    row({ tile: icon("trash"), title: "Erase this phone's copy", sub: CLOUD.on() ? "Your account keeps everything that has synced" : "Not signed in: this deletes your data for good", act: "eraseAsk" }) + `</div>`;
  return h;
};
ACT.setSave = () => {
  const name = val("setname"), up = parseFloat(val("setup")), low = parseFloat(val("setlow"));
  if (!name) return toast("Enter a name");
  S.me.display_name = name.slice(0, 40);
  if (up > 0) S.me.increments.upper = up;
  if (low > 0) S.me.increments.lower = low;
  touchMe(); toast("Saved");
};
ACT.setUnits = (d) => { if (S.me.units === d.v) return; S.me.units = d.v; S.me.increments = d.v === "kg" ? { upper: 2.5, lower: 5 } : { upper: 5, lower: 10 }; touchMe(); render(); toast(`New sets log in ${d.v}. Past sets stay as you logged them.`); };
ACT.setGear = (d) => { const g = S.me.equipment, i = g.indexOf(d.v); if (i >= 0) g.splice(i, 1); else g.push(d.v); touchMe(); render(); };
ACT.setDays = (d) => { S.me.days_per_week = +d.v; touchMe(); render(); };
ACT.noGoDrop = (d) => { S.me.no_go.splice(+d.i, 1); touchMe(); render(); };
ACT.setMode = (d) => { TG.look.set(null, d.v); };
ACT.syncTap = async () => { toast("Syncing…"); const ok = await syncNow(); render(); toast(ok ? "Up to date" : S.sync.error || "Could not sync"); };
ACT.installHelp = () => sheet("Add to Home Screen", `<p class="muted">Spotter is a web app. Adding it to your Home Screen gives it its own icon, full screen, and lets it open with no signal.</p>
  <div class="deep"><b>iPhone (Safari)</b><ol class="steps"><li>Open this page in Safari.</li><li>Tap the Share button, the square with an arrow.</li><li>Scroll down and tap Add to Home Screen.</li><li>Open Spotter from the new icon and sign in there. The icon keeps its own sign-in, separate from Safari.</li></ol></div>
  <div class="deep"><b>Android (Chrome)</b><ol class="steps"><li>Tap the three dots, top right.</li><li>Tap Add to Home screen, or Install app.</li></ol></div><div class="acts"><button class="tp-btn" data-close>Got it</button></div>`);
ACT.exportTap = () => {
  const blob = new Blob([exportData()], { type: "application/json" }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `spotter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
ACT.eraseAsk = () => sheet("Erase this phone's copy?", `<p class="muted">${CLOUD.on() ? "Everything that has synced stays in your account and comes back when you sign in." : "You are not signed in, so there is no other copy. This cannot be undone."}</p>
  <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn tp-danger" data-act="eraseDo">Erase</button></div>`);
ACT.eraseDo = (d, el) => {
  if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.textContent = "Tap again to erase"; return; }
  if (CLOUD.on()) CLOUD.signOut();
  replaceState({}); resetFriends(); closeSheet(); go("onboard");
};

// ---------------------------------------------------------------- account
const A = { email: "" };
ACT.signIn = () => sheet("Sign in", `<p class="muted">Enter your email and we send a 6-digit code. No password. New here? The same steps make your account.</p>
  ${field("sgemail", "Email", CLOUD.email(), "you@example.com", "email")}
  <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="signSend">Email me a code</button></div>`);
ACT.signSend = async (d, el) => {
  const email = val("sgemail").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("That email does not look right");
  el.disabled = true; el.textContent = "Sending…";
  try {
    await CLOUD.sendCode(email);
    A.email = email;
    sheet("Check your email", `<p class="muted">We sent a 6-digit code to <b>${esc(email)}</b>. It can take a minute. Check spam if it is not there.</p>
      ${field("sgcode", "6-digit code", "", "123456", "text", "numeric")}
      <div class="acts"><button class="tp-btn tp-ghost" data-act="signIn">Different email</button><button class="tp-btn" data-act="signVerify">Sign in</button></div>`);
  } catch (e) { el.disabled = false; el.textContent = "Email me a code"; toast(e.status === 429 ? "Too many tries. Wait a minute and try again." : e.message); }
};
ACT.signVerify = async (d, el) => {
  const code = val("sgcode").replace(/\D/g, "");
  if (code.length !== 6) return toast("The code is 6 digits");
  el.disabled = true; el.textContent = "Checking…";
  try {
    await CLOUD.verify(A.email, code);
    const wasNew = !S.me.settings.onboarded;
    await syncNow();
    resetFriends(); closeSheet();
    if (wasNew && S.me.settings.onboarded) go("today"); else render();
    toast(S.sync.error ? "Signed in, but the first sync failed. It will retry." : "Signed in. Your training is backed up.");
  } catch (e) { el.disabled = false; el.textContent = "Sign in"; toast(/expired|invalid/i.test(e.message) ? "That code is wrong or has expired" : e.message); }
};
ACT.signOutAsk = () => {
  const unsent = S.me._d || S.activities.some((a) => a._d && !a.open) || S.blocks.some((b) => b._d);
  sheet("Sign out?", `<p class="muted">${unsent ? "Some changes have not reached your account yet. Tap Sync now first, or they stay only on this phone." : "Everything is backed up. Your data stays on this phone until you erase it, and syncs again when you sign back in."}</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Stay signed in</button><button class="tp-btn tp-danger" data-act="signOutDo">Sign out</button></div>`);
};
ACT.signOutDo = () => { CLOUD.signOut(); resetFriends(); closeSheet(); render(); toast("Signed out"); };

// ---------------------------------------------------------------- first run
const O = { step: 0 };
const dots = () => `<div class="sxhead">${O.step ? `<button class="ibtn" data-act="obBack" aria-label="Back">${icon("back")}</button>` : ""}<div class="stepdots">${[0, 1, 2, 3].map((i) => `<i class="${i <= O.step ? "on" : ""}"></i>`).join("")}</div></div>`;
VIEWS.onboard = () => {
  const me = S.me;
  if (O.step === 0) return dots() + `<span class="eyebrow hi">Spotter</span><h1 class="flowh">Know what to lift today, and beat it next time</h1>
    <p class="flowp muted">A plan, a target for every set, and a reason behind each one. Four quick questions, then you are in.</p>
    ${field("obname", "Your first name", me.display_name, "What your friends will see")}
    <label class="tp-label">Units</label><div class="seg" id="obunits">${[["lb", "Pounds"], ["kg", "Kilos"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${me.units === v ? "on" : ""}">${l}</button>`).join("")}</div>
    <button class="tp-btn big1 tp-block mt" data-act="obNext">Next</button>
    ${CLOUD.ready() && !CLOUD.on() ? `<button class="tp-btn tp-ghost tp-block mt" data-act="signIn">I already have an account</button>` : ""}`;
  if (O.step === 1) return dots() + `<h1 class="flowh">What are you training for?</h1><p class="flowp muted">This picks your plan. You can change it any time.</p>` +
    Object.entries(FOCUS).map(([k, f]) => `<button class="tp-opt${me.settings.focus === k ? " tp-on" : ""}" data-act="obFocus" data-v="${k}"><span><b>${esc(f.name)}</b><span>${esc(f.line)}. ${esc(f.how.split(". ")[0])}.</span></span></button>`).join("");
  if (O.step === 2) return dots() + `<h1 class="flowh">How many days a week?</h1><p class="flowp muted">Be honest. A plan you finish beats a bigger one you skip.</p>
    ${chips("obDays", [2, 3, 4, 5, 6].map((n) => [String(n), `${n} days`]), String(me.days_per_week || ""))}
    <h2 class="flowh2">What do you have to train with?</h2>
    <div class="chips"><button class="chip${me.equipment.length === ALL_GEAR.length ? " on" : ""}" data-act="obGym">Full gym</button><button class="chip${me.equipment.length === 2 && me.equipment.includes("dumbbell") ? " on" : ""}" data-act="obHome">Dumbbells at home</button><button class="chip${me.settings.gear === "none" ? " on" : ""}" data-act="obNone">No equipment</button></div>
    <p class="small muted mt">You can fine-tune the list in Settings.</p>
    <button class="tp-btn big1 tp-block mt" data-act="obNext"${me.days_per_week ? "" : " disabled"}>Next</button>`;
  const t = recommended();
  return dots() + `<span class="eyebrow hi">Your plan</span><h1 class="flowh">${esc(t.title)}</h1>
    <p class="flowp muted">${esc(t.summary)}</p>
    <div class="glass pad"><div class="kv"><span>Goal</span><b>${esc(FOCUS[t.focus].name)}</b></div><div class="kv"><span>Schedule</span><b>${t.days_per_week} days a week, ${t.weeks} weeks</b></div><div class="kv"><span>First session</span><b>${esc(t.sessions[0].title)}</b></div></div>
    ${note(`<b>Your first week sets your starting weights.</b> Pick loads that feel moderate. From week two the app gives you a target for every set.`)}
    <button class="tp-btn big1 tp-block mt" data-act="obStart" data-slug="${t.slug}">Start this plan</button>
    <button class="tp-btn tp-ghost tp-block mt" data-act="obBrowse">See all ${templates.length} plans</button>
    <button class="tp-btn tp-ghost tp-block mt" data-act="obSkip">Skip, I will just log workouts</button>`;
};
ACT.obBack = () => { O.step = Math.max(0, O.step - 1); render(); };
ACT.obNext = () => {
  if (O.step === 0) {
    const name = val("obname");
    if (!name) return toast("Enter your first name");
    S.me.display_name = name.slice(0, 40);
    const u = document.querySelector("#obunits .on").getAttribute("data-v");
    if (u !== S.me.units) { S.me.units = u; S.me.increments = u === "kg" ? { upper: 2.5, lower: 5 } : { upper: 5, lower: 10 }; }
  }
  O.step += 1; touchMe(); render(); scrollTo(0, 0);
};
ACT.obFocus = (d) => { S.me.settings.focus = d.v; O.step = 2; touchMe(); render(); scrollTo(0, 0); };
ACT.obDays = (d) => { S.me.days_per_week = +d.v; touchMe(); render(); };
ACT.obGym = () => { S.me.equipment = ALL_GEAR.slice(); delete S.me.settings.gear; touchMe(); render(); };
ACT.obHome = () => { S.me.equipment = ["dumbbell", "bench"]; delete S.me.settings.gear; touchMe(); render(); };
ACT.obNone = () => { S.me.equipment = []; S.me.settings.gear = "none"; touchMe(); render(); };
function finishOnboard() { S.me.settings.onboarded = true; O.step = 0; touchMe(); saveNow(); }
ACT.obStart = (d) => { startBlock(templates.find((t) => t.slug === d.slug)); finishOnboard(); go("today"); };
ACT.obBrowse = () => { finishOnboard(); go("plans"); };
ACT.obSkip = () => { finishOnboard(); go("today"); };
export { SYNC, CHG, save, ago };
