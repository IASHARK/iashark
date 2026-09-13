// Consentement avant paiement — module pur (aucun import Deno/npm) pour etre
// teste par node --test (tests/checkout-consent.test.js) et importe par
// index.ts. Miroir serveur de lib/checkout-consent.js : le navigateur affiche
// les cases, mais c'est CE fichier qui decide si une session Stripe peut etre
// creee. Jamais de confiance dans un "regime" envoye par le client : le regime
// est deduit du marche resolu cote serveur.
//
// Regimes (verifies le 13/09/2026, a faire confirmer par un juriste) :
// - eu : marche EUR (repertoires fr en es de it pt et pages racine). Droit
//   francais / directive 2011/83/UE. CJUE C-234/25 Sky Osterreich (9/07/2026) :
//   un abonnement en ligne dynamique est un "service numerique", le droit de
//   retractation ne peut pas etre exclu. On recueille donc la DEMANDE EXPRESSE
//   d'execution immediate (L221-25 al. 1) avec la reconnaissance du paiement
//   proportionnel en cas de retractation (L221-25 al. 2).
// - uk : Consumer Contracts Regulations 2013 reg. 36 (service) et 37 (digital
//   content) : express request/consent + acknowledgement.
// - za : ECT Act 2002 s42(2)(d) : le cooling-off de s44 ne s'applique pas aux
//   services commences avec le consentement du consommateur avant la fin des
//   7 jours.
// - mx : LFPC art. 1 (droits irrenunciables) : aucune renonciation demandee.
//   Art. 76 Bis VIII (DOF 12/12/2025) : consentement expres et informe au
//   cobro recurrente, porte par la case des conditions.

export type RegimeId = "eu" | "uk" | "za" | "mx";
export type Regime = { id: RegimeId; waiverRequired: boolean; waiverType: string | null };

export const CONSENT_REGIMES: Record<RegimeId, Regime> = {
  eu: { id: "eu", waiverRequired: true, waiverType: "eu_express_request_immediate_start_l221_25" },
  uk: { id: "uk", waiverRequired: true, waiverType: "uk_ccr2013_reg36_reg37" },
  za: { id: "za", waiverRequired: true, waiverType: "za_ect_s42_2_d" },
  mx: { id: "mx", waiverRequired: false, waiverType: null },
};

const MARKET_REGIME: Record<string, RegimeId> = { fr: "eu", gb: "uk", za: "za", mx: "mx" };

export function regimeForMarket(market: unknown): Regime {
  const key = typeof market === "string" ? market.toLowerCase() : "";
  return CONSENT_REGIMES[MARKET_REGIME[key] || "eu"];
}

// Valeur courte et sure pour les metadata Stripe (500 caracteres max par
// valeur) : jamais une chaine libre du navigateur recopiee telle quelle.
function clean(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/[^A-Za-z0-9._:+\-]/g, "").slice(0, max);
}

export type ConsentResult =
  | { ok: true; regime: Regime; metadata: Record<string, string> }
  | { ok: false; code: "consent_required"; regime: Regime; missing: string[] };

export function validateConsent(consent: unknown, market: unknown, serverTs: string): ConsentResult {
  const regime = regimeForMarket(market);
  const c = (consent && typeof consent === "object" && !Array.isArray(consent))
    ? consent as Record<string, unknown>
    : {};
  const missing: string[] = [];
  if (c.terms !== true) missing.push("terms");
  if (regime.waiverRequired && c.waiver !== true) missing.push("waiver");
  if (missing.length) return { ok: false, code: "consent_required", regime, missing };

  const waiver = regime.waiverRequired ? "true" : (c.waiver === true ? "true" : c.waiver === false ? "false" : "null");
  return {
    ok: true,
    regime,
    metadata: {
      consent_terms: "true",
      consent_waiver: waiver,
      consent_waiver_type: regime.waiverType || "none",
      consent_regime: regime.id,
      consent_terms_version: clean(c.terms_version, 40) || "unknown",
      consent_locale: clean(c.locale, 10) || "unknown",
      consent_dir: clean(c.dir, 4) || "root",
      consent_client_ts: clean(c.ts, 40) || "unknown",
      consent_server_ts: clean(serverTs, 40),
    },
  };
}
