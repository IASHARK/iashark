import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

// FILET DE SECURITE DU PASSAGE EN PRO — MASTER V2.1 §3.2.
//
// Pourquoi cette fonction existe : le 02/09/2026, le tout premier vrai
// abonnement du site a ete encaisse par Stripe sans que le compte passe en
// Pro (bug d'ordre des evenements webhook, detaille en tete de
// supabase/functions/stripe-webhook/index.ts). Le webhook a ete corrige,
// mais un webhook reste un point de defaillance unique : endpoint mal
// configure, secret de signature rotationne, indisponibilite Supabase,
// evenement expire apres 3 jours de re-essais... A chaque fois le resultat
// est le meme et il est inacceptable : un client a paye et n'a pas son acces.
//
// Cette fonction est un second chemin, TOTALEMENT INDEPENDANT du webhook :
// le client connecte demande "verifie mon abonnement", et on va lire l'etat
// reel chez Stripe pour le reappliquer en base. Elle est appelee par
// checkout-succes.html (retour de paiement) et par compte.html (a chaque
// ouverture de la page compte). Un client qui a paye finit donc Pro meme si
// aucun webhook n'est jamais arrive.
//
// SECURITE : rien n'est jamais fait sur la foi d'une donnee du navigateur.
// - l'utilisateur est identifie par son JWT verifie server-side ;
// - un session_id fourni n'est utilise que si la session Stripe correspond
//   bien a CE compte (client_reference_id) ET est reellement payee ;
// - a defaut, on ne cherche que le customer Stripe deja associe au compte,
//   ou celui portant l'email verifie du compte ;
// - le plan n'est jamais eleve a "pro" sans un statut d'abonnement reel
//   ("active"/"trialing") lu chez Stripe a l'instant meme.
// Un utilisateur ne peut donc pas s'offrir Pro en appelant cette URL.

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

// Alignee sur la version d'API que Stripe utilise pour ce compte, comme
// dans stripe-webhook (emplacement de current_period_end identique).
const STRIPE_API_VERSION = "2026-06-24.dahlia";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ACTIVE_LIKE_STATUSES = new Set(["active", "trialing"]);

function periodEndIso(sub: Stripe.Subscription): string | null {
  const anySub = sub as unknown as Record<string, unknown>;
  const onSub = anySub.current_period_end as number | undefined;
  const onItem = (sub.items?.data?.[0] as unknown as Record<string, unknown> | undefined)
    ?.current_period_end as number | undefined;
  const ts = onSub ?? onItem;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: HEADERS });

  if (PAYMENT_PROVIDER !== "stripe") {
    return json({ ok: true, processed: false, plan: null, reason: "billing_disabled" });
  }
  if (!STRIPE_SECRET_KEY) {
    console.error("[sync-subscription] PAYMENT_PROVIDER=stripe mais STRIPE_SECRET_KEY manquant.");
    return json({ error: "billing_misconfigured" }, 500);
  }

  // 1. Identite : JWT verifie server-side, jamais un id envoye par le client.
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const asUser = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await asUser.auth.getUser();
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);
  const user = auth.user;

  const admin = createClient(SUPA_URL, SERVICE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });

  let sessionId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.session_id === "string") sessionId = body.session_id;
  } catch (_) { /* corps vide accepte : on retombe sur la recherche par compte */ }

  try {
    let customerId: string | null = null;
    let subscription: Stripe.Subscription | null = null;

    // 2a. Chemin "retour de paiement" : on part de la session de checkout,
    // mais seulement apres avoir verifie qu'elle appartient bien a ce compte
    // et qu'elle est reellement payee.
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const belongsToUser = session.client_reference_id === user.id;
      const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      if (!belongsToUser) {
        console.error("[sync-subscription] session " + sessionId + " ne correspond pas a l'utilisateur authentifie - ignoree.");
      } else if (paid) {
        customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) subscription = await stripe.subscriptions.retrieve(subId);
      }
    }

    // 2b. Chemin general : le customer deja associe au compte, sinon celui
    // qui porte l'email verifie du compte (cas ou le webhook n'a jamais pu
    // ecrire le mapping).
    if (!customerId) {
      const { data: mapping } = await admin
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      customerId = mapping?.stripe_customer_id ?? null;
    }
    if (!customerId && user.email) {
      const found = await stripe.customers.list({ email: user.email, limit: 10 });
      // En cas de doublons cote Stripe, on garde celui qui a un abonnement
      // exploitable (teste juste apres) - ici on prend le plus recent.
      customerId = found.data[0]?.id ?? null;
    }
    if (!customerId) {
      return json({ ok: true, processed: false, plan: null, reason: "no_stripe_customer" });
    }

    await admin.from("billing_customers").upsert(
      { user_id: user.id, stripe_customer_id: customerId },
      { onConflict: "user_id" },
    );

    // 3. Etat reel de l'abonnement chez Stripe, maintenant.
    if (!subscription) {
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      subscription = subs.data.find((s) => ACTIVE_LIKE_STATUSES.has(s.status)) ?? subs.data[0] ?? null;
    }
    if (!subscription) {
      return json({ ok: true, processed: false, plan: null, reason: "no_subscription" });
    }

    const status = subscription.status;
    const { error: subError } = await admin.from("subscriptions").upsert({
      stripe_subscription_id: subscription.id,
      user_id: user.id,
      status,
      price_id: subscription.items.data[0]?.price?.id || null,
      current_period_end: periodEndIso(subscription),
      cancel_at_period_end: !!subscription.cancel_at_period_end,
    }, { onConflict: "stripe_subscription_id" });
    if (subError) throw new Error("ecriture subscriptions: " + subError.message);

    const plan = ACTIVE_LIKE_STATUSES.has(status) ? "pro" : "free";
    const { data: updated, error: planError } = await admin
      .from("users")
      .update({ plan })
      .eq("id", user.id)
      .select("id");
    if (planError) throw new Error("mise a jour users.plan: " + planError.message);
    if (!updated || updated.length === 0) {
      const { error: insertError } = await admin
        .from("users")
        .insert({ id: user.id, email: user.email ?? null, plan });
      if (insertError) throw new Error("creation ligne users manquante: " + insertError.message);
    }

    console.log("[sync-subscription] compte " + user.id + " synchronise : statut " + status + ", plan " + plan + ".");
    return json({ ok: true, processed: true, plan, status, current_period_end: periodEndIso(subscription) });
  } catch (err) {
    console.error("[sync-subscription] echec synchronisation pour " + user.id + ":", (err as Error).message);
    return json({ error: "sync_failed" }, 500);
  }
});
