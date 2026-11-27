// A Spotter account: sign in with a 6-digit code from your email, no password.
// Same small fetch client Tally uses. The key here is the publishable one,
// which is meant to be public; privacy comes from the database's row rules.
import { CONFIG } from "./config.js";

const LS = "spotter.cloud";
function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
function lsSet(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* in-memory only */ } }

export const CLOUD = {
  s: lsGet(), _ref: null, lost: false,
  ready() { return !!(CONFIG.url && CONFIG.key); },
  on() { return !!(this.s && this.s.rt); },
  email() { return (this.s && this.s.email) || ""; },
  uid() { return (this.s && this.s.uid) || ""; },
  keep() { lsSet(this.s); },
  async raw(method, path, body, at, prefer) {
    const h = { apikey: CONFIG.key, "Content-Type": "application/json" };
    if (at) h.Authorization = "Bearer " + at;
    if (prefer) h.Prefer = prefer;
    const r = await fetch(CONFIG.url + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let j = null;
    try { j = t ? JSON.parse(t) : null; } catch (e) { /* not JSON */ }
    if (!r.ok) {
      const err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || "Error " + r.status);
      err.status = r.status; err.code = j && (j.error_code || j.code);
      throw err;
    }
    return j;
  },
  sendCode(email) { return this.raw("POST", "/auth/v1/otp", { email, create_user: true }); },
  async verify(email, code) {
    const j = await this.raw("POST", "/auth/v1/verify", { type: "email", email, token: code });
    this.take(j);
    return j;
  },
  take(j) {
    const o = this.s || {};
    this.s = {
      at: j.access_token, rt: j.refresh_token,
      exp: j.expires_at ? j.expires_at * 1000 : Date.now() + (+j.expires_in || 3600) * 1000,
      email: (j.user && j.user.email) || o.email || "", uid: (j.user && j.user.id) || o.uid || "",
    };
    this.lost = false;
    this.keep();
  },
  // A fresh access token. Refreshes are shared so two calls never spend the same refresh token.
  token() {
    if (!this.on()) return Promise.reject(new Error("Not signed in"));
    const other = lsGet();
    if (other && other.rt && other.rt !== this.s.rt && other.exp > this.s.exp) this.s = other; // another tab refreshed
    if (this.s.exp - Date.now() > 90000) return Promise.resolve(this.s.at);
    if (!this._ref) {
      this._ref = this.raw("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: this.s.rt }).then(
        (j) => { this._ref = null; this.take(j); return this.s.at; },
        (e) => {
          this._ref = null;
          if (e.status >= 400 && e.status < 500) { this.lost = true; this.s.rt = ""; this.keep(); e.message = "Signed out. Sign in again in Settings."; }
          throw e;
        });
    }
    return this._ref;
  },
  async api(method, path, body, prefer) { return this.raw(method, path, body, await this.token(), prefer); },
  get(path) { return this.api("GET", "/rest/v1/" + path); },
  upsert(table, rows, conflict) {
    if (!rows.length) return Promise.resolve();
    return this.api("POST", `/rest/v1/${table}?on_conflict=${conflict || "id"}`, rows, "resolution=merge-duplicates,return=minimal");
  },
  insert(table, row) { return this.api("POST", `/rest/v1/${table}`, row, "return=representation"); },
  patch(table, query, body) { return this.api("PATCH", `/rest/v1/${table}?${query}`, body, "return=minimal"); },
  del(table, query) { return this.api("DELETE", `/rest/v1/${table}?${query}`, null, "return=minimal"); },
  rpc(fn, args) { return this.api("POST", "/rest/v1/rpc/" + fn, args || {}); },
  signOut() {
    const at = this.s && this.s.at, em = this.email();
    if (at) this.raw("POST", "/auth/v1/logout", {}, at).catch(() => {});
    this.s = { email: em };
    this.keep();
  },
};
