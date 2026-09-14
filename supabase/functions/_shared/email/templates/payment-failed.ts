// Echec de paiement d'un renouvellement (optionnel). Reprend la tolerance
// impaye existante (PAST_DUE_GRACE_DAYS de stripe-webhook, migrations 0011 et
// 0012) : aucune regle nouvelle, seulement l'information du client.
import type { Block, RenderedEmail } from "../document.ts";
import { renderEmail } from "../document.ts";
import type { CompanyIdentity } from "../config.ts";
import type { LocaleId } from "./types.ts";
import { STRINGS } from "./index.ts";
import { fill, formatDate, formatMoney } from "../format.ts";
import { DIRS, MARKET_TIMEZONE, helplineForDir, pageUrl, regimeForMarket } from "../markets.ts";
import { companyBlocks, footerBlocks, helplineBlocks } from "./common.ts";

export type PaymentFailedData = {
  locale: LocaleId;
  market: string;
  dir: string;
  siteUrl: string;
  planName: string;
  amountMinor: number | null;
  currency: string;
  graceDays: number;
  // Fin de la periode payee + graceDays : date a partir de laquelle l'acces
  // payant PEUT etre coupe ("au plus tot").
  graceEndDate: string | null;
  customerEmail: string;
  company: CompanyIdentity;
};

export function renderPaymentFailed(d: PaymentFailedData): RenderedEmail {
  const s = STRINGS[d.locale];
  const dir = DIRS[d.dir] || DIRS[""];
  const tz = MARKET_TIMEZONE[d.market] || "Europe/Paris";
  const accountUrl = pageUrl(d.siteUrl, dir, "compte.html");
  const amount = d.amountMinor == null ? s.common.placeholder : formatMoney(d.amountMinor, d.currency, dir.intlLocale);
  const vars = {
    plan: d.planName,
    amount,
    days: d.graceDays,
    date: formatDate(d.graceEndDate, dir.intlLocale, tz) || s.common.placeholder,
    accountUrl,
    email: d.company.email,
  };
  const blocks: Block[] = [
    { kind: "h1", text: s.paymentFailed.title },
    { kind: "p", text: s.common.greeting },
    { kind: "p", text: fill(s.paymentFailed.intro, vars) },
    { kind: "p", text: s.paymentFailed.retryText },
    { kind: "p", text: fill(s.paymentFailed.graceText, vars) },
    { kind: "p", text: fill(s.paymentFailed.updateText, vars) },
    ...companyBlocks(s, d.company, regimeForMarket(d.market)),
    ...helplineBlocks(s, helplineForDir(dir)),
    ...footerBlocks(s, d.company),
  ];
  return renderEmail(s.htmlLang, fill(s.paymentFailed.subject, vars), blocks);
}
