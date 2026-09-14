// Rappel avant renouvellement automatique — Mexique, LFPC art. 76 Bis
// (fracc. VIII et IX, DOF 12/12/2025) : avis au moins 5 jours naturels avant
// chaque renouvellement, avec montant, date, et moyen d'annuler sans penalite
// (cancelation immediate depuis le compte).
import type { Block, RenderedEmail } from "../document.ts";
import { renderEmail } from "../document.ts";
import type { CompanyIdentity } from "../config.ts";
import type { LocaleId } from "./types.ts";
import { STRINGS } from "./index.ts";
import { fill, formatDate, formatMoney } from "../format.ts";
import { DIRS, MARKET_TIMEZONE, helplineForDir, pageUrl } from "../markets.ts";
import { companyBlocks, footerBlocks, helplineBlocks, periodLabel } from "./common.ts";

export type RenewalReminderData = {
  locale: LocaleId;
  market: string;
  dir: string;
  siteUrl: string;
  planName: string;
  amountMinor: number | null;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  renewalDate: string;
  customerEmail: string;
  company: CompanyIdentity;
};

export function renderRenewalReminder(d: RenewalReminderData): RenderedEmail {
  const s = STRINGS[d.locale];
  const dir = DIRS[d.dir] || DIRS["mx"];
  const tz = MARKET_TIMEZONE[d.market] || "America/Mexico_City";
  const date = formatDate(d.renewalDate, dir.intlLocale, tz);
  const accountUrl = pageUrl(d.siteUrl, dir, "compte.html");
  const vars = { plan: d.planName, date, accountUrl, email: d.company.email };
  const blocks: Block[] = [
    { kind: "h1", text: s.reminder.title },
    { kind: "p", text: s.common.greeting },
    { kind: "p", text: fill(s.reminder.intro, vars) },
    {
      kind: "rows",
      rows: [
        [s.reminder.amount, d.amountMinor == null ? s.common.placeholder : formatMoney(d.amountMinor, d.currency, dir.intlLocale)],
        [s.reminder.date, date],
        [s.reminder.period, periodLabel(s, d.interval, d.intervalCount)],
      ],
    },
    { kind: "p", text: fill(s.reminder.cancelText, vars) },
    { kind: "p", text: s.reminder.noCharge },
    { kind: "small", text: s.reminder.legalNote },
    ...companyBlocks(s, d.company, "mx"),
    ...helplineBlocks(s, helplineForDir(dir)),
    ...footerBlocks(s, d.company),
  ];
  return renderEmail(s.htmlLang, fill(s.reminder.subject, vars), blocks);
}
