// Fonction Edge send-lifecycle-emails : branchement Deno de handler.ts.
// Emails de relance / cycle de vie (bienvenue J0, match offert J2, Pro J5,
// inactivite 7 j et 30 j, resume hebdomadaire Pro) via Resend.
// Appel SERVEUR uniquement (en-tete x-internal-secret), prevu toutes les heures
// par pg_cron (SQL commente en fin de supabase/migrations/0024_email_preferences.sql).
//
// Deploiement : supabase functions deploy send-lifecycle-emails
//   (le dossier ../_shared est embarque automatiquement)
//
// Secrets (Supabase > Edge Functions > Secrets) :
//   EMAIL_INTERNAL_SECRET      obligatoire (sinon 503), meme valeur que send-transactional-email
//   RESEND_API_KEY             absent = no-op (aucune lecture, aucun envoi)
//   EMAIL_FROM                 ex. "IASHARK <news@iashark.com>" (domaine verifie chez Resend)
//   EMAIL_REPLY_TO             optionnel (defaut contact@iashark.com)
//   EMAIL_UNSUBSCRIBE_SECRET   obligatoire, 32 caracteres minimum, PARTAGE avec email-unsubscribe
//   COMPANY_OPERATOR_NAME, COMPANY_ADDRESS   identite de l'expediteur (BLOCKED_DECISION tant qu'absents)
//   EMAIL_ALLOW_BLOCKED_DECISION  "true" = envoyer malgre l'identite manquante
//   LIFECYCLE_PUBLIC_DATA_URL  optionnel (defaut https://iashark.com/data-home.json)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  fournis par Supabase
//
// Apres modification d'un gabarit ou de lib/lifecycle-email.js :
//   node lib/lifecycle-email-build.js
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import type { LifecycleStore } from "./handler.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = SUPA_URL && SERVICE_KEY
  ? createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const db: LifecycleStore | null = supabase
  ? {
    async listCandidates({ nowIso, limit }) {
      const { data, error } = await supabase.rpc("lifecycle_email_candidates", { p_now: nowIso, p_limit: limit });
      if (error) throw new Error("lifecycle_email_candidates: " + error.message);
      return data ?? [];
    },
    async reserveSend({ userId, campaign, key, market }) {
      const { data, error } = await supabase.rpc("email_reserve_send", {
        p_user_id: userId, p_campaign: campaign, p_campaign_key: key, p_market: market,
      });
      if (error) throw new Error("email_reserve_send: " + error.message);
      return data == null ? null : Number(data);
    },
    async completeSend({ id, status, messageId, error: sendError }) {
      const { error } = await supabase.rpc("email_complete_send", {
        p_id: id, p_status: status, p_message_id: messageId ?? null, p_error: sendError ?? null,
      });
      if (error) throw new Error("email_complete_send: " + error.message);
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
