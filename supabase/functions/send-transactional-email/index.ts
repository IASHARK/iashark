// Fonction Edge send-transactional-email : branchement Deno de handler.ts.
// Emails transactionnels via Resend (confirmation d'abonnement FR/GB, rappel
// de renouvellement MX, rappel avant reconduction des abonnements annuels
// fr/gb/mx en 7 langues). Appel SERVEUR uniquement (en-tete x-internal-secret).
// INACTIF tant que RESEND_API_KEY n'est pas configure (no-op journalise).
//
// Secrets (Supabase > Edge Functions > Secrets) :
//   EMAIL_INTERNAL_SECRET   obligatoire (sinon 503) - partage avec les appelants
//   RESEND_API_KEY          absent = no-op + log (aucun envoi)
//   EMAIL_FROM              ex. "IASHARK <no-reply@iashark.com>" (domaine verifie Resend)
//   EMAIL_REPLY_TO          optionnel (defaut contact@iashark.com)
//   COMPANY_OPERATOR_NAME, COMPANY_ADDRESS, COMPANY_REGISTRATION, COMPANY_VAT,
//   COMPANY_PHONE, COMPANY_MEDIATOR  identite vendeur (BLOCKED_DECISION tant qu'absents)
//   EMAIL_ALLOW_BLOCKED_DECISION     "true" = envoyer malgre des mentions manquantes
//   STRIPE_PORTAL_LOGIN_URL          optionnel, lien https://billing.stripe.com/p/login/...
//   MX_RENEWAL_REMINDER_DAYS         optionnel, defaut 7
//   STRIPE_SECRET_KEY                       deja utilise par les fonctions de paiement
//   (plus aucun STRIPE_PRICE_ID_* : selection par market + billing_interval, migration 0026)
//
// Planification (pg_cron + pg_net, a creer apres activation de Resend), une
// tache par regle, corps JSON :
//   {"type":"renewal_reminder_scan","market":"fr","interval":"year","daysBefore":45}
//   {"type":"renewal_reminder_scan","market":"gb","interval":"year","daysBefore":30}
//   {"type":"renewal_reminder_scan","market":"mx","interval":"year","daysBefore":30}
//   {"type":"renewal_reminder_scan","market":"mx","interval":"year","daysBefore":7}
//   {"type":"renewal_reminder_scan","market":"mx","interval":"month","daysBefore":7}
//   (hebdomadaire MX a J-2 : BLOCKED_LEGAL, ne pas planifier avant avis juridique)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY fournis par Supabase
//
// Apres modification d'un gabarit : node lib/email-build.js (regenere
// email-bundle.generated.mjs).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import type { SubscriptionStore } from "./handler.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = SUPA_URL && SERVICE_KEY
  ? createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const db: SubscriptionStore | null = supabase
  ? {
    // Selection par marche et duree (colonnes de la migration 0026) : plus
    // de dependance a un unique STRIPE_PRICE_ID_MX.
    async listRenewingSubscriptions({ market, interval, startIso, endIso }) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id,user_id,status,price_id,billing_interval,market,current_period_end,cancel_at_period_end")
        .eq("market", market)
        .eq("billing_interval", interval)
        .in("status", ["active", "trialing"])
        .eq("cancel_at_period_end", false)
        .gte("current_period_end", startIso)
        .lt("current_period_end", endIso)
        .limit(1000);
      if (error) throw new Error("subscriptions select: " + error.message);
      return data ?? [];
    },
  }
  : null;

Deno.serve((req: Request) =>
  handleRequest(req, {
    env: (name: string) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    log: {
      info: (m: string) => console.log(m),
      warn: (m: string) => console.warn(m),
      error: (m: string) => console.error(m),
    },
    db,
  })
);
