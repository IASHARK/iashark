// send-lifecycle-emails — logique de la fonction Edge, SANS dependance
// Deno/npm (reseau, base, horloge, variables d'environnement injectes) :
// testee par tests/email-lifecycle-edge.test.js (node --test), branchee par
// index.ts (Deno.serve).
//
// APPEL SERVEUR UNIQUEMENT (workflow GitHub .github/workflows/emails-cycle-de-vie.yml,
// toutes les heures une fois active) :
// - en-tete x-internal-secret = EMAIL_INTERNAL_SECRET (meme secret que
//   send-transactional-email), comparaison en temps constant ; secret absent
//   cote serveur = refus 503 ; aucun en-tete CORS ;
// - en-tete x-region: us-east-2 cote appelant : Brevo n'accepte que les adresses
//   IP autorisees par Clement (plage AWS Ohio), comme relance-emails.
//
// Fournisseur d'envoi (25/10/2026) : Resend si RESEND_API_KEY existe, sinon
// Brevo (BREVO_API_KEY, domaine iashark.com authentifie, deja utilise par
// relance-emails). EMAIL_PROVIDER = "brevo" | "resend" force le choix.
// Aucun fournisseur = no-op propre : aucune lecture de la base, aucun envoi,
// reponse 200 {processed:false, reason:"provider_not_configured"}.
//
// Corps JSON :
//   {}                       passage normal (envoi reel)
//   { dryRun: true }         selection + rendu complets, rien n'est reserve ni envoye ;
//                            "details": true ajoute la liste (adresses masquees) a la reponse
//                            (ne JAMAIS l'utiliser depuis un journal public)
//   { test: { campaign, dir } }  UN seul e-mail « [TEST] » au premier compte administrateur
//                            (users.role = 'admin'), sans reservation ni journal email_sends
//
// Etapes pour chaque destinataire :
// 1. public.lifecycle_email_candidates (0024) propose une campagne ;
// 2. lib/lifecycle-email.js decideCampaign doit donner EXACTEMENT la meme
//    campagne et la meme cle (sinon : ignore + log) ;
// 3. contenu public (data-home.json : noms, competition, horaire, lien) ;
// 4. rendu avec lien de desinscription signe + en-tetes List-Unsubscribe ;
// 5. reservation atomique (email_reserve_send) PUIS envoi PUIS
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
  // user_preferences.language, ajoutee par index.ts (listCandidates) ; absente = repertoire d'inscription.
  language?: string | null;
  // Le compte a deja eu un abonnement (tous statuts), ajoute par index.ts ; absent/null = inconnu.
  ever_subscribed?: boolean | null;
  [key: string]: unknown;
};
export type TestRecipient = { user_id: string; email: string };
export type LifecycleStore = {
  listCandidates: (args: { nowIso: string; limit: number }) => Promise<CandidateRow[]>;
  reserveSend: (args: { userId: string; campaign: string; key: string; market: string }) => Promise<number | null>;
  completeSend: (args: { id: number; status: "sent" | "failed"; messageId?: string | null; error?: string | null }) => Promise<void>;
  // Comptes administrateurs (users.role = 'admin') : destinataires de l'envoi de test.
  listTestRecipients?: () => Promise<TestRecipient[]>;
};
export type HandlerDeps = {
  env: GetEnv;
  fetch: typeof fetch;
  now: () => Date;
  log: Logger;
  db: LifecycleStore | null;
};

export const RESEND_API_URL = "https://api.resend.com/emails";
export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
export const DEFAULT_PUBLIC_DATA_URL = "https://iashark.com/data-home.json";
export const MAX_BODY_BYTES = 16 * 1024;
// Essai Pro : meme regle que create-checkout-session/trial.ts (fonction en ligne) :
// TRIAL_DAYS absent = 7 jours, "0" = coupe, borne a 1..30.
export const TRIAL_DAYS_DEFAULT = 7;
const SALES_CAMPAIGNS = ["free_match", "pro_features", "inactive_7d", "inactive_30d"];
const TAG = "[send-lifecycle-emails]";

type Json = Record<string, unknown>;
type Rendered = { campaign: string; dir: string; subject: string; html: string; text: string; blockedDecisions: string[] };
type Provider = { name: "resend" | "brevo"; key: string };
type Mail = { to: string; subject: string; html: string; text: string; headers: Record<string, string>; campaign: string; dir: string; idempotencyKey: string };
type Delivery = { ok: true; id: string | null } | { ok: false; reason: string };

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
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

export function trialDaysFromEnv(getEnv: GetEnv): number {
  const raw = getEnv("TRIAL_DAYS");
  if (raw === undefined || raw === null || String(raw).trim() === "") return TRIAL_DAYS_DEFAULT;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(30, Math.max(1, Math.round(n)));
}

// Resend si sa cle existe, sinon Brevo ; EMAIL_PROVIDER force le choix.
export function chooseProvider(getEnv: GetEnv): Provider | null {
  const val = (n: string) => { const v = getEnv(n); return typeof v === "string" && v.trim() ? v.trim() : null; };
  const resend = val("RESEND_API_KEY");
  const brevoRaw = val("BREVO_API_KEY");
  const brevo = brevoRaw ? brevoRaw.replace(/\s+/g, "") : null;
  const forced = (val("EMAIL_PROVIDER") || "").toLowerCase();
  if (forced === "brevo") return brevo ? { name: "brevo", key: brevo } : null;
  if (forced === "resend") return resend ? { name: "resend", key: resend } : null;
  if (resend) return { name: "resend", key: resend };
  if (brevo) return { name: "brevo", key: brevo };
  return null;
}

// "Nom <adresse>" ou "adresse" -> { name, email } (format expediteur de Brevo).
export function parseSender(from: string): { name: string; email: string } | null {
  const m = /^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+)\s*>\s*$/.exec(from);
  const email = m ? m[2] : from.trim();
  if (!Render.isValidEmail(email)) return null;
  return { name: (m && m[1].trim()) || "IASHARK", email };
}

async function deliver(deps: HandlerDeps, provider: Provider, from: string, replyTo: string, mail: Mail): Promise<Delivery> {
  const tag = provider.name;
  let res: Response;
  try {
    if (provider.name === "resend") {
      res = await deps.fetch(RESEND_API_URL, {
        method: "POST",
        headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json", "Idempotency-Key": mail.idempotencyKey },
        body: JSON.stringify({
          from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, reply_to: replyTo, headers: mail.headers,
          tags: [{ name: "category", value: "lifecycle_" + mail.campaign }, { name: "market", value: mail.dir }],
        }),
        signal: timeoutSignal(10000),
      });
    } else {
      res = await deps.fetch(BREVO_API_URL, {
        method: "POST",
        headers: { "api-key": provider.key, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          sender: parseSender(from), to: [{ email: mail.to }], replyTo: { email: replyTo },
          subject: mail.subject, htmlContent: mail.html, textContent: mail.text, headers: mail.headers,
          tags: ["lifecycle_" + mail.campaign, "market_" + mail.dir],
        }),
        signal: timeoutSignal(10000),
      });
    }
  } catch (err) {
    deps.log.error(TAG + " " + tag + " injoignable : " + errorText(err));
    return { ok: false, reason: tag + "_network_error" };
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    deps.log.error(TAG + " " + tag + " HTTP " + res.status + " : " + text.slice(0, 200));
    return { ok: false, reason: tag + "_http_" + res.status };
  }
  let id: string | null = null;
  try {
    const body = JSON.parse(text) as { id?: string; messageId?: string };
    id = (provider.name === "resend" ? body.id : body.messageId) || null;
  } catch (_e) { /* corps inattendu */ }
  return { ok: true, id };
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
  const testMode = body.test !== undefined && body.test !== false && body.test !== null;
  const dryRun = body.dryRun === true && !testMode;
  const details = body.details === true;
  const limit = body.limit === undefined ? 200 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return json(400, { ok: false, error: "invalid_limit" });

  const provider = chooseProvider((k) => deps.env(k));
  if (!provider && !dryRun) {
    deps.log.info(TAG + " aucun fournisseur d'e-mail (RESEND_API_KEY absent, BREVO_API_KEY absent) - no-op, aucun email de relance traite.");
    return json(200, { ok: true, processed: false, reason: "provider_not_configured" });
  }
  const unsubscribeSecret = envValue(deps, "EMAIL_UNSUBSCRIBE_SECRET");
  const supabaseUrl = envValue(deps, "SUPABASE_URL");
  const from = envValue(deps, "EMAIL_FROM");
  const fromOk = !!from && (provider?.name !== "brevo" || !!parseSender(from));
  const missing = [
    (!unsubscribeSecret || unsubscribeSecret.length < Lifecycle.MIN_SECRET_LENGTH) && "EMAIL_UNSUBSCRIBE_SECRET",
    !supabaseUrl && "SUPABASE_URL",
    !deps.db && "SUPABASE_SERVICE_ROLE_KEY",
    !dryRun && !fromOk && "EMAIL_FROM",
  ].filter(Boolean);
  if (missing.length) {
    deps.log.info(TAG + " relances non executees (no-op), configuration absente : " + missing.join(","));
    return json(200, { ok: true, processed: false, reason: "not_configured", missing });
  }
  const replyTo = envValue(deps, "EMAIL_REPLY_TO") || Render.SUPPORT_EMAIL;
  // Identite de l'expediteur (pied de chaque e-mail) : COMPANY_OPERATOR_NAME et
  // COMPANY_ADDRESS. Aucune adresse postale n'est publiee dans les mentions
  // legales (25/10/2026) : LIFECYCLE_SENDER_CONTACT (contact@iashark.com, comme
  // relance-emails) la remplace pour ces e-mails seulement, sans toucher aux
  // e-mails de paiement (send-transactional-email garde son garde-fou).
  const company = Render.companyFromEnv((k: string) => deps.env(k) ?? undefined);
  if (!company.address) company.address = envValue(deps, "LIFECYCLE_SENDER_CONTACT");
  const allowBlocked = envValue(deps, "EMAIL_ALLOW_BLOCKED_DECISION") === "true";
  const trialDays = trialDaysFromEnv((k) => deps.env(k));
  const now = deps.now();

  let publicMatches: unknown[] | null | undefined;
  const matches = async () => {
    if (publicMatches === undefined) publicMatches = await loadPublicMatches(deps);
    return publicMatches;
  };
  // Contenu public d'une campagne ; null = rien a envoyer (raison donnee).
  const contentFor = async (campaign: string, dir: string, optIn: boolean, trial: number): Promise<{ data: Json } | { reason: string }> => {
    const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
    const need = Lifecycle.CAMPAIGNS[campaign].needs;
    const data: Json = { marketingOptIn: optIn, freeMatch: null, weekendMatches: [], trialDays: trial };
    if (campaign === "welcome" || need === "free_match" || need === "weekend_matches") {
      const list = await matches();
      if (!list && need) return { reason: "public_data_unavailable" };
      if (list) {
        data.freeMatch = Lifecycle.pickFreeMatch(list, now, ctx);
        if (need === "weekend_matches") data.weekendMatches = Lifecycle.weekendMatches(list, now, ctx, 8);
      }
    }
    // Jamais de contenu invente : pas de match publie = pas d'email (retente a l'heure suivante).
    if (need === "free_match" && !data.freeMatch) return { reason: "no_free_match" };
    if (need === "weekend_matches" && !(data.weekendMatches as unknown[]).length) return { reason: "no_weekend_matches" };
    return { data };
  };
  const renderFor = async (userId: string, campaign: string, dir: string, data: Json) => {
    const token = await Lifecycle.createUnsubscribeToken({ userId, dir }, unsubscribeSecret, now);
    const links = Lifecycle.unsubscribeLinks(token, dir, supabaseUrl);
    const rendered = Lifecycle.renderLifecycleEmail(BUNDLE, campaign, dir, data, { company, unsubscribeUrl: links.page, now }) as Rendered;
    return { rendered, headers: Lifecycle.listUnsubscribeHeaders(links.oneClick) as Record<string, string> };
  };

  // ------------------------------------------------ envoi de test (un seul)
  if (testMode) {
    const t = (typeof body.test === "object" ? body.test : {}) as Json;
    const campaign = typeof t.campaign === "string" ? t.campaign : "welcome";
    const dir = typeof t.dir === "string" ? t.dir : "fr";
    if (!Object.prototype.hasOwnProperty.call(Lifecycle.CAMPAIGNS, campaign) || Lifecycle.DIRS.indexOf(dir) === -1) {
      return json(400, { ok: false, error: "invalid_test_target" });
    }
    const store = deps.db as LifecycleStore;
    if (typeof store.listTestRecipients !== "function") return json(200, { ok: false, processed: false, test: true, reason: "no_test_recipient" });
    let admins: TestRecipient[];
    try {
      admins = (await store.listTestRecipients()).filter((a) => a && Render.isValidEmail(a.email));
    } catch (err) {
      deps.log.error(TAG + " lecture des comptes administrateurs impossible : " + errorText(err));
      return json(500, { ok: false, error: "db_unavailable" });
    }
    const admin = admins[0];
    if (!admin) return json(200, { ok: false, processed: false, test: true, reason: "no_test_recipient" });
    const content = await contentFor(campaign, dir, true, SALES_CAMPAIGNS.indexOf(campaign) !== -1 ? trialDays : 0);
    if ("reason" in content) return json(200, { ok: false, processed: false, test: true, campaign, dir, reason: content.reason });
    let r: { rendered: Rendered; headers: Record<string, string> };
    try {
      r = await renderFor(admin.user_id, campaign, dir, content.data);
    } catch (err) {
      deps.log.error(TAG + " rendu de test impossible (" + campaign + "/" + dir + ") : " + errorText(err));
      return json(200, { ok: false, processed: false, test: true, campaign, dir, reason: "render_error" });
    }
    if (r.rendered.blockedDecisions.length && !allowBlocked) {
      return json(200, { ok: false, processed: false, test: true, campaign, dir, reason: "blocked_decision_placeholders", blocked: r.rendered.blockedDecisions });
    }
    const subject = "[TEST] " + r.rendered.subject;
    const sent = await deliver(deps, provider as Provider, from as string, replyTo, {
      to: admin.email, subject, html: r.rendered.html, text: r.rendered.text, headers: r.headers, campaign, dir,
      idempotencyKey: "lifecycle-test:" + campaign + ":" + dir + ":" + now.getTime(),
    });
    deps.log.info(TAG + " test " + campaign + "/" + dir + " to=" + Render.maskEmail(admin.email) + " : " + (sent.ok ? "envoye id=" + (sent.id || "?") : sent.reason));
    return json(sent.ok ? 200 : 502, {
      ok: sent.ok, processed: true, test: true, provider: (provider as Provider).name, campaign, dir, subject,
      sent: sent.ok ? 1 : 0, messageId: sent.ok ? sent.id : null, reason: sent.ok ? null : sent.reason,
    });
  }

  // ------------------------------------------------ passage normal / essai a blanc
  let rows: CandidateRow[];
  try {
    rows = await (deps.db as LifecycleStore).listCandidates({ nowIso: now.toISOString(), limit });
  } catch (err) {
    deps.log.error(TAG + " lecture des destinataires impossible : " + errorText(err));
    return json(500, { ok: false, error: "db_unavailable" });
  }

  const summary = { checked: rows.length, sent: 0, notSent: 0, skipped: 0, failed: 0 };
  const results: Json[] = [];
  const preview: Json[] = [];
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
    // Langue du compte (user_preferences.language) d'abord : la meme que le site et le robot.
    const dir = Lifecycle.dirForLanguage(row.language, row.market);
    // Essai Pro annonce dans les e-mails de vente seulement si TRIAL_DAYS l'ouvre et si
    // le compte n'a JAMAIS eu d'abonnement (inconnu = pas d'annonce).
    const trial = SALES_CAMPAIGNS.indexOf(campaign) !== -1 && row.ever_subscribed === false ? trialDays : 0;
    const content = await contentFor(campaign, dir, row.marketing_opt_in === true, trial);
    if ("reason" in content) { skip(n, campaign, content.reason); continue; }

    let r: { rendered: Rendered; headers: Record<string, string> };
    try {
      r = await renderFor(row.user_id, campaign, dir, content.data);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      deps.log.error(TAG + " rendu impossible (" + campaign + "/" + dir + ") : " + errorText(err));
      skip(n, campaign, code ? "render_" + code : "render_error");
      continue;
    }
    const rendered = r.rendered;
    const line = campaign + "/" + dir + " to=" + Render.maskEmail(row.email) + " subject=\"" + rendered.subject + "\"";
    if (rendered.blockedDecisions.length && !allowBlocked) {
      deps.log.warn(TAG + " NON envoye, identite expediteur manquante (BLOCKED_DECISION: " + rendered.blockedDecisions.join(",") + ") : " + line);
      summary.notSent++;
      results.push({ n, campaign, dir, status: "not_sent", reason: "blocked_decision_placeholders" });
      continue;
    }
    if (dryRun) {
      deps.log.info(TAG + " dryRun - NON envoye : " + line);
      summary.notSent++;
      results.push({ n, campaign, dir, status: "not_sent", reason: "dry_run" });
      if (details) preview.push({ campaign, dir, to: Render.maskEmail(row.email), subject: rendered.subject, trial: trial > 0 });
      continue;
    }

    let reservation: number | null;
    try {
      reservation = await (deps.db as LifecycleStore).reserveSend({ userId: row.user_id, campaign, key, market: dir });
    } catch (err) {
      deps.log.error(TAG + " reservation impossible : " + errorText(err));
      summary.failed++;
      results.push({ n, campaign, dir, status: "failed", reason: "reserve_error" });
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
    const sent = await deliver(deps, provider as Provider, from as string, replyTo, {
      to: row.email, subject: rendered.subject, html: rendered.html, text: rendered.text, headers: r.headers, campaign, dir,
      idempotencyKey: "lifecycle:" + campaign + ":" + row.user_id + ":" + (key || "once"),
    });
    if (!sent.ok) {
      deps.log.error(TAG + " echec (" + sent.reason + ") : " + line);
      await finish("failed", null, sent.reason);
      summary.failed++;
      results.push({ n, campaign, dir, status: "failed", reason: sent.reason });
      continue;
    }
    await finish("sent", sent.id, null);
    deps.log.info(TAG + " envoye id=" + (sent.id || "?") + " : " + line);
    summary.sent++;
    results.push({ n, campaign, dir, status: "sent" });
  }

  // Nombres par campagne (aucune adresse) : ce que le journal public peut montrer.
  const byCampaign: Record<string, Record<string, number>> = {};
  for (const r of results) {
    const c = String(r.campaign || "?");
    const label = r.reason === "dry_run" ? "would_send" : r.status === "sent" ? "sent" : String(r.status) + ":" + String(r.reason);
    byCampaign[c] = byCampaign[c] || {};
    byCampaign[c][label] = (byCampaign[c][label] || 0) + 1;
  }
  deps.log.info(TAG + " execution " + now.toISOString() + (dryRun ? " (dryRun)" : "") + " : " + JSON.stringify(summary));
  const out: Json = { ok: summary.failed === 0, processed: true, dryRun, provider: provider ? provider.name : null, ...summary, byCampaign, results };
  if (dryRun && details) out.preview = preview;
  return json(summary.failed ? 207 : 200, out);
}
