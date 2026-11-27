// Saved to try: workouts you saw somewhere (a reel, a video, an article) and
// want in front of you at the gym instead of buried in another app.
import { S, touch, save, uid, ymd, ago } from "./store.js";
import { ACT, VIEWS, R, go, render, backTop, sect, row, icon, esc, pill, sheet, closeSheet, toast, chips, field, val } from "./ui.js";

const TAGS = ["Upper", "Lower", "Core", "Full body", "Cardio", "Mobility", "Skill"];
const N = { tag: "", id: null, show: "" };   // show: the type filter on the list
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "link"; } }
function guessTitle(u) { const h = host(u); return /instagram/.test(h) ? "Instagram reel" : /tiktok/.test(h) ? "TikTok video" : /youtu/.test(h) ? "YouTube video" : h; }
/** Pulls the first web address out of whatever was pasted or shared. */
export function firstUrl(text) { const m = /https?:\/\/[^\s<>"']+/i.exec(text || ""); return m ? m[0] : ""; }

VIEWS.saved = () => {
  // Filter by type once more than one type is in use.
  const used = TAGS.filter((t) => S.saved.some((l) => l.tag === t));
  if (N.show && !used.includes(N.show)) N.show = "";
  const fits = (l) => !N.show || l.tag === N.show;
  const filter = used.length > 1 ? `<div class="chips" style="margin-bottom:12px">${[["", `All ${S.saved.length}`]].concat(used.map((t) => [t, `${t} ${S.saved.filter((l) => l.tag === t).length}`])).map(([v, l]) => `<button type="button" class="chip${N.show === v ? " on" : ""}" data-act="savedShow" data-v="${v}">${esc(l)}</button>`).join("")}</div>` : "";
  const todo = S.saved.filter((l) => !l.tried_on && fits(l)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const tried = S.saved.filter((l) => l.tried_on && fits(l)).sort((a, b) => b.tried_on.localeCompare(a.tried_on));
  const line = (l) => row({ tile: icon("link"), title: l.title, sub: `${host(l.url)}${l.tag ? " · " + l.tag : ""} · ${l.tried_on ? "tried " + ago(l.tried_on).toLowerCase() : "saved " + ago(l.created_at).toLowerCase()}`, act: "savedOpen", data: { id: l.id } });
  return backTop("Saved to try", "Workouts you meant to get to", "goToday", `<button class="tp-btn tp-sm" data-act="savedAdd">${icon("plus")} Save</button>`) + filter +
    (todo.length ? `<div class="glass">${todo.map(line).join("")}</div>` : N.show ? `<div class="glass"><div class="empty">Nothing left to try under ${esc(N.show)}.</div></div>` : `<div class="glass"><div class="empty">Seen a workout you want to try? Copy its link and save it here. Next time you train, it is one tap away.<br><button class="tp-btn tp-sm" data-act="savedAdd">Save a link</button></div></div>`) +
    (tried.length ? sect("Tried") + `<div class="glass">${tried.map(line).join("")}</div>` : "");
};
ACT.goSaved = () => go("saved");
ACT.savedShow = (d) => { N.show = d.v; render(); };

export function openSave(prefill = {}) {
  N.tag = prefill.tag || ""; N.id = prefill.id || null;
  const url = prefill.url || "";
  sheet(N.id ? "Edit saved workout" : "Save a workout to try", `${N.id ? "" : `<p class="small muted">In Instagram, tap Share, then Copy link. Come back here and paste it.</p>`}
    ${field("svurl", "Link", url, "https://", "url")}
    <button class="pillbtn mt" data-act="savedPaste">${"Paste from clipboard"}</button>
    ${field("svtitle", "What is it?", prefill.title || (url ? guessTitle(url) : ""), "e.g. Cable shoulder circuit")}
    <label class="tp-label">For</label>${chips("savedTag", TAGS.map((t) => [t, t]), N.tag)}
    ${field("svnote", "Note (optional)", prefill.note || "", "e.g. try on Upper 3")}
    <div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="savedSave">Save</button></div>`);
}
ACT.savedAdd = () => { closeSheet(); openSave(); };
ACT.savedTag = (d, el) => { N.tag = N.tag === d.v ? "" : d.v; [].forEach.call(el.parentNode.children, (x) => x.classList.toggle("on", x === el && !!N.tag)); };
ACT.savedPaste = async () => {
  try {
    const u = firstUrl(await navigator.clipboard.readText());
    if (!u) return toast("No link on the clipboard");
    document.getElementById("svurl").value = u;
    const t = document.getElementById("svtitle");
    if (!t.value) t.value = guessTitle(u);
  } catch (e) { toast("Could not read the clipboard. Press and hold the box to paste."); }
};
ACT.savedSave = () => {
  const url = firstUrl(val("svurl")), title = val("svtitle");
  if (!url) return toast("Paste a link that starts with https://");
  if (url.length > 2000) return toast("That link is too long");
  const fields = { url, title: (title || guessTitle(url)).slice(0, 120), tag: N.tag || null, note: val("svnote").slice(0, 500) || null };
  const old = N.id && S.saved.find((x) => x.id === N.id);
  if (old) touch(Object.assign(old, fields)); else S.saved.push(touch({ id: uid(), ...fields, tried_on: null, created_at: new Date().toISOString() }));
  N.id = null; save(); closeSheet();
  if (R.name === "saved" || R.name === "today") render();
  toast(old ? "Changes saved" : "Saved. It is on Today when you train.");
};
ACT.savedOpen = (d) => {
  const l = S.saved.find((x) => x.id === d.id);
  sheet(l.title, `<div class="kv"><span>From</span><b>${esc(host(l.url))}</b></div>${l.tag ? `<div class="kv"><span>For</span><b>${esc(l.tag)}</b></div>` : ""}${l.note ? `<div class="kv"><span>Note</span><b>${esc(l.note)}</b></div>` : ""}
    <a class="tp-btn tp-block mt" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open it</a>
    <button class="tp-btn tp-ghost tp-block mt" data-act="savedEdit" data-id="${l.id}">${icon("pencil")} Edit</button>
    <div class="acts"><button class="tp-btn tp-ghost" data-act="savedTried" data-id="${l.id}">${l.tried_on ? "Move back to try" : "Mark as tried"}</button><button class="tp-btn tp-danger" data-act="savedDelete" data-id="${l.id}">Delete</button></div>`);
};
ACT.savedEdit = (d) => { const l = S.saved.find((x) => x.id === d.id); closeSheet(); openSave({ id: l.id, url: l.url, title: l.title, tag: l.tag, note: l.note }); };
ACT.savedTried = (d) => { const l = S.saved.find((x) => x.id === d.id); l.tried_on = l.tried_on ? null : ymd(); touch(l); closeSheet(); render(); toast(l.tried_on ? "Marked as tried" : "Back on the list"); };
ACT.savedDelete = (d, el) => {
  if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.textContent = "Tap again to delete"; return; }
  const i = S.saved.findIndex((x) => x.id === d.id), [l] = S.saved.splice(i, 1);
  if (l.pushed) S.dels.push({ t: "saved_links", id: l.id });
  save(); closeSheet(); render();
};
