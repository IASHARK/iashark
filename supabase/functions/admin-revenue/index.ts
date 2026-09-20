// IASHARK - Revenus reels pour le tableau de bord admin (admin-v2).
// Source de verite : Stripe, jamais reconstruit depuis les pages vues.
// Renvoie MRR par devise, etats des abonnements, encaisse / echoue sur les
// 30 derniers jours (nouveaux vs renouvellements) et les derniers mouvements.
// Acces : compte connecte dont public.users.role = 'admin' (verifie sous RLS
// avec le jeton de l'appelant), sinon 403. Aucune donnee client n'est
// renvoyee en clair : les emails sont tronques comme dans admin.html.
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@22.3.0";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// MRR : montant mensuel equivalent d'un abonnement, par devise.
// semaine -> x 52/12, annee -> / 12, mois -> tel quel.
function monthly(amount: number, interval: string): number {
  if (interval === "week") return (amount * 52) / 12;
  if (interval === "year") return amount / 12;
  return amount;
}

function maskEmail(email: string | null | undefined): string {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at < 1) return s ? "**" : "";
  return s.slice(0, Math.min(2, at)) + "***" + s.slice(at);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: "billing_misconfigured" }), { status: 500, headers });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  const supabase = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  const { data: me } = await supabase.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role !== "admin") return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers });

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
    const since30d = Math.floor(Date.now() / 1000) - 30 * 86400;

    const [subsRes, invoicesRes] = await Promise.all([
      stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items.data.price"] }),
      stripe.invoices.list({ created: { gte: since30d }, limit: 100 }),
    ]);

    // Abonnements : etat, duree, devise, montant mensuel equivalent.
    const mrrByCurrency: Record<string, number> = {};
    const counts = { active: 0, trialing: 0, past_due: 0, canceled: 0, cancel_at_period_end: 0 };
    const subs = subsRes.data.map((s) => {
      const item = s.items?.data?.[0];
      const price = item?.price as Stripe.Price | undefined;
      const amount = (price?.unit_amount ?? 0) / 100;
      const interval = price?.recurring?.interval ?? "month";
      const currency = (price?.currency ?? "eur").toUpperCase();
      const live = s.status === "active" || s.status === "trialing" || s.status === "past_due";
      if (s.status in counts) (counts as Record<string, number>)[s.status]++;
      if (live && s.cancel_at_period_end) counts.cancel_at_period_end++;
      if (live && !s.cancel_at_period_end) mrrByCurrency[currency] = (mrrByCurrency[currency] || 0) + monthly(amount, interval);
      return {
        status: s.status,
        interval,
        currency,
        amount,
        cancel_at_period_end: !!s.cancel_at_period_end,
        created: s.created,
        current_period_end: item?.current_period_end ?? null,
      };
    });
    for (const c of Object.keys(mrrByCurrency)) mrrByCurrency[c] = Math.round(mrrByCurrency[c] * 100) / 100;

    // Factures des 30 derniers jours : encaisse (nouveaux vs renouvellements)
    // et paiements en echec (facture ouverte deja tentee, ou irrecuperable).
    const inv30 = { paid: 0, paid_new: 0, paid_renewal: 0, failed: 0 };
    const paidByCurrency: Record<string, number> = {};
    const recent: Array<Record<string, unknown>> = [];
    for (const inv of invoicesRes.data) {
      const amount = (inv.amount_paid ?? 0) / 100;
      const currency = (inv.currency ?? "eur").toUpperCase();
      const isNew = inv.billing_reason === "subscription_create";
      if (inv.status === "paid") {
        inv30.paid++;
        if (isNew) inv30.paid_new++; else inv30.paid_renewal++;
        paidByCurrency[currency] = (paidByCurrency[currency] || 0) + amount;
      } else if ((inv.status === "open" && (inv.attempt_count ?? 0) > 0) || inv.status === "uncollectible") {
        inv30.failed++;
      }
      if (recent.length < 20) {
        recent.push({
          created: inv.created,
          status: inv.status,
          billing_reason: inv.billing_reason,
          amount: ((inv.status === "paid" ? inv.amount_paid : inv.amount_due) ?? 0) / 100,
          currency,
          email: maskEmail(inv.customer_email),
        });
      }
    }
    for (const c of Object.keys(paidByCurrency)) paidByCurrency[c] = Math.round(paidByCurrency[c] * 100) / 100;

    return new Response(JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
      mrr: mrrByCurrency,
      counts,
      last30d: { ...inv30, paid_amount: paidByCurrency },
      recent,
      subs,
    }), { headers });
  } catch (error) {
    console.error("[admin-revenue]", (error as Error).message);
    return new Response(JSON.stringify({ error: "revenue_fetch_failed" }), { status: 500, headers });
  }
});
