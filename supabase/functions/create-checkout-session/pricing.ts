// Resolution du Price Stripe de l'offre Pro — module PUR (aucun import
// Deno/npm, environnement injecte) pour etre teste par node --test
// (tests/pro-pricing.test.js) et importe par index.ts. Meme discipline
// que consent.ts.
//
// Offre unique Pro, 3 durees (decision du proprietaire du 16/09/2026).
// ZA : pas de duree annuelle au lancement (aucune ligne year dans la table). Regles : voir en-tete de index.ts. Jamais de repli vers un
// autre prix, une autre duree ou une autre devise ; seul repli admis :
// l'ancien secret STRIPE_PRICE_ID pour le MENSUEL FR (legacyEnvKey).
import { PRO_DEFAULT_INTERVAL, PRO_INTERVALS, PRO_PRICES } from "./prices.generated.ts";
import type { IntervalKey } from "./prices.generated.ts";

export type GetEnv = (name: string) => string | undefined | null;

export type PriceResolution =
  | { ok: true; priceId: string; usedMarket: string; interval: IntervalKey; currency: string; unitAmount: number }
  | { ok: false; requestedMarket: string; interval: IntervalKey | null; reason: "invalid_interval" | "market_not_configured" | "interval_not_configured" };

// Marches envoyes explicitement par le front (gb/mx/za). Le marche EUR "fr"
// est le marche par defaut : champ market absent.
export const CHECKOUT_MARKETS = Object.keys(PRO_PRICES).filter((k) => k !== "fr");

function marketKey(market: unknown): { raw: string; key: string } {
  const raw = typeof market === "string" ? market.toLowerCase() : "";
  return { raw, key: raw ? (CHECKOUT_MARKETS.includes(raw) ? raw : "") : "fr" };
}

function envPriceId(getEnv: GetEnv, market: string, interval: IntervalKey): string | null {
  const row = PRO_PRICES[market]?.intervals[interval];
  if (!row) return null;
  const main = getEnv(row.envKey);
  if (typeof main === "string" && main.trim()) return main.trim();
  if (row.legacyEnvKey) {
    const legacy = getEnv(row.legacyEnvKey);
    if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  }
  return null;
}

export function resolvePriceId(getEnv: GetEnv, market: unknown, interval: unknown): PriceResolution {
  const { raw, key } = marketKey(market);
  let iv: IntervalKey = PRO_DEFAULT_INTERVAL;
  if (interval !== undefined && interval !== null && interval !== "") {
    const s = typeof interval === "string" ? interval.toLowerCase() : "";
    if (!(PRO_INTERVALS as string[]).includes(s)) return { ok: false, requestedMarket: raw || "fr", interval: null, reason: "invalid_interval" };
    iv = s as IntervalKey;
  }
  if (!key) return { ok: false, requestedMarket: raw, interval: iv, reason: "market_not_configured" };
  const priceId = envPriceId(getEnv, key, iv);
  if (!priceId) {
    const anyConfigured = PRO_INTERVALS.some((i) => !!envPriceId(getEnv, key, i));
    return { ok: false, requestedMarket: key, interval: iv, reason: anyConfigured ? "interval_not_configured" : "market_not_configured" };
  }
  const row = PRO_PRICES[key].intervals[iv]!;
  return { ok: true, priceId, usedMarket: key, interval: iv, currency: PRO_PRICES[key].currency, unitAmount: row.unitAmount };
}

// Durees ouvertes au paiement (booleens seulement, aucun id de Price expose).
export function availability(getEnv: GetEnv, market: unknown): Record<IntervalKey, boolean> {
  const { key } = marketKey(market);
  const out = {} as Record<IntervalKey, boolean>;
  for (const iv of PRO_INTERVALS) out[iv] = !!(key && envPriceId(getEnv, key, iv));
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
