// Oura link. The app asks for a sign-in address, the person approves on Oura's own page, and Oura sends
// them back here with a code. This function swaps the code for tokens, keeps them in wearable_links
// (server-only), and copies sleep, readiness, resting heart rate, HRV and steps into daily_health.
import postgres from "npm:postgres@3.4.5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
let _sql: ReturnType<typeof postgres> | null = null;
const db = () => (_sql ||= postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 }));
const APP = "https://alphacorrections.github.io/spotter/";
const SELF = Deno.env.get("SUPABASE_URL") + "/functions/v1/oura";
const ID = () => Deno.env.get("OURA_CLIENT_ID") || "", SECRET = () => Deno.env.get("OURA_CLIENT_SECRET") || "";
const UA = { "User-Agent": "Spotter/1.0" };

async function userOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return null;
  const r = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { apikey: req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return (u && u.id) || null;
}
async function token(params: Record<string, string>) {
  const r = await fetch("https://api.ouraring.com/oauth/token", { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, client_id: ID(), client_secret: SECRET() }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Oura refused the sign-in (" + r.status + ")");
  return j as { access_token: string; refresh_token?: string; expires_in?: number };
}
async function keep(uid: string, t: { access_token: string; refresh_token?: string; expires_in?: number }) {
  const exp = new Date(Date.now() + (Number(t.expires_in) || 86400) * 1000);
  await db()`insert into public.wearable_links (user_id, provider, access_token, refresh_token, expires_at) values (${uid}, 'oura', ${t.access_token}, ${t.refresh_token ?? null}, ${exp})
             on conflict (user_id, provider) do update set access_token = excluded.access_token, refresh_token = coalesce(excluded.refresh_token, public.wearable_links.refresh_token), expires_at = excluded.expires_at, last_error = null`;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const clamp = (v: unknown, lo: number, hi: number) => (v == null || isNaN(+v) ? null : Math.min(hi, Math.max(lo, Math.round(+v))));

/* Copy the last `days` days from Oura into daily_health. Returns how many days were written. */
async function sync(uid: string, days: number): Promise<number> {
  const sql = db();
  let link = (await sql`select access_token, refresh_token, expires_at from public.wearable_links where user_id = ${uid} and provider = 'oura'`)[0];
  if (!link) throw new Error("Oura is not linked.");
  if (new Date(link.expires_at).getTime() - Date.now() < 10 * 60e3 && link.refresh_token) {
    // Refresh tokens work once: save the new pair before doing anything else.
    await keep(uid, await token({ grant_type: "refresh_token", refresh_token: link.refresh_token }));
    link = (await sql`select access_token from public.wearable_links where user_id = ${uid} and provider = 'oura'`)[0];
  }
  const q = "?start_date=" + iso(new Date(Date.now() - days * 864e5)) + "&end_date=" + iso(new Date(Date.now() + 864e5));
  // deno-lint-ignore no-explicit-any
  const get = async (path: string): Promise<any[]> => {
    const r = await fetch("https://api.ouraring.com/v2/usercollection/" + path + q, { headers: { ...UA, Authorization: "Bearer " + link.access_token } });
    if (r.status === 401) throw new Error("Oura access ended. Connect again.");
    if (!r.ok) return [];
    return ((await r.json()).data || []);
  };
  const [ds, dr, da, sl] = await Promise.all([get("daily_sleep"), get("daily_readiness"), get("daily_activity"), get("sleep")]);
  const by: Record<string, Record<string, number | null>> = {};
  const row = (d: string) => (by[d] ||= {});
  for (const x of ds) if (x.day) row(x.day).sleep_score = clamp(x.score, 0, 100);
  for (const x of dr) if (x.day) row(x.day).readiness = clamp(x.score, 0, 100);
  for (const x of da) if (x.day) row(x.day).steps = clamp(x.steps, 0, 200000);
  for (const x of sl) {
    if (!x.day || (x.type && x.type !== "long_sleep")) continue;
    const mins = clamp((x.total_sleep_duration || 0) / 60, 0, 1440) || 0;
    if (mins <= (row(x.day).sleep_minutes || 0)) continue;   // keep the main sleep of the night
    Object.assign(row(x.day), { sleep_minutes: mins, resting_hr: clamp(x.lowest_heart_rate, 20, 150), hrv_ms: clamp(x.average_hrv, 0, 400) });
  }
  let n = 0;
  for (const [day, v] of Object.entries(by)) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day)) continue;
    await sql`insert into public.daily_health (user_id, day, source, steps, sleep_minutes, sleep_score, readiness, resting_hr, hrv_ms, synced_at)
              values (${uid}, ${day}, 'oura', ${v.steps ?? null}, ${v.sleep_minutes ?? null}, ${v.sleep_score ?? null}, ${v.readiness ?? null}, ${v.resting_hr ?? null}, ${v.hrv_ms ?? null}, now())
              on conflict (user_id, day, source) do update set steps = coalesce(excluded.steps, public.daily_health.steps), sleep_minutes = coalesce(excluded.sleep_minutes, public.daily_health.sleep_minutes),
                sleep_score = coalesce(excluded.sleep_score, public.daily_health.sleep_score), readiness = coalesce(excluded.readiness, public.daily_health.readiness),
                resting_hr = coalesce(excluded.resting_hr, public.daily_health.resting_hr), hrv_ms = coalesce(excluded.hrv_ms, public.daily_health.hrv_ms), synced_at = now()`;
    n++;
  }
  await sql`update public.wearable_links set last_sync = now(), last_error = null where user_id = ${uid} and provider = 'oura'`;
  return n;
}
async function safeSync(uid: string, days: number) {
  try { return { ok: true, days: await sync(uid, days) }; }
  catch (e) { const m = String((e as Error)?.message || e).slice(0, 200); await db()`update public.wearable_links set last_error = ${m} where user_id = ${uid} and provider = 'oura'`; return { ok: false, error: m }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sql = db(), back = (msg: string) => Response.redirect(APP + "?oura=" + msg + "#wear", 302);
  try {
    if (req.method === "GET") {   // Oura sending the person back
      const u = new URL(req.url), code = u.searchParams.get("code"), state = u.searchParams.get("state") || "";
      const st = (await sql`delete from public.oauth_states where state = ${state} and provider = 'oura' and created_at > now() - interval '15 minutes' returning user_id`)[0];
      if (!code || !st) return back("failed");
      await keep(st.user_id, await token({ grant_type: "authorization_code", code, redirect_uri: SELF }));
      await safeSync(st.user_id, 30);
      return back("linked");
    }
    const b = await req.json().catch(() => ({}));
    if (b.tick) {
      const due = await sql`select user_id from public.wearable_links where provider = 'oura' and (last_sync is null or last_sync < now() - interval '3 hours') limit 50`;
      let n = 0;
      for (const d of due) if ((await safeSync(d.user_id, 7)).ok) n++;
      await sql`delete from public.oauth_states where created_at < now() - interval '1 day'`;
      return json({ ok: true, synced: n });
    }
    const uid = await userOf(req);
    if (!uid) return json({ ok: false, error: "Sign in again." }, 401);
    if (b.action === "start") {
      if (!ID() || !SECRET()) return json({ ok: false, error: "Oura is not set up on the server yet." });
      const state = crypto.randomUUID() + crypto.randomUUID();
      await sql`insert into public.oauth_states (state, user_id, provider) values (${state}, ${uid}, 'oura')`;
      return json({ ok: true, url: "https://cloud.ouraring.com/oauth/authorize?" + new URLSearchParams({ response_type: "code", client_id: ID(), redirect_uri: SELF, scope: "daily heartrate workout", state }) });
    }
    if (b.action === "status") {
      const l = (await sql`select linked_at, last_sync, last_error from public.wearable_links where user_id = ${uid} and provider = 'oura'`)[0];
      return json({ ok: true, linked: !!l, last_sync: l?.last_sync ?? null, error: l?.last_error ?? null });
    }
    if (b.action === "sync") return json(await safeSync(uid, 14));
    if (b.action === "unlink") {
      const l = (await sql`delete from public.wearable_links where user_id = ${uid} and provider = 'oura' returning access_token`)[0];
      if (l) await fetch("https://api.ouraring.com/oauth/revoke?access_token=" + encodeURIComponent(l.access_token), { method: "POST", headers: UA }).catch(() => {});
      return json({ ok: true });
    }
    return json({ ok: false, error: "Unknown request." });
  } catch (e) {
    if (req.method === "GET") return back("failed");
    return json({ ok: false, error: String((e as Error)?.message || e) });
  }
});
