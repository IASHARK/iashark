// trial-reminder — rappel 2 jours avant la fin de l'essai de 7 jours.
// Logique PURE (aucune dependance Deno/npm : base, reseau, horloge et
// variables injectes) : testee par tests/pro-trial.test.js, branchee par
// index.ts (Deno.serve).
//
// APPEL SERVEUR UNIQUEMENT (pg_cron toutes les heures, migration
// 0042_schedule_trial_reminder.sql, ecrite, pas appliquee) :
// en-tete x-internal-secret = EMAIL_INTERNAL_SECRET, compare en temps
// constant ; secret absent cote serveur = refus 503.
//
// Fenetre : essais (status trialing, pas d'annulation programmee) dont la fin
// tombe entre maintenant + 36 h et maintenant + 60 h, soit « dans 2 jours »
// pour un passage horaire. Un seul envoi par abonnement : la ligne est
// reservee (trial_reminder_sent_at pose atomiquement) AVANT l'envoi.
//
// E-mail TRANSACTIONNEL (information contractuelle sur un prelevement a
// venir) : envoye meme sans consentement marketing. Il dit : la date de fin,
// le montant qui sera preleve, comment annuler en 1 clic. Aucune promesse de
// gain, aucun chiffre de resultat.
//
// RESEND_API_KEY absent = no-op propre (rien n'est reserve, rien n'est envoye).
//
// Montant : celui de la PROCHAINE FACTURE lue chez Stripe (code promo et
// taxes compris, /invoices/create_preview), jamais le prix catalogue quand
// Stripe est configure. Lecture impossible = pas d'envoi a ce passage (la
// ligne n'est pas reservee : le passage suivant reessaie). Sans cle Stripe
// (essais locaux) : prix catalogue.
// Date : a l'heure du pays de l'abonne (Mexique : heure de Mexico).

import { PRO_PRICES } from "../create-checkout-session/prices.generated.ts";

export type GetEnv = (name: string) => string | undefined | null;
export type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
export type TrialRow = {
  stripe_subscription_id: string;
  email: string;
  market: string | null;
  billing_interval: string | null;
  current_period_end: string;
  locale?: string | null;
};
export type TrialStore = {
  listDue: (args: { fromIso: string; toIso: string; limit: number }) => Promise<TrialRow[]>;
  // true si CETTE execution a pose trial_reminder_sent_at (sinon deja fait).
  reserve: (subscriptionId: string, nowIso: string) => Promise<boolean>;
  release: (subscriptionId: string) => Promise<void>;
};
export type Deps = { env: GetEnv; fetch: typeof fetch; now: () => Date; log: Logger; db: TrialStore | null };
export type Amount = { cents: number; currency: string };

const TAG = "[trial-reminder]";
export const RESEND_API_URL = "https://api.resend.com/emails";
export const STRIPE_API_URL = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-06-24.dahlia"; // meme version que send-transactional-email
export const WINDOW_FROM_HOURS = 36;
export const WINDOW_TO_HOURS = 60;

const MARKET_LOCALE: Record<string, string> = { fr: "fr", gb: "en", za: "en", us: "en", mx: "es-mx" };
const LOCALE_INTL: Record<string, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", "es-mx": "es-MX", de: "de-DE", it: "it-IT", pt: "pt-PT" };
const LOCALE_DIR: Record<string, string> = { fr: "fr", en: "en", es: "es", "es-mx": "mx", de: "en", it: "en", pt: "en" };
// Fuseau du pays de l'abonne (sa date de fin, pas celle de Paris).
export const MARKET_TIMEZONE: Record<string, string> = {
  fr: "Europe/Paris", gb: "Europe/London", za: "Africa/Johannesburg", mx: "America/Mexico_City", us: "America/New_York",
};
export function timeZoneFor(market: string | null): string {
  return MARKET_TIMEZONE[String(market || "fr").toLowerCase()] || "Europe/Paris";
}

type Texts = { subject: string; hello: string; ends: string; amount: string; nothing: string; cancel: string; button: string; keep: string; footer: string; per: Record<string, string> };
export const TEXTS: Record<string, Texts> = {
  fr: {
    subject: "Ton essai IASHARK Pro se termine dans 2 jours",
    hello: "Bonjour,",
    ends: "Ton essai gratuit de IASHARK Pro se termine le {date}.",
    amount: "Si tu gardes Pro, ton abonnement démarre ce jour-là : {amount} {per}, prélevés sur la carte enregistrée.",
    nothing: "Si tu ne veux pas continuer, annule avant cette date : rien ne sera prélevé.",
    cancel: "L'annulation se fait en 1 clic, dans ton compte, rubrique Abonnement.",
    button: "Gérer mon abonnement",
    keep: "Tu n'as rien à faire pour continuer.",
    footer: "Cet e-mail t'est envoyé parce que tu as commencé un essai IASHARK Pro. Il concerne ton abonnement : il est envoyé même si tu ne reçois pas nos autres e-mails.",
    per: { week: "par semaine", month: "par mois", year: "par an" },
  },
  en: {
    subject: "Your IASHARK Pro trial ends in 2 days",
    hello: "Hello,",
    ends: "Your free IASHARK Pro trial ends on {date}.",
    amount: "If you keep Pro, your subscription starts that day: {amount} {per}, charged to the card on file.",
    nothing: "If you don't want to continue, cancel before that date: nothing will be charged.",
    cancel: "Cancelling takes 1 click, in your account, under Subscription.",
    button: "Manage my subscription",
    keep: "There's nothing to do if you want to continue.",
    footer: "You're receiving this email because you started an IASHARK Pro trial. It concerns your subscription, so it's sent even if you don't receive our other emails.",
    per: { week: "per week", month: "per month", year: "per year" },
  },
  es: {
    subject: "Tu prueba de IASHARK Pro termina en 2 días",
    hello: "Hola:",
    ends: "Tu prueba gratuita de IASHARK Pro termina el {date}.",
    amount: "Si sigues con Pro, tu suscripción empieza ese día: {amount} {per}, cargados en la tarjeta registrada.",
    nothing: "Si no quieres seguir, cancela antes de esa fecha: no se cobrará nada.",
    cancel: "Cancelar se hace en 1 clic, en tu cuenta, apartado Suscripción.",
    button: "Gestionar mi suscripción",
    keep: "Si quieres seguir, no tienes que hacer nada.",
    footer: "Recibes este correo porque empezaste una prueba de IASHARK Pro. Se refiere a tu suscripción: se envía aunque no recibas nuestros otros correos.",
    per: { week: "por semana", month: "al mes", year: "al año" },
  },
  "es-mx": {
    subject: "Tu prueba de IASHARK Pro termina en 2 días",
    hello: "Hola:",
    ends: "Tu prueba gratis de IASHARK Pro termina el {date}.",
    amount: "Si te quedas con Pro, tu suscripción empieza ese día: {amount} {per}, con cargo a la tarjeta registrada.",
    nothing: "Si no quieres continuar, cancela antes de esa fecha: no se hará ningún cargo.",
    cancel: "Cancelar toma 1 clic, en tu cuenta, sección Suscripción.",
    button: "Administrar mi suscripción",
    keep: "Si quieres continuar, no tienes que hacer nada.",
    footer: "Recibes este correo porque iniciaste una prueba de IASHARK Pro. Tiene que ver con tu suscripción: se envía aunque no recibas nuestros otros correos.",
    per: { week: "por semana", month: "al mes", year: "al año" },
  },
  de: {
    subject: "Dein IASHARK-Pro-Test endet in 2 Tagen",
    hello: "Hallo,",
    ends: "Dein kostenloser IASHARK-Pro-Test endet am {date}.",
    amount: "Wenn du Pro behältst, beginnt dein Abo an diesem Tag: {amount} {per}, abgebucht von der hinterlegten Karte.",
    nothing: "Wenn du nicht weitermachen willst, kündige vor diesem Datum: Es wird nichts abgebucht.",
    cancel: "Die Kündigung dauert 1 Klick, in deinem Konto unter Abonnement.",
    button: "Mein Abo verwalten",
    keep: "Wenn du weitermachen willst, musst du nichts tun.",
    footer: "Du erhältst diese E-Mail, weil du einen IASHARK-Pro-Test begonnen hast. Sie betrifft dein Abo und wird auch gesendet, wenn du unsere anderen E-Mails nicht erhältst.",
    per: { week: "pro Woche", month: "pro Monat", year: "pro Jahr" },
  },
  it: {
    subject: "La tua prova di IASHARK Pro finisce tra 2 giorni",
    hello: "Ciao,",
    ends: "La tua prova gratuita di IASHARK Pro finisce il {date}.",
    amount: "Se tieni Pro, l'abbonamento parte quel giorno: {amount} {per}, addebitati sulla carta registrata.",
    nothing: "Se non vuoi continuare, annulla prima di quella data: non verrà addebitato nulla.",
    cancel: "Annullare richiede 1 clic, nel tuo account, sezione Abbonamento.",
    button: "Gestisci il mio abbonamento",
    keep: "Se vuoi continuare, non devi fare nulla.",
    footer: "Ricevi questa e-mail perché hai iniziato una prova di IASHARK Pro. Riguarda il tuo abbonamento: viene inviata anche se non ricevi le nostre altre e-mail.",
    per: { week: "a settimana", month: "al mese", year: "all'anno" },
  },
  pt: {
    subject: "O teu teste do IASHARK Pro termina dentro de 2 dias",
    hello: "Olá,",
    ends: "O teu teste gratuito do IASHARK Pro termina a {date}.",
    amount: "Se ficares com o Pro, a assinatura começa nesse dia: {amount} {per}, cobrados no cartão registado.",
    nothing: "Se não quiseres continuar, cancela antes dessa data: nada será cobrado.",
    cancel: "Cancelar demora 1 clique, na tua conta, secção Assinatura.",
    button: "Gerir a minha assinatura",
    keep: "Se quiseres continuar, não tens de fazer nada.",
    footer: "Recebes este e-mail porque começaste um teste do IASHARK Pro. Diz respeito à tua assinatura: é enviado mesmo que não recebas os nossos outros e-mails.",
    per: { week: "por semana", month: "por mês", year: "por ano" },
  },
};

export function localeFor(row: Pick<TrialRow, "market" | "locale">): string {
  const l = String(row.locale || "").toLowerCase();
  if (l === "es" && String(row.market || "").toLowerCase() === "mx") return "es-mx";
  if (TEXTS[l]) return l;
  return MARKET_LOCALE[String(row.market || "fr").toLowerCase()] || "fr";
}

export function amountFor(market: string | null, interval: string | null): { cents: number; currency: string } | null {
  const m = PRO_PRICES[String(market || "fr").toLowerCase()];
  const k = String(interval || "") as "week" | "month" | "year";
  const row = m && m.intervals[k];
  return row ? { cents: row.unitAmount, currency: m.currency } : null;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// `exact` = montant de la prochaine facture lu chez Stripe (remise comprise).
export function renderReminder(row: TrialRow, siteUrl: string, exact?: Amount | null) {
  const locale = localeFor(row);
  const t = TEXTS[locale];
  const intl = LOCALE_INTL[locale] || "fr-FR";
  const date = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: timeZoneFor(row.market) }).format(new Date(row.current_period_end));
  const price = exact || amountFor(row.market, row.billing_interval);
  if (!price || !(price.cents >= 0) || !price.currency) return null; // jamais un montant invente : pas d'e-mail sans prix connu
  const amount = new Intl.NumberFormat(intl, { style: "currency", currency: price.currency.toUpperCase() }).format(price.cents / 100);
  const per = t.per[String(row.billing_interval)] || "";
  const link = siteUrl.replace(/\/$/, "") + "/" + (LOCALE_DIR[locale] || "fr") + "/compte.html#abonnement";
  const lines = [
    t.hello,
    t.ends.replace("{date}", date),
    t.amount.replace("{amount}", amount).replace("{per}", per),
    t.nothing,
    t.cancel,
    t.keep,
  ];
  const text = lines.join("\n\n") + "\n\n" + t.button + " : " + link + "\n\n—\n" + t.footer;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">'
    + lines.map((l) => "<p>" + esc(l) + "</p>").join("")
    + '<p><a href="' + esc(link) + '" style="display:inline-block;background:#20d5ef;color:#04141b;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">' + esc(t.button) + "</a></p>"
    + '<p style="font-size:12px;color:#64748b">' + esc(t.footer) + "</p></div>";
  return { locale, subject: t.subject, text, html, link };
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

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function mask(email: string): string {
  const [u, d] = String(email).split("@");
  return (u ? u.slice(0, 1) + "***" : "***") + "@" + (d || "?");
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const secret = deps.env("EMAIL_INTERNAL_SECRET");
  if (!secret) return json(503, { ok: false, error: "not_configured" });
  if (!safeEqual(req.headers.get("x-internal-secret") || "", secret)) return json(401, { ok: false, error: "unauthorized" });
  let dryRun = false;
  try { dryRun = (await req.json())?.dryRun === true; } catch (_e) { /* corps vide */ }
  const apiKey = deps.env("RESEND_API_KEY");
  if (!apiKey && !dryRun) {
    deps.log.info(TAG + " RESEND_API_KEY absent - no-op.");
    return json(200, { ok: true, processed: false, reason: "resend_not_configured" });
  }
  const from = deps.env("EMAIL_FROM");
  if (!from && !dryRun) return json(200, { ok: true, processed: false, reason: "email_from_not_configured" });
  if (!deps.db) return json(503, { ok: false, error: "db_not_configured" });

  const now = deps.now();
  const fromIso = new Date(now.getTime() + WINDOW_FROM_HOURS * 3600e3).toISOString();
  const toIso = new Date(now.getTime() + WINDOW_TO_HOURS * 3600e3).toISOString();
  const siteUrl = deps.env("SITE_URL") || "https://iashark.com";
  const rows = await deps.db.listDue({ fromIso, toIso, limit: 200 });
  let sent = 0, skipped = 0, failed = 0;
  const stripeKey = deps.env("STRIPE_SECRET_KEY");
  for (const row of rows) {
    let exact: Amount | null = null;
    if (stripeKey) {
      try {
        exact = await upcomingAmount(deps, stripeKey, row.stripe_subscription_id);
      } catch (e) {
        failed++;
        deps.log.error(TAG + " montant Stripe illisible pour " + mask(row.email) + " : " + String((e as Error).message).slice(0, 80));
        continue;
      }
      if (!exact) { skipped++; continue; }
    }
    const mail = renderReminder(row, siteUrl, exact);
    if (!mail || !row.email) { skipped++; continue; }
    if (dryRun) { deps.log.info(TAG + " dryRun " + mask(row.email) + " " + mail.subject); skipped++; continue; }
    if (!(await deps.db.reserve(row.stripe_subscription_id, now.toISOString()))) { skipped++; continue; }
    try {
      const res = await deps.fetch(RESEND_API_URL, {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": "trial-reminder-" + row.stripe_subscription_id },
        body: JSON.stringify({ from, to: [row.email], subject: mail.subject, html: mail.html, text: mail.text, tags: [{ name: "category", value: "trial_reminder" }] }),
      });
      if (!res.ok) throw new Error("resend_http_" + res.status);
      sent++;
      deps.log.info(TAG + " envoye a " + mask(row.email));
    } catch (e) {
      failed++;
      // Echec : la reservation est levee pour que le passage suivant reessaie.
      await deps.db.release(row.stripe_subscription_id);
      deps.log.error(TAG + " echec pour " + mask(row.email) + " : " + String((e as Error).message).slice(0, 120));
    }
  }
  return json(200, { ok: true, processed: true, due: rows.length, sent, skipped, failed });
}
