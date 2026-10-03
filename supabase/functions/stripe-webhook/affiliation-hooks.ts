// Programme de partenaires (03/10/2026) : crochets appeles par stripe-webhook.
// Logique pure dans ../_shared/affiliation.ts (testee par node --test) ; ici
// seulement les lectures / ecritures Stripe et base (service role).
//
// 1. recordCardAndGuardTrial : a chaque abonnement, l'empreinte Stripe de la
//    carte (payment_method.card.fingerprint, jamais le numero) est enregistree
//    dans card_fingerprints. Nouvel essai dont la carte a deja servi (autre
//    compte, ou autre abonnement) = essai coupe tout de suite
//    (trial_end: 'now' -> Stripe facture le premier mois immediatement) et
//    subscriptions.trial_cut_reason = 'card_already_used' pour que
//    checkout-succes.html previenne proprement.
// 2. recordCommission : facture payee -> ligne affiliate_commissions (40 % du
//    HT encaisse), 'pending' 30 jours, ou 'refused' avec sa raison (affilie
//    non valide, auto-affiliation : meme compte / e-mail / client Stripe /
//    carte). Facture a 0 (essai) = rien. Unique par facture : les re-essais
//    Stripe ne doublent jamais une commission.
// 3. reverseCommission : remboursement ou contestation -> reprise.
//
// AUCUN crochet ne fait echouer le traitement principal de l'abonnement : une
// erreur ici est journalisee, jamais propagee (sinon un paiement reel
// pourrait rester sans acces Pro a cause d'un detail du programme).

import type Stripe from "npm:stripe@17";
import {
  affiliateCanEarn,
  commissionFromInvoice,
  COMMISSION_RATE_BP,
  payableAt,
  reversalAmount,
  selfReferralReason,
  trialCutDecision,
} from "../_shared/affiliation.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type HookCtx = { stripe: Stripe; supabase: Db; log?: (msg: string) => void; logError?: (msg: string) => void };
const TAG = "[stripe-webhook/affiliation]";

function info(ctx: HookCtx, msg: string) { (ctx.log || console.log)(TAG + " " + msg); }
function fail(ctx: HookCtx, msg: string) { (ctx.logError || console.error)(TAG + " " + msg); }

function idOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
}

async function ledger(ctx: HookCtx, affiliateId: string | null, event: string, details: Record<string, unknown>) {
  const { error } = await ctx.supabase.from("affiliate_ledger").insert({ affiliate_id: affiliateId, event, details });
  if (error) fail(ctx, "journal : " + error.message);
}

// Empreinte de la carte de l'abonnement : moyen de paiement par defaut de
// l'abonnement, sinon celui du client. Pas de carte (SEPA, lien...) = null.
export async function cardFingerprintOf(ctx: HookCtx, sub: Stripe.Subscription): Promise<{ fingerprint: string | null; pmId: string | null; brand: string | null }> {
  let pmId = idOf(sub.default_payment_method);
  if (!pmId) {
    const customerId = idOf(sub.customer);
    if (customerId) {
      const customer = await ctx.stripe.customers.retrieve(customerId);
      if (!customer.deleted) pmId = idOf(customer.invoice_settings?.default_payment_method);
    }
  }
  if (!pmId) return { fingerprint: null, pmId: null, brand: null };
  const pm = await ctx.stripe.paymentMethods.retrieve(pmId);
  const card = pm.card as { fingerprint?: string | null; brand?: string | null } | undefined;
  return { fingerprint: card?.fingerprint || null, pmId, brand: card?.brand || null };
}

export async function recordCardAndGuardTrial(ctx: HookCtx, sub: Stripe.Subscription, userId: string): Promise<void> {
  try {
    const { fingerprint, pmId, brand } = await cardFingerprintOf(ctx, sub);
    if (!fingerprint) { info(ctx, "abonnement " + sub.id + " sans empreinte de carte (pas de carte) : rien a verifier."); return; }
    const { data: known, error } = await ctx.supabase
      .from("card_fingerprints")
      .select("user_id,stripe_subscription_id,used_for_trial")
      .eq("fingerprint", fingerprint);
    if (error) throw new Error("lecture card_fingerprints : " + error.message);
    const decision = trialCutDecision({ status: sub.status, fingerprint, userId, subscriptionId: sub.id, knownUses: known || [] });
    const alreadyCut = (sub.metadata as Record<string, string> | null)?.trial_cut === "card_already_used";
    if (decision.cut && !alreadyCut) {
      // Fin d'essai immediate : Stripe cree la facture du premier mois tout
      // de suite ; l'evenement invoice.paid (ou payment_failed) suit le chemin
      // normal. proration_behavior none : aucun montant au prorata invente.
      await ctx.stripe.subscriptions.update(sub.id, {
        trial_end: "now",
        proration_behavior: "none",
        metadata: { ...(sub.metadata as Record<string, string> | null || {}), trial_cut: "card_already_used" },
      });
      const { error: upErr } = await ctx.supabase
        .from("subscriptions")
        .update({ trial_cut_reason: "card_already_used", trial_cut_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id);
      if (upErr) fail(ctx, "subscriptions.trial_cut_reason : " + upErr.message);
      await ledger(ctx, null, "trial_cut_card_already_used", { user_id: userId, subscription: sub.id, known_uses: (known || []).length });
      info(ctx, "ESSAI COUPE : abonnement " + sub.id + ", carte deja utilisee pour un essai ou un abonnement (" + (known || []).length + " usage(s) connus).");
    }
    const { error: insErr } = await ctx.supabase.from("card_fingerprints").insert({
      fingerprint,
      user_id: userId,
      stripe_customer_id: idOf(sub.customer),
      stripe_subscription_id: sub.id,
      stripe_payment_method_id: pmId,
      used_for_trial: sub.status === "trialing" && !decision.cut,
      brand,
    });
    if (insErr && insErr.code !== "23505") fail(ctx, "card_fingerprints : " + insErr.message);
  } catch (err) {
    fail(ctx, "verification de la carte impossible pour " + sub.id + " : " + (err as Error).message);
  }
}

type AffiliateRow = { id: string; user_id: string; status: string; code: string };

async function affiliateFor(ctx: HookCtx, userId: string, sub: Stripe.Subscription): Promise<{ affiliate: AffiliateRow | null; customerEmail: string | null; customerCustomerId: string | null }> {
  const { data: u } = await ctx.supabase.from("users").select("referred_by,email").eq("id", userId).maybeSingle();
  // Source de verite : users.referred_by (pose une fois, jamais modifiable).
  // Les metadata Stripe ne sont qu'une trace (affiliate_id) : jamais une
  // commission sur leur seule foi.
  const affiliateId = u?.referred_by as string | null | undefined;
  if (!affiliateId) return { affiliate: null, customerEmail: u?.email || null, customerCustomerId: idOf(sub.customer) };
  const { data: a } = await ctx.supabase.from("affiliates").select("id,user_id,status,code").eq("id", affiliateId).maybeSingle();
  return { affiliate: (a as AffiliateRow) || null, customerEmail: u?.email || null, customerCustomerId: idOf(sub.customer) };
}

export async function recordCommission(ctx: HookCtx, invoice: Record<string, unknown>, sub: Stripe.Subscription, userId: string): Promise<void> {
  try {
    const invoiceId = typeof invoice.id === "string" ? invoice.id : null;
    if (!invoiceId) return;
    const { affiliate, customerEmail, customerCustomerId } = await affiliateFor(ctx, userId, sub);
    if (!affiliate) return;
    const calc = commissionFromInvoice({
      id: invoiceId,
      status: invoice.status as string | null,
      amount_paid: invoice.amount_paid as number | null,
      total_excluding_tax: invoice.total_excluding_tax as number | null,
      tax: invoice.tax as number | null,
      currency: invoice.currency as string | null,
    });
    if (!calc.ok) { info(ctx, "facture " + invoiceId + " : aucune commission (" + calc.reason + ")."); return; }

    let status = "pending";
    let reason: string | null = null;
    if (!affiliateCanEarn(affiliate.status)) {
      status = "refused";
      reason = "affiliate_not_active";
    } else {
      const [{ data: affUser }, { data: affCustomers }, { data: affCards }, { data: thisCard }] = await Promise.all([
        ctx.supabase.from("users").select("email").eq("id", affiliate.user_id).maybeSingle(),
        ctx.supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", affiliate.user_id),
        ctx.supabase.from("card_fingerprints").select("fingerprint").eq("user_id", affiliate.user_id),
        ctx.supabase.from("card_fingerprints").select("fingerprint").eq("stripe_subscription_id", sub.id).limit(1).maybeSingle(),
      ]);
      let customerFingerprint: string | null = thisCard?.fingerprint || null;
      if (!customerFingerprint) customerFingerprint = (await cardFingerprintOf(ctx, sub)).fingerprint;
      const self = selfReferralReason({
        affiliateUserId: affiliate.user_id,
        customerUserId: userId,
        affiliateEmail: affUser?.email || null,
        customerEmail,
        affiliateStripeCustomerIds: (affCustomers || []).map((c: { stripe_customer_id: string }) => c.stripe_customer_id),
        customerStripeCustomerId: customerCustomerId,
        affiliateCardFingerprints: (affCards || []).map((c: { fingerprint: string }) => c.fingerprint),
        customerCardFingerprint: customerFingerprint,
      });
      if (self) { status = "refused"; reason = self; }
    }
    const paidAtSec = typeof invoice.status_transitions === "object" && invoice.status_transitions
      ? (invoice.status_transitions as { paid_at?: number }).paid_at
      : undefined;
    const paidAtIso = new Date((paidAtSec || (invoice.created as number) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const charge = idOf(invoice.charge) || idOf((invoice.payments as { data?: { payment?: { charge?: unknown } }[] } | undefined)?.data?.[0]?.payment?.charge);
    const { error } = await ctx.supabase.from("affiliate_commissions").insert({
      affiliate_id: affiliate.id,
      customer_user_id: userId,
      stripe_customer_id: customerCustomerId,
      stripe_subscription_id: sub.id,
      stripe_invoice_id: invoiceId,
      stripe_charge_id: charge,
      kind: "commission",
      currency: calc.currency,
      base_cents: calc.baseCents,
      rate_bp: COMMISSION_RATE_BP,
      amount_cents: calc.commissionCents,
      status,
      reason,
      paid_at_stripe: paidAtIso,
      payable_at: status === "pending" ? payableAt(paidAtIso) : null,
    });
    if (error) {
      if (error.code === "23505") { info(ctx, "facture " + invoiceId + " : commission deja enregistree (re-essai Stripe), ignoree."); return; }
      throw new Error("affiliate_commissions : " + error.message);
    }
    await ledger(ctx, affiliate.id, status === "refused" ? "commission_refused" : "commission_created", {
      invoice: invoiceId, subscription: sub.id, amount_cents: calc.commissionCents, base_cents: calc.baseCents, currency: calc.currency, reason,
    });
    info(ctx, "facture " + invoiceId + " : commission " + calc.commissionCents + " " + calc.currency + " -> " + status + (reason ? " (" + reason + ")" : "") + " pour l'affilie " + affiliate.code + ".");
  } catch (err) {
    fail(ctx, "commission non enregistree pour la facture " + String(invoice.id) + " : " + (err as Error).message);
  }
}

// Remboursement (charge.refunded, montant cumule charge.amount_refunded) ou
// contestation (charge.dispute.created : tout le montant). Parent non encore
// paye et reprise totale -> parent 'reversed' ; sinon ligne 'reversal'
// (deduite du prochain versement si le parent a deja ete paye).
export async function reverseCommission(ctx: HookCtx, charge: Record<string, unknown>, kind: "refund" | "dispute", refId: string): Promise<void> {
  try {
    const chargeId = typeof charge.id === "string" ? charge.id : null;
    const invoiceId = idOf(charge.invoice);
    if (!chargeId) return;
    let q = ctx.supabase.from("affiliate_commissions").select("*").eq("kind", "commission");
    q = invoiceId ? q.eq("stripe_invoice_id", invoiceId) : q.eq("stripe_charge_id", chargeId);
    const { data: parent, error } = await q.limit(1).maybeSingle();
    if (error) throw new Error("lecture commission : " + error.message);
    if (!parent) { info(ctx, kind + " sur " + chargeId + " : aucune commission liee, rien a reprendre."); return; }
    if (parent.status === "refused" || parent.status === "reversed") return;
    const refunded = kind === "dispute" ? Number(charge.amount || 0) : Number(charge.amount_refunded || 0);
    const target = reversalAmount(parent.amount_cents, parent.base_cents, refunded);
    const { data: existing } = await ctx.supabase.from("affiliate_commissions").select("amount_cents").eq("parent_id", parent.id).eq("kind", "reversal");
    const already = (existing || []).reduce((s: number, r: { amount_cents: number }) => s + r.amount_cents, 0);
    const delta = target - already;
    if (delta <= 0) return;
    const full = target >= parent.amount_cents;
    if ((parent.status === "pending" || parent.status === "payable") && full) {
      const { error: upErr } = await ctx.supabase.from("affiliate_commissions").update({ status: "reversed", reason: kind }).eq("id", parent.id);
      if (upErr) throw new Error("reversed : " + upErr.message);
      await ledger(ctx, parent.affiliate_id, "commission_reversed", { parent: parent.id, kind, charge: chargeId, amount_cents: parent.amount_cents });
      info(ctx, "commission " + parent.id + " annulee (" + kind + ", jamais payee).");
      return;
    }
    const { error: insErr } = await ctx.supabase.from("affiliate_commissions").insert({
      affiliate_id: parent.affiliate_id,
      customer_user_id: parent.customer_user_id,
      stripe_customer_id: parent.stripe_customer_id,
      stripe_subscription_id: parent.stripe_subscription_id,
      stripe_invoice_id: parent.stripe_invoice_id,
      stripe_charge_id: chargeId,
      stripe_refund_id: refId,
      kind: "reversal",
      parent_id: parent.id,
      currency: parent.currency,
      base_cents: 0,
      rate_bp: parent.rate_bp,
      amount_cents: delta,
      status: parent.status === "paid" ? "payable" : parent.status,
      reason: kind,
      paid_at_stripe: parent.paid_at_stripe,
      payable_at: parent.status === "paid" ? new Date().toISOString() : parent.payable_at,
    });
    if (insErr) {
      if (insErr.code === "23505") return;
      throw new Error("reversal : " + insErr.message);
    }
    await ledger(ctx, parent.affiliate_id, "commission_reversal", { parent: parent.id, kind, charge: chargeId, amount_cents: delta });
    info(ctx, "reprise de " + delta + " " + parent.currency + " sur la commission " + parent.id + " (" + kind + ").");
  } catch (err) {
    fail(ctx, "reprise impossible (" + kind + ") : " + (err as Error).message);
  }
}
