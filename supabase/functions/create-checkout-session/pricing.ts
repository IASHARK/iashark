// Resolution du Price Stripe de l'offre Pro — module PUR (aucun import
// Deno/npm, environnement injecte) pour etre teste par node --test
// (tests/pro-pricing.test.js) et importe par index.ts. Meme discipline
// que consent.ts.
//
// Offre unique Pro, 3 durees (decision du proprietaire du 16/09/2026).
// ZA : pas de duree annuelle au lancement (aucune ligne year dans la table). Regles : voir en-tete de index.ts. Jamais de repli vers un
// autre prix, une autre duree ou une autre devise.
//
// Id du Price Stripe d'un marche et d'une duree, dans cet ordre (19/09/2026) :
//   1. secret Supabase envKey (ex. STRIPE_PRICE_ID_GB_MONTH) ;
//   2. ancien secret legacyEnvKey (STRIPE_PRICE_ID, mensuel FR seulement) ;
//   3. priceId de la configuration (config/markets.json#<marche>.stripePriceIds,
//      recopie dans prices.generated.ts) : un id de Price n'est pas un secret.
// Toujours pour CE marche et CETTE duree ; le Price obtenu est ensuite relu chez
// Stripe et doit correspondre exactement au prix affiche (priceMatches).
// Duree fermee au paiement (open:false = absente de
// config/markets.json#<marche>.checkoutOpen, 19/09/2026 : annuel FR) :
// jamais resolue, ni par secret ni par id de configuration. Champ absent (table
// generee avant le 19/09/2026) = ouverte, comportement historique.
import { PRO_DEFAULT_INTERVAL, PRO_INTERVALS, PRO_PRICES } from "./prices.generated.ts";
import type { IntervalKey, PriceRow } from "./prices.generated.ts";

type PriceTable = Record<string, { currency: string; intervals: Partial<Record<IntervalKey, PriceRow>> }>;

export type GetEnv = (name: string) => string | undefined | null;

export type PriceResolution =
  | { ok: true; priceId: string; usedMarket: string; interval: IntervalKey; currency: string; unitAmount: number }
  | { ok: false; requestedMarket: string; interval: IntervalKey | null; reason: "invalid_interval" | "market_not_configured" | "interval_not_configured" };

// Marches envoyes explicitement par le front (gb/mx/za ; us = USD de /en/ une
// fois config/markets.json#_usdSwitch applique). Le marche EUR "fr" est le
// marche par defaut : champ market absent.
export const CHECKOUT_MARKETS = Object.keys(PRO_PRICES).filter((k) => k !== "fr");

// prices : table des prix (par defaut celle generee depuis config/markets.json ;
// les tests passent une table construite par scripts/build-locales.js).
function marketKey(market: unknown, prices: PriceTable): { raw: string; key: string } {
  const raw = typeof market === "string" ? market.toLowerCase() : "";
  return { raw, key: raw ? (raw !== "fr" && Object.prototype.hasOwnProperty.call(prices, raw) ? raw : "") : "fr" };
}

function configuredPriceId(getEnv: GetEnv, prices: PriceTable, market: string, interval: IntervalKey): string | null {
  const row = prices[market]?.intervals[interval];
  if (!row || (row as PriceRow & { open?: boolean }).open === false) return null;
  const main = getEnv(row.envKey);
  if (typeof main === "string" && main.trim()) return main.trim();
  if (row.legacyEnvKey) {
    const legacy = getEnv(row.legacyEnvKey);
    if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  }
  if (typeof row.priceId === "string" && row.priceId.trim()) return row.priceId.trim();
  return null;
}

export function resolvePriceId(getEnv: GetEnv, market: unknown, interval: unknown, prices: PriceTable = PRO_PRICES): PriceResolution {
  const { raw, key } = marketKey(market, prices);
  let iv: IntervalKey = PRO_DEFAULT_INTERVAL;
  if (interval !== undefined && interval !== null && interval !== "") {
    const s = typeof interval === "string" ? interval.toLowerCase() : "";
    if (!(PRO_INTERVALS as string[]).includes(s)) return { ok: false, requestedMarket: raw || "fr", interval: null, reason: "invalid_interval" };
    iv = s as IntervalKey;
  }
  if (!key) return { ok: false, requestedMarket: raw, interval: iv, reason: "market_not_configured" };
  const priceId = configuredPriceId(getEnv, prices, key, iv);
  if (!priceId) {
    const anyConfigured = PRO_INTERVALS.some((i) => !!configuredPriceId(getEnv, prices, key, i));
    return { ok: false, requestedMarket: key, interval: iv, reason: anyConfigured ? "interval_not_configured" : "market_not_configured" };
  }
  const row = prices[key].intervals[iv]!;
  return { ok: true, priceId, usedMarket: key, interval: iv, currency: prices[key].currency, unitAmount: row.unitAmount };
}

// Durees ouvertes au paiement (booleens seulement, aucun id de Price expose) :
// meme resolution que resolvePriceId (secret, ancien secret, puis configuration).
export function availability(getEnv: GetEnv, market: unknown, prices: PriceTable = PRO_PRICES): Record<IntervalKey, boolean> {
  const { key } = marketKey(market, prices);
  const out = {} as Record<IntervalKey, boolean>;
  for (const iv of PRO_INTERVALS) out[iv] = !!(key && configuredPriceId(getEnv, prices, key, iv));
  return out;
}

// Le Price Stripe relu doit correspondre exactement au prix affiche.
export type StripePriceLike = {
  active?: boolean; type?: string; currency?: string; unit_amount?: number | null; tax_behavior?: string | null;
  recurring?: { interval?: string; interval_count?: number } | null;
};
export function priceMatches(price: StripePriceLike, expected: { currency: string; unitAmount: number; interval: IntervalKey }): boolean {
  return price.active === true && price.type === "recurring" &&
    String(price.currency || "").toUpperCase() === expected.currency &&
    price.recurring?.interval === expected.interval && (price.recurring?.interval_count ?? 1) === 1 &&
    price.unit_amount === expected.unitAmount && price.tax_behavior !== "exclusive";
}
