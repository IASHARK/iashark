import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

// Creation de session de paiement — MASTER V2.1 §3.2/§21/§23. Meme
// discipline "desactive par defaut" que supabase/functions/stripe-webhook/ :
// DESACTIVE PAR DEFAUT via PAYMENT_PROVIDER (le choix reel du prestataire
// est une decision separee de l'utilisateur, ne doit jamais bloquer la V2).
// Cette fonction est le pendant "aller" du webhook (qui traite le "retour").
//
// Tant que PAYMENT_PROVIDER !== "stripe", cette fonction repond 200 avec
// processed:false et NE CREE AUCUNE session Stripe, N'APPELLE AUCUNE API
// externe. C'est ce qui permet au frontend (pro.html) d'avoir un vrai
// bouton "Passer Outils" cable des maintenant ("checkout pret", demande
// explicitement) sans qu'aucun paiement reel ne puisse jamais se
// declencher avant que PAYMENT_PROVIDER soit bascule sur "stripe" avec de
// vraies cles.
//
// STATUT HONNETE : jamais teste contre un vrai compte Stripe (aucune cle
// disponible depuis cette session). Verifie uniquement : structure,
// verification JWT reelle (pas de confiance dans un user_id envoye par le
// client), absence totale d'appel reseau tant que PAYMENT_PROVIDER!=='stripe'.
//
// client_reference_id = auth.uid() du JWT verifie server-side (jamais une
// valeur envoyee telle quelle par le navigateur) - c'est ce qui permet au
// webhook de relier ensuite le customer Stripe au bon compte IASHARK.

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID");
const SITE_URL = Deno.env.get("SITE_URL") || "https://iashark.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (PAYMENT_PROVIDER !== "stripe") {
    // Comportement par defaut et actuel du produit : reponse honnete,
    // jamais un echec silencieux ni une fausse URL - le frontend affiche un
    // message clair "bientot disponible" a partir de processed:false.
    console.log("[create-checkout-session] PAYMENT_PROVIDER=" + PAYMENT_PROVIDER + " - demande recue mais NON traitee (paiement desactive).");
    return new Response(JSON.stringify({ ok: true, payment_provider: PAYMENT_PROVIDER, processed: false }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    console.error("[create-checkout-session] PAYMENT_PROVIDER=stripe mais STRIPE_SECRET_KEY/STRIPE_PRICE_ID manquants - configuration incoherente, refus de traiter.");
    return new Response(JSON.stringify({ error: "billing_misconfigured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Authentification reelle du JWT (pas de confiance dans un id envoye par
  // le corps de la requete) - meme pattern que les autres fonctions Edge du
  // projet (match-data, login-guard).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const supabaseAuth = createClient(SUPA_URL, SUPA_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const user = userData.user;

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    // checkout-succes.html/checkout-annule.html n'existent pour l'instant
    // qu'a la racine (pas encore localisees dans les 6 langues, contenu
    // utilitaire non indexe) - jamais construire une URL /xx/checkout-...
    // qui n'existerait pas (meme classe de bug que les liens legaux 404
    // corriges plus tot ce chantier).
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: SITE_URL + "/checkout-succes.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: SITE_URL + "/checkout-annule.html",
    });
    return new Response(JSON.stringify({ ok: true, processed: true, url: session.url }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-checkout-session] erreur creation session:", (err as Error).message);
    return new Response(JSON.stringify({ error: "checkout_creation_failed" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
