// Donnees marche utiles aux e-mails. MIROIR de config/markets.json (_dirs,
// _helplines, <marche>.helpline) et du regime de consentement de
// supabase/functions/create-checkout-session/consent.ts : une fonction Edge
// deployee ne peut pas lire config/markets.json a l'execution. La coherence est
// verifiee par tests/transactional-emails.test.js (toute derive fait echouer
// les tests). Module pur, aucun import.

import type { LocaleId, RegimeId } from "./templates/types.ts";

export type Helpline = { name: string; phone: string | null; url: string; display: string };

export type DirInfo = { dir: string; market: string; locale: LocaleId; intlLocale: string };

// "" = pages racine (historiques, marche EUR en francais).
export const DIRS: Record<string, DirInfo> = {
  "": { dir: "", market: "fr", locale: "fr", intlLocale: "fr-FR" },
  fr: { dir: "fr", market: "fr", locale: "fr", intlLocale: "fr-FR" },
  gb: { dir: "gb", market: "gb", locale: "en", intlLocale: "en-GB" },
  za: { dir: "za", market: "za", locale: "en", intlLocale: "en-ZA" },
  en: { dir: "en", market: "fr", locale: "en", intlLocale: "en-GB" },
  mx: { dir: "mx", market: "mx", locale: "es-mx", intlLocale: "es-MX" },
  es: { dir: "es", market: "fr", locale: "es", intlLocale: "es-ES" },
  de: { dir: "de", market: "fr", locale: "de", intlLocale: "de-DE" },
  it: { dir: "it", market: "fr", locale: "it", intlLocale: "it-IT" },
  pt: { dir: "pt", market: "fr", locale: "pt", intlLocale: "pt-PT" },
};

export const MARKET_HELPLINES: Record<string, Helpline> = {
  fr: { name: "Joueurs Info Service", phone: "09 74 75 13 13", url: "https://www.joueurs-info-service.fr", display: "joueurs-info-service.fr" },
  gb: { name: "National Gambling Helpline (GamCare / BeGambleAware)", phone: "0808 8020 133", url: "https://www.begambleaware.org", display: "begambleaware.org" },
  mx: { name: "Línea de la Vida (CONASAMA)", phone: "800 911 2000", url: "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000", display: "gob.mx/conasama" },
  za: { name: "National Responsible Gambling Programme (NRGP)", phone: "0800 006 008", url: "https://www.responsiblegambling.org.za", display: "responsiblegambling.org.za" },
};

export const SHARED_HELPLINES: Record<string, Helpline> = {
  international: { name: "Gambling Therapy", phone: null, url: "https://www.gamblingtherapy.org", display: "gamblingtherapy.org" },
};

// Repertoires qui affichent une ressource partagee a la place de celle du marche.
export const DIR_HELPLINE_OVERRIDE: Record<string, string> = {
  en: "international", es: "international", de: "international", it: "international", pt: "international",
};

export const MARKET_CURRENCY: Record<string, string> = { fr: "EUR", gb: "GBP", mx: "MXN", za: "ZAR" };

export const MARKET_TIMEZONE: Record<string, string> = {
  fr: "Europe/Paris", gb: "Europe/London", mx: "America/Mexico_City", za: "Africa/Johannesburg",
};

// Meme table que consent.ts (MARKET_REGIME) : marche inconnu = regime UE.
const MARKET_REGIME: Record<string, RegimeId> = { fr: "eu", gb: "uk", za: "za", mx: "mx" };

export function normMarket(market: unknown): string {
  const key = typeof market === "string" ? market.trim().toLowerCase() : "";
  return Object.prototype.hasOwnProperty.call(MARKET_REGIME, key) ? key : "fr";
}

export function regimeForMarket(market: unknown): RegimeId {
  return MARKET_REGIME[normMarket(market)];
}

export function isRegime(value: unknown): value is RegimeId {
  return value === "eu" || value === "uk" || value === "za" || value === "mx";
}

// consent_dir vaut "root" pour les pages racine (consent.ts). Un repertoire
// inconnu ou absent retombe sur le repertoire du marche.
export function resolveDir(consentDir: unknown, market: string): DirInfo {
  const d = typeof consentDir === "string" ? consentDir.trim().toLowerCase() : "";
  if (d && d !== "root" && d !== "unknown" && Object.prototype.hasOwnProperty.call(DIRS, d) && d !== "") {
    return DIRS[d];
  }
  if (d === "root") return DIRS[""];
  return market === "fr" ? DIRS[""] : (DIRS[market] || DIRS[""]);
}

export function helplineForDir(dir: DirInfo): Helpline {
  const override = DIR_HELPLINE_OVERRIDE[dir.dir];
  if (override && SHARED_HELPLINES[override]) return SHARED_HELPLINES[override];
  return MARKET_HELPLINES[dir.market] || MARKET_HELPLINES.fr;
}

export function pageUrl(siteUrl: string, dir: DirInfo, page: string): string {
  return siteUrl + (dir.dir ? "/" + dir.dir : "") + "/" + page;
}
