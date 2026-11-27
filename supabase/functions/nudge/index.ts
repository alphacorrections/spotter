// Wakes the phones that have a notice waiting. Called by the database right after it queues one.
// It takes no input and can only wake devices that already have something queued, so it is safe to leave open.
import postgres from "npm:postgres@3.4.5";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (s: string) => new TextEncoder().encode(s);
Deno.serve(async () => {
  try {
    const rows = await sql`update public.push_queue set pending = false where pending and fetched_at is null and created_at > now() - interval '15 minutes' returning endpoint`;
    const eps = [...new Set(rows.map((r) => r.endpoint as string))];
    if (!eps.length) return Response.json({ ok: true, woke: 0 });
    const k = (await sql`select pub, priv from public.push_keys where id = 1`)[0];
    if (!k) return Response.json({ ok: false, error: "no keys yet" });
    const key = await crypto.subtle.importKey("jwk", k.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    let woke = 0;
    for (const ep of eps) {
      const head = b64u(enc(JSON.stringify({ typ: "JWT", alg: "ES256" }))), claims = b64u(enc(JSON.stringify({ aud: new URL(ep).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://alphacorrections.github.io/spotter/" })));
      const sig = b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc(head + "." + claims)));
      const r = await fetch(ep, { method: "POST", headers: { Authorization: "vapid t=" + head + "." + claims + "." + sig + ", k=" + k.pub, TTL: "86400", Urgency: "normal", "Content-Length": "0" } }).catch(() => null);
      if (r) await r.body?.cancel();
      if (r && r.status >= 200 && r.status < 300) { woke++; await sql`update public.push_subs set last_ok = now(), fails = 0 where endpoint = ${ep}`; }
      else if (r && (r.status === 404 || r.status === 410)) await sql`delete from public.push_subs where endpoint = ${ep}`;
    }
    return Response.json({ ok: true, woke });
  } catch (e) { return Response.json({ ok: false, error: String((e as Error)?.message || e) }); }
});
