// Confirmation d'achat sur support durable.
// - FR/UE : C. conso. L221-13 (confirmation du contrat avec les informations
//   de L221-5, formulaire type de retractation, et le cas echeant confirmation
//   de l'accord expres) + L221-25 (demande expresse d'execution immediate et
//   montant proportionnel en cas de retractation).
// - UK : CCR 2013 reg. 16 (confirmation, Schedule 2) et reg. 36/37 (consent et
//   acknowledgement ; reg. 37(4)(c) : sans confirmation, aucun cout pour le
//   consommateur).
// - ZA : ECT Act s43(1) (informations fournisseur) et s42(2)(d)/s44.
// - MX : LFPC art. 76 Bis VIII/IX (cobro recurrente, cancelacion inmediata).
// Aucun contenu n'est invente : prix, dates et consentement viennent de
// Stripe (metadata ecrites par create-checkout-session/consent.ts).
import type { Block, RenderedEmail } from "../document.ts";
import { renderEmail } from "../document.ts";
import type { CompanyIdentity } from "../config.ts";
import type { LocaleId, RegimeId } from "./types.ts";
import { STRINGS } from "./index.ts";
import { CONSENT_WORDING } from "./consent-wording.ts";
import { fill, formatDate, formatDateTime, formatMoney } from "../format.ts";
import { DIRS, MARKET_TIMEZONE, helplineForDir, pageUrl } from "../markets.ts";
import { companyBlocks, footerBlocks, helplineBlocks, periodLabel } from "./common.ts";

export type ConsentRecord = {
  terms: boolean;
  waiver: "true" | "false" | "null" | null;
  waiverType: string | null;
  termsVersion: string | null;
  locale: string | null;
  serverTs: string | null;
};

export type PurchaseConfirmationData = {
  locale: LocaleId;
  consentLocale: LocaleId;
  regime: RegimeId;
  market: string;
  dir: string;
  siteUrl: string;
  planName: string;
  amountPaidMinor: number | null;
  recurringAmountMinor: number | null;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  startDate: string | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  customerEmail: string;
  consent: ConsentRecord;
  company: CompanyIdentity;
};

// Regime -> cles des cases du checkout (miroir de lib/checkout-consent.js REGIMES).
export const REGIME_CONSENT_KEYS: Record<RegimeId, { termsKey: "terms_label" | "terms_label_recurring"; waiverKey: "waiver_eu" | "waiver_uk" | "waiver_za" | null; infoKey: "info_mx" | null }> = {
  eu: { termsKey: "terms_label", waiverKey: "waiver_eu", infoKey: null },
  uk: { termsKey: "terms_label", waiverKey: "waiver_uk", infoKey: null },
  za: { termsKey: "terms_label", waiverKey: "waiver_za", infoKey: null },
  mx: { termsKey: "terms_label_recurring", waiverKey: null, infoKey: "info_mx" },
};

// Texte exact de la case, liens remplaces par leur libelle.
export function consentLabel(locale: LocaleId, key: string): string {
  const w = CONSENT_WORDING[locale] as Record<string, string>;
  return String(w[key] || "").replace("{terms}", w.terms_link).replace("{privacy}", w.privacy_link);
}

export function renderPurchaseConfirmation(d: PurchaseConfirmationData): RenderedEmail {
  const s = STRINGS[d.locale];
  const dir = DIRS[d.dir] || DIRS[""];
  const tz = MARKET_TIMEZONE[d.market] || "Europe/Paris";
  const intl = dir.intlLocale;
  const money = (m: number | null) => (m == null ? s.common.placeholder : formatMoney(m, d.currency, intl));
  const accountUrl = pageUrl(d.siteUrl, dir, "compte.html");
  const termsUrl = pageUrl(d.siteUrl, dir, "cgv.html");
  const period = periodLabel(s, d.interval, d.intervalCount);
  const startDate = formatDate(d.startDate, intl, tz) || s.common.placeholder;
  const version = d.consent.termsVersion && d.consent.termsVersion !== "unknown" ? d.consent.termsVersion : s.common.placeholder;
  const vars = { plan: d.planName, email: d.company.email, accountUrl, termsUrl, startDate, version };

  const rows: Array<[string, string]> = [[s.purchase.plan, d.planName]];
  if (d.amountPaidMinor != null) rows.push([s.purchase.amountPaid, money(d.amountPaidMinor)]);
  rows.push([s.purchase.recurringPrice, money(d.recurringAmountMinor)]);
  rows.push([s.purchase.billingPeriod, period]);
  rows.push([s.purchase.startDate, startDate]);
  if (d.renewalDate && !d.cancelAtPeriodEnd) rows.push([s.purchase.nextRenewal, formatDate(d.renewalDate, intl, tz)]);
  rows.push([s.purchase.account, d.customerEmail]);

  const blocks: Block[] = [
    { kind: "h1", text: s.purchase.title },
    { kind: "p", text: s.common.greeting },
    { kind: "p", text: s.purchase.intro },
    { kind: "h2", text: s.purchase.orderTitle },
    { kind: "rows", rows },
    { kind: "p", text: s.purchase.renewalTerms },
    { kind: "h2", text: s.purchase.cancelTitle },
    { kind: "p", text: fill(s.purchase.cancelTerms, vars) },
    { kind: "h2", text: s.purchase.consentTitle },
  ];

  const keys = REGIME_CONSENT_KEYS[d.regime];
  if (d.consent.terms) {
    const ticked = [consentLabel(d.consentLocale, keys.termsKey)];
    if (keys.waiverKey && d.consent.waiver === "true") ticked.push(consentLabel(d.consentLocale, keys.waiverKey));
    blocks.push({ kind: "p", text: s.purchase.consentIntro }, { kind: "quote", items: ticked });
    if (keys.infoKey) blocks.push({ kind: "p", text: s.purchase.consentInfoShown }, { kind: "p", text: consentLabel(d.consentLocale, keys.infoKey) });
    blocks.push({
      kind: "small",
      text: fill(s.purchase.consentRecordedAt, {
        date: formatDateTime(d.consent.serverTs, intl, tz) || s.common.placeholder,
        version,
        locale: d.consent.locale && d.consent.locale !== "unknown" ? d.consent.locale : d.consentLocale,
      }),
    });
  } else {
    blocks.push({ kind: "p", text: fill(s.purchase.consentNotRecorded, vars) });
  }

  blocks.push({ kind: "h2", text: s.purchase.termsTitle }, { kind: "p", text: fill(s.purchase.termsText, vars) });

  const w = s.withdrawal[d.regime];
  if (w) {
    blocks.push({ kind: "h2", text: w.title });
    for (const p of w.intro) blocks.push({ kind: "p", text: fill(p, vars) });
    if (keys.waiverKey) {
      const variant = d.consent.terms && d.consent.waiver === "true" ? w.waiverGiven : w.waiverMissing;
      if (variant) blocks.push({ kind: "p", text: fill(variant, vars) });
    }
    for (const p of w.howTo) blocks.push({ kind: "p", text: fill(p, vars) });
    if (w.formTitle && w.formLines) blocks.push({ kind: "form", title: w.formTitle, lines: w.formLines.map((l) => fill(l, vars)) });
  }

  blocks.push(...companyBlocks(s, d.company, d.regime));
  blocks.push(...helplineBlocks(s, helplineForDir(dir)));
  blocks.push(...footerBlocks(s, d.company));

  return renderEmail(s.htmlLang, fill(s.purchase.subject, vars), blocks);
}
