// Fonction Edge send-lifecycle-emails : branchement Deno de handler.ts.
// Emails de relance / cycle de vie (bienvenue J0, match offert J2, Pro J5,
// inactivite 7 j et 30 j, resume hebdomadaire Pro), envoyes par Brevo
// (ou Resend si sa cle existe).
// Appel SERVEUR uniquement (en-tete x-internal-secret), toutes les heures par
// .github/workflows/emails-cycle-de-vie.yml une fois active (en-tete
// x-region: us-east-2 : Brevo n'accepte que les adresses IP autorisees).
//
// Deploiement : par le workflow (mode « installer »), qui pose aussi les secrets :
//   supabase functions deploy send-lifecycle-emails --use-api --no-verify-jwt
//   (le dossier ../_shared est embarque automatiquement)
//
// Secrets (Supabase > Edge Functions > Secrets) :
//   EMAIL_INTERNAL_SECRET      obligatoire (sinon 503), meme valeur que send-transactional-email
//   BREVO_API_KEY              fournisseur Brevo (deja utilise par relance-emails)
//   RESEND_API_KEY             optionnel : s'il existe, Resend est utilise (sauf EMAIL_PROVIDER=brevo)
//   EMAIL_PROVIDER             optionnel : "brevo" ou "resend" force le fournisseur
//   EMAIL_FROM                 ex. "IASHARK <news@iashark.com>" (domaine iashark.com authentifie)
//   EMAIL_REPLY_TO             optionnel (defaut contact@iashark.com)
//   EMAIL_UNSUBSCRIBE_SECRET   obligatoire, 32 caracteres minimum, PARTAGE avec email-unsubscribe
//   COMPANY_OPERATOR_NAME      identite de l'expediteur (mentions legales : « IASHARK, entrepreneur individuel »)
//   COMPANY_ADDRESS            adresse postale ; absente des mentions legales -> LIFECYCLE_SENDER_CONTACT
//   LIFECYCLE_SENDER_CONTACT   contact affiche a la place (contact@iashark.com, comme relance-emails)
//   EMAIL_ALLOW_BLOCKED_DECISION  "true" = envoyer malgre l'identite manquante
//   TRIAL_DAYS                 essai Pro (absent = 7 jours, "0" = coupe), meme regle que create-checkout-session
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
      const rows = data ?? [];
      // Langue du compte : user_preferences.language, la SEULE source (site, robot, e-mails).
      // Lecture impossible : repertoire d'inscription (email_preferences.market), comme avant.
      const ids = rows.map((r: { user_id: string }) => r.user_id).filter(Boolean);
      if (ids.length) {
        const prefs = await supabase.from("user_preferences").select("user_id,language").in("user_id", ids);
        if (!prefs.error) {
          const lang = new Map((prefs.data || []).map((p: { user_id: string; language: string }) => [p.user_id, p.language]));
          for (const r of rows) (r as { language?: string | null }).language = lang.get(r.user_id) ?? null;
        }
        // Essai Pro gratuit : annonce dans les e-mails de vente seulement a un compte
        // qui n'a JAMAIS eu d'abonnement (toutes lignes, tous statuts : meme regle que
        // create-checkout-session). Lecture impossible = null = pas d'annonce. Lecture seule.
        const subs = await supabase.from("subscriptions").select("user_id").in("user_id", ids);
        const deja = subs.error ? null : new Set((subs.data || []).map((s: { user_id: string }) => s.user_id));
        for (const r of rows) (r as { ever_subscribed?: boolean | null }).ever_subscribed = deja ? deja.has(r.user_id) : null;
      }
      return rows;
    },
    // Envoi de test : comptes administrateurs seulement (users.role = 'admin').
    async listTestRecipients() {
      const { data, error } = await supabase.from("users").select("id,email").eq("role", "admin").order("created_at").limit(5);
      if (error) throw new Error("users(admin): " + error.message);
      return (data ?? []).map((u: { id: string; email: string }) => ({ user_id: u.id, email: u.email }));
    },
    async reserveSend({ userId, campaign, key, market }) {
      const { data, error } = await supabase.rpc("email_reserve_send", {
        p_user_id: userId, p_campaign: campaign, p_campaign_key: key, p_market: market,
      });
      if (error) throw new Error("email_reserve_send: " + error.message);
      return data == null ? null : Number(data);
    },
    // Suivi (27/10/2026) : envois recents avec identifiant de message (toutes campagnes),
    // puis public.email_record_event pour chaque ouverture, clic, rebond ou plainte.
    async recentSends({ sinceIso }) {
      const { data, error } = await supabase.from("email_sends").select("message_id,opened_at,clicked_at,status")
        .gte("sent_at", sinceIso).not("message_id", "is", null).limit(5000);
      if (error) throw new Error("email_sends: " + error.message);
      return data ?? [];
    },
    async recordEvent({ messageId, event, at }) {
      const { data, error } = await supabase.rpc("email_record_event", { p_message_id: messageId, p_event: event, p_at: at });
      if (error) throw new Error("email_record_event: " + error.message);
      return data === true;
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
