// Registre des chaines par langue + resolution de la langue d'un e-mail.
import type { EmailStrings, LocaleId, RegimeId } from "./types.ts";
import { fr } from "./locales/fr.ts";
import { en } from "./locales/en.ts";
import { es } from "./locales/es.ts";
import { esMx } from "./locales/es-mx.ts";
import { de } from "./locales/de.ts";
import { it } from "./locales/it.ts";
import { pt } from "./locales/pt.ts";

export const TEMPLATE_VERSION = "2026-09-14.1";

export const LOCALES: LocaleId[] = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

export const STRINGS: Record<LocaleId, EmailStrings> = { fr, en, es, "es-mx": esMx, de, it, pt };

// Langue de repli quand la clause de retractation d'un regime n'existe pas dans
// la langue demandee (combinaison impossible via le site : /gb/ et /za/ sont en
// anglais, /mx/ en espagnol du Mexique). On bascule alors TOUT l'e-mail dans la
// langue du regime pour ne jamais melanger deux langues.
const REGIME_FALLBACK: Record<RegimeId, LocaleId> = { eu: "en", uk: "en", za: "en", mx: "es-mx" };

// Meme normalisation que create-checkout-session (normLocale) : gb/za -> en,
// mx -> es-mx, es-MX -> es-mx, en-GB -> en.
const DIR_LOCALE: Record<string, LocaleId> = { gb: "en", za: "en", mx: "es-mx" };

export function normLocale(value: unknown): LocaleId | null {
  const s = String(value == null ? "" : value).trim().toLowerCase().replace("_", "-");
  if (!s || s === "unknown") return null;
  if (DIR_LOCALE[s]) return DIR_LOCALE[s];
  if (s.startsWith("es-mx")) return "es-mx";
  if ((LOCALES as string[]).includes(s)) return s as LocaleId;
  const base = s.split("-")[0];
  return (LOCALES as string[]).includes(base) ? base as LocaleId : null;
}

export function resolveEmailLocale(consentLocale: unknown, dirLocale: LocaleId, regime: RegimeId | null): LocaleId {
  const wanted = normLocale(consentLocale) || dirLocale || "fr";
  if (!regime) return wanted;
  if (STRINGS[wanted].withdrawal[regime]) return wanted;
  if (regime === "eu" && wanted === "es-mx") return "es";
  return REGIME_FALLBACK[regime];
}
