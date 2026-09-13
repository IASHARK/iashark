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

// Expansion GB/MX/ZA (config/markets.json) : un marche = une devise = un
// Price Stripe distinct (Stripe n'accepte qu'une devise fixe par Price, pas
// de conversion a la volee). Chaque cle est le nom de la variable d'env lue
// pour CE marche - les valeurs elles-memes doivent etre creees dans le
// dashboard Stripe (action externe, hors de portee de ce code) avant que le
// marche correspondant ne passe reellement "LIVE" dans markets.json.
//
// Repli sur STRIPE_PRICE_ID (FR) UNIQUEMENT quand aucun marche n'est precise
// du tout (retro-compatibilite du flux FR existant, qui n'envoie jamais ce
// champ). Si un marche EST precise mais que sa variable n'est pas configuree,
// on NE bascule PAS silencieusement sur le prix FR - un visiteur UK qui voit
// "£14.99" ne doit jamais etre facture au tarif FR en euros parce que la cle
// manquait cote serveur. On renvoie une erreur explicite a la place, et le
// frontend doit alors afficher un message "bientot disponible" pour ce
// marche precis (meme discipline honnete que PAYMENT_PROVIDER != "stripe").
const MARKET_STRIPE_PRICE_ENV: Record<string, string> = {
  gb: "STRIPE_PRICE_ID_GB",
  mx: "STRIPE_PRICE_ID_MX",
  za: "STRIPE_PRICE_ID_ZA",
};

type PriceResolution =
  | { ok: true; priceId: string; usedMarket: string }
  | { ok: false; requestedMarket: string };

function resolvePriceId(market: unknown): PriceResolution {
  const key = typeof market === "string" ? market.toLowerCase() : "";
  if (!key) {
    // Aucun marche precise : comportement historique, flux FR sur STRIPE_PRICE_ID.
    return STRIPE_PRICE_ID
      ? { ok: true, priceId: STRIPE_PRICE_ID, usedMarket: "fr" }
      : { ok: false, requestedMarket: "fr" };
  }
  const envName = MARKET_STRIPE_PRICE_ENV[key];
  const marketPriceId = envName ? Deno.env.get(envName) : undefined;
  if (marketPriceId) return { ok: true, priceId: marketPriceId, usedMarket: key };
  return { ok: false, requestedMarket: key };
}

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

  if (!STRIPE_SECRET_KEY) {
    console.error("[create-checkout-session] PAYMENT_PROVIDER=stripe mais STRIPE_SECRET_KEY manquant - configuration incoherente, refus de traiter.");
    return new Response(JSON.stringify({ error: "billing_misconfigured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // market est optionnel (retro-compatible : un appel sans corps ou sans
  // champ "market" se comporte exactement comme avant, flux FR sur
  // STRIPE_PRICE_ID). Body JSON invalide/absent = simplement pas de market.
  let requestedMarket: unknown = undefined;
  let requestedDir: unknown = undefined;
  try {
    const body = await req.clone().json();
    requestedMarket = body?.market;
    requestedDir = body?.dir;
  } catch (_e) {
    // pas de corps JSON - comportement par defaut (marche FR).
  }
  const resolution = resolvePriceId(requestedMarket);

  if (!resolution.ok) {
    console.log(`[create-checkout-session] marche="${resolution.requestedMarket}" demande mais aucun Price Stripe configure pour lui - refus explicite (jamais de repli silencieux vers un autre marche/devise).`);
    return new Response(JSON.stringify({ ok: true, processed: false, market: resolution.requestedMarket, reason: "market_not_configured" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const STRIPE_PRICE_ID_RESOLVED = resolution.priceId;
  const usedMarket = resolution.usedMarket;

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
    // Retour apres paiement dans le repertoire du visiteur (/gb/, /mx/, /en/...) :
    // checkout-succes.html et checkout-annule.html sont generes dans chaque
    // repertoire par scripts/build-locales.js. Liste blanche stricte (jamais une
    // valeur libre du navigateur dans une URL de redirection) ; sinon repli sur
    // le repertoire du marche, puis sur la racine historique.
    const ALLOWED_DIRS = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx"];
    const dirKey = typeof requestedDir === "string" ? requestedDir.toLowerCase() : "";
    const returnDir = ALLOWED_DIRS.includes(dirKey)
      ? dirKey
      : (usedMarket !== "fr" && ALLOWED_DIRS.includes(usedMarket) ? usedMarket : "");
    const returnBase = SITE_URL + (returnDir ? "/" + returnDir : "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID_RESOLVED, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: returnBase + "/checkout-succes.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: returnBase + "/checkout-annule.html",
      metadata: { market: usedMarket },
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
