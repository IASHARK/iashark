// Annulation en 1 clic (essai de 7 jours et abonnement Pro) — V3 du 3/10/2026.
//
// Le bouton « Annuler » de la page Compte appelle cette fonction : l'abonnement
// s'arrete a la fin de la periode en cours (pendant l'essai : a la fin des 7
// jours, AUCUN prelevement). Pas de detour par une page tierce, pas de
// questionnaire. Le portail Stripe reste disponible pour les factures et la
// carte.
//
// Securite : l'identite vient du JWT verifie cote serveur (jamais d'un id
// envoye par le navigateur) ; l'abonnement vise est lu sous RLS
// (subscriptions_select_own) : on ne peut annuler que LE SIEN. Le webhook
// Stripe met ensuite la table subscriptions a jour (cancel_at_period_end).
//
// Desactive tant que PAYMENT_PROVIDER !== "stripe" (meme regle que les autres
// fonctions de paiement) : reponse 200 processed:false, aucun appel Stripe.
//
// Corps optionnel : { "undo": true } pour reprendre un abonnement dont
// l'annulation est programmee (meme bouton, meme page).
//
// Confirmation ecrite (article L215-1-1 du Code de la consommation) : apres
// chaque resiliation reussie, un e-mail confirme la demande, la date de fin et
// ses effets (confirmation.ts). La reponse dit s'il est parti (email_sent) :
// la page Compte n'annonce jamais un e-mail qui n'a pas ete envoye.
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { sendCancellation } from "./confirmation.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-iashark-locale",
  "Content-Type": "application/json",
};
const CANCELLABLE = ["active", "trialing", "past_due", "unpaid"];

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { ok: false, code: "method_not_allowed" });
  if (PAYMENT_PROVIDER !== "stripe") return reply(200, { ok: true, processed: false, code: "payment_disabled" });
  if (!STRIPE_SECRET_KEY) return reply(500, { ok: false, code: "billing_misconfigured" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return reply(401, { ok: false, code: "unauthorized" });
  const sb = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await sb.auth.getUser();
  if (userError || !userData.user) return reply(401, { ok: false, code: "unauthorized" });

  let undo = false;
  try { undo = (await req.json())?.undo === true; } catch (_e) { /* corps vide = annuler */ }

  const { data: rows, error } = await sb
    .from("subscriptions")
    .select("stripe_subscription_id,status,current_period_end,cancel_at_period_end,market")
    .eq("user_id", userData.user.id)
    .in("status", CANCELLABLE)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return reply(500, { ok: false, code: "read_failed" });
  const sub = rows && rows[0];
  if (!sub) return reply(200, { ok: true, processed: false, code: "no_subscription" });

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: !undo });
    const end = updated.cancel_at || updated.trial_end || updated.current_period_end || null;
    const endsAt = end ? new Date(end * 1000).toISOString() : null;
    console.log(`[cancel-subscription] ${undo ? "reprise" : "annulation"} programmee (statut ${updated.status}).`);
    let email: { sent: boolean; reason?: string } = { sent: false, reason: "not_a_cancellation" };
    if (!undo && updated.cancel_at_period_end) {
      // Langue : celle du COMPTE d'abord (user_preferences.language, la seule source : site,
      // robot, e-mails), sinon celle de la page (en-tete), sinon celle du marche. La variante
      // de la page est gardee quand elle parle la meme langue (es-mx sur /mx/ pour un compte 'es').
      const page = req.headers.get("x-iashark-locale");
      const { data: pref } = await sb.from("user_preferences").select("language").eq("user_id", userData.user.id).maybeSingle();
      const compte = pref?.language || null;
      const locale = compte && !(page && page.split("-")[0] === compte) ? compte : (page || compte);
      email = await sendCancellation(
        { env: (k: string) => Deno.env.get(k), fetch: (i, init) => fetch(i, init), log: console },
        {
          subscriptionId: sub.stripe_subscription_id,
          email: userData.user.email || "",
          locale,
          market: (sub as { market?: string | null }).market || "fr",
          requestedAt: new Date().toISOString(),
          endsAt,
          trial: updated.status === "trialing",
        },
      );
    }
    return reply(200, {
      ok: true,
      processed: true,
      cancel_at_period_end: updated.cancel_at_period_end,
      status: updated.status,
      ends_at: endsAt,
      email_sent: email.sent,
    });
  } catch (e) {
    console.error("[cancel-subscription] echec Stripe:", (e as Error).message);
    return reply(502, { ok: false, code: "stripe_failed" });
  }
});
