// A stand-in for Supabase, for tests only.
//   /auth/v1/*  email-code sign-in that mints real JWTs
//   /rest/v1/*  passed straight to PostgREST, the API server Supabase itself runs,
//               in front of a Postgres loaded with Spotter's actual migrations
// So row level security, grants and upserts behave as they will in production.
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const SECRET = "spotter-test-secret-spotter-test-secret-0123456789";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function jwt(sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
const idFor = (email) => { const h = crypto.createHash("md5").update(email).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
export function sql(q) {
  return execFileSync("psql", ["-X", "-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-Atc", q], { encoding: "utf8" }).trim();
}

export function startStandin(port) {
  const codes = new Map(), refresh = new Map();
  const session = (email) => {
    const id = idFor(email), rt = crypto.randomBytes(12).toString("hex");
    refresh.set(rt, email);
    return { access_token: jwt(id, email), refresh_token: rt, expires_in: 3600, token_type: "bearer", user: { id, email } };
  };
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Expose-Headers": "*" };
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks), url = new URL(req.url, "http://x");
      const send = (status, obj) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(obj == null ? "" : JSON.stringify(obj)); };
      try {
        if (url.pathname === "/auth/v1/otp") {
          const { email } = JSON.parse(raw);
          sql(`insert into auth.users (id, email) values ('${idFor(email)}', '${email.replace(/'/g, "")}') on conflict do nothing`);
          codes.set(email, String(crypto.randomInt(100000, 999999)));
          return send(200, {});
        }
        if (url.pathname === "/auth/v1/verify") {
          const { email, token } = JSON.parse(raw);
          if (codes.get(email) !== token) return send(403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
          codes.delete(email);
          return send(200, session(email));
        }
        if (url.pathname === "/auth/v1/token") {
          const { refresh_token } = JSON.parse(raw), email = refresh.get(refresh_token);
          if (!email) return send(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
          refresh.delete(refresh_token);
          return send(200, session(email));
        }
        if (url.pathname === "/auth/v1/logout") return send(204, null);
        if (url.pathname === "/__test/code") return send(200, { code: codes.get(url.searchParams.get("email")) || null });
        if (url.pathname.startsWith("/rest/v1/")) {
          const headers = { ...req.headers, host: "127.0.0.1:54330" };
          delete headers.apikey; delete headers.origin; delete headers.referer;
          const up = http.request({ host: "127.0.0.1", port: 54330, method: req.method, path: url.pathname.replace("/rest/v1", "") + url.search, headers }, (pr) => {
            const out = { ...pr.headers, ...cors };
            res.writeHead(pr.statusCode, out);
            pr.pipe(res);
          });
          up.on("error", (e) => send(502, { message: "PostgREST unreachable: " + e.message }));
          return up.end(raw);
        }
        send(404, { message: "not found" });
      } catch (e) { send(500, { message: String(e.message || e) }); }
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

/** Serves one folder over http, for the app itself. */
export function startStatic(port, dir, fs, path) {
  const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(dir, p === "/" ? "index.html" : p);
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
