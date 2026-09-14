// Fonction Edge send-transactional-email : branchement Deno de handler.ts.
// Emails transactionnels via Resend (confirmation d'abonnement FR/GB, rappel
// de renouvellement MX). Appel SERVEUR uniquement (en-tete x-internal-secret).
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
//   STRIPE_SECRET_KEY, STRIPE_PRICE_ID_MX   deja utilises par les fonctions de paiement
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
    async listRenewingSubscriptions({ priceId, startIso, endIso }) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id,user_id,status,price_id,current_period_end,cancel_at_period_end")
        .eq("price_id", priceId)
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
