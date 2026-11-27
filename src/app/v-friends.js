// Friends: groups joined by a six-character code, a feed of finished sessions,
// and group blocks you run alongside each other. Needs an account and a connection.
import { S, touch, save, ex, ago, finished, activeBlock, fmtW, fmtN } from "./store.js";
import { ACT, VIEWS, R, go, render, top, sect, row, note, icon, esc, pill, sheet, closeSheet, toast, field, val } from "./ui.js";
import { CLOUD } from "./cloud.js";
import { syncNow } from "./sync.js";
import { startBlock, pos } from "./train.js";
import { blockPosition } from "../engine/progression.mjs";
import { subline, ICON } from "./v-progress.js";
import { saveAsProgram } from "./v-plans.js";
import { currentTarget } from "./v-coach.js";

const G = { loaded: false, loading: false, error: null, groups: [], members: [], feed: [], reactions: [], comments: [], gblocks: [], runs: [], cur: null };
const REACT = ["💪", "🔥", "👏"];
export function resetFriends() { Object.assign(G, { loaded: false, groups: [], members: [], feed: [], reactions: [], comments: [], gblocks: [], runs: [], cur: null, error: null }); }

async function load() {
  if (G.loading) return;
  G.loading = true; G.error = null;
  try {
    await syncNow();
    const uid = CLOUD.uid();
    const [groups, members, gblocks, feed, runs, reactions, comments] = await Promise.all([
      CLOUD.get("groups?select=id,name,code,created_by&order=created_at"),
      CLOUD.get("group_members?select=group_id,user_id,role,detail_level,profiles(display_name)"),
      CLOUD.get("group_blocks?select=id,group_id,program_id,author_id,title,started_on,programs(title,weeks,days_per_week,focus,template)&order=created_at.desc"),
      CLOUD.get(`activities?user_id=neq.${uid}&ended_at=not.is.null&source=neq.import&or=(note.is.null,note.not.like.Imported from your sheet*)&order=started_at.desc&limit=40&select=id,user_id,domain,title,started_at,duration_s,note,link_url,efforts(exercise_id,kind,weight,reps,steps,distance_m,hr_zone,duration_s,seq)`),
      CLOUD.get("blocks?group_block_id=not.is.null&select=id,user_id,group_block_id,position,status"),
      CLOUD.get("reactions?select=activity_id,group_id,user_id,emoji"),
      CLOUD.get("comments?select=id,group_id,user_id,activity_id,group_block_id,week,body,created_at&order=created_at"),
    ]);
    Object.assign(G, { groups, members, gblocks, feed, runs, reactions, comments, loaded: true });
    if (!G.cur || !groups.some((g) => g.id === G.cur)) G.cur = groups[0]?.id || null;
  } catch (e) { G.error = e.message || "Could not load your groups"; }
  G.loading = false;
  if (R.name === "friends") render();
}
const nameOf = (uid) => (uid === CLOUD.uid() ? "You" : G.members.find((m) => m.user_id === uid)?.profiles?.display_name || "Someone");
const membersOf = (gid) => G.members.filter((m) => m.group_id === gid);

function feedCard(a, gid) {
  const mine = a.user_id === CLOUD.uid(), ef = (a.efforts || []).slice().sort((x, y) => (x.seq || 0) - (y.seq || 0));
  let detail = "";
  if (a.domain === "strength" && ef.length) {
    const by = new Map();
    for (const e of ef) if (e.kind === "work" && e.exercise_id) { if (!by.has(e.exercise_id)) by.set(e.exercise_id, []); by.get(e.exercise_id).push(e); }
    const lines = [...by.entries()];
    detail = `<div class="feedsets">` + lines.slice(0, 5).map(([id, es]) => `<div><span>${esc(ex(id).name)}</span><b class="num">${esc(es.map((e) => (e.weight != null ? fmtW(e.weight) + "×" : "") + fmtN(e.reps)).join("  "))}</b></div>`).join("") +
      (lines.length > 5 ? `<div class="muted">+ ${lines.length - 5} more lifts</div>` : "") + `</div>`;
  }
  const rs = G.reactions.filter((r) => r.activity_id === a.id && r.group_id === gid), my = rs.find((r) => r.user_id === CLOUD.uid());
  const cs = G.comments.filter((c) => c.activity_id === a.id && c.group_id === gid);
  return `<div class="glass pad feed"><div class="feedhead"><span class="tp-tile">${icon(ICON[a.domain] || "dumbbell")}</span><div class="grow"><b>${esc(nameOf(a.user_id))} · ${esc(a.title)}</b><span>${esc(ago(a.started_at))} · ${esc(subline(a))}</span></div></div>
    ${a.note ? `<p class="feednote">“${esc(a.note)}”</p>` : ""}${detail}
    ${cs.map((c) => `<div class="cmt"><b>${esc(nameOf(c.user_id))}</b> ${esc(c.body)}</div>`).join("")}
    <div class="reacts">${REACT.map((em) => { const n = rs.filter((r) => r.emoji === em).length; return `<button class="chip${my?.emoji === em ? " on" : ""}" data-act="react" data-id="${a.id}" data-e="${em}" aria-label="React ${em}"${mine ? " disabled" : ""}>${em}${n ? " " + n : ""}</button>`; }).join("")}
    <button class="chip" data-act="cmtOpen" data-id="${a.id}">Comment</button></div></div>`;
}

function blockCard(gb, gid) {
  const tpl = gb.programs?.template, len = tpl ? tpl.rotation.length : 7;
  const runs = G.runs.filter((r) => r.group_block_id === gb.id), mine = S.blocks.find((b) => b.group_block_id === gb.id);
  const wk = (position) => Math.min(Math.floor(position / len) + 1, tpl?.weeks || 99);
  const myWeek = mine ? wk(mine.position) : runs.length ? Math.max(...runs.map((r) => wk(r.position))) : 1;
  const talk = G.comments.filter((c) => c.group_block_id === gb.id && c.week === myWeek);
  return `<div class="glass pad"><div class="feedhead"><span class="tp-tile">${icon("list")}</span><div class="grow"><b>${esc(gb.title)}</b><span>Shared by ${esc(nameOf(gb.author_id))} · ${gb.programs ? gb.programs.days_per_week + " days a week, " + gb.programs.weeks + " weeks" : ""}</span></div></div>
    <div class="deep mt">${runs.map((r) => `<div class="kv"><span>${esc(nameOf(r.user_id))}</span><b>${r.status === "done" ? "Finished" : "Week " + wk(r.position)}</b></div>`).join("") || `<div class="small muted">Nobody has started it yet.</div>`}</div>
    ${talk.length ? `<div class="mt">` + talk.map((c) => `<div class="cmt"><b>${esc(nameOf(c.user_id))}</b> ${esc(c.body)}</div>`).join("") + `</div>` : ""}
    <div class="flex mt">${mine ? "" : `<button class="tp-btn tp-sm" data-act="gbJoin" data-id="${gb.id}">Run this with them</button>`}<button class="tp-btn tp-ghost tp-sm" data-act="cmtOpen" data-gb="${gb.id}" data-w="${myWeek}">Talk about week ${myWeek}</button></div></div>`;
}

VIEWS.friends = () => {
  let h = top("Friends", "Train alongside your people");
  if (!CLOUD.ready()) return h + `<div class="glass"><div class="empty">Accounts are not switched on in this build yet. Everything else works, and your data stays on this phone.</div></div>`;
  if (!CLOUD.on()) return h + `<div class="glass hero"><div class="label">Groups</div><div class="heroT">Sign in to train with friends</div><div class="small muted">Join a group with a six-character code. See each other's sessions, cheer them on, and run the same plan side by side. Nothing is public.</div>
    <div class="flex mt"><button class="tp-btn" data-act="signIn">Sign in with email</button></div></div>`;
  if (!G.loaded && !G.error) { load(); return h + `<div class="glass"><div class="empty">Loading your groups…</div></div>`; }
  if (G.error) return h + `<div class="glass"><div class="empty">${esc(G.error)}. Groups need a connection.<br><button class="tp-btn tp-sm" data-act="frReload">Try again</button></div></div>`;
  if (!G.groups.length) return h + `<div class="glass hero"><div class="label">No group yet</div><div class="heroT">Start one, or join with a code</div><div class="small muted">A group is a handful of people. Whoever starts it gets a code to text to the others.</div>
    <div class="flex mt"><button class="tp-btn" data-act="grCreate">Start a group</button><button class="tp-btn tp-ghost" data-act="grJoin">I have a code</button></div></div>`;
  const g = G.groups.find((x) => x.id === G.cur) || G.groups[0], ms = membersOf(g.id), me = ms.find((m) => m.user_id === CLOUD.uid());
  h += `<div class="chips">${G.groups.map((x) => `<button class="chip${x.id === g.id ? " on" : ""}" data-act="grPick" data-id="${x.id}">${esc(x.name)}</button>`).join("")}<button class="chip" data-act="grMore" aria-label="Add a group">+ Group</button></div>`;
  h = top("Friends", "Train alongside your people", `<button class="coachbtn" data-act="grInvite" data-id="${g.id}">${icon("plus")}Invite</button>`) + h.slice(top("Friends", "Train alongside your people").length);
  h += `<div class="glass pad mt">
    <div class="small muted">${ms.length} member${ms.length === 1 ? "" : "s"}: ${esc(ms.map((m) => nameOf(m.user_id)).join(", "))}</div>
    <div class="flex mt"><button class="pillbtn" data-act="grPrivacy" data-id="${g.id}" data-cur="${me?.detail_level || "full"}">You share: ${me?.detail_level === "names_only" ? "session names only" : "full detail"}</button><button class="pillbtn" data-act="grLeaveAsk" data-id="${g.id}">Leave</button></div></div>`;
  const gbs = G.gblocks.filter((b) => b.group_id === g.id);
  h += sect("Group blocks", activeBlock() ? `<button data-act="gbShareAsk" data-id="${g.id}">Share my plan</button>` : "");
  h += gbs.length ? gbs.map((b) => blockCard(b, g.id)).join("") : `<div class="glass"><div class="empty">Share the plan you are running and the others can run it with you, each on their own weights.</div></div>`;
  const ids = new Set(ms.map((m) => m.user_id));
  const own = finished().filter((a) => a.pushed).map((a) => ({ ...a, user_id: CLOUD.uid() }));
  const feed = G.feed.filter((a) => ids.has(a.user_id)).concat(own).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 30);
  h += sect("Feed", `<button data-act="frReload">Refresh</button>`);
  h += feed.length ? feed.map((a) => feedCard(a, g.id)).join("") : `<div class="glass"><div class="empty">Finished sessions show up here.</div></div>`;
  return h;
};
ACT.frReload = () => { G.loaded = false; G.error = null; render(); };
ACT.grPick = (d) => { G.cur = d.id; render(); };
ACT.grMore = () => sheet("Add a group", `<div class="acts"><button class="tp-btn" data-act="grCreate">Start a group</button><button class="tp-btn tp-ghost" data-act="grJoin">I have a code</button></div>`);
ACT.grCreate = () => sheet("Start a group", `${field("grname", "Group name", "", "e.g. Saturday Lifters")}<div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="grCreateDo">Create</button></div>`);
ACT.grCreateDo = async () => {
  const name = val("grname");
  if (!name) return toast("Give it a name");
  try { await syncNow(); const g = await CLOUD.rpc("create_group", { group_name: name }); G.cur = g.id; closeSheet(); G.loaded = false; render(); toast(`Code ${g.code}. Text it to your friends.`); }
  catch (e) { toast(e.message); }
};
ACT.grJoin = () => sheet("Join a group", `${field("grcode", "Six-character code", "", "e.g. K7M2QX")}<div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="grJoinDo">Join</button></div>`);
ACT.grJoinDo = async () => {
  const code = val("grcode").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return toast("The code is six characters");
  try { await syncNow(); G.cur = await CLOUD.rpc("join_group", { join_code: code }); closeSheet(); G.loaded = false; render(); toast("You are in"); }
  catch (e) { toast(/no group/i.test(e.message) ? "No group has that code" : e.message); }
};
// Invite: the code, big enough to read out, with share and copy.
ACT.grInvite = (d) => {
  const g = G.groups.find((x) => x.id === d.id); if (!g) return;
  sheet(`Invite to ${g.name}`, `<p class="muted">Anyone with this code can join. Text it to them.</p>
    <div class="glass pad" style="text-align:center"><div class="small muted">Group code</div><div class="code num" style="font-size:44px;letter-spacing:.18em">${esc(g.code)}</div></div>
    <div class="acts"><button class="tp-btn" data-act="grShare" data-code="${esc(g.code)}" data-name="${esc(g.name)}">${icon("share")} Share invite</button><button class="tp-btn tp-ghost" data-act="grCopy" data-code="${esc(g.code)}">${icon("copy")} Copy code</button></div>
    <p class="small muted mt">They open Spotter, tap Friends, then I have a code.</p>`);
};
ACT.grCopy = async (d) => { try { await navigator.clipboard.writeText(d.code); toast("Code copied"); } catch (e) { toast(`Code: ${d.code}`); } };
ACT.grShare = async (d) => {
  const text = `Join my Spotter group "${d.name}" with code ${d.code}: ${location.href.split("#")[0]}`;
  try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("Invite copied"); } }
  catch (e) { toast(`Code: ${d.code}`); }
};
ACT.grPrivacy = async (d) => {
  const next = d.cur === "full" ? "names_only" : "full";
  try { await CLOUD.patch("group_members", `group_id=eq.${d.id}&user_id=eq.${CLOUD.uid()}`, { detail_level: next }); G.loaded = false; render(); toast(next === "full" ? "This group sees your sets and weights" : "This group sees session names only"); }
  catch (e) { toast(e.message); }
};
ACT.grLeaveAsk = (d) => sheet("Leave this group?", `<p class="muted">You stop seeing their sessions and they stop seeing yours. Your own history is untouched. You can rejoin with the code.</p><div class="acts"><button class="tp-btn tp-ghost" data-close>Stay</button><button class="tp-btn tp-danger" data-act="grLeaveDo" data-id="${d.id}">Leave</button></div>`);
ACT.grLeaveDo = async (d) => { try { await CLOUD.del("group_members", `group_id=eq.${d.id}&user_id=eq.${CLOUD.uid()}`); closeSheet(); G.cur = null; G.loaded = false; render(); } catch (e) { toast(e.message); } };

ACT.react = async (d) => {
  const uid = CLOUD.uid(), had = G.reactions.find((r) => r.activity_id === d.id && r.group_id === G.cur && r.user_id === uid);
  try {
    if (had) await CLOUD.del("reactions", `activity_id=eq.${d.id}&group_id=eq.${G.cur}&user_id=eq.${uid}`);
    G.reactions = G.reactions.filter((r) => r !== had);
    if (!had || had.emoji !== d.e) { const r = { activity_id: d.id, group_id: G.cur, user_id: uid, emoji: d.e }; await CLOUD.insert("reactions", r); G.reactions.push(r); }
    render();
  } catch (e) { toast(e.message); }
};
ACT.cmtOpen = (d) => sheet(d.gb ? `Week ${d.w}` : "Comment", `${field("cmtbody", "Say something", "", "")}<div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="cmtSend" data-id="${d.id || ""}" data-gb="${d.gb || ""}" data-w="${d.w || ""}">Post</button></div>`);
ACT.cmtSend = async (d) => {
  const body = val("cmtbody");
  if (!body) return toast("Write something first");
  const c = { group_id: G.cur, user_id: CLOUD.uid(), body, activity_id: d.id || null, group_block_id: d.gb || null, week: d.gb ? +d.w : null };
  try { const [saved] = await CLOUD.insert("comments", c); G.comments.push(saved || c); closeSheet(); render(); } catch (e) { toast(e.message); }
};

// ---------------------------------------------------------------- group blocks
ACT.gbShareAsk = (d) => {
  const b = activeBlock();
  sheet("Share my plan", `<p class="muted">${esc(b.title)} goes to this group as a block others can run. They get their own copy: their weights, their swaps. Nothing they change touches yours.</p>
    ${field("gbtitle", "Name it", b.title)}<div class="acts"><button class="tp-btn tp-ghost" data-close>Cancel</button><button class="tp-btn" data-act="gbShareDo" data-id="${d.id}">Share</button></div>`);
};
ACT.gbShareDo = async (d) => {
  const b = activeBlock(), title = val("gbtitle") || b.title;
  try {
    const p = saveAsProgram(b, title);
    await syncNow();                                   // the program has to exist on the server first
    const [gb] = await CLOUD.insert("group_blocks", { group_id: d.id, program_id: p.id, author_id: CLOUD.uid(), title });
    b.group_block_id = gb.id; b.program_id = p.id; touch(b);
    await syncNow();
    closeSheet(); G.loaded = false; render(); toast("Shared with the group");
  } catch (e) { toast(e.message); }
};
ACT.gbJoin = (d) => {
  const gb = G.gblocks.find((x) => x.id === d.id), tpl = gb.programs.template, len = tpl.rotation.length;
  const runs = G.runs.filter((r) => r.group_block_id === gb.id), week = runs.length ? Math.min(tpl.weeks, Math.max(...runs.map((r) => Math.floor(r.position / len) + 1))) : 1;
  const cur = activeBlock();
  sheet(gb.title, `<p class="muted">You get your own copy. Start from the top, or jump in where the group is so you are all on the same week.${cur ? ` This pauses ${esc(cur.title)}.` : ""}</p>
    <div class="acts"><button class="tp-btn tp-ghost" data-act="gbJoinDo" data-id="${gb.id}" data-w="1">Start at week 1</button>${week > 1 ? `<button class="tp-btn" data-act="gbJoinDo" data-id="${gb.id}" data-w="${week}">Jump to week ${week}</button>` : ""}</div>`);
};
ACT.gbJoinDo = async (d) => {
  const gb = G.gblocks.find((x) => x.id === d.id), tpl = gb.programs.template;
  startBlock({ ...tpl, title: gb.title }, { groupBlockId: gb.id, programId: gb.program_id, position: (+d.w - 1) * tpl.rotation.length, nutritionPhase: currentTarget()?.phase });
  closeSheet(); await syncNow(); G.loaded = false; go("today"); toast(`Running ${gb.title}`);
};
export { blockPosition, pos, save, note, row };
