// send-lifecycle-emails — logique de la fonction Edge, SANS dependance
// Deno/npm (reseau, base, horloge, variables d'environnement injectes) :
// testee par tests/email-lifecycle-edge.test.js (node --test), branchee par
// index.ts (Deno.serve).
//
// APPEL SERVEUR UNIQUEMENT (pg_cron via pg_net, toutes les heures) :
// - en-tete x-internal-secret = EMAIL_INTERNAL_SECRET (meme secret que
//   send-transactional-email), comparaison en temps constant ; secret absent
//   cote serveur = refus 503 ; aucun en-tete CORS.
//
// RESEND_API_KEY absent = no-op propre : aucune lecture de la base, aucun
// envoi, reponse 200 {processed:false, reason:"resend_not_configured"}.
// dryRun:true = selection + rendu complets, rien n'est reserve ni envoye.
//
// Etapes pour chaque destinataire :
// 1. public.lifecycle_email_candidates (0024) propose une campagne ;
// 2. lib/lifecycle-email.js decideCampaign doit donner EXACTEMENT la meme
//    campagne et la meme cle (sinon : ignore + log) ;
// 3. contenu public (data-home.json : noms, competition, horaire, lien) ;
// 4. rendu avec lien de desinscription signe + en-tetes List-Unsubscribe ;
// 5. reservation atomique (email_reserve_send) PUIS envoi Resend PUIS
//    email_complete_send : jamais deux fois le meme email.
// Journaux : adresse masquee, jamais d'email en clair ni d'identifiant.
import { BUNDLE, Lifecycle, Render } from "../_shared/lifecycle-email-bundle.generated.mjs";

export type GetEnv = (name: string) => string | undefined | null;
export type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
export type CandidateRow = {
  user_id: string;
  email: string;
  market?: string | null;
  campaign: string;
  campaign_key?: string | null;
  marketing_opt_in?: boolean | null;
  [key: string]: unknown;
};
export type LifecycleStore = {
  listCandidates: (args: { nowIso: string; limit: number }) => Promise<CandidateRow[]>;
  reserveSend: (args: { userId: string; campaign: string; key: string; market: string }) => Promise<number | null>;
  completeSend: (args: { id: number; status: "sent" | "failed"; messageId?: string | null; error?: string | null }) => Promise<void>;
};
export type HandlerDeps = {
  env: GetEnv;
  fetch: typeof fetch;
  now: () => Date;
  log: Logger;
  db: LifecycleStore | null;
};

export const RESEND_API_URL = "https://api.resend.com/emails";
export const DEFAULT_PUBLIC_DATA_URL = "https://iashark.com/data-home.json";
export const MAX_BODY_BYTES = 16 * 1024;
const TAG = "[send-lifecycle-emails]";

type Json = Record<string, unknown>;
type Rendered = { campaign: string; dir: string; subject: string; html: string; text: string; blockedDecisions: string[] };

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function envValue(deps: HandlerDeps, name: string): string | null {
  const v = deps.env(name);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function errorText(err: unknown): string {
  return String((err as Error)?.message || err).slice(0, 200);
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

async function loadPublicMatches(deps: HandlerDeps): Promise<unknown[] | null> {
  const url = envValue(deps, "LIFECYCLE_PUBLIC_DATA_URL") || DEFAULT_PUBLIC_DATA_URL;
  try {
    const res = await deps.fetch(url, { headers: { "Accept": "application/json" }, signal: timeoutSignal(10000) });
    if (!res.ok) throw new Error("http_" + res.status);
    const body = await res.json() as Json;
    return Array.isArray(body.matchs) ? body.matchs as unknown[] : null;
  } catch (err) {
    deps.log.warn(TAG + " donnees publiques indisponibles (" + errorText(err) + ") : campagnes avec matchs reportees.");
    return null;
  }
}

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const internal = envValue(deps, "EMAIL_INTERNAL_SECRET");
  if (!internal) {
    deps.log.error(TAG + " EMAIL_INTERNAL_SECRET non configure - toutes les demandes sont refusees.");
    return json(503, { ok: false, error: "internal_secret_not_configured" });
  }
  if (!Render.safeEqual(req.headers.get("x-internal-secret") || "", internal)) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "payload_too_large" });
  let body: Json = {};
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Json;
    } catch (_e) {
      return json(400, { ok: false, error: "invalid_json" });
    }
  }
  const dryRun = body.dryRun === true;
  const limit = body.limit === undefined ? 200 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return json(400, { ok: false, error: "invalid_limit" });

  const resendKey = envValue(deps, "RESEND_API_KEY");
  if (!resendKey && !dryRun) {
    deps.log.info(TAG + " RESEND_API_KEY absent - no-op, aucun email de relance traite.");
    return json(200, { ok: true, processed: false, reason: "resend_not_configured" });
  }
  const unsubscribeSecret = envValue(deps, "EMAIL_UNSUBSCRIBE_SECRET");
  const supabaseUrl = envValue(deps, "SUPABASE_URL");
  const from = envValue(deps, "EMAIL_FROM");
  const missing = [
    (!unsubscribeSecret || unsubscribeSecret.length < Lifecycle.MIN_SECRET_LENGTH) && "EMAIL_UNSUBSCRIBE_SECRET",
    !supabaseUrl && "SUPABASE_URL",
    !deps.db && "SUPABASE_SERVICE_ROLE_KEY",
    !dryRun && !from && "EMAIL_FROM",
  ].filter(Boolean);
  if (missing.length) {
    deps.log.info(TAG + " relances non executees (no-op), configuration absente : " + missing.join(","));
    return json(200, { ok: true, processed: false, reason: "not_configured", missing });
  }

  const now = deps.now();
  let rows: CandidateRow[];
  try {
    rows = await (deps.db as LifecycleStore).listCandidates({ nowIso: now.toISOString(), limit });
  } catch (err) {
    deps.log.error(TAG + " lecture des destinataires impossible : " + errorText(err));
    return json(500, { ok: false, error: "db_unavailable" });
  }

  let publicMatches: unknown[] | null | undefined;
  const matches = async () => {
    if (publicMatches === undefined) publicMatches = await loadPublicMatches(deps);
    return publicMatches;
  };
  const company = Render.companyFromEnv((k: string) => deps.env(k) ?? undefined);
  const allowBlocked = envValue(deps, "EMAIL_ALLOW_BLOCKED_DECISION") === "true";
  const summary = { checked: rows.length, sent: 0, notSent: 0, skipped: 0, failed: 0 };
  const results: Json[] = [];
  const skip = (n: number, campaign: string, reason: string) => {
    summary.skipped++;
    results.push({ n, campaign, status: "skipped", reason });
  };

  for (let n = 0; n < rows.length; n++) {
    const row = rows[n];
    const campaign = String(row.campaign || "");
    const key = String(row.campaign_key || "");
    const decision = Lifecycle.decideCampaign(Lifecycle.factsFromRow(row), now);
    if (decision.campaign !== campaign || decision.key !== key) {
      if (decision.campaign) deps.log.warn(TAG + " regles SQL/JS divergentes (" + campaign + " vs " + decision.campaign + ") : envoi ignore.");
      skip(n, campaign, decision.campaign ? "rule_mismatch" : (decision.reason || "rule_mismatch"));
      continue;
    }
    if (!Render.isValidEmail(row.email)) { skip(n, campaign, "invalid_email"); continue; }
    const dir = Lifecycle.DIRS.indexOf(String(row.market)) !== -1 ? String(row.market) : "fr";
    const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
    const need = Lifecycle.CAMPAIGNS[campaign].needs;
    const data: Json = { marketingOptIn: row.marketing_opt_in === true, freeMatch: null, weekendMatches: [] };
    if (campaign === "welcome" || need === "free_match" || need === "weekend_matches") {
      const list = await matches();
      if (!list && need) { skip(n, campaign, "public_data_unavailable"); continue; }
      if (list) {
        data.freeMatch = Lifecycle.pickFreeMatch(list, now, ctx);
        if (need === "weekend_matches") data.weekendMatches = Lifecycle.weekendMatches(list, now, ctx, 8);
      }
    }
    // Jamais de contenu invente : pas de match publie = pas d'email (retente a l'heure suivante).
    if (need === "free_match" && !data.freeMatch) { skip(n, campaign, "no_free_match"); continue; }
    if (need === "weekend_matches" && !(data.weekendMatches as unknown[]).length) { skip(n, campaign, "no_weekend_matches"); continue; }

    let rendered: Rendered;
    let oneClick: string;
    try {
      const token = await Lifecycle.createUnsubscribeToken({ userId: row.user_id, dir }, unsubscribeSecret, now);
      const links = Lifecycle.unsubscribeLinks(token, dir, supabaseUrl);
      oneClick = links.oneClick;
      rendered = Lifecycle.renderLifecycleEmail(BUNDLE, campaign, dir, data, { company, unsubscribeUrl: links.page, now }) as Rendered;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      deps.log.error(TAG + " rendu impossible (" + campaign + "/" + dir + ") : " + errorText(err));
      skip(n, campaign, code ? "render_" + code : "render_error");
      continue;
    }
    const line = campaign + "/" + dir + " to=" + Render.maskEmail(row.email) + " subject=\"" + rendered.subject + "\"";
    if (rendered.blockedDecisions.length && !allowBlocked) {
      deps.log.warn(TAG + " NON envoye, identite expediteur manquante (BLOCKED_DECISION: " + rendered.blockedDecisions.join(",") + ") : " + line);
      summary.notSent++;
      results.push({ n, campaign, status: "not_sent", reason: "blocked_decision_placeholders" });
      continue;
    }
    if (dryRun) {
      deps.log.info(TAG + " dryRun - NON envoye : " + line);
      summary.notSent++;
      results.push({ n, campaign, status: "not_sent", reason: "dry_run" });
      continue;
    }

    let reservation: number | null;
    try {
      reservation = await (deps.db as LifecycleStore).reserveSend({ userId: row.user_id, campaign, key, market: dir });
    } catch (err) {
      deps.log.error(TAG + " reservation impossible : " + errorText(err));
      summary.failed++;
      results.push({ n, campaign, status: "failed", reason: "reserve_error" });
      continue;
    }
    if (reservation == null) { skip(n, campaign, "already_reserved"); continue; }

    const finish = async (status: "sent" | "failed", messageId: string | null, error: string | null) => {
      try {
        await (deps.db as LifecycleStore).completeSend({ id: reservation as number, status, messageId, error });
      } catch (err) {
        // La ligne reste "pending" : elle bloque tout renvoi (pas de doublon).
        deps.log.error(TAG + " journal d'envoi non mis a jour : " + errorText(err));
      }
    };
    try {
      const res = await deps.fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + resendKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "lifecycle:" + campaign + ":" + row.user_id + ":" + (key || "once"),
        },
        body: JSON.stringify({
          from,
          to: [row.email],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          reply_to: envValue(deps, "EMAIL_REPLY_TO") || Render.SUPPORT_EMAIL,
          headers: Lifecycle.listUnsubscribeHeaders(oneClick),
          tags: [{ name: "category", value: "lifecycle_" + campaign }, { name: "market", value: dir }],
        }),
        signal: timeoutSignal(10000),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        deps.log.error(TAG + " Resend HTTP " + res.status + " : " + line);
        await finish("failed", null, "resend_http_" + res.status);
        summary.failed++;
        results.push({ n, campaign, status: "failed", reason: "resend_http_" + res.status });
        continue;
      }
      let id: string | null = null;
      try { id = (JSON.parse(text) as { id?: string }).id || null; } catch (_e) { /* corps inattendu */ }
      await finish("sent", id, null);
      deps.log.info(TAG + " envoye id=" + (id || "?") + " : " + line);
      summary.sent++;
      results.push({ n, campaign, status: "sent" });
    } catch (err) {
      deps.log.error(TAG + " Resend injoignable : " + line + " " + errorText(err));
      await finish("failed", null, "resend_network_error");
      summary.failed++;
      results.push({ n, campaign, status: "failed", reason: "resend_network_error" });
    }
  }

  deps.log.info(TAG + " execution " + now.toISOString() + (dryRun ? " (dryRun)" : "") + " : " + JSON.stringify(summary));
  return json(summary.failed ? 207 : 200, { ok: summary.failed === 0, processed: true, dryRun, ...summary, results });
}
