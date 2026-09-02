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
// plan utilisateur.
//
// Association user <-> customer <-> subscription : le checkout Stripe est
// cree avec `client_reference_id` = user.id (Supabase auth uid), pour que ce
// webhook puisse relier un customer Stripe a un compte IASHARK sans jamais
// faire confiance a une donnee envoyee par le navigateur.
//
// ------------------------------------------------------------------
// HISTORIQUE DES BUGS REELS CORRIGES ICI (premier vrai abonnement du
// site, 02/09/2026 10:01 UTC, paiement encaisse, compte reste "free") :
//
// 1. ORDRE DES EVENEMENTS. Stripe ne garantit pas que
//    checkout.session.completed arrive en premier - en reel il est arrive
//    EN DERNIER. Le mapping billing_customers n'existait donc pas encore
//    quand le handler d'abonnement le cherchait. Corrige par resolveUserId()
//    (repli par email) + rattrapage dans checkout.session.completed.
//
// 2. LOOKUP EMAIL LIMITE A 50 COMPTES. Le repli par email utilisait
//    auth.admin.listUsers() sans pagination : la valeur par defaut ne
//    renvoie que la premiere page (50 utilisateurs). Au-dela de 50 comptes,
//    le repli echouait a nouveau en silence et le bug n°1 revenait a
//    l'identique pour un vrai client. Corrige : lookup direct par email
//    dans public.users, puis pagination complete en dernier recours.
//
// 3. EVENEMENT "EMPOISONNE" PAR LA DEDUPLICATION. La ligne billing_events
//    etait inseree AVANT le traitement. Si le traitement echouait (appel
//    Stripe en erreur, timeout), on renvoyait 500 -> Stripe re-essayait ->
//    le re-essai tombait sur la branche "doublon" et repartait en 200 sans
//    jamais traiter. Un paiement pouvait ainsi etre perdu definitivement
//    sans aucun moyen de rattrapage automatique. Corrige : la ligne sert
//    de "reservation" et est SUPPRIMEE si le traitement echoue, pour que le
//    re-essai Stripe (jusqu'a 3 jours) puisse vraiment retraiter.
//
// 4. DATE D'ECHEANCE JAMAIS ENREGISTREE. Le compte Stripe est en version
//    d'API 2026-06-24.dahlia, ou `current_period_end` n'est plus sur
//    l'abonnement mais sur ses items. `sub.current_period_end` valait donc
//    toujours undefined -> colonne a NULL -> compte.html affichait
//    "prochaine echeance Invalid Date". Corrige par periodEndIso(), qui lit
//    les deux emplacements.
//
// 5. ABANDON SILENCIEUX SI UTILISATEUR INTROUVABLE. L'evenement etait
//    logue puis jete. Desormais on renvoie une erreur pour que Stripe
//    re-essaie : si le compte/mapping apparait entre-temps, le passage en
//    Pro finit par se faire tout seul.
//
// Filet de securite independant de ce webhook : supabase/functions/
// sync-subscription/ verifie l'abonnement directement chez Stripe a la
// demande du client connecte. Meme si ce webhook tombe entierement, un
// client qui a paye finit Pro.
// ------------------------------------------------------------------

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

// Version d'API alignee sur celle que Stripe envoie reellement dans les
// evenements de ce compte (constatee dans billing_events.payload
// ->>'api_version'). Aligner evite que retrieve() renvoie une forme d'objet
// differente de celle des webhooks - c'est exactement ce qui a produit le
// bug n°4 ci-dessus.
const STRIPE_API_VERSION = "2026-06-24.dahlia";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Statuts Stripe qui donnent acces PRO. "trialing" inclus par anticipation
// (MASTER §3.2 le liste comme statut possible) meme si aucun essai PRO
// n'est actuellement vendu (§3.1 : pas de "1€ 3 jours", plan FREE permanent).
const ACTIVE_LIKE_STATUSES = new Set(["active", "trialing"]);

// TOLERANCE IMPAYE (decision produit explicite de l'utilisateur, 02/09/2026).
// Quand le prelevement du renouvellement echoue (carte expiree, plafond),
// Stripe passe l'abonnement en "past_due" et relance le paiement pendant
// plusieurs jours. Couper l'acces des la premiere tentative echouee
// punirait un client fidele pour un incident bancaire de quelques heures.
// On garde donc l'acces 4 jours apres la fin de la periode payee, puis on
// coupe. Re-evalue a chaque evenement Stripe, a chaque appel de
// sync-subscription, et une fois par jour par la tache planifiee
// public.expire_past_due_access() (migration 0007) - pour que la coupure
// tombe bien meme si aucun evenement n'arrive ce jour-la.
const PAST_DUE_GRACE_DAYS = 4;

function grantsProAccess(status: string, periodEnd: string | null): boolean {
  if (ACTIVE_LIKE_STATUSES.has(status)) return true;
  if (status === "past_due" && periodEnd) {
    return Date.now() < new Date(periodEnd).getTime() + PAST_DUE_GRACE_DAYS * 86400000;
  }
  return false;
}

// `current_period_end` a change d'emplacement selon la version d'API Stripe :
// sur l'abonnement avant, sur chaque item depuis les versions "dahlia".
// On lit les deux pour ne dependre d'aucune version.
function periodEndIso(sub: Stripe.Subscription): string | null {
  const anySub = sub as unknown as Record<string, unknown>;
  const onSub = anySub.current_period_end as number | undefined;
  const onItem = (sub.items?.data?.[0] as unknown as Record<string, unknown> | undefined)
    ?.current_period_end as number | undefined;
  const ts = onSub ?? onItem;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (PAYMENT_PROVIDER !== "stripe") {
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

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
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
  // comme un doublon deja traite, jamais une seconde fois. Cette ligne est
  // une RESERVATION : si le traitement echoue plus bas, elle est supprimee
  // pour que le re-essai Stripe puisse vraiment retraiter (bug n°3).
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

  // Resout user_id <-> stripe_customer_id, en creant le mapping au passage
  // s'il n'existe pas encore (voir bugs n°1 et n°2 en tete de fichier).
  async function resolveUserId(customerId: string): Promise<string | null> {
    const { data: mapping } = await supabase
      .from("billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (mapping) return mapping.user_id;

    const customer = await stripe.customers.retrieve(customerId);
    const email = !customer.deleted ? customer.email : null;
    if (!email) {
      console.error("[stripe-webhook] customer " + customerId + " sans email - impossible de retrouver le compte IASHARK.");
      return null;
    }

    const userId = await findUserIdByEmail(email);
    if (!userId) return null;
    await supabase.from("billing_customers").upsert(
      { user_id: userId, stripe_customer_id: customerId },
      { onConflict: "user_id" },
    );
    return userId;
  }

  // Lookup email -> auth uid. public.users est alimentee par le trigger
  // on_auth_user_created et contient l'email : c'est le chemin direct et
  // indexe. La pagination complete de auth.admin.listUsers() n'est qu'un
  // dernier recours (compte auth existant sans ligne public.users).
  async function findUserIdByEmail(email: string): Promise<string | null> {
    const normalized = email.trim().toLowerCase();
    const { data: profile } = await supabase
      .from("users")
      .select("id")
      .ilike("email", normalized)
      .maybeSingle();
    if (profile) return profile.id;

    // Pagination explicite : listUsers() sans arguments ne renvoie que les
    // 50 premiers comptes (bug n°2).
    for (let page = 1; page <= 40; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
      if (match) return match.id;
      if (data.users.length < 1000) break;
    }
    console.error("[stripe-webhook] aucun compte IASHARK pour l'email du customer Stripe.");
    return null;
  }

  async function applySubscription(sub: Stripe.Subscription, deleted: boolean) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await resolveUserId(customerId);
    if (!userId) {
      // On NE renvoie PAS un succes : un paiement encaisse dont on ne sait
      // pas encore a quel compte l'attribuer doit etre re-essaye par Stripe
      // (jusqu'a 3 jours), pas jete en silence (bug n°5).
      throw new Error("utilisateur IASHARK introuvable pour le customer " + customerId);
    }
    const status = deleted ? "canceled" : sub.status;
    const periodEnd = periodEndIso(sub);
    const { error: subError } = await supabase.from("subscriptions").upsert({
      stripe_subscription_id: sub.id,
      user_id: userId,
      status,
      price_id: sub.items.data[0]?.price?.id || null,
      current_period_end: periodEnd,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    }, { onConflict: "stripe_subscription_id" });
    if (subError) throw new Error("ecriture subscriptions: " + subError.message);

    // users.plan reflete l'etat reel de l'abonnement - jamais mis a jour
    // par le client (voir compte.html, aucune ecriture directe).
    const newPlan = grantsProAccess(status, periodEnd) ? "pro" : "free";
    const { data: updated, error: planError } = await supabase
      .from("users")
      .update({ plan: newPlan })
      .eq("id", userId)
      .select("id");
    if (planError) throw new Error("mise a jour users.plan: " + planError.message);
    // update() sur une ligne inexistante ne remonte aucune erreur : sans ce
    // controle, un compte auth sans ligne public.users resterait "free"
    // apres un paiement reussi, en silence.
    if (!updated || updated.length === 0) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const { error: insertError } = await supabase
        .from("users")
        .insert({ id: userId, email: authUser?.user?.email ?? null, plan: newPlan });
      if (insertError) throw new Error("creation ligne users manquante: " + insertError.message);
    }
    console.log("[stripe-webhook] abonnement " + sub.id + " -> statut " + status + ", plan " + newPlan + " applique.");
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
        // Repli : si l'evenement d'abonnement est deja arrive/reparti avant
        // que ce mapping existe (bug n°1), on rattrape ici en recuperant
        // directement l'abonnement associe a la session.
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscription(sub, false);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(sub, event.type === "customer.subscription.deleted");
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // Troisieme chemin independant vers le passage en Pro : meme si les
        // deux evenements ci-dessus se perdent, une facture payee suffit a
        // reconstituer l'etat reel de l'abonnement. invoice.payment_failed
        // est traite par le meme chemin : chaque relance de Stripe re-evalue
        // la tolerance impaye de 4 jours (voir grantsProAccess).
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const rawSub = invoice.subscription ??
          (invoice.parent as Record<string, Record<string, unknown>> | undefined)?.subscription_details?.subscription;
        const subscriptionId = typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | undefined)?.id;
        if (!subscriptionId) {
          console.log("[stripe-webhook] " + event.type + " sans abonnement associe (paiement ponctuel), ignore.");
          break;
        }
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(sub, false);
        break;
      }
      default:
        console.log("[stripe-webhook] evenement " + event.type + " recu, aucun handler specifique (ignore volontairement).");
    }
  } catch (err) {
    // La reservation est liberee pour que le re-essai Stripe puisse
    // reellement retraiter cet evenement (bug n°3).
    console.error("[stripe-webhook] erreur traitement evenement " + event.id + ":", (err as Error).message);
    const { error: releaseError } = await supabase
      .from("billing_events")
      .delete()
      .eq("stripe_event_id", event.id);
    if (releaseError) {
      console.error("[stripe-webhook] ATTENTION: echec liberation de " + event.id + " - le re-essai Stripe sera vu comme un doublon:", releaseError.message);
    }
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
