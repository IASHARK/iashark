// Branchement Deno de trial-reminder (logique : handler.ts). Role de service
// uniquement cote serveur ; jamais expose au navigateur.
//
// Appel SERVEUR uniquement, TOUJOURS dans la region us-east-2 (Brevo) :
//   - workflow .github/workflows/emails-automatiques.yml (modes apercu et test) ;
//   - plus tard, tache pg_cron (plan commente dans
//     supabase/migrations/0055_emails_relances_paiement.sql).
// Mise en ligne : par le workflow (--use-api --no-verify-jwt, comme la version
// en ligne depuis le 03/10/2026).
//
// Secrets : les memes que send-lifecycle-emails (BREVO_API_KEY,
// EMAIL_UNSUBSCRIBE_SECRET, EMAIL_INTERNAL_SECRET ou RELANCE_SECRET,
// LIFECYCLE_SENDING_ENABLED, COMPANY_*), plus STRIPE_SECRET_KEY (montant exact
// de la prochaine facture).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import type { TrialStore } from "./handler.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = SUPA_URL && SERVICE_KEY
  ? createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const db: TrialStore | null = supabase
  ? {
    async listDue({ fromIso, toIso, limit }) {
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id,user_id,status,cancel_at_period_end,trial_reminder_sent_at,market,billing_interval,current_period_end")
        .eq("status", "trialing")
        .eq("cancel_at_period_end", false)
        .is("trial_reminder_sent_at", null)
        .gte("current_period_end", fromIso)
        .lt("current_period_end", toIso)
        .limit(limit);
      if (error) throw new Error("subscriptions: " + error.message);
      if (!subs || !subs.length) return [];
      const ids = subs.map((s) => s.user_id);
      const [users, prefs] = await Promise.all([
        supabase.from("users").select("id,email").in("id", ids),
        supabase.from("email_preferences").select("user_id,market").in("user_id", ids),
      ]);
      if (users.error) throw new Error("users: " + users.error.message);
      const email = new Map((users.data || []).map((u) => [u.id, u.email]));
      const dir = new Map((prefs.data || []).map((p) => [p.user_id, p.market]));
      return subs.map((s) => ({
        stripe_subscription_id: s.stripe_subscription_id,
        user_id: s.user_id,
        email: email.get(s.user_id) || "",
        status: s.status,
        cancel_at_period_end: s.cancel_at_period_end,
        trial_reminder_sent_at: s.trial_reminder_sent_at,
        current_period_end: s.current_period_end,
        market: s.market,
        billing_interval: s.billing_interval,
        dir: dir.get(s.user_id) || null,
      }));
    },
    async reserve(id, nowIso) {
      const { data, error } = await supabase
        .from("subscriptions")
        .update({ trial_reminder_sent_at: nowIso })
        .eq("stripe_subscription_id", id)
        .is("trial_reminder_sent_at", null)
        .select("stripe_subscription_id");
      if (error) throw new Error("reserve: " + error.message);
      return !!(data && data.length);
    },
    async release(id) {
      await supabase.from("subscriptions").update({ trial_reminder_sent_at: null }).eq("stripe_subscription_id", id);
    },
    async findAccount(email) {
      const { data, error } = await supabase.from("users").select("id").ilike("email", email).limit(1).maybeSingle();
      if (error) throw new Error("users: " + error.message);
      return data && data.id ? { userId: String(data.id) } : null;
    },
  }
  : null;

Deno.serve((req: Request) =>
  handleRequest(req, {
    env: (name: string) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    log: { info: (m) => console.log(m), warn: (m) => console.warn(m), error: (m) => console.error(m) },
    db,
  })
);
