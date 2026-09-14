// send-transactional-email — logique de la fonction Edge, SANS dependance
// Deno/npm (reseau, base, horloge et variables d'environnement injectes) :
// testee par tests/email-edge-function.test.js (node --test) et branchee par
// index.ts (Deno.serve).
//
// APPEL COTE SERVEUR UNIQUEMENT (stripe-webhook, pg_cron via pg_net) :
// - en-tete x-internal-secret = secret EMAIL_INTERNAL_SECRET (comparaison en
//   temps constant). Secret absent cote serveur = refus (503), jamais "ouvert" ;
// - aucun en-tete CORS : un navigateur ne peut pas l'appeler.
//
// RESEND_API_KEY absent = no-op propre : l'email est rendu (validation
// complete), rien n'est envoye, un log dit ce qui AURAIT ete envoye (adresse
// masquee), reponse 200 {sent:false, reason:"resend_not_configured"}.
//
// Corps JSON accepte (POST) :
// 1. {type:"purchase_confirmation"|"renewal_reminder", stripeSubscriptionId}
//    -> les donnees sont relues chez Stripe (jamais confiance dans un montant
//    envoye par l'appelant) ; chemin utilise par stripe-webhook.
// 2. {type, market, to, data, idempotencyKey?} -> rendu direct (tests manuels).
// 3. {type:"renewal_reminder_scan", daysBefore?, dryRun?} -> execution
//    planifiee (pg_cron) : rappels MX des renouvellements a J+daysBefore.
import * as Email from "./email-bundle.generated.mjs";

export type GetEnv = (name: string) => string | undefined | null;
export type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
export type RenewingSubscriptionRow = {
  stripe_subscription_id: string;
  user_id?: string | null;
  status?: string | null;
  price_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
};
export type SubscriptionStore = {
  listRenewingSubscriptions: (args: { priceId: string; startIso: string; endIso: string }) => Promise<RenewingSubscriptionRow[]>;
};
export type HandlerDeps = {
  env: GetEnv;
  fetch: typeof fetch;
  now: () => Date;
  log: Logger;
  db: SubscriptionStore | null;
};

export const RESEND_API_URL = "https://api.resend.com/emails";
export const STRIPE_API_URL = "https://api.stripe.com/v1";
// Meme version que stripe-webhook (forme des objets identique aux evenements).
export const STRIPE_API_VERSION = "2026-06-24.dahlia";
export const MAX_BODY_BYTES = 64 * 1024;
const TAG = "[send-transactional-email]";

type Json = Record<string, unknown>;
type Rendered = { kind: string; market: string; subject: string; html: string; text: string; blockedDecisions: string[] };
type Delivery = { sent: boolean; reason?: string; id?: string | null; blockedDecisions?: string[]; httpStatus?: number };

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function envValue(deps: HandlerDeps, name: string): string | null {
  const v = deps.env(name);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function errorText(err: unknown): string {
  return String((err as Error)?.message || err).slice(0, 300);
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

// ------------------------------------------------------------------ Stripe

async function stripeRequest(deps: HandlerDeps, key: string, path: string, form?: Record<string, string>): Promise<Json> {
  const init: RequestInit = {
    method: form ? "POST" : "GET",
    headers: {
      "Authorization": "Bearer " + key,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: timeoutSignal(10000),
  };
  const res = await deps.fetch(STRIPE_API_URL + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("stripe_http_" + res.status + ":" + String((body as Json)?.error && ((body as Json).error as Json).code || ""));
  return body as Json;
}

function retrieveSubscription(deps: HandlerDeps, key: string, id: string): Promise<Json> {
  const expand = ["items.data.price.product", "customer", "latest_invoice"].map((e) => "expand%5B%5D=" + encodeURIComponent(e)).join("&");
  return stripeRequest(deps, key, "/subscriptions/" + encodeURIComponent(id) + "?" + expand);
}

// Montant exact de la prochaine facture (remises, taxes comprises).
function previewNextInvoice(deps: HandlerDeps, key: string, id: string): Promise<Json> {
  return stripeRequest(deps, key, "/invoices/create_preview", { subscription: id });
}

// ------------------------------------------------------------------ envoi

async function deliver(deps: HandlerDeps, rendered: Rendered, to: string, idempotencyKey: string | null, dryRun: boolean): Promise<Delivery> {
  const summary = rendered.kind + "/" + rendered.market + " to=" + Email.maskEmail(to) + " subject=\"" + rendered.subject + "\"";
  const blocked = rendered.blockedDecisions;
  const blockedNote = blocked.length ? " ; identite vendeur incomplete (BLOCKED_DECISION: " + blocked.join(",") + ")" : "";
  if (dryRun) {
    deps.log.info(TAG + " dryRun - NON envoye : " + summary + blockedNote);
    return { sent: false, reason: "dry_run", blockedDecisions: blocked };
  }
  const apiKey = envValue(deps, "RESEND_API_KEY");
  if (!apiKey) {
    deps.log.info(TAG + " RESEND_API_KEY absent - no-op, email NON envoye : " + summary + blockedNote);
    return { sent: false, reason: "resend_not_configured", blockedDecisions: blocked };
  }
  const from = envValue(deps, "EMAIL_FROM");
  if (!from) {
    deps.log.error(TAG + " EMAIL_FROM absent - email NON envoye : " + summary);
    return { sent: false, reason: "email_from_not_configured", blockedDecisions: blocked };
  }
  if (blocked.length && envValue(deps, "EMAIL_ALLOW_BLOCKED_DECISION") !== "true") {
    // Decision business manquante : on n'envoie pas a un client reel un email
    // contractuel avec des mentions obligatoires vides, sauf choix explicite.
    deps.log.warn(TAG + " email NON envoye, mentions vendeur manquantes (BLOCKED_DECISION: " + blocked.join(",") + "). Renseigner les secrets COMPANY_* ou EMAIL_ALLOW_BLOCKED_DECISION=true : " + summary);
    return { sent: false, reason: "blocked_decision_placeholders", blockedDecisions: blocked };
  }
  const headers: Record<string, string> = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" };
  // Resend deduplique pendant 24 h les envois portant la meme cle (re-essai
  // Stripe, double execution du cron).
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  try {
    const res = await deps.fetch(RESEND_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to: [to],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: envValue(deps, "EMAIL_REPLY_TO") || Email.SUPPORT_EMAIL,
        tags: [{ name: "category", value: rendered.kind }, { name: "market", value: rendered.market }],
      }),
      signal: timeoutSignal(10000),
    });
    const bodyText = await res.text().catch(() => "");
    if (res.status === 409) {
      deps.log.warn(TAG + " Resend 409 (cle d'idempotence deja utilisee ou envoi concurrent) : " + summary);
      return { sent: false, reason: "idempotency_conflict", blockedDecisions: blocked };
    }
    if (!res.ok) {
      deps.log.error(TAG + " Resend HTTP " + res.status + " : " + summary + " " + bodyText.slice(0, 200));
      return { sent: false, reason: "resend_http_" + res.status, httpStatus: 502, blockedDecisions: blocked };
    }
    let id: string | null = null;
    try { id = (JSON.parse(bodyText) as { id?: string }).id || null; } catch (_e) { /* corps inattendu */ }
    deps.log.info(TAG + " envoye id=" + (id || "?") + " : " + summary);
    return { sent: true, id, blockedDecisions: blocked };
  } catch (err) {
    deps.log.error(TAG + " Resend injoignable : " + summary + " " + errorText(err));
    return { sent: false, reason: "resend_network_error", httpStatus: 502, blockedDecisions: blocked };
  }
}

function renderFor(deps: HandlerDeps, kind: string, market: string, data: unknown): Rendered {
  return Email.renderEmail(kind, market, data, {
    company: Email.companyFromEnv((k: string) => deps.env(k) ?? undefined),
    portalUrl: envValue(deps, "STRIPE_PORTAL_LOGIN_URL"),
    now: deps.now(),
  }) as Rendered;
}

function renderErrorResponse(err: unknown): Response | null {
  if (err instanceof Email.EmailRenderError) {
    const e = err as unknown as { code: string; message: string };
    return json(422, { ok: false, error: "invalid_payload", code: e.code, message: e.message });
  }
  return null;
}

function deliveryResponse(d: Delivery, extra: Json): Response {
  const body: Json = { ok: !d.httpStatus, sent: d.sent, ...extra };
  if (d.reason) body.reason = d.reason;
  if (d.id) body.id = d.id;
  if (d.blockedDecisions && d.blockedDecisions.length) body.blockedDecisions = d.blockedDecisions;
  return json(d.httpStatus || 200, body);
}

// ------------------------------------------------------------ cas d'usage

async function handleDirect(deps: HandlerDeps, body: Json): Promise<Response> {
  const type = String(body.type);
  const data = body.data as Json | undefined;
  const to = typeof body.to === "string" ? body.to : (data && typeof data.customerEmail === "string" ? data.customerEmail : "");
  if (!Email.isValidEmail(to)) return json(422, { ok: false, error: "invalid_recipient" });
  let rendered: Rendered;
  try {
    rendered = renderFor(deps, type, String(body.market || ""), data);
  } catch (err) {
    const r = renderErrorResponse(err);
    if (r) return r;
    throw err;
  }
  const key = Email.cleanIdempotencyKey(body.idempotencyKey);
  const d = await deliver(deps, rendered, to, key, body.dryRun === true);
  return deliveryResponse(d, { type, market: rendered.market });
}

async function handleFromStripe(deps: HandlerDeps, body: Json): Promise<Response> {
  const type = String(body.type);
  const id = typeof body.stripeSubscriptionId === "string" ? body.stripeSubscriptionId : "";
  if (!/^sub_[A-Za-z0-9]{1,100}$/.test(id)) return json(400, { ok: false, error: "invalid_subscription_id" });
  const stripeKey = envValue(deps, "STRIPE_SECRET_KEY");
  if (!stripeKey) {
    deps.log.info(TAG + " STRIPE_SECRET_KEY absent - " + type + " " + id + " non traite (no-op).");
    return json(200, { ok: true, sent: false, reason: "stripe_not_configured", type });
  }
  let sub: Json;
  try {
    sub = await retrieveSubscription(deps, stripeKey, id);
  } catch (err) {
    deps.log.error(TAG + " lecture Stripe impossible pour " + id + " : " + errorText(err));
    return json(502, { ok: false, error: "stripe_unavailable", type });
  }
  const now = deps.now();
  let mapped: Json;
  if (type === "purchase_confirmation") {
    mapped = Email.purchaseConfirmationFromStripe({ subscription: sub });
  } else {
    const reason = Email.renewalReminderSkipReason(sub, now);
    if (reason) {
      mapped = { ok: false, reason };
    } else {
      let preview: Json;
      try {
        preview = await previewNextInvoice(deps, stripeKey, id);
      } catch (err) {
        deps.log.error(TAG + " apercu de facture Stripe impossible pour " + id + " : " + errorText(err));
        return json(502, { ok: false, error: "stripe_unavailable", type });
      }
      mapped = Email.renewalReminderFromStripe({ subscription: sub, preview, now });
    }
  }
  if (!mapped.ok) {
    deps.log.info(TAG + " " + type + " " + id + " ignore : " + mapped.reason);
    return json(200, { ok: true, sent: false, reason: mapped.reason, type });
  }
  let rendered: Rendered;
  try {
    rendered = renderFor(deps, String(mapped.kind), String(mapped.market), mapped.data);
  } catch (err) {
    const r = renderErrorResponse(err);
    if (r) {
      deps.log.error(TAG + " rendu impossible pour " + id + " : " + errorText(err));
      return r;
    }
    throw err;
  }
  const d = await deliver(deps, rendered, String(mapped.to), String(mapped.idempotencyKey), body.dryRun === true);
  return deliveryResponse(d, { type, market: rendered.market });
}

async function handleScan(deps: HandlerDeps, body: Json): Promise<Response> {
  let days: number;
  try {
    days = Email.parseReminderDays(body.daysBefore ?? envValue(deps, "MX_RENEWAL_REMINDER_DAYS"));
  } catch (err) {
    const r = renderErrorResponse(err);
    if (r) return json(400, { ok: false, error: "invalid_days_before" });
    throw err;
  }
  if (days < Email.MIN_RECOMMENDED_REMINDER_DAYS) {
    deps.log.warn(TAG + " daysBefore=" + days + " : delai inferieur au minimum recommande (" + Email.MIN_RECOMMENDED_REMINDER_DAYS + " j, a confirmer par un juriste).");
  }
  const priceId = envValue(deps, "STRIPE_PRICE_ID_MX");
  const stripeKey = envValue(deps, "STRIPE_SECRET_KEY");
  const missing = [!priceId && "STRIPE_PRICE_ID_MX", !stripeKey && "STRIPE_SECRET_KEY", !deps.db && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) {
    deps.log.info(TAG + " scan des rappels MX non execute (no-op), configuration absente : " + missing.join(","));
    return json(200, { ok: true, processed: false, reason: "not_configured", missing });
  }
  const now = deps.now();
  const win = Email.renewalWindow(now, days, Email.MARKETS.mx.timeZone);
  let rows: RenewingSubscriptionRow[];
  try {
    rows = await (deps.db as SubscriptionStore).listRenewingSubscriptions({ priceId: priceId as string, startIso: win.start, endIso: win.end });
  } catch (err) {
    deps.log.error(TAG + " lecture public.subscriptions impossible : " + errorText(err));
    return json(500, { ok: false, error: "db_unavailable" });
  }
  const summary = { checked: rows.length, sent: 0, notSent: 0, skipped: 0, failed: 0 };
  const results: Json[] = [];
  const dryRun = body.dryRun === true;
  for (const row of rows) {
    const id = row.stripe_subscription_id;
    try {
      const sub = await retrieveSubscription(deps, stripeKey as string, id);
      const reason = Email.renewalReminderSkipReason(sub, now);
      if (reason) {
        summary.skipped++;
        results.push({ subscription: id, status: "skipped", reason });
        continue;
      }
      const preview = await previewNextInvoice(deps, stripeKey as string, id);
      const mapped = Email.renewalReminderFromStripe({ subscription: sub, preview, now }) as Json;
      if (!mapped.ok) {
        summary.skipped++;
        results.push({ subscription: id, status: "skipped", reason: mapped.reason });
        continue;
      }
      // La base peut etre en retard sur Stripe : on se fie a la date Stripe.
      if (mapped.renewalLocalDate !== win.localDate) {
        summary.skipped++;
        results.push({ subscription: id, status: "skipped", reason: "renewal_date_changed" });
        continue;
      }
      const rendered = renderFor(deps, "renewal_reminder", "mx", mapped.data);
      const d = await deliver(deps, rendered, String(mapped.to), String(mapped.idempotencyKey), dryRun);
      if (d.sent) summary.sent++;
      else if (d.httpStatus) summary.failed++;
      else summary.notSent++;
      results.push({ subscription: id, status: d.sent ? "sent" : (d.httpStatus ? "failed" : "not_sent"), reason: d.reason || null });
    } catch (err) {
      summary.failed++;
      deps.log.error(TAG + " rappel MX " + id + " en erreur : " + errorText(err));
      results.push({ subscription: id, status: "failed", reason: "error" });
    }
  }
  deps.log.info(TAG + " scan rappels MX " + win.localDate + " (J-" + days + ") : " + JSON.stringify(summary));
  return json(summary.failed ? 207 : 200, { ok: summary.failed === 0, processed: true, window: win, dryRun, ...summary, results });
}

// ------------------------------------------------------------------ entree

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const secret = envValue(deps, "EMAIL_INTERNAL_SECRET");
  if (!secret) {
    deps.log.error(TAG + " EMAIL_INTERNAL_SECRET non configure - toutes les demandes sont refusees.");
    return json(503, { ok: false, error: "internal_secret_not_configured" });
  }
  if (!Email.safeEqual(req.headers.get("x-internal-secret") || "", secret)) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "payload_too_large" });
  let body: Json;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Json;
  } catch (_e) {
    return json(400, { ok: false, error: "invalid_json" });
  }
  try {
    if (body.type === "renewal_reminder_scan") return await handleScan(deps, body);
    if (body.type !== "purchase_confirmation" && body.type !== "renewal_reminder") return json(400, { ok: false, error: "unknown_type" });
    if (body.stripeSubscriptionId !== undefined) return await handleFromStripe(deps, body);
    return await handleDirect(deps, body);
  } catch (err) {
    deps.log.error(TAG + " erreur inattendue : " + errorText(err));
    return json(500, { ok: false, error: "internal_error" });
  }
}
