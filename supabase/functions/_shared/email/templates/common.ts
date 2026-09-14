// Blocs communs : identite du vendeur (placeholders si inconnue), jeu
// responsable, periodicite, pied de message.
import type { Block } from "../document.ts";
import type { CompanyIdentity } from "../config.ts";
import type { EmailStrings, RegimeId } from "./types.ts";
import type { Helpline } from "../markets.ts";
import { fill } from "../format.ts";

export function periodLabel(s: EmailStrings, interval: string | null, count: number | null): string {
  const n = count && count > 1 ? count : 1;
  if (interval === "year") return n > 1 ? fill(s.common.periodYears, { n }) : s.common.periodYear;
  if (interval === "month") return n > 1 ? fill(s.common.periodMonths, { n }) : s.common.periodMonth;
  return s.common.placeholder;
}

export function companyBlocks(s: EmailStrings, company: CompanyIdentity, regime: RegimeId | null): Block[] {
  const v = (x: string | null) => (x && x.trim() ? x : s.common.placeholder);
  const L = s.common.company;
  const rows: Array<[string, string]> = [
    [L.tradingName, company.tradingName],
    [L.legalStatus, v(company.legalStatus)],
    [L.operatorName, v(company.operatorName)],
    [L.address, v(company.address === "Paris, France" ? null : company.address) === s.common.placeholder && company.address
      ? company.address + " " + s.common.placeholder
      : v(company.address)],
    [L.registration, v(company.registration)],
    [L.vat, v(company.vat)],
    [L.phone, v(company.phone)],
    [L.email, company.email],
  ];
  // Mediateur de la consommation : obligation du droit francais (L612-1),
  // affiche pour le regime UE uniquement.
  if (regime === "eu") rows.push([L.mediator, v(company.mediator)]);
  return [{ kind: "h2", text: s.common.companyTitle }, { kind: "rows", rows }];
}

export function helplineBlocks(s: EmailStrings, helpline: Helpline): Block[] {
  const parts = [helpline.name];
  if (helpline.phone) parts.push(helpline.phone);
  parts.push(helpline.url);
  return [
    { kind: "h2", text: s.common.helplineTitle },
    { kind: "small", text: s.common.helplineText + " " + parts.join(" · ") },
  ];
}

export function footerBlocks(s: EmailStrings, company: CompanyIdentity): Block[] {
  return [
    { kind: "p", text: s.common.signature },
    { kind: "small", text: fill(s.common.autoNotice, { email: company.email }) },
  ];
}
