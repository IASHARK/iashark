// Routage evenement Stripe -> e-mail transactionnel. Module pur (Stripe,
// base et fetch injectes). Appele par supabase/functions/stripe-webhook APRES
// le traitement facturation ; ne leve jamais d'exception.
//
// Evenements :
// - checkout.session.completed (mode subscription, paiement confirme) et
//   invoice.paid (billing_reason=subscription_create) -> confirmation d'achat.
//   Meme cle d'idempotence "purchase_confirmation:<subscription>" : un seul
//   e-mail quel que soit l'ordre d'arrivee (Stripe ne le garantit pas, bug n°1
//   du webhook), et le second evenement rattrape un premier envoi echoue.
// - invoice.upcoming (abonnement market=mx) -> rappel avant renouvellement,
//   cle "renewal_reminder_mx:<subscription>:<date de renouvellement UTC>".
//   La MEME cle est utilisee par public.flag_missing_mx_renewal_reminders()
//   (migration 0020) : un rappel signale manquant est envoye des que
//   l'evenement arrive.
// - invoice.payment_failed (billing_reason=subscription_cycle) -> echec de
//   paiement, cle "payment_failed:<invoice>" : un seul e-mail par facture,
//   pas un par relance Stripe.
import type { EmailConfig } from "./config.ts";
import { missingCompanyFields } from "./config.ts";
import type { DeliveryResult, EmailKind, EmailLogStore, LogFn } from "./sender.ts";
import { deliverEmail } from "./sender.ts";
import { DIRS, MARKET_CURRENCY, isRegime, normMarket, regimeForMarket, resolveDir } from "./markets.ts";
import { TEMPLATE_VERSION, normLocale, resolveEmailLocale } from "./templates/index.ts";
import type { PurchaseConfirmationData } from "./templates/purchase-confirmation.ts";
import { renderPurchaseConfirmation } from "./templates/purchase-confirmation.ts";
import type { RenewalReminderData } from "./templates/renewal-reminder.ts";
import { renderRenewalReminder } from "./templates/renewal-reminder.ts";
import type { PaymentFailedData } from "./templates/payment-failed.ts";
import { renderPaymentFailed } from "./templates/payment-failed.ts";

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

export type StripeEventLike = { id: string; type: string; data: { object: Obj } };

export type EmailPlan = {
  kind: EmailKind;
  subscriptionId: string;
  customerId: string | null;
  invoiceId: string | null;
  amountMinor: number | null;
  currency: string | null;
  email: string | null;
  userId: string | null;
  metadata: Record<string, string>;
  periodStart: string | null;
};

export type SubscriptionInfo = {
  id: string;
  customerId: string | null;
  status: string;
  metadata: Record<string, string>;
  startDate: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  planName: string;
  unitAmountMinor: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;
};

export type StripeEmailDeps = {
  config: EmailConfig;
  store: EmailLogStore;
  fetch: typeof fetch;
  now: () => Date;
  log: LogFn;
  getSubscription: (id: string) => Promise<Obj | null>;
  getCustomerEmail: (customerId: string) => Promise<string | null>;
  findUserId: (customerId: string) => Promise<string | null>;
  pastDueGraceDays: number;
};

export const purchaseKey = (subscriptionId: string) => "purchase_confirmation:" + subscriptionId;
export const reminderKey = (subscriptionId: string, renewalIso: string) => "renewal_reminder_mx:" + subscriptionId + ":" + renewalIso.slice(0, 10);
export const paymentFailedKey = (invoiceId: string) => "payment_failed:" + invoiceId;

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : (v && typeof v === "object" && typeof (v as Obj).id === "string" ? (v as Obj).id : null);

const iso = (ts: unknown): string | null => (typeof ts === "number" && ts > 0 ? new Date(ts * 1000).toISOString() : null);

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Obj)) if (typeof x === "string") out[k] = x;
  return out;
}

// Meme lecture que le webhook : abonnement.subscription (anciennes versions
// d'API) ou parent.subscription_details.subscription (versions basil/dahlia).
export function subscriptionIdFromInvoice(invoice: Obj): string | null {
  return idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
}

function invoiceSubscriptionMetadata(invoice: Obj): Record<string, string> {
  return stringMap(invoice.parent?.subscription_details?.metadata ?? invoice.subscription_details?.metadata);
}

export function planEmailsForEvent(event: StripeEventLike): EmailPlan[] {
  const o = event?.data?.object || {};
  switch (event?.type) {
    case "checkout.session.completed": {
      const subscriptionId = idOf(o.subscription);
      if (o.mode !== "subscription" || !subscriptionId) return [];
      // Contrat forme quand le paiement est confirme ; un paiement differe est
      // confirme plus tard par invoice.paid (meme cle d'idempotence).
      if (o.payment_status !== "paid" && o.payment_status !== "no_payment_required") return [];
      return [{
        kind: "purchase_confirmation",
        subscriptionId,
        customerId: idOf(o.customer),
        invoiceId: idOf(o.invoice),
        amountMinor: typeof o.amount_total === "number" ? o.amount_total : null,
        currency: typeof o.currency === "string" ? o.currency : null,
        email: o.customer_details?.email || o.customer_email || null,
        userId: typeof o.client_reference_id === "string" ? o.client_reference_id : null,
        metadata: stringMap(o.metadata),
        periodStart: null,
      }];
    }
    case "invoice.paid": {
      const subscriptionId = subscriptionIdFromInvoice(o);
      if (!subscriptionId || o.billing_reason !== "subscription_create") return [];
      return [{
        kind: "purchase_confirmation",
        subscriptionId,
        customerId: idOf(o.customer),
        invoiceId: typeof o.id === "string" ? o.id : null,
        amountMinor: typeof o.amount_paid === "number" ? o.amount_paid : null,
        currency: typeof o.currency === "string" ? o.currency : null,
        email: o.customer_email || null,
        userId: null,
        metadata: invoiceSubscriptionMetadata(o),
        periodStart: null,
      }];
    }
    case "invoice.upcoming": {
      const subscriptionId = subscriptionIdFromInvoice(o);
      if (!subscriptionId) return [];
      const meta = invoiceSubscriptionMetadata(o);
      // Filtre precoce sans appel Stripe quand le marche est deja connu.
      if (meta.market && normMarket(meta.market) !== "mx") return [];
      return [{
        kind: "renewal_reminder_mx",
        subscriptionId,
        customerId: idOf(o.customer),
        invoiceId: null,
        amountMinor: typeof o.amount_due === "number" ? o.amount_due : null,
        currency: typeof o.currency === "string" ? o.currency : null,
        email: o.customer_email || null,
        userId: null,
        metadata: meta,
        periodStart: null,
      }];
    }
    case "invoice.payment_failed": {
      const subscriptionId = subscriptionIdFromInvoice(o);
      // Premier paiement : l'echec est affiche sur la page de paiement, aucun
      // contrat n'est forme -> pas d'e-mail.
      if (!subscriptionId || o.billing_reason !== "subscription_cycle" || typeof o.id !== "string") return [];
      const line = o.lines?.data?.[0];
      return [{
        kind: "payment_failed",
        subscriptionId,
        customerId: idOf(o.customer),
        invoiceId: o.id,
        amountMinor: typeof o.amount_due === "number" ? o.amount_due : null,
        currency: typeof o.currency === "string" ? o.currency : null,
        email: o.customer_email || null,
        userId: null,
        metadata: invoiceSubscriptionMetadata(o),
        periodStart: iso(line?.period?.start) ?? iso(o.period_start),
      }];
    }
    default:
      return [];
  }
}

export function subscriptionInfoFromStripe(sub: Obj): SubscriptionInfo {
  const item = sub?.items?.data?.[0] || {};
  const price = item.price || {};
  const product = price.product;
  const planName = (product && typeof product === "object" && typeof product.name === "string" && product.name) ||
    (typeof price.nickname === "string" && price.nickname) || "IASHARK Pro";
  return {
    id: String(sub?.id || ""),
    customerId: idOf(sub?.customer),
    status: String(sub?.status || ""),
    metadata: stringMap(sub?.metadata),
    startDate: iso(sub?.start_date) ?? iso(sub?.created),
    // current_period_end : sur l'abonnement (anciennes API) ou sur l'item
    // (versions dahlia) - meme regle que periodEndIso() du webhook.
    periodEnd: iso(sub?.current_period_end) ?? iso(item.current_period_end),
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
    planName,
    unitAmountMinor: typeof price.unit_amount === "number" ? price.unit_amount * (typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1) : null,
    currency: typeof price.currency === "string" ? price.currency : null,
    interval: typeof price.recurring?.interval === "string" ? price.recurring.interval : null,
    intervalCount: typeof price.recurring?.interval_count === "number" ? price.recurring.interval_count : null,
  };
}

async function alreadyDone(store: EmailLogStore, key: string): Promise<boolean> {
  try {
    const row = await store.get(key);
    return !!row && (row.status === "sent" || row.status === "skipped");
  } catch (_e) {
    return false; // deliverEmail refera la verification de facon sure
  }
}

async function safe<T>(p: () => Promise<T>): Promise<T | null> {
  try { return await p(); } catch (_e) { return null; }
}

export async function handleStripeEventEmails(event: StripeEventLike, deps: StripeEmailDeps): Promise<DeliveryResult[]> {
  let plans: EmailPlan[] = [];
  try {
    plans = planEmailsForEvent(event);
  } catch (err) {
    deps.log("error", "[email] routage impossible pour " + event?.type + ": " + String((err as Error)?.message || err));
    return [];
  }
  const results: DeliveryResult[] = [];
  for (const plan of plans) {
    let key = plan.kind === "purchase_confirmation" ? purchaseKey(plan.subscriptionId)
      : plan.kind === "payment_failed" ? paymentFailedKey(plan.invoiceId || "")
      : "renewal_reminder_mx:" + plan.subscriptionId;
    try {
      if (plan.kind !== "renewal_reminder_mx" && await alreadyDone(deps.store, key)) {
        results.push({ status: "duplicate", key, kind: plan.kind });
        continue;
      }
      const raw = await deps.getSubscription(plan.subscriptionId);
      if (!raw) throw new Error("abonnement Stripe introuvable " + plan.subscriptionId);
      const sub = subscriptionInfoFromStripe(raw);
      const meta = { ...sub.metadata, ...plan.metadata };
      const market = normMarket(meta.market);
      const dirInfo = resolveDir(meta.consent_dir, market);
      const customerId = plan.customerId || sub.customerId;
      const currency = (plan.currency || sub.currency || MARKET_CURRENCY[market] || "eur").toUpperCase();

      if (plan.kind === "renewal_reminder_mx") {
        if (market !== "mx" || !["active", "trialing"].includes(sub.status) || sub.cancelAtPeriodEnd || !sub.periodEnd) {
          results.push({ status: "not_applicable", key, kind: plan.kind });
          continue;
        }
        key = reminderKey(plan.subscriptionId, sub.periodEnd);
        if (await alreadyDone(deps.store, key)) {
          results.push({ status: "duplicate", key, kind: plan.kind });
          continue;
        }
      }

      const to = plan.email || (customerId ? await safe(() => deps.getCustomerEmail(customerId)) : null);
      const userId = plan.userId || (customerId ? await safe(() => deps.findUserId(customerId)) : null);
      const missing = missingCompanyFields(deps.config.company);
      if (missing.length) deps.log("warn", "[email] identite vendeur incomplete (" + missing.join(",") + ") - placeholders affiches (BLOCKED_DECISION, voir EMAILS.md).");

      let rendered;
      let renderData: unknown;
      let regime: string | null = null;
      let locale: string;
      if (plan.kind === "purchase_confirmation") {
        const r = isRegime(meta.consent_regime) ? meta.consent_regime : regimeForMarket(market);
        regime = r;
        const emailLocale = resolveEmailLocale(meta.consent_locale, dirInfo.locale, r);
        const data: PurchaseConfirmationData = {
          locale: emailLocale,
          consentLocale: normLocale(meta.consent_locale) || emailLocale,
          regime: r,
          market,
          dir: dirInfo.dir,
          siteUrl: deps.config.siteUrl,
          planName: sub.planName,
          amountPaidMinor: plan.amountMinor,
          recurringAmountMinor: sub.unitAmountMinor,
          currency,
          interval: sub.interval,
          intervalCount: sub.intervalCount,
          startDate: sub.startDate,
          renewalDate: sub.periodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          customerEmail: to || "",
          consent: {
            terms: meta.consent_terms === "true",
            waiver: meta.consent_waiver === "true" || meta.consent_waiver === "false" || meta.consent_waiver === "null" ? meta.consent_waiver : null,
            waiverType: meta.consent_waiver_type || null,
            termsVersion: meta.consent_terms_version || null,
            locale: meta.consent_locale || null,
            serverTs: meta.consent_server_ts || null,
          },
          company: deps.config.company,
        };
        locale = emailLocale;
        renderData = data;
        rendered = renderPurchaseConfirmation(data);
      } else if (plan.kind === "renewal_reminder_mx") {
        locale = resolveEmailLocale(meta.consent_locale, DIRS.mx.locale, null);
        const data: RenewalReminderData = {
          locale: locale as RenewalReminderData["locale"],
          market,
          dir: dirInfo.dir || "mx",
          siteUrl: deps.config.siteUrl,
          planName: sub.planName,
          amountMinor: plan.amountMinor ?? sub.unitAmountMinor,
          currency,
          interval: sub.interval,
          intervalCount: sub.intervalCount,
          renewalDate: sub.periodEnd as string,
          customerEmail: to || "",
          company: deps.config.company,
        };
        renderData = data;
        rendered = renderRenewalReminder(data);
      } else {
        locale = resolveEmailLocale(meta.consent_locale, dirInfo.locale, null);
        const start = plan.periodStart;
        const data: PaymentFailedData = {
          locale: locale as PaymentFailedData["locale"],
          market,
          dir: dirInfo.dir,
          siteUrl: deps.config.siteUrl,
          planName: sub.planName,
          amountMinor: plan.amountMinor,
          currency,
          graceDays: deps.pastDueGraceDays,
          graceEndDate: start ? new Date(new Date(start).getTime() + deps.pastDueGraceDays * 86400000).toISOString() : null,
          customerEmail: to || "",
          company: deps.config.company,
        };
        renderData = data;
        rendered = renderPaymentFailed(data);
      }

      results.push(await deliverEmail({
        idempotencyKey: key,
        kind: plan.kind,
        to,
        rendered,
        templateVersion: TEMPLATE_VERSION,
        renderData,
        meta: {
          userId,
          stripeEventId: event.id,
          stripeEventType: event.type,
          stripeSubscriptionId: plan.subscriptionId,
          stripeInvoiceId: plan.invoiceId,
          market,
          regime,
          locale,
        },
      }, deps));
    } catch (err) {
      const message = String((err as Error)?.message || err).slice(0, 300);
      deps.log("error", "[email] " + key + " non traite (" + event.type + " " + event.id + "): " + message);
      results.push({ status: "error", key, kind: plan.kind, error: message });
    }
  }
  return results;
}
