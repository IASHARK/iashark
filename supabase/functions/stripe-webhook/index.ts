import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

// Webhook de paiement — MASTER V2.1 §3.2/§23. DÉSACTIVÉ PAR DÉFAUT via
// PAYMENT_PROVIDER (architecture agnostique du prestataire final - le choix
// réel du prestataire est une décision séparée de l'utilisateur, ne doit
// jamais bloquer la V2 : voir IASHARK_V2_EXECUTION_STATE.md, décision "ne
// pas choisir de prestataire maintenant"). Cette implémentation concrète
// est Stripe (le candidat déjà documenté par le MASTER §3.2), prête à
// s'activer si `PAYMENT_PROVIDER=stripe` — mais rien n'empêche de brancher
// un autre prestataire plus tard en gardant `entitlements`/`subscriptions`
// tels quels et en ajoutant une fonction équivalente pour ce prestataire.
//
// Tant que PAYMENT_PROVIDER !== "stripe" (secret non configuré ou vaut
// "disabled"), cette fonction accuse reception (200) et NE FAIT RIEN
// d'autre : aucun appel Stripe, aucune ecriture DB, aucun changement de
// plan utilisateur. C'est le mecanisme qui garantit "aucun vrai paiement
// ne doit etre execute sans cles reelles" - pas une simple convention
// documentaire.
//
// STATUT HONNETE : ce code n'a jamais pu etre teste contre un vrai webhook
// Stripe (aucun compte Stripe/cle de test disponible depuis cette session).
// Verifie uniquement : structure, coherence avec le schema
// supabase/migrations/0006_billing_scaffold.sql, et absence d'appel reseau
// tant que PAYMENT_PROVIDER!=='stripe'. A tester en conditions reelles
// (Stripe CLI `stripe listen --forward-to`, ou le tableau de bord Stripe en
// mode test) avant toute activation - voir IASHARK_V2_STRIPE_GO_LIVE.md.
//
// Association user <-> customer <-> subscription : le checkout Stripe doit
// etre cree avec `client_reference_id` = user.id (Supabase auth uid), pour
// que ce webhook puisse relier un customer Stripe a un compte IASHARK sans
// jamais faire confiance a une donnee envoyee par le navigateur.

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Statuts Stripe qui donnent acces PRO. "trialing" inclus par anticipation
// (MASTER §3.2 le liste comme statut possible) meme si aucun essai PRO
// n'est actuellement vendu (§3.1 : pas de "1€ 3 jours", plan FREE permanent).
const ACTIVE_LIKE_STATUSES = new Set(["active", "trialing"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (PAYMENT_PROVIDER !== "stripe") {
    // Comportement par defaut et actuel du produit : accuse reception sans
    // rien traiter. Renvoie 200 (pas une erreur) pour que Stripe, si ce
    // secret etait un jour configure par erreur cote Stripe avant d'etre
    // pret cote IASHARK, ne re-tente pas indefiniment un webhook qui ne
    // sera jamais traite.
    console.log("[stripe-webhook] PAYMENT_PROVIDER=" + PAYMENT_PROVIDER + " - evenement recu mais NON traite (paiement desactive).");
    return new Response(JSON.stringify({ ok: true, payment_provider: PAYMENT_PROVIDER, processed: false }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] PAYMENT_PROVIDER=stripe mais STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET manquants - configuration incoherente, refus de traiter.");
    return new Response(JSON.stringify({ error: "billing_misconfigured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing stripe-signature header");
    // Verification cryptographique de la signature - jamais de confiance
    // dans un payload webhook sans elle (n'importe qui pourrait sinon
    // simuler un paiement reussi en POSTant directement cette URL).
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature invalide:", (err as Error).message);
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPA_URL, SERVICE_KEY);

  // Idempotence explicite (MASTER §3.2) : Stripe peut renvoyer le meme
  // evenement plusieurs fois. La cle primaire de billing_events fait
  // echouer un second insert du meme stripe_event_id - on le traite alors
  // comme un doublon deja traite, jamais une seconde fois.
  const { error: dedupeError } = await supabase
    .from("billing_events")
    .insert({ stripe_event_id: event.id, event_type: event.type, payload: event as unknown as Record<string, unknown> });
  if (dedupeError) {
    if (dedupeError.code === "23505") {
      console.log("[stripe-webhook] evenement " + event.id + " deja traite (doublon Stripe), ignore.");
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    console.error("[stripe-webhook] echec ecriture billing_events:", dedupeError.message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (!userId || !customerId) {
          console.error("[stripe-webhook] checkout.session.completed sans client_reference_id/customer - impossible d'associer un utilisateur IASHARK.");
          break;
        }
        await supabase.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: mapping } = await supabase
          .from("billing_customers")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!mapping) {
          console.error("[stripe-webhook] subscription pour customer " + customerId + " sans mapping billing_customers connu - evenement ignore.");
          break;
        }
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await supabase.from("subscriptions").upsert({
          stripe_subscription_id: sub.id,
          user_id: mapping.user_id,
          status,
          price_id: sub.items.data[0]?.price?.id || null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: !!sub.cancel_at_period_end,
        }, { onConflict: "stripe_subscription_id" });
        // users.plan reflete l'etat reel de l'abonnement - jamais mis a
        // jour par le client (voir compte.html, aucune ecriture directe).
        const newPlan = ACTIVE_LIKE_STATUSES.has(status) ? "pro" : "free";
        await supabase.from("users").update({ plan: newPlan }).eq("id", mapping.user_id);
        break;
      }
      default:
        console.log("[stripe-webhook] evenement " + event.type + " recu, aucun handler specifique (ignore volontairement).");
    }
  } catch (err) {
    console.error("[stripe-webhook] erreur traitement evenement " + event.id + ":", (err as Error).message);
    return new Response(JSON.stringify({ error: "processing_failed" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
