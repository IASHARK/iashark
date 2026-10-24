// trial-reminder — rappel 2 jours avant la fin de l'essai Pro (campagne
// « trial_ending » de lib/lifecycle-email.js). Fonction deja en ligne depuis le
// 03/10/2026 (source retiree du depot par le retour au 29/09, remise ici le
// 21/10/2026) : elle faisait deja ce rappel, elle est REUTILISEE au lieu d'en
// ecrire une seconde. Changements du 21/10/2026 :
//   - envoi par Brevo (meme methode que relance-emails, _shared/brevo.ts) au
//     lieu de Resend (jamais configure : aucun rappel n'est jamais parti) ;
//   - regle et textes dans le module commun (Lifecycle.decideTrialEnding,
//     emails/lifecycle/copy.<langue>.json, 7 langues, meme gabarit, signe Clement) ;
//   - modes apercu et test (workflow .github/workflows/emails-automatiques.yml).
//
// Logique PURE (aucune dependance Deno/npm : base, reseau, horloge et variables
// injectes) : testee par tests/trial-reminder.test.js, branchee par index.ts.
//
// APPEL SERVEUR UNIQUEMENT : x-internal-secret (EMAIL_INTERNAL_SECRET, future
// tache pg_cron) ou x-relance-secret (RELANCE_SECRET, workflow), en temps
// constant ; region us-east-2 obligatoire pour envoyer (en-tete x-region).
//
// Fenetre : essais (statut trialing, sans annulation programmee) dont la fin
// tombe entre maintenant + 36 h et maintenant + 60 h, soit « dans 2 jours »
// pour un passage horaire. Un seul envoi par abonnement : trial_reminder_sent_at
// est pose atomiquement AVANT l'envoi (leve si l'envoi echoue).
//
// E-mail lie a l'abonnement (information sur un prelevement a venir) : envoye
// meme sans consentement marketing. Il dit la date et l'heure de fin, le montant
// qui sera preleve et comment annuler. Aucune promesse de gain.
//
// Montant : celui de la PROCHAINE FACTURE lue chez Stripe (code promo et taxes
// compris, /invoices/create_preview). Lecture impossible = pas d'envoi a ce
// passage (rien n'est reserve : le passage suivant reessaie). Sans cle Stripe
// (essais locaux) : prix catalogue (config/markets.json).
//
// Corps JSON :
//   {}                 -> passage normal ; envoi reel SEULEMENT si
//                         LIFECYCLE_SENDING_ENABLED = "true" (sinon no-op).
//   { dryRun: true }   -> lecture + rendu, rien n'est reserve ni envoye.
//   { mode: "apercu" } -> dryRun (comptes seulement) + l'email rendu pour un essai
//                         fictif dans les 9 versions du site. N'envoie RIEN.
//   { mode: "test" }   -> l'email en francais a la SEULE adresse Lifecycle.TEST_RECIPIENT.
import { BUNDLE, Lifecycle, Render } from "../_shared/lifecycle-email-bundle.generated.mjs";
import { authorize, BREVO_REGION, brevoConfig, envValue, realSendingEnabled, regionStatus, sendBrevo } from "../_shared/brevo.ts";

export type GetEnv = (name: string) => string | undefined | null;
export type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
export type TrialRow = {
  stripe_subscription_id: string;
  user_id: string;
  email: string;
  status: string;
  cancel_at_period_end: boolean | null;
  trial_reminder_sent_at: string | null;
  current_period_end: string;
  market: string | null;            // marche de facturation (fr, gb, mx, za, us)
  billing_interval: string | null;
  dir?: string | null;              // version du site du compte (email_preferences.market)
};
export type TrialStore = {
  listDue: (args: { fromIso: string; toIso: string; limit: number }) => Promise<TrialRow[]>;
  // true si CETTE execution a pose trial_reminder_sent_at (sinon deja fait).
  reserve: (subscriptionId: string, nowIso: string) => Promise<boolean>;
  release: (subscriptionId: string) => Promise<void>;
  findAccount: (email: string) => Promise<{ userId: string } | null>;
};
export type Deps = { env: GetEnv; fetch: typeof fetch; now: () => Date; log: Logger; db: TrialStore | null };
export type Amount = { cents: number; currency: string };

const TAG = "[trial-reminder]";
export const CAMPAIGN = "trial_ending";
export const STRIPE_API_URL = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-06-24.dahlia"; // meme version que send-transactional-email
export const APERCU_TOKEN = "APERCU";
const MARKET_DIR: Record<string, string> = { fr: "fr", gb: "gb", za: "za", mx: "mx", us: "en" };

type Json = Record<string, unknown>;
type Rendered = { subject: string; html: string; text: string; blockedDecisions: string[] };

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// Version du site de l'abonne : celle de ses preferences e-mail, sinon celle de
// son marche de facturation (us = /en/).
export function dirFor(row: Pick<TrialRow, "dir" | "market">): string {
  const d = String(row.dir || "");
  if (Lifecycle.DIRS.indexOf(d) !== -1) return d;
  return MARKET_DIR[String(row.market || "fr").toLowerCase()] || "fr";
}

// Montant exact de la prochaine facture (remises et taxes comprises).
export async function upcomingAmount(deps: Deps, key: string, subscriptionId: string): Promise<Amount | null> {
  const res = await deps.fetch(STRIPE_API_URL + "/invoices/create_preview", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Stripe-Version": STRIPE_API_VERSION, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ subscription: subscriptionId }).toString(),
  });
  if (!res.ok) throw new Error("stripe_http_" + res.status);
  const inv = await res.json().catch(() => null) as { amount_due?: unknown; currency?: unknown } | null;
  const cents = Number(inv && inv.amount_due);
  const currency = inv && typeof inv.currency === "string" ? inv.currency : "";
  return Number.isFinite(cents) && cents >= 0 && currency ? { cents, currency } : null;
}

function readiness(deps: Deps) {
  const unsub = envValue(deps.env, "EMAIL_UNSUBSCRIBE_SECRET");
  const region = regionStatus(deps.env);
  return {
    brevo: !!brevoConfig(deps.env).apiKey,
    desinscription: !!unsub && unsub.length >= Lifecycle.MIN_SECRET_LENGTH,
    base: !!deps.db && !!envValue(deps.env, "SUPABASE_URL"),
    stripe: !!envValue(deps.env, "STRIPE_SECRET_KEY"),
    envoi_reel_active: realSendingEnabled(deps.env),
    region: region.region,
    region_attendue: BREVO_REGION,
    identite_expediteur: !!(envValue(deps.env, "COMPANY_OPERATOR_NAME") && envValue(deps.env, "COMPANY_ADDRESS")),
  };
}

function render(dir: string, trial: unknown, unsubscribeUrl: string, deps: Deps, now: Date): Rendered {
  const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
  const prepared = Lifecycle.campaignData(CAMPAIGN, null, now, ctx, { trial });
  if (!prepared.data) throw Object.assign(new Error("donnees d'essai incompletes"), { code: prepared.reason });
  const company = Render.companyFromEnv((k: string) => deps.env(k) ?? undefined);
  return Lifecycle.renderLifecycleEmail(BUNDLE, CAMPAIGN, dir, prepared.data, { company, unsubscribeUrl, now }) as Rendered;
}

async function realLinks(userId: string, dir: string, deps: Deps, now: Date) {
  const token = await Lifecycle.createUnsubscribeToken({ userId, dir }, envValue(deps.env, "EMAIL_UNSUBSCRIBE_SECRET"), now);
  return Lifecycle.unsubscribeLinks(token, dir, envValue(deps.env, "SUPABASE_URL")) as { page: string; oneClick: string };
}

// Passage sur les vrais essais (envoi ou dryRun).
async function processDue(deps: Deps, now: Date, dryRun: boolean) {
  const win = Lifecycle.trialWindow(now) as { fromIso: string; toIso: string };
  const rows = await (deps.db as TrialStore).listDue({ fromIso: win.fromIso, toIso: win.toIso, limit: 200 });
  const stripeKey = envValue(deps.env, "STRIPE_SECRET_KEY");
  const cfg = brevoConfig(deps.env);
  const allowBlocked = envValue(deps.env, "EMAIL_ALLOW_BLOCKED_DECISION") === "true";
  const counts: Record<string, number> = { due: rows.length, sent: 0, skipped: 0, failed: 0, not_sent: 0 };
  const reasons: Record<string, number> = {};
  const note = (bucket: string, reason: string) => { counts[bucket]++; reasons[reason] = (reasons[reason] || 0) + 1; };

  for (const row of rows) {
    const decision = Lifecycle.decideTrialEnding(row, now) as { due: boolean; reason: string | null };
    if (!decision.due) { note("skipped", decision.reason || "not_due"); continue; }
    if (!Render.isValidEmail(row.email)) { note("skipped", "invalid_email"); continue; }
    let exact: Amount | null = null;
    if (stripeKey) {
      try {
        exact = await upcomingAmount(deps, stripeKey, row.stripe_subscription_id);
      } catch (e) {
        deps.log.error(TAG + " montant Stripe illisible pour " + Render.maskEmail(row.email) + " : " + String((e as Error).message).slice(0, 80));
        note("failed", "stripe_unreadable");
        continue;
      }
      if (!exact) { note("skipped", "stripe_amount_missing"); continue; }
    }
    const amount = exact
      ? { amountMinor: exact.cents, currency: exact.currency.toUpperCase() }
      : Lifecycle.catalogAmount(BUNDLE.markets, String(row.market || "fr").toLowerCase(), row.billing_interval);
    // Jamais un montant invente : pas d'e-mail sans prix connu.
    if (!amount) { note("skipped", "amount_unknown"); continue; }
    const dir = dirFor(row);
    const trial = { endsAt: row.current_period_end, amountMinor: amount.amountMinor, currency: amount.currency, interval: row.billing_interval };
    let r: Rendered;
    let links: { page: string; oneClick: string };
    try {
      links = await realLinks(row.user_id, dir, deps, now);
      r = render(dir, trial, links.page, deps, now);
    } catch (e) {
      note("skipped", "render_" + ((e as { code?: string })?.code || "error"));
      continue;
    }
    const line = dir + " to=" + Render.maskEmail(row.email) + " subject=\"" + r.subject + "\"";
    if (r.blockedDecisions.length && !allowBlocked) {
      deps.log.warn(TAG + " NON envoye, identite expediteur manquante (BLOCKED_DECISION: " + r.blockedDecisions.join(",") + ") : " + line);
      note("not_sent", "blocked_decision_placeholders");
      continue;
    }
    if (dryRun) { deps.log.info(TAG + " dryRun - NON envoye : " + line); note("not_sent", "dry_run"); continue; }
    if (!(await (deps.db as TrialStore).reserve(row.stripe_subscription_id, now.toISOString()))) { note("skipped", "already_reserved"); continue; }
    const sent = await sendBrevo(deps.fetch, cfg, {
      to: row.email,
      subject: r.subject,
      html: r.html,
      text: r.text,
      headers: Lifecycle.listUnsubscribeHeaders(links.oneClick, links.page),
      tags: ["lifecycle-" + CAMPAIGN, "market-" + dir],
    });
    if (!sent.ok) {
      // Echec : la reservation est levee pour que le passage suivant reessaie.
      await (deps.db as TrialStore).release(row.stripe_subscription_id);
      deps.log.error(TAG + " echec pour " + Render.maskEmail(row.email) + " : " + sent.error);
      note("failed", sent.error);
      continue;
    }
    deps.log.info(TAG + " envoye : " + line);
    note("sent", "sent");
  }
  return { counts, reasons };
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const auth = authorize(req, deps.env);
  if (auth === "not_configured") return json(503, { ok: false, error: "internal_secret_not_configured" });
  if (auth !== "ok") return json(401, { ok: false, error: "unauthorized" });
  let body: Json = {};
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json(413, { ok: false, error: "payload_too_large" });
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Json;
  } catch (_e) {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const mode = body.mode === undefined ? "envoi" : String(body.mode);
  if (["envoi", "apercu", "test"].indexOf(mode) === -1) return json(400, { ok: false, error: "invalid_mode" });
  const dryRun = mode === "apercu" || body.dryRun === true;
  const now = deps.now();
  const pret = readiness(deps);

  if (mode === "test") {
    const missing = [!pret.brevo && "BREVO_API_KEY", !pret.desinscription && "EMAIL_UNSUBSCRIBE_SECRET", !pret.base && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
    if (missing.length) return json(503, { ok: false, mode, pret, error: "not_configured", missing });
    if (!regionStatus(deps.env).ok) return json(409, { ok: false, mode, pret, error: "wrong_region", raison: "appeler avec l'en-tete x-region: " + BREVO_REGION });
    const to = Lifecycle.TEST_RECIPIENT as string;
    let account: { userId: string } | null = null;
    try { account = await (deps.db as TrialStore).findAccount(to); } catch (err) { deps.log.warn(TAG + " compte de test illisible : " + String((err as Error).message).slice(0, 80)); }
    const dir = "fr";
    const links = await realLinks(account ? account.userId : Lifecycle.SAMPLE_USER_ID as string, dir, deps, now);
    let r: Rendered;
    try {
      r = render(dir, Lifecycle.sampleTrial(Lifecycle.siteContext(BUNDLE.markets, dir), now), links.page, deps, now);
    } catch (e) {
      return json(200, { ok: false, mode, results: [{ campaign: CAMPAIGN, status: "not_sent", reason: "render_" + ((e as { code?: string })?.code || "error") }] });
    }
    const sent = await sendBrevo(deps.fetch, brevoConfig(deps.env), {
      to,
      subject: "[TEST] " + r.subject,
      html: r.html,
      text: r.text,
      headers: Lifecycle.listUnsubscribeHeaders(links.oneClick, links.page),
      tags: ["lifecycle-test", "lifecycle-" + CAMPAIGN],
    });
    deps.log.info(TAG + " test : " + (sent.ok ? "envoye" : "echec") + " a " + Render.maskEmail(to));
    return json(200, {
      ok: sent.ok, mode, destinataire: Render.maskEmail(to), compte_trouve: !!account, envoyes: sent.ok ? 1 : 0,
      results: [sent.ok ? { campaign: CAMPAIGN, status: "sent" } : { campaign: CAMPAIGN, status: "failed", reason: sent.error }],
      identite_expediteur_manquante: r.blockedDecisions,
    });
  }

  if (mode === "apercu") {
    const apercus: Json[] = [];
    const nonRendus: Json[] = [];
    for (const dir of Lifecycle.DIRS as string[]) {
      const ctx = Lifecycle.siteContext(BUNDLE.markets, dir);
      try {
        const r = render(dir, Lifecycle.sampleTrial(ctx, now), Lifecycle.SITE_URL + "/" + dir + "/desinscription-email.html#t=" + APERCU_TOKEN, deps, now);
        apercus.push({ campaign: CAMPAIGN, dir, subject: r.subject, html: r.html, text: r.text, identite_manquante: r.blockedDecisions });
      } catch (e) {
        nonRendus.push({ campaign: CAMPAIGN, dir, raison: "render_" + ((e as { code?: string })?.code || "error") });
      }
    }
    let essais: Json = { lus: false };
    if (pret.base && pret.desinscription) {
      try {
        const run = await processDue(deps, now, true);
        essais = { lus: true, ...run.counts, raisons: run.reasons };
      } catch (err) {
        deps.log.error(TAG + " lecture des essais impossible : " + String((err as Error).message).slice(0, 120));
        essais = { lus: false, erreur: "db_unavailable" };
      }
    }
    return json(200, { ok: true, mode, dryRun: true, pret, essais, apercus, non_rendus: nonRendus });
  }

  if (!dryRun && !pret.envoi_reel_active) {
    deps.log.info(TAG + " envoi reel desactive (LIFECYCLE_SENDING_ENABLED) - no-op.");
    return json(200, { ok: true, processed: false, reason: "sending_disabled" });
  }
  if (!dryRun && !pret.brevo) {
    deps.log.info(TAG + " BREVO_API_KEY absent - no-op.");
    return json(200, { ok: true, processed: false, reason: "brevo_not_configured" });
  }
  if (!deps.db) return json(503, { ok: false, error: "db_not_configured" });
  const missing = [!pret.desinscription && "EMAIL_UNSUBSCRIBE_SECRET", !envValue(deps.env, "SUPABASE_URL") && "SUPABASE_URL"].filter(Boolean);
  if (missing.length) return json(200, { ok: true, processed: false, reason: "not_configured", missing });
  if (!dryRun && !regionStatus(deps.env).ok) {
    deps.log.error(TAG + " appel hors de la region " + BREVO_REGION + " (" + pret.region + ") : rien n'est envoye.");
    return json(409, { ok: false, processed: false, error: "wrong_region", region: pret.region });
  }
  let run: { counts: Record<string, number>; reasons: Record<string, number> };
  try {
    run = await processDue(deps, now, dryRun);
  } catch (err) {
    deps.log.error(TAG + " lecture des essais impossible : " + String((err as Error).message).slice(0, 120));
    return json(500, { ok: false, error: "db_unavailable" });
  }
  return json(200, { ok: run.counts.failed === 0, processed: true, dryRun, ...run.counts, raisons: run.reasons });
}
