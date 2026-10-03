// Branchement Deno de trial-reminder (logique : handler.ts). Role de service
// uniquement cote serveur ; jamais expose au navigateur.
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
        .select("stripe_subscription_id,user_id,market,billing_interval,current_period_end")
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
        supabase.from("user_preferences").select("user_id,language").in("user_id", ids),
      ]);
      const email = new Map((users.data || []).map((u) => [u.id, u.email]));
      const lang = new Map((prefs.data || []).map((p) => [p.user_id, p.language]));
      return subs.map((s) => ({
        stripe_subscription_id: s.stripe_subscription_id,
        email: email.get(s.user_id) || "",
        market: s.market,
        billing_interval: s.billing_interval,
        current_period_end: s.current_period_end,
        locale: lang.get(s.user_id) || null,
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
