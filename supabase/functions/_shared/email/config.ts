// E-mails transactionnels : configuration par variables d'environnement.
// Module pur (aucun import Deno/npm) : importe par stripe-webhook (Deno) et par
// tests/transactional-emails.test.js (node --test, type stripping Node 24).
//
// EMAIL_PROVIDER  : "resend" | "disabled" (defaut : disabled). Toute autre
//                   valeur est traitee comme "disabled" (fail closed : aucun
//                   envoi reel tant que le proprietaire n'a pas choisi).
// RESEND_API_KEY  : cle API Resend (secret Supabase, jamais dans le code).
// EMAIL_FROM      : expediteur, ex. "IASHARK <billing@iashark.com>" (domaine
//                   verifie chez Resend).
// EMAIL_REPLY_TO  : adresse de reponse (defaut : contact@iashark.com).
// SITE_URL        : deja utilisee par create-checkout-session (defaut
//                   https://iashark.com).
//
// IDENTITE DU VENDEUR : les pages legales (legal/*/mentions-legales.html) ne
// contiennent PAS encore le nom de l'exploitant, l'adresse complete, le
// SIREN/SIRET, la TVA ni le telephone (BLOCKED_DECISION, legal/README.md §4
// point 1). Ils ne sont JAMAIS inventes ici : valeur null = placeholder
// visible "[a completer]" dans l'e-mail + avertissement dans les logs. Le
// proprietaire les renseigne via les secrets COMPANY_* ci-dessous, sans
// modifier le code. Seules les donnees deja publiees sur le site sont
// renseignees par defaut (nom commercial, statut, ville, email de contact).

export type EmailProvider = "resend" | "disabled";

export type CompanyIdentity = {
  tradingName: string;
  legalStatus: string | null;
  operatorName: string | null;
  address: string | null;
  registration: string | null;
  vat: string | null;
  phone: string | null;
  email: string;
  mediator: string | null;
};

export type EmailConfig = {
  provider: EmailProvider;
  resendApiKey: string | null;
  from: string | null;
  replyTo: string;
  siteUrl: string;
  company: CompanyIdentity;
  // Problemes de configuration detectes (jamais la valeur d'un secret).
  problems: string[];
};

export const RESEND_API_URL = "https://api.resend.com/emails";

// Donnees deja publiees dans legal/fr/mentions-legales.html (sept. 2026).
export const COMPANY_DEFAULTS: CompanyIdentity = {
  tradingName: "IASHARK",
  legalStatus: "auto-entrepreneur",
  operatorName: null,
  address: "Paris, France",
  registration: null,
  vat: null,
  phone: null,
  email: "contact@iashark.com",
  mediator: null,
};

type GetEnv = (name: string) => string | undefined | null;

function envValue(getEnv: GetEnv, name: string): string | null {
  const v = getEnv(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export function readEmailConfig(getEnv: GetEnv): EmailConfig {
  const rawProvider = (envValue(getEnv, "EMAIL_PROVIDER") || "disabled").toLowerCase();
  const provider: EmailProvider = rawProvider === "resend" ? "resend" : "disabled";
  const problems: string[] = [];
  if (rawProvider !== "resend" && rawProvider !== "disabled") problems.push("EMAIL_PROVIDER_unknown_value_treated_as_disabled");
  const resendApiKey = envValue(getEnv, "RESEND_API_KEY");
  const from = envValue(getEnv, "EMAIL_FROM");
  if (provider === "resend") {
    if (!resendApiKey) problems.push("RESEND_API_KEY_missing");
    if (!from) problems.push("EMAIL_FROM_missing");
  }
  const siteUrl = (envValue(getEnv, "SITE_URL") || "https://iashark.com").replace(/\/+$/, "");
  const company: CompanyIdentity = {
    tradingName: envValue(getEnv, "COMPANY_TRADING_NAME") || COMPANY_DEFAULTS.tradingName,
    legalStatus: envValue(getEnv, "COMPANY_LEGAL_STATUS") || COMPANY_DEFAULTS.legalStatus,
    operatorName: envValue(getEnv, "COMPANY_OPERATOR_NAME") || COMPANY_DEFAULTS.operatorName,
    address: envValue(getEnv, "COMPANY_ADDRESS") || COMPANY_DEFAULTS.address,
    registration: envValue(getEnv, "COMPANY_REGISTRATION") || COMPANY_DEFAULTS.registration,
    vat: envValue(getEnv, "COMPANY_VAT") || COMPANY_DEFAULTS.vat,
    phone: envValue(getEnv, "COMPANY_PHONE") || COMPANY_DEFAULTS.phone,
    email: envValue(getEnv, "COMPANY_EMAIL") || COMPANY_DEFAULTS.email,
    mediator: envValue(getEnv, "COMPANY_MEDIATOR") || COMPANY_DEFAULTS.mediator,
  };
  return {
    provider,
    resendApiKey,
    from,
    replyTo: envValue(getEnv, "EMAIL_REPLY_TO") || company.email,
    siteUrl,
    company,
    problems,
  };
}

// Champs d'identite encore manquants (pour les logs et EMAILS.md).
export function missingCompanyFields(company: CompanyIdentity): string[] {
  const out: string[] = [];
  for (const k of ["operatorName", "address", "registration", "vat", "phone", "mediator"] as const) {
    if (!company[k]) out.push(k);
  }
  // "Paris, France" n'est pas une adresse geographique complete.
  if (company.address === COMPANY_DEFAULTS.address) out.push("address_incomplete");
  return out;
}
