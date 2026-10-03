// Faux robot Telegram pour les tests : l'Edge Function supabase/functions/telegram-bot/index.ts chargee
// dans Node avec une FAUSSE base supabase-js (tableaux en memoire) et un faux fetch (aucun vrai message
// Telegram, aucune ecriture en base de production). Utilise par tests/telegram-langues.test.mjs et
// tests/canal-pro-prive.test.js.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
/** Fausse base supabase-js (sous-ensemble utilise par le robot), sur des tableaux en memoire. */
export function fausseSupabase(tables) {
  const T0 = structuredClone(tables);
  const tab = (n) => (T0[n] ||= []);
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = "select"; }
    select() { if (this.op === "select") this.op = "select"; this.ret = true; return this; }
    eq(c, v) { this.f.push((r) => String(r[c]) === String(v)); return this; }
    neq(c, v) { this.f.push((r) => String(r[c]) !== String(v)); return this; }
    not(c, op, v) { this.f.push((r) => r[c] != null); return this; }
    gt(c, v) { this.f.push((r) => String(r[c]) > String(v)); return this; }
    in(c, v) { this.f.push((r) => v.map(String).includes(String(r[c]))); return this; }
    like(c, motif) { const re = new RegExp(`^${String(motif).split("%").map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`); this.f.push((r) => re.test(String(r[c] ?? ""))); return this; }
    is(c, v) { this.f.push((r) => r[c] == null); return this; }
    order() { return this; }
    limit() { return this; }
    update(p) { this.op = "update"; this.p = p; return this; }
    insert(rows) { this.op = "insert"; this.rows = [].concat(rows); return this; }
    // Sans onConflict : la cle primaire de la table (comme Supabase).
    upsert(row, { onConflict } = {}) { this.op = "upsert"; this.rows = [].concat(row); this.cle = onConflict || { telegram_settings: "key", pro_envois: "cle" }[this.t] || "user_id"; return this; }
    delete() { this.op = "delete"; return this; }
    run() {
      const r = tab(this.t), ok = (x) => this.f.every((f) => f(x));
      if (this.op === "select") return { data: r.filter(ok).map((x) => ({ ...x })), error: null };
      if (this.op === "update") { const out = r.filter(ok); out.forEach((x) => Object.assign(x, this.p)); return { data: out, error: null }; }
      if (this.op === "insert") {
        const cle = { telegram_settings: "key", pro_envois: "cle" }[this.t];
        if (cle && this.rows.some((x) => r.some((y) => y[cle] === x[cle]))) return { data: null, error: { message: "duplicate" } };
        r.push(...this.rows.map((x) => ({ id: `id${r.length + 1}`, ...x }))); return { data: this.rows, error: null };
      }
      if (this.op === "upsert") {
        for (const x of this.rows) { const y = r.find((z) => z[this.cle] === x[this.cle]); if (y) Object.assign(y, x); else r.push({ ...x }); }
        return { data: this.rows, error: null };
      }
      if (this.op === "delete") { const out = r.filter(ok); T0[this.t] = r.filter((x) => !ok(x)); return { data: out, error: null }; }
    }
    maybeSingle() { const x = this.run(); return Promise.resolve({ data: x.data?.[0] ?? null, error: x.error }); }
    single() { const x = this.run(); return Promise.resolve({ data: x.data?.[0] ?? null, error: x.error }); }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  }
  return { from: (t) => new Q(t), auth: { getUser: async () => ({ data: {}, error: "non" }) }, tables: T0 };
}
export async function chargerRobot(tables, { reponse } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-robot-"));
  fs.writeFileSync(path.join(dir, "supabase.mjs"), "export const createClient = () => globalThis.__fausseBase;\n");
  fs.writeFileSync(path.join(dir, "anthropic.mjs"), "export default class {}\n");
  const partage = pathToFileURL(path.join(ICI, "../../supabase/functions/_shared/")).href;
  const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/telegram-bot/index.ts"), "utf8")
    .replace('"jsr:@supabase/supabase-js@2"', JSON.stringify(pathToFileURL(path.join(dir, "supabase.mjs")).href))
    .replace('"npm:@anthropic-ai/sdk"', JSON.stringify(pathToFileURL(path.join(dir, "anthropic.mjs")).href))
    .replaceAll('"../_shared/', `"${partage}`);
  fs.writeFileSync(path.join(dir, "robot.mts"), src);
  const env = { TELEGRAM_BOT_TOKEN: "factice", TELEGRAM_WEBHOOK_SECRET: "secret", TELEGRAM_ADMIN_CHAT_ID: "42", SUPABASE_URL: "http://faux", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" };
  let handler;
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
  globalThis.__fausseBase = fausseSupabase(tables);
  const envoyes = [];
  let n = 500;
  globalThis.fetch = async (url, init) => {
    const corps = JSON.parse(init.body || "{}");
    envoyes.push({ methode: String(url).split("/").pop(), corps });
    // reponse(methode, corps) peut simuler une erreur de Telegram : { ok: false, error_code, description, parameters }.
    const r = reponse ? reponse(String(url).split("/").pop(), corps) : null;
    if (r) return { status: r.error_code || 400, json: async () => r };
    return { status: 200, json: async () => ({ ok: true, result: { message_id: ++n, username: "IasharkBot" } }) };
  };
  await import(pathToFileURL(path.join(dir, "robot.mts")).href);
  fs.rmSync(dir, { recursive: true, force: true }); // fichiers temporaires : supprimes des le chargement
  const maj = (u) => handler(new Request("http://x", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(u) }));
  return { maj, envoyes, base: globalThis.__fausseBase };
}

