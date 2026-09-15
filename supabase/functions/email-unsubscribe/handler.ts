// email-unsubscribe — desinscription des emails de relance SANS connexion,
// par jeton signe (HMAC-SHA256, lib/lifecycle-email.js). Logique sans
// dependance Deno (testee par tests/email-lifecycle-edge.test.js), branchee
// par index.ts.
//
// Deux appelants :
// 1. la page /<dir>/desinscription-email.html (lien en bas de chaque email) :
//    POST JSON {token} depuis https://iashark.com (CORS limite a cette origine) ;
// 2. le client mail (Gmail, Yahoo, Apple...) : POST en un clic RFC 8058 sur
//    l'URL de l'en-tete List-Unsubscribe (?t=<jeton>), corps
//    "List-Unsubscribe=One-Click".
// GET ne desinscrit JAMAIS : les antivirus de messagerie ouvrent les liens.
//
// A deployer avec --no-verify-jwt (un client mail n'envoie aucun jeton
// Supabase) : l'autorisation est la signature du jeton, verifiee ici.
import { Lifecycle } from "../_shared/lifecycle-email-bundle.generated.mjs";

export type GetEnv = (name: string) => string | undefined | null;
export type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
export type UnsubscribeStore = {
  unsubscribe: (args: { userId: string; source: "link" | "one_click" }) => Promise<string>;
};
export type HandlerDeps = { env: GetEnv; now: () => Date; log: Logger; db: UnsubscribeStore | null };

export const DEFAULT_ALLOWED_ORIGIN = "https://iashark.com";
export const MAX_BODY_BYTES = 4096;
const TAG = "[email-unsubscribe]";

type Json = Record<string, unknown>;

function envValue(deps: HandlerDeps, name: string): string | null {
  const v = deps.env(name);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function corsHeaders(deps: HandlerDeps, req: Request): Record<string, string> {
  const allowed = envValue(deps, "EMAIL_UNSUBSCRIBE_ALLOWED_ORIGIN") || DEFAULT_ALLOWED_ORIGIN;
  if (req.headers.get("origin") !== allowed) return {};
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function json(status: number, body: Json, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extra },
  });
}

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const cors = corsHeaders(deps, req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, cors);

  const secret = envValue(deps, "EMAIL_UNSUBSCRIBE_SECRET");
  if (!secret || secret.length < Lifecycle.MIN_SECRET_LENGTH) {
    deps.log.error(TAG + " EMAIL_UNSUBSCRIBE_SECRET absent ou trop court - desinscription impossible.");
    return json(503, { ok: false, error: "not_configured" }, cors);
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "payload_too_large" }, cors);

  let token = new URL(req.url).searchParams.get("t");
  let source: "link" | "one_click" = "link";
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) {
    try {
      const body = JSON.parse(raw || "{}");
      if (body && typeof body.token === "string") token = body.token;
    } catch (_e) {
      return json(400, { ok: false, error: "invalid_json" }, cors);
    }
  } else if (/List-Unsubscribe=One-Click/i.test(raw)) {
    source = "one_click";
  }
  if (!token) return json(400, { ok: false, error: "missing_token" }, cors);

  const v = await Lifecycle.verifyUnsubscribeToken(token, secret, deps.now());
  if (!v.ok) {
    deps.log.info(TAG + " jeton refuse : " + v.reason);
    return v.reason === "expired"
      ? json(410, { ok: false, error: "expired_token", dir: v.dir || null }, cors)
      : json(400, { ok: false, error: "invalid_token" }, cors);
  }
  if (!deps.db) {
    deps.log.error(TAG + " SUPABASE_SERVICE_ROLE_KEY absent - desinscription impossible.");
    return json(503, { ok: false, error: "db_not_configured" }, cors);
  }
  let status: string;
  try {
    status = await deps.db.unsubscribe({ userId: v.userId, source });
  } catch (err) {
    deps.log.error(TAG + " ecriture impossible : " + String((err as Error)?.message || err).slice(0, 200));
    return json(500, { ok: false, error: "db_error" }, cors);
  }
  // Aucun identifiant ni adresse dans les journaux.
  deps.log.info(TAG + " " + status + " source=" + source + " dir=" + v.dir);
  return json(200, { ok: true, status, dir: v.dir }, cors);
}
