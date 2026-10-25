// send-lifecycle-emails — logique de la fonction Edge, SANS dependance
// Deno/npm (reseau, base, horloge, variables d'environnement injectes) :
// testee par tests/email-lifecycle-edge.test.js (node --test), branchee par
// index.ts (Deno.serve).
//
// ENVOI PAR BREVO (21/10/2026), meme methode que relance-emails (_shared/brevo.ts) :
// meme expediteur (« Clément, IASHARK » <news@iashark.com>), reponse a
// contact@iashark.com, meme lien de desinscription (page du site + un clic),
// appel OBLIGATOIRE dans la region us-east-2 (en-tete x-region).
//
// APPEL SERVEUR UNIQUEMENT : en-tete x-internal-secret (EMAIL_INTERNAL_SECRET,
// future tache pg_cron) ou x-relance-secret (RELANCE_SECRET, workflow
// .github/workflows/emails-automatiques.yml), compare en temps constant ;
// aucun secret configure = refus 503 ; aucun en-tete CORS.
//
// Corps JSON :
//   {}                 -> passage normal (selection + envoi). Envoi reel SEULEMENT si
//                         LIFECYCLE_SENDING_ENABLED = "true" (mise en route, apres
//                         l'accord de Clement) ; sinon no-op, rien n'est lu ni envoye.
//   { dryRun: true }   -> selection + rendu complets, rien n'est reserve ni envoye.
//   { mode: "apercu" } -> dryRun sur les vrais destinataires (comptes seulement, aucune
//                         adresse) + chaque email rendu pour un compte fictif, dans les
//                         9 versions du site. N'envoie RIEN.
//   { mode: "test" }   -> un exemplaire de chaque campagne, en francais, a la SEULE
//                         adresse Lifecycle.TEST_RECIPIENT (le patron). Rien n'est
//                         reserve, aucun client ne recoit rien.
//
// Etapes d'un passage normal, pour chaque destinataire :
// 1. public.lifecycle_email_candidates (0055) propose une campagne ;
// 2. lib/lifecycle-email.js decideCampaign doit donner EXACTEMENT la meme
//    campagne et la meme cle (sinon : ignore + log) ;
// 3. contenu public (data-home.json : noms, competition, horaire, lien ; match
//    offert = celui du site, Lifecycle.pickFreeMatch) ;
// 4. rendu avec lien de desinscription signe + en-tetes List-Unsubscribe ;
// 5. reservation atomique (email_reserve_send) PUIS envoi Brevo PUIS
//    email_complete_send : jamais deux fois le meme email.
// Journaux et reponses : adresse masquee, jamais d'email en clair ni d'identifiant.
import { BUNDLE, Lifecycle, Render } from "../_shared/lifecycle-email-bundle.generated.mjs";
import { authorize, BREVO_REGION, brevoConfig, envValue, realSendingEnabled, regionStatus, sendBrevo } from "../_shared/brevo.ts";

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
  // Mode test : compte du destinataire de test (lien de desinscription valide).
  findAccount: (email: string) => Promise<{ userId: string } | null>;
};
export type HandlerDeps = {
  env: GetEnv;
  fetch: typeof fetch;
  now: () => Date;
  log: Logger;
  db: LifecycleStore | null;
};

export const DEFAULT_PUBLIC_DATA_URL = "https://iashark.com/data-home.json";
export const MAX_BODY_BYTES = 16 * 1024;
export const APERCU_TOKEN = "APERCU";
const TAG = "[send-lifecycle-emails]";

// Campagnes envoyees par cette fonction (trial_ending : fonction trial-reminder).
export const OWN_CAMPAIGNS: string[] = Object.keys(Lifecycle.CAMPAIGNS)
  .filter((c) => Lifecycle.CAMPAIGNS[c].sender === "send-lifecycle-emails");

type Json = Record<string, unknown>;
type Rendered = { campaign: string; dir: string; subject: string; html: string; text: string; blockedDecisions: string[] };

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function errorText(err: unknown): string {
  return String((err as Error)?.message || err).slice(0, 200);
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

async function loadPublicMatches(deps: HandlerDeps): Promise<unknown[] | null> {
  const url = envValue(deps.env, "LIFECYCLE_PUBLIC_DATA_URL") || DEFAULT_PUBLIC_DATA_URL;
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

function needsPublicData(campaign: string): boolean {
  const need = Lifecycle.CAMPAIGNS[campaign].needs;
  return campaign === "welcome" || need === "free_match" || need === "weekend_matches";
}

function dirOf(value: unknown): string {
  return Lifecycle.DIRS.indexOf(String(value)) !== -1 ? String(value) : "fr";
}

// Lien de desinscription d'un compte reel (jeton signe, 400 jours).
async function realLinks(userId: string, dir: string, secret: string, supabaseUrl: string, now: Date) {
  const token = await Lifecycle.createUnsubscribeToken({ userId, dir }, secret, now);
  return Lifecycle.unsubscribeLinks(token, dir, supabaseUrl) as { page: string; oneClick: string };
}

function readiness(deps: HandlerDeps) {
  const unsub = envValue(deps.env, "EMAIL_UNSUBSCRIBE_SECRET");
  const region = regionStatus(deps.env);
  return {
    brevo: !!brevoConfig(deps.env).apiKey,
    desinscription: !!unsub && unsub.length >= Lifecycle.MIN_SECRET_LENGTH,
    base: !!deps.db && !!envValue(deps.env, "SUPABASE_URL"),
    envoi_reel_active: realSendingEnabled(deps.env),
    region: region.region,
    region_attendue: BREVO_REGION,
    identite_expediteur: !!(envValue(deps.env, "COMPANY_OPERATOR_NAME") && envValue(deps.env, "COMPANY_ADDRESS")),
  };
}

type Summary = { checked: number; sent: number; notSent: number; skipped: number; failed: number };

// Passage sur les vrais destinataires (envoi, dryRun, apercu).
async function processCandidates(deps: HandlerDeps, rows: CandidateRow[], now: Date, dryRun: boolean) {
  const unsubscribeSecret = envValue(deps.env, "EMAIL_UNSUBSCRIBE_SECRET") as string;
  const supabaseUrl = envValue(deps.env, "SUPABASE_URL") as string;
  const cfg = brevoConfig(deps.env);
  let publicMatches: unknown[] | null | undefined;
  const matches = async () => {
    if (publicMatches === undefined) publicMatches = await loadPublicMatches(deps);
    return publicMatches;
  };
  const company = Render.companyFromEnv((k: string) => deps.env(k) ?? undefined);
  const allowBlocked = envValue(deps.env, "EMAIL_ALLOW_BLOCKED_DECISION") === "true";
  const summary: Summary = { checked: rows.length, sent: 0, notSent: 0, skipped: 0, failed: 0 };
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
    if (decision.campaign !== campaign || decision.key !== key || OWN_CAMPAIGNS.indexOf(campaign) === -1) {
      if (decision.campaign) deps.log.warn(TAG + " regles SQL/JS divergentes (" + campaign + " vs " + decision.campaign + ") : envoi ignore.");
      skip(n, campaign, decision.campaign ? "rule_mismatch" : (decision.reason || "rule_mismatch"));
      continue;
    }
    if (!Render.isValidEmail(row.email)) { skip(n, campaign, "invalid_email"); continue; }
    const dir = dirOf(row.market);
    const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
    const list = needsPublicData(campaign) ? await matches() : null;
    // Jamais de contenu invente : pas de match publie = pas d'email (retente au passage suivant).
    const prepared = Lifecycle.campaignData(campaign, list, now, ctx, { marketingOptIn: row.marketing_opt_in === true });
    if (!prepared.data) { skip(n, campaign, prepared.reason); continue; }

    let rendered: Rendered;
    let links: { page: string; oneClick: string };
    try {
      links = await realLinks(row.user_id, dir, unsubscribeSecret, supabaseUrl, now);
      rendered = Lifecycle.renderLifecycleEmail(BUNDLE, campaign, dir, prepared.data, { company, unsubscribeUrl: links.page, now }) as Rendered;
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
    const sent = await sendBrevo(deps.fetch, cfg, {
      to: row.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: Lifecycle.listUnsubscribeHeaders(links.oneClick, links.page),
      tags: ["lifecycle-" + campaign, "market-" + dir],
    });
    if (!sent.ok) {
      deps.log.error(TAG + " Brevo : " + sent.error + " : " + line);
      await finish("failed", null, sent.error);
      summary.failed++;
      results.push({ n, campaign, status: "failed", reason: sent.error });
      continue;
    }
    await finish("sent", sent.messageId || null, null);
    deps.log.info(TAG + " envoye : " + line);
    summary.sent++;
    results.push({ n, campaign, status: "sent" });
  }
  return { summary, results };
}

// Apercus : chaque campagne de cette fonction, dans les 9 versions du site, pour
// un compte fictif (lien de desinscription factice : aucun compte reel).
async function renderSamples(deps: HandlerDeps, now: Date) {
  const list = await loadPublicMatches(deps);
  const company = Render.companyFromEnv((k: string) => deps.env(k) ?? undefined);
  const apercus: Json[] = [];
  const nonRendus: Json[] = [];
  for (const dir of Lifecycle.DIRS as string[]) {
    const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
    const page = Lifecycle.SITE_URL + "/" + dir + "/desinscription-email.html#t=" + APERCU_TOKEN;
    const variants: Array<[string, string, boolean]> = OWN_CAMPAIGNS.map((c): [string, string, boolean] => [c, c, true]);
    variants.splice(1, 0, ["welcome", "welcome-sans-accord", false]);
    for (const [campaign, name, optIn] of variants) {
      const prepared = Lifecycle.campaignData(campaign, list, now, ctx, { marketingOptIn: optIn });
      if (!prepared.data) { nonRendus.push({ campaign: name, dir, raison: prepared.reason }); continue; }
      try {
        const r = Lifecycle.renderLifecycleEmail(BUNDLE, campaign, dir, prepared.data, { company, unsubscribeUrl: page, now }) as Rendered;
        apercus.push({ campaign: name, dir, subject: r.subject, html: r.html, text: r.text, identite_manquante: r.blockedDecisions });
      } catch (err) {
        nonRendus.push({ campaign: name, dir, raison: "render_" + ((err as { code?: string })?.code || "error") });
      }
    }
  }
  return { apercus, nonRendus };
}

function countBy(results: Json[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) {
    const k = String(r.campaign || "?") + ":" + String(r[field] || "");
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const auth = authorize(req, deps.env);
  if (auth === "not_configured") {
    deps.log.error(TAG + " EMAIL_INTERNAL_SECRET et RELANCE_SECRET non configures - toutes les demandes sont refusees.");
    return json(503, { ok: false, error: "internal_secret_not_configured" });
  }
  if (auth !== "ok") return json(401, { ok: false, error: "unauthorized" });
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
  const mode = body.mode === undefined ? "envoi" : String(body.mode);
  if (["envoi", "apercu", "test"].indexOf(mode) === -1) return json(400, { ok: false, error: "invalid_mode" });
  const dryRun = mode === "apercu" || body.dryRun === true;
  const limit = body.limit === undefined ? 200 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return json(400, { ok: false, error: "invalid_limit" });
  const now = deps.now();
  const pret = readiness(deps);

  // ------------------------------------------------------------- mode test
  if (mode === "test") {
    const missing = [!pret.brevo && "BREVO_API_KEY", !pret.desinscription && "EMAIL_UNSUBSCRIBE_SECRET", !pret.base && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
    if (missing.length) return json(503, { ok: false, mode, pret, error: "not_configured", missing });
    if (!regionStatus(deps.env).ok) return json(409, { ok: false, mode, pret, error: "wrong_region", raison: "appeler avec l'en-tete x-region: " + BREVO_REGION });
    const to = Lifecycle.TEST_RECIPIENT as string;
    let account: { userId: string } | null = null;
    try {
      account = await (deps.db as LifecycleStore).findAccount(to);
    } catch (err) {
      deps.log.warn(TAG + " compte de test illisible : " + errorText(err));
    }
    const userId = account ? account.userId : Lifecycle.SAMPLE_USER_ID as string;
    const dir = "fr";
    const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
    const list = await loadPublicMatches(deps);
    const links = await realLinks(userId, dir, envValue(deps.env, "EMAIL_UNSUBSCRIBE_SECRET") as string, envValue(deps.env, "SUPABASE_URL") as string, now);
    const company = Render.companyFromEnv((k: string) => deps.env(k) ?? undefined);
    const cfg = brevoConfig(deps.env);
    const results: Json[] = [];
    let identite: string[] = [];
    for (const campaign of OWN_CAMPAIGNS) {
      const prepared = Lifecycle.campaignData(campaign, list, now, ctx, { marketingOptIn: true });
      if (!prepared.data) { results.push({ campaign, status: "not_sent", reason: prepared.reason }); continue; }
      let r: Rendered;
      try {
        r = Lifecycle.renderLifecycleEmail(BUNDLE, campaign, dir, prepared.data, { company, unsubscribeUrl: links.page, now }) as Rendered;
      } catch (err) {
        results.push({ campaign, status: "not_sent", reason: "render_" + ((err as { code?: string })?.code || "error") });
        continue;
      }
      identite = r.blockedDecisions.length ? r.blockedDecisions : identite;
      const sent = await sendBrevo(deps.fetch, cfg, {
        to,
        subject: "[TEST] " + r.subject,
        html: r.html,
        text: r.text,
        headers: Lifecycle.listUnsubscribeHeaders(links.oneClick, links.page),
        tags: ["lifecycle-test", "lifecycle-" + campaign],
      });
      results.push(sent.ok ? { campaign, status: "sent" } : { campaign, status: "failed", reason: sent.error });
    }
    const envoyes = results.filter((r) => r.status === "sent").length;
    deps.log.info(TAG + " test : " + envoyes + " email(s) envoye(s) a " + Render.maskEmail(to));
    return json(200, {
      ok: !results.some((r) => r.status === "failed"), mode, destinataire: Render.maskEmail(to), compte_trouve: !!account,
      envoyes, results, identite_expediteur_manquante: identite,
    });
  }

  // ------------------------------------------------------------- mode apercu
  if (mode === "apercu") {
    const { apercus, nonRendus } = await renderSamples(deps, now);
    let candidats: Json = { lus: false };
    if (pret.base && pret.desinscription) {
      try {
        const rows = await (deps.db as LifecycleStore).listCandidates({ nowIso: now.toISOString(), limit });
        const run = await processCandidates(deps, rows, now, true);
        candidats = { lus: true, ...run.summary, par_campagne_et_raison: countBy(run.results, "reason") };
      } catch (err) {
        deps.log.error(TAG + " lecture des destinataires impossible : " + errorText(err));
        candidats = { lus: false, erreur: "db_unavailable" };
      }
    }
    return json(200, { ok: true, mode, dryRun: true, pret, candidats, apercus, non_rendus: nonRendus });
  }

  // ------------------------------------------------------------- passage normal
  if (!dryRun && !pret.envoi_reel_active) {
    deps.log.info(TAG + " envoi reel desactive (LIFECYCLE_SENDING_ENABLED) - no-op, rien n'est lu ni envoye.");
    return json(200, { ok: true, processed: false, reason: "sending_disabled" });
  }
  if (!dryRun && !pret.brevo) {
    deps.log.info(TAG + " BREVO_API_KEY absent - no-op, aucun email de relance traite.");
    return json(200, { ok: true, processed: false, reason: "brevo_not_configured" });
  }
  const missing = [
    !pret.desinscription && "EMAIL_UNSUBSCRIBE_SECRET",
    !envValue(deps.env, "SUPABASE_URL") && "SUPABASE_URL",
    !deps.db && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    deps.log.info(TAG + " relances non executees (no-op), configuration absente : " + missing.join(","));
    return json(200, { ok: true, processed: false, reason: "not_configured", missing });
  }
  if (!dryRun && !regionStatus(deps.env).ok) {
    deps.log.error(TAG + " appel hors de la region " + BREVO_REGION + " (" + pret.region + ") : Brevo refuserait l'envoi, rien n'est envoye.");
    return json(409, { ok: false, processed: false, error: "wrong_region", region: pret.region });
  }

  let rows: CandidateRow[];
  try {
    rows = await (deps.db as LifecycleStore).listCandidates({ nowIso: now.toISOString(), limit });
  } catch (err) {
    deps.log.error(TAG + " lecture des destinataires impossible : " + errorText(err));
    return json(500, { ok: false, error: "db_unavailable" });
  }
  const { summary, results } = await processCandidates(deps, rows, now, dryRun);
  deps.log.info(TAG + " execution " + now.toISOString() + (dryRun ? " (dryRun)" : "") + " : " + JSON.stringify(summary));
  return json(summary.failed ? 207 : 200, { ok: summary.failed === 0, processed: true, dryRun, ...summary, results });
}
