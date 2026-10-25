// IASHARK — programme de partenaires (affiliation), 03/10/2026. Module PUR :
// aucun import Deno/npm, aucune lecture d'environnement. Importe par
// stripe-webhook, create-checkout-session, affiliate-connect et
// affiliate-payouts ; teste par node --test (tests/affiliation.test.js).
//
// Decisions de Clement :
// - commission = 40 % de chaque paiement ENCAISSE (semaine, mois, annee),
//   calculee sur le montant hors taxes apres remise, a vie tant que le client
//   reste abonne ; rien pendant l'essai (facture a 0) ;
// - un seul niveau : jamais de commission sur les affilies d'un affilie ;
// - 30 jours d'attente avant qu'une commission soit payable ;
// - seuil de versement 50 EUR (5000 centimes), par devise ;
// - un affilie suspendu, refuse ou en attente ne gagne rien ;
// - jamais de commission sur soi-meme : meme compte, meme e-mail normalise
//   (points et +alias gmail), meme client Stripe, meme empreinte de carte.
//
// Faille de l'essai : « un essai par personne » se verifiait par compte et
// e-mail ; une personne pouvait creer plusieurs adresses. L'empreinte Stripe
// de la carte (payment_method.card.fingerprint, jamais le numero) sert
// maintenant de verrou : carte deja vue pour un essai ou un abonnement d'une
// autre personne = essai coupe tout de suite (trial_end: 'now').

export const COMMISSION_RATE = 0.4;
export const COMMISSION_RATE_BP = 4000; // points de base, stockes en base
export const HOLD_DAYS = 30;
export const PAYOUT_THRESHOLD_CENTS = 5000;
export const AFFILIATE_COOKIE_DAYS = 60;

// Codes : 4 a 20 caracteres, lettres majuscules, chiffres, tiret, souligne.
// Le navigateur accepte aussi les minuscules (mis en majuscules), jamais
// tronque : couper un code en fabriquerait un autre.
export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,18}[A-Z0-9]$/;
const RESERVED_CODES = new Set(["IASHARK", "ADMIN", "PRO", "TEST", "NULL", "UNDEFINED", "SHARK", "FREE", "GRATUIT"]);

export function normalizeCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase();
  if (!CODE_RE.test(s)) return null;
  if (RESERVED_CODES.has(s)) return null;
  return s;
}

// E-mail « normalise » pour reconnaitre la meme personne derriere plusieurs
// adresses : minuscules, suppression de l'alias « +xxx », et pour gmail /
// googlemail suppression des points (gmail les ignore) et domaine unifie.
export function normalizeEmail(value: unknown): string {
  const s = String(value || "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1) return s;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + domain;
}

export type SelfReferralInput = {
  affiliateUserId: string | null | undefined;
  customerUserId: string | null | undefined;
  affiliateEmail?: string | null;
  customerEmail?: string | null;
  affiliateStripeCustomerIds?: string[] | null;
  customerStripeCustomerId?: string | null;
  affiliateCardFingerprints?: string[] | null;
  customerCardFingerprint?: string | null;
};
export type SelfReferralReason = "self_account" | "self_email" | "self_customer" | "self_card";

// Renvoie la raison du refus, ou null si le client et l'affilie sont bien
// deux personnes differentes pour tout ce qu'on sait verifier.
export function selfReferralReason(i: SelfReferralInput): SelfReferralReason | null {
  if (i.affiliateUserId && i.customerUserId && i.affiliateUserId === i.customerUserId) return "self_account";
  if (i.affiliateEmail && i.customerEmail && normalizeEmail(i.affiliateEmail) === normalizeEmail(i.customerEmail)) return "self_email";
  if (i.customerStripeCustomerId && (i.affiliateStripeCustomerIds || []).includes(i.customerStripeCustomerId)) return "self_customer";
  if (i.customerCardFingerprint && (i.affiliateCardFingerprints || []).includes(i.customerCardFingerprint)) return "self_card";
  return null;
}

// Un affilie ne gagne que s'il est valide par Clement.
export function affiliateCanEarn(status: unknown): boolean {
  return status === "approved";
}

// Montant de la commission a partir d'une facture Stripe. Base = montant HT
// reellement encaisse apres remise : `total_excluding_tax` (facture reglee),
// sinon amount_paid - tax. Facture a 0 (essai), impayee, ou sans abonnement :
// aucune commission. Montants en centimes, arrondi au centime le plus proche.
export type InvoiceLike = {
  id?: string;
  status?: string | null;
  amount_paid?: number | null;
  total_excluding_tax?: number | null;
  tax?: number | null;
  currency?: string | null;
  billing_reason?: string | null;
};
export type CommissionCalc =
  | { ok: true; baseCents: number; commissionCents: number; currency: string }
  | { ok: false; reason: "not_paid" | "zero_amount" | "no_base" };

export function commissionFromInvoice(inv: InvoiceLike, rateBp: number = COMMISSION_RATE_BP): CommissionCalc {
  if (inv.status && inv.status !== "paid") return { ok: false, reason: "not_paid" };
  const paid = typeof inv.amount_paid === "number" ? inv.amount_paid : 0;
  if (paid <= 0) return { ok: false, reason: "zero_amount" };
  let base: number;
  if (typeof inv.total_excluding_tax === "number" && inv.total_excluding_tax >= 0) base = Math.min(inv.total_excluding_tax, paid);
  else base = paid - (typeof inv.tax === "number" ? inv.tax : 0);
  if (!(base > 0)) return { ok: false, reason: "no_base" };
  const commissionCents = Math.round((base * rateBp) / 10000);
  return { ok: true, baseCents: base, commissionCents, currency: String(inv.currency || "eur").toLowerCase() };
}

// Reprise sur remboursement : proportionnelle au montant rembourse (un
// remboursement partiel reprend une part de la commission), plafonnee a la
// commission d'origine. Montant renvoye POSITIF ; la ligne est de type
// "reversal" et compte en negatif dans les soldes.
export function reversalAmount(originalCommissionCents: number, originalBaseCents: number, refundedCents: number): number {
  if (!(originalCommissionCents > 0) || !(originalBaseCents > 0) || !(refundedCents > 0)) return 0;
  const share = Math.min(1, refundedCents / originalBaseCents);
  return Math.min(originalCommissionCents, Math.round(originalCommissionCents * share));
}

// Date a partir de laquelle une commission devient payable.
export function payableAt(paidAtIso: string, holdDays: number = HOLD_DAYS): string {
  return new Date(new Date(paidAtIso).getTime() + holdDays * 86400000).toISOString();
}
export function isMature(paidAtIso: string, nowIso: string, holdDays: number = HOLD_DAYS): boolean {
  return new Date(nowIso).getTime() >= new Date(payableAt(paidAtIso, holdDays)).getTime();
}

// Soldes d'un affilie a partir de ses lignes (commissions et reprises).
export type CommissionRow = { kind: "commission" | "reversal"; status: string; amount_cents: number; currency: string };
export type Balances = Record<string, { pending: number; payable: number; paid: number; reversed: number; refused: number }>;
export function balances(rows: CommissionRow[]): Balances {
  const out: Balances = {};
  for (const r of rows) {
    const cur = String(r.currency || "eur").toLowerCase();
    const b = out[cur] || (out[cur] = { pending: 0, payable: 0, paid: 0, reversed: 0, refused: 0 });
    const sign = r.kind === "reversal" ? -1 : 1;
    if (r.status === "pending") b.pending += sign * r.amount_cents;
    else if (r.status === "payable") b.payable += sign * r.amount_cents;
    else if (r.status === "paid") b.paid += sign * r.amount_cents;
    else if (r.status === "reversed") b.reversed += r.amount_cents;
    else if (r.status === "refused") b.refused += r.amount_cents;
  }
  return out;
}

// Lots de versement : par affilie et par devise, seulement si le solde
// payable atteint le seuil. Les reprises payables (negatives) sont imputees.
export type PayableLine = { affiliate_id: string; currency: string; amount_cents: number; kind: "commission" | "reversal"; id: string };
export type PayoutBatch = { affiliate_id: string; currency: string; amount_cents: number; line_ids: string[] };
export function payoutBatches(lines: PayableLine[], thresholdCents: number = PAYOUT_THRESHOLD_CENTS): PayoutBatch[] {
  const map = new Map<string, PayoutBatch>();
  for (const l of lines) {
    const key = l.affiliate_id + "|" + String(l.currency).toLowerCase();
    const b = map.get(key) || { affiliate_id: l.affiliate_id, currency: String(l.currency).toLowerCase(), amount_cents: 0, line_ids: [] };
    b.amount_cents += (l.kind === "reversal" ? -1 : 1) * l.amount_cents;
    b.line_ids.push(l.id);
    map.set(key, b);
  }
  return Array.from(map.values()).filter((b) => b.amount_cents >= thresholdCents);
}

// Coupure d'essai par empreinte de carte. `knownUses` = lignes de
// card_fingerprints deja en base pour cette empreinte. Une carte vue pour un
// AUTRE compte (essai ou abonnement) ou pour un autre abonnement du meme
// compte = essai coupe. La meme ligne (meme abonnement) re-vue par un
// re-essai Stripe ne coupe rien (idempotent).
export type FingerprintUse = { user_id: string; stripe_subscription_id: string | null; used_for_trial: boolean };
export type TrialCut = { cut: true; reason: "card_already_used" } | { cut: false; reason: "no_fingerprint" | "not_trialing" | "first_use" };
export function trialCutDecision(i: { status: string; fingerprint: string | null; userId: string; subscriptionId: string; knownUses: FingerprintUse[] }): TrialCut {
  if (i.status !== "trialing") return { cut: false, reason: "not_trialing" };
  if (!i.fingerprint) return { cut: false, reason: "no_fingerprint" };
  const others = i.knownUses.filter((u) => u.stripe_subscription_id !== i.subscriptionId);
  if (others.length > 0) return { cut: true, reason: "card_already_used" };
  return { cut: false, reason: "first_use" };
}

// Pour l'URL de la page partenaire et le QR code.
export function referralLink(siteUrl: string, code: string): string {
  return String(siteUrl || "https://iashark.com").replace(/\/$/, "") + "/?ref=" + encodeURIComponent(code);
}

// Questionnaire de candidature : champs attendus, bornes, acceptation
// obligatoire. Renvoie la ligne propre ou la liste des champs manquants.
export type ApplicationInput = Record<string, unknown>;
export type ApplicationResult = { ok: true; row: Record<string, unknown> } | { ok: false; missing: string[] };
const STATUSES_PRO = new Set(["individual", "professional"]);
const CONTENT_STYLES = new Set(["analysis", "tips", "entertainment", "education", "community", "other"]);
export function cleanApplication(input: ApplicationInput): ApplicationResult {
  const missing: string[] = [];
  const str = (k: string, max: number) => {
    const v = input[k];
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s.slice(0, max);
  };
  const code = normalizeCode(input.code);
  if (!code) missing.push("code");
  const networks = Array.isArray(input.networks) ? (input.networks as unknown[]).map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 10) : [];
  if (!networks.length) missing.push("networks");
  const audience = Number(input.audience);
  if (!Number.isFinite(audience) || audience < 0) missing.push("audience");
  const style = str("content_style", 40);
  if (!CONTENT_STYLES.has(style)) missing.push("content_style");
  // Code pays ISO a 2 lettres, jamais tronque (« France » n'est pas « FR »).
  const country = String(input.country === null || input.country === undefined ? "" : input.country).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) missing.push("country");
  const status = str("status", 20);
  if (!STATUSES_PRO.has(status)) missing.push("status");
  if (input.accept_terms !== true) missing.push("accept_terms");
  if (input.accept_rules !== true) missing.push("accept_rules");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    row: {
      code,
      networks,
      audience: Math.min(100000000, Math.round(audience)),
      content_style: style,
      country,
      legal_status: status,
      about: str("about", 1000),
      accepted_terms_at: new Date().toISOString(),
    },
  };
}
