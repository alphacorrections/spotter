// The bell: what has happened in your groups, newest first.
import { ago } from "./store.js";
import { ACT, go, render, sheet, closeSheet, esc, icon, row } from "./ui.js";
import { CLOUD } from "./cloud.js";

export const INBOX = { items: [], at: 0 };
const TILE = { join: "plus", react: "heart", comment: "pencil", workout: "dumbbell" };
export const unread = () => INBOX.items.filter((n) => !n.read_at).length;
export async function loadInbox(force) {
  if (!CLOUD.ready() || !CLOUD.on() || (!force && Date.now() - INBOX.at < 60000)) return;
  INBOX.at = Date.now();
  try { const before = unread(); INBOX.items = await CLOUD.get("notices?select=id,kind,title,body,url,created_at,read_at&order=created_at.desc&limit=30"); if (unread() !== before) render(); } catch (e) { /* offline: keep what we have */ }
}
export const bell = () => { loadInbox(); const n = unread(); return CLOUD.ready() && CLOUD.on() ? `<button class="ibtn bellbtn" data-act="inbox" aria-label="Notifications${n ? ", " + n + " new" : ""}">${icon("bell")}${n ? `<i>${n > 9 ? "9+" : n}</i>` : ""}</button>` : ""; };
ACT.inbox = async () => {
  await loadInbox(true);
  const list = INBOX.items;
  sheet("Notifications", (list.length ? `<div class="glass">` + list.map((n) => row({ tile: icon(TILE[n.kind] || "bell"), title: n.title, sub: `${n.body ? esc(n.body) + " · " : ""}${ago(n.created_at)}`, act: "inboxGo", data: { u: n.url }, chev: false, right: n.read_at ? "" : `<span class="newdot"></span>` })).join("") + `</div>`
    : `<p class="muted">Nothing yet. When someone joins your group, finishes a workout, or reacts to yours, it shows here.</p>`) +
    `<div class="acts"><button class="tp-btn tp-ghost" data-act="goNotify" data-close>Choose what you get</button><button class="tp-btn" data-close>Done</button></div>`);
  const ids = list.filter((n) => !n.read_at).map((n) => n.id);
  if (ids.length) { const now = new Date().toISOString(); list.forEach((n) => { n.read_at = n.read_at || now; }); CLOUD.patch("notices", `id=in.(${ids.join(",")})`, { read_at: now }).catch(() => {}); if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(() => {}); }
};
ACT.inboxGo = (d) => { closeSheet(); const name = String(d.u || "").replace("#", ""); if (name) go(name); else render(); };
addEventListener("focus", () => loadInbox(true));
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadInbox(true); });
