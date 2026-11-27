// Notifications.
//   1. This function puts a row in push_queue for the device, then sends it an empty Web Push "wake up".
//   2. The app's service worker wakes, asks this function for its queue ({action:"pull"}), and shows it.
// An empty push needs only a signed token (VAPID), so nothing about your training travels through
// Apple's or Google's push servers. The signing key pair is made here the first time and kept in push_keys.
// Called every hour by pg_cron ({"tick":true}) to send reminders at each person's chosen hour.
import { cors, dayIn, db, json, userOf } from "../_shared/util.ts";

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (s: string) => new TextEncoder().encode(s);
const CONTACT = Deno.env.get("PUSH_CONTACT") || "https://alphacorrections.github.io/spotter/";

let _keys: { pub: string; key: CryptoKey } | null = null;
async function keys() {
  if (_keys) return _keys;
  const sql = db();
  let rows = await sql`select pub, priv from public.push_keys where id = 1`;
  if (!rows.length) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
    await sql`insert into public.push_keys (id, pub, priv) values (1, ${pub}, ${sql.json(priv as never)}) on conflict (id) do nothing`;
    rows = await sql`select pub, priv from public.push_keys where id = 1`;
  }
  const key = await crypto.subtle.importKey("jwk", rows[0].priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  _keys = { pub: rows[0].pub, key };
  return _keys;
}

/* Wake one device. true = handed to the push service; false = that device is gone or unreachable. */
async function wake(endpoint: string): Promise<boolean> {
  const k = await keys(), sql = db();
  let aud = "";
  try { aud = new URL(endpoint).origin; } catch { await sql`delete from public.push_subs where endpoint = ${endpoint}`; return false; }
  const head = b64u(enc(JSON.stringify({ typ: "JWT", alg: "ES256" }))), claims = b64u(enc(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const sig = b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.key, enc(head + "." + claims)));
  let status = 0;
  try {
    const r = await fetch(endpoint, { method: "POST", headers: { Authorization: "vapid t=" + head + "." + claims + "." + sig + ", k=" + k.pub, TTL: "86400", Urgency: "normal", "Content-Length": "0" } });
    status = r.status; await r.body?.cancel();
  } catch { status = 0; }
  if (status === 404 || status === 410) { await sql`delete from public.push_subs where endpoint = ${endpoint}`; return false; }
  if (status >= 200 && status < 300) { await sql`update public.push_subs set last_ok = now(), fails = 0 where endpoint = ${endpoint}`; return true; }
  await sql`update public.push_subs set fails = fails + 1 where endpoint = ${endpoint}`;
  await sql`delete from public.push_subs where endpoint = ${endpoint} and fails >= 12`;
  return false;
}

type Note = { title: string; body: string; tag: string; url: string };
async function notify(uid: string, n: Note): Promise<number> {
  const sql = db(), subs = await sql`select endpoint from public.push_subs where user_id = ${uid}`;
  let ok = 0;
  for (const s of subs) {
    await sql`insert into public.push_queue (endpoint, title, body, tag, url) values (${s.endpoint}, ${n.title.slice(0, 120)}, ${n.body.slice(0, 300)}, ${n.tag.slice(0, 60)}, ${n.url.slice(0, 200)})`;
    if (await wake(s.endpoint)) ok++;
  }
  return ok;
}
/* Send once: the key says what this reminder is (for example "train:2026-11-27"). */
async function once(uid: string, key: string, n: Note): Promise<boolean> {
  const r = await db()`insert into public.push_sent (user_id, key) values (${uid}, ${key}) on conflict do nothing returning key`;
  if (!r.length) return false;
  await notify(uid, n);
  return true;
}

function localNow(tz: string) {
  let wd = 0, hr = 0;
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date());
    wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.find((x) => x.type === "weekday")!.value);
    hr = +p.find((x) => x.type === "hour")!.value % 24;
  } catch { /* fall back to Sunday midnight */ }
  return { wd, hr };
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);

/* The hourly run: for each person who turned notifications on, send what is due at their chosen hour. */
async function tick() {
  const sql = db();
  const people = await sql`select p.* from public.push_prefs p where exists (select 1 from public.push_subs s where s.user_id = p.user_id)`;
  let sent = 0;
  for (const p of people) {
    try {
      const tz = p.tz || "America/New_York", now = localNow(tz);
      const mobHours: number[] = (p.mobility_hours || []).map(Number);
      const due = { train: p.train && now.hr === +p.train_hour, mob: p.mobility && mobHours.includes(now.hr), week: p.weekly && now.wd === +p.weekly_day && now.hr === +p.weekly_hour };
      if (!due.train && !due.mob && !due.week) continue;
      const today = dayIn(tz);
      const acts = await sql`select domain, started_at from public.activities where user_id = ${p.user_id} and ended_at is not null and started_at > now() - interval '15 days' order by started_at desc`;
      const days = (domain: string) => acts.filter((a) => a.domain === domain).map((a) => dayIn(tz, a.started_at));
      if (due.train) {
        const lifts = days("strength");
        // Only after two quiet days, and only for two weeks: a nudge, not a nag.
        if (lifts.length && lifts[0] !== today) {
          const gap = daysBetween(lifts[0], today);
          if (gap >= 2 && gap <= 14 && await once(p.user_id, "train:" + today, { title: plural(gap, "day", "days") + " since your last session", body: "Your next session is ready when you are. Missed days just shift forward, nothing is lost.", tag: "train", url: "#today" })) sent++;
        }
      }
      if (due.mob) {
        // Skipped if a routine was logged in the two hours before this reminder.
        const recent = acts.some((a) => a.domain === "mobility" && Date.now() - new Date(a.started_at).getTime() < 2 * 3600e3);
        const first = now.hr === Math.min(...mobHours);
        const note = first && now.hr < 11
          ? { title: "Morning mobility", body: "Five to ten minutes to get blood moving. A routine is picked for you on Today." }
          : { title: "Movement break", body: "Stand up and loosen up for five minutes. A routine is picked for you on Today." };
        if (!recent && await once(p.user_id, "mob:" + today + ":" + now.hr, { ...note, tag: "mobility", url: "#today" })) sent++;
      }
      if (due.week) {
        const wk = acts.filter((a) => daysBetween(dayIn(tz, a.started_at), today) < 7);
        const n = (d: string) => wk.filter((a) => a.domain === d).length;
        const parts = [n("strength") && plural(n("strength"), "lift", "lifts"), n("cardio") && plural(n("cardio"), "cardio session", "cardio sessions"), n("yoga") && plural(n("yoga"), "yoga session", "yoga sessions"), n("mobility") && plural(n("mobility"), "mobility session", "mobility sessions")].filter(Boolean);
        if (await once(p.user_id, "week:" + today, { title: "Your week", body: (parts.length ? parts.join(", ") + "." : "Nothing logged this week.") + " Open Progress to see what moved.", tag: "weekly", url: "#progress" })) sent++;
      }
    } catch (e) { console.error("push tick", p.user_id, e); }
  }
  await sql`delete from public.push_queue where created_at < now() - interval '3 days'`;
  await sql`delete from public.push_sent where at < now() - interval '45 days'`;
  return { ok: true, sent };
}

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
// deno-lint-ignore no-explicit-any
async function savePrefs(uid: string, b: any) {
  const sql = db(), f = b.prefs || {};
  let tz = String(b.tz || "America/New_York").slice(0, 60);
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = "America/New_York"; }
  const hr = (v: unknown, d: number) => (v == null || isNaN(+v) ? d : Math.min(23, Math.max(0, Math.round(+v))));
  const mob = [...new Set((Array.isArray(f.mobility_hours) ? f.mobility_hours : [7]).map((v: unknown) => hr(v, 7)))].slice(0, 8) as number[];
  const day = Math.min(6, Math.max(0, Math.round(+f.weekly_day) || 0));
  await sql`insert into public.push_prefs (user_id, tz, train, train_hour, mobility, mobility_hours, friends, weekly, weekly_day, weekly_hour)
            values (${uid}, ${tz}, ${bool(f.train, true)}, ${hr(f.train_hour, 17)}, ${bool(f.mobility, false)}, ${mob.length ? mob : [7]}, ${bool(f.friends, true)}, ${bool(f.weekly, true)}, ${day}, ${hr(f.weekly_hour, 18)})
            on conflict (user_id) do update set tz = excluded.tz, train = excluded.train, train_hour = excluded.train_hour, mobility = excluded.mobility, mobility_hours = excluded.mobility_hours,
              friends = excluded.friends, weekly = excluded.weekly, weekly_day = excluded.weekly_day, weekly_hour = excluded.weekly_hour, updated_at = now()`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({})), sql = db();
    if (b.tick) return json(await tick());

    /* A device asking what to show. The endpoint address is long and unguessable, and only that device has it. */
    if (b.action === "pull") {
      const ep = String(b.endpoint || "");
      if (!ep) return json({ ok: false, items: [] });
      const rows = await sql`update public.push_queue set fetched_at = now() where endpoint = ${ep} and fetched_at is null and created_at > now() - interval '2 days' returning id, title, body, tag, url`;
      rows.sort((x, y) => Number(x.id) - Number(y.id));
      return json({ ok: true, items: rows.map((r) => ({ title: r.title, body: r.body, tag: r.tag, url: r.url })) });
    }

    const user = await userOf(req);
    if (!user) return json({ ok: false, error: "Sign in again." }, 401);
    if (b.action === "key") return json({ ok: true, key: (await keys()).pub });
    if (b.action === "sub") {
      const ep = String(b.endpoint || "");
      if (!/^https:\/\/[^\s]{20,1000}$/.test(ep)) return json({ ok: false, error: "That does not look like a notification address." });
      await sql`insert into public.push_subs (endpoint, user_id, ua) values (${ep}, ${user.id}, ${String(b.ua || "").slice(0, 200)})
                on conflict (endpoint) do update set user_id = excluded.user_id, ua = excluded.ua, fails = 0`;
      await savePrefs(user.id, b);
      return json({ ok: true });
    }
    if (b.action === "prefs") { await savePrefs(user.id, b); return json({ ok: true }); }
    if (b.action === "unsub") { await sql`delete from public.push_subs where endpoint = ${String(b.endpoint || "")} and user_id = ${user.id}`; return json({ ok: true }); }
    if (b.action === "status") {
      const mine = b.endpoint ? await sql`select 1 from public.push_subs where endpoint = ${String(b.endpoint)} and user_id = ${user.id}` : [];
      const p = await sql`select train, train_hour, mobility, mobility_hours, friends, weekly, weekly_day, weekly_hour from public.push_prefs where user_id = ${user.id}`;
      return json({ ok: true, here: mine.length > 0, prefs: p[0] || null });
    }
    if (b.action === "test") {
      const n = await notify(user.id, { title: "Spotter notifications are on", body: "This is what a reminder looks like. You pick which ones you get.", tag: "test", url: "" });
      return json(n ? { ok: true, devices: n } : { ok: false, error: "No device could be reached. Turn notifications off and on again on this phone." });
    }
    /* Someone finished a workout: tell the friends who share a group with them and asked to hear about it. */
    if (b.action === "done") {
      const title = String(b.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const me = await sql`select display_name from public.profiles where id = ${user.id}`;
      const name = (me[0] && me[0].display_name) || "A friend";
      // One row per friend. If any shared group is set to names only, the workout title stays out.
      const friends = await sql`
        select o.user_id, bool_and(m.detail_level = 'full') as full
        from public.group_members m join public.group_members o on o.group_id = m.group_id and o.user_id <> m.user_id
        join public.push_prefs p on p.user_id = o.user_id and p.friends
        where m.user_id = ${user.id} group by o.user_id`;
      let n = 0;
      for (const f of friends) {
        const body = f.full && title ? title + ". Open Friends to react." : "Open Friends to react.";
        if (await once(f.user_id, "f:" + user.id + ":" + dayIn("UTC") + ":" + title, { title: name + " finished a workout", body, tag: "friend-" + user.id, url: "#friends" })) n++;
      }
      return json({ ok: true, told: n });
    }
    return json({ ok: false, error: "Unknown request." });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) });
  }
});
