import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { validateConsent } from "./consent.ts";
import { availability, priceMatches, resolvePriceId } from "./pricing.ts";

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
const SITE_URL = Deno.env.get("SITE_URL") || "https://iashark.com";

// OFFRE PRO UNIQUE, 3 DUREES (decision du proprietaire du 16/09/2026 ;
// l'ancienne offre a deux niveaux est abandonnee). Un marche = une devise ; une duree = un Price Stripe distinct.
// Table des prix attendus et des noms de secrets : prices.generated.ts,
// GENERE depuis config/markets.json (scripts/build-locales.js) ; logique pure
// de resolution et de controle : pricing.ts (teste par node --test).
//
// Regles (jamais de repli silencieux vers un autre prix, une autre duree ou
// une autre devise) :
// - market absent = marche EUR "fr" (flux historique) ; market gb/mx/za =
//   marche pays ; market us = offre USD de /en/ (19,99 USD/mois, secret
//   STRIPE_PRICE_ID_US_MONTH ; envoye par le front seulement apres
//   config/markets.json#_usdSwitch) ; toute autre valeur = market_not_configured ;
// - interval absent = PRO_DEFAULT_INTERVAL ("month", retro-compatibilite des
//   pages deja en cache) ; interval invalide = 400 invalid_interval ;
// - secret de la duree absent = processed:false, reason
//   "interval_not_configured" (ou "market_not_configured" si aucune duree du
//   marche n'est configuree) -> le front affiche "bientot disponible" ;
// - id du Price : secret de la duree, puis ancien secret STRIPE_PRICE_ID (MENSUEL
//   FR seulement), puis id ecrit dans config/markets.json#<marche>.stripePriceIds
//   (pricing.ts) - toujours pour ce marche et cette duree ;
// - avant toute session, le Price Stripe est relu et doit correspondre
//   exactement (devise, periodicite x1, montant TTC) au prix affiche, sinon
//   processed:false, reason "price_mismatch".
const getEnv = (name: string) => Deno.env.get(name);

// Abonnements qui interdisent une seconde souscription (aucun double
// paiement : changer de duree passe par le portail client).
const LIVE_STATUSES = ["active", "trialing", "past_due"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-iashark-locale",
};

// Langue des messages renvoyes a l'utilisateur. Priorite : champ `locale` du
// consentement ou du corps (ou `dir` de la page : fr/en/es/de/it/pt/gb/mx/za),
// en-tete x-iashark-locale, puis Accept-Language du navigateur ; francais par
// defaut. Meme helper que create-portal-session, delete-account, login-guard.
// Les codes `code` restent stables pour les clients qui traduisent eux-memes.
const MSG_LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DIR_LOCALE: Record<string, string> = { gb: "en", za: "en", mx: "es-mx" };
function normLocale(value: unknown): string {
  const s = String(value || "").trim().toLowerCase().replace("_", "-");
  if (!s) return "";
  if (DIR_LOCALE[s]) return DIR_LOCALE[s];
  if (s.startsWith("es-mx")) return "es-mx";
  if (MSG_LOCALES.includes(s)) return s;
  const base = s.split("-")[0];
  return MSG_LOCALES.includes(base) ? base : "";
}
function pickLocale(req: Request, hint?: unknown): string {
  const direct = normLocale(hint) || normLocale(req.headers.get("x-iashark-locale"));
  if (direct) return direct;
  for (const part of (req.headers.get("accept-language") || "").split(",")) {
    const l = normLocale(part.split(";")[0]);
    if (l) return l;
  }
  return "fr";
}
function msg(table: Record<string, Record<string, string>>, key: string, locale: string): string {
  const row = table[key];
  return (row && (row[locale] || row[locale.split("-")[0]] || row.fr)) || key;
}
const MESSAGES: Record<string, Record<string, string>> = {
  consent_required: {
    fr: "Pour continuer, acceptez les conditions générales de vente et cochez les confirmations obligatoires avant le paiement.",
    en: "To continue, please accept the terms and tick the required confirmations before payment.",
    es: "Para continuar, acepta las condiciones generales de venta y marca las confirmaciones obligatorias antes del pago.",
    "es-mx": "Para continuar, acepta los términos y condiciones y marca las confirmaciones obligatorias antes de pagar.",
    de: "Um fortzufahren, akzeptieren Sie bitte die Allgemeinen Verkaufsbedingungen und setzen Sie die erforderlichen Häkchen vor der Zahlung.",
    it: "Per continuare, accetta le condizioni generali di vendita e seleziona le conferme obbligatorie prima del pagamento.",
    pt: "Para continuar, aceite as condições gerais de venda e assinale as confirmações obrigatórias antes do pagamento.",
  },
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
  let requestedConsent: unknown = undefined;
  let requestedLocale: unknown = undefined;
  let requestedInterval: unknown = undefined;
  let requestedMode: unknown = undefined;
  let requestedPromo: unknown = undefined;
  try {
    const body = await req.clone().json();
    requestedMarket = body?.market;
    requestedInterval = body?.interval;
    requestedMode = body?.mode;
    requestedPromo = body?.promo;
    requestedDir = body?.dir;
    requestedConsent = body?.consent;
    requestedLocale = body?.consent?.locale || body?.locale || body?.dir;
  } catch (_e) {
    // pas de corps JSON - comportement par defaut (marche FR), et donc pas de
    // consentement : la demande sera refusee plus bas (consent_required).
  }
  if (requestedMode === "availability") {
    return new Response(JSON.stringify({ ok: true, processed: false, mode: "availability", intervals: availability(getEnv, requestedMarket) }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const resolution = resolvePriceId(getEnv, requestedMarket, requestedInterval);

  if (!resolution.ok) {
    if (resolution.reason === "invalid_interval") {
      return new Response(JSON.stringify({ ok: false, code: "invalid_interval" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    console.log(`[create-checkout-session] marche="${resolution.requestedMarket}" duree="${resolution.interval}" demandee mais aucun Price Stripe configure (${resolution.reason}) - refus explicite (jamais de repli vers un autre prix, une autre duree ou une autre devise).`);
    return new Response(JSON.stringify({ ok: true, processed: false, market: resolution.requestedMarket, interval: resolution.interval, reason: resolution.reason }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const STRIPE_PRICE_ID_RESOLVED = resolution.priceId;
  const usedMarket = resolution.usedMarket;
  const usedInterval = resolution.interval;

  // Consentement avant paiement (consent.ts) : acceptation des CGV, et pour
  // les marches fr/gb/za la demande expresse d'execution immediate (regime
  // deduit du marche RESOLU cote serveur, jamais d'un champ du navigateur).
  // Sans lui, aucune session Stripe n'est creee. Verifie avant tout appel
  // reseau (auth, Stripe).
  const consent = validateConsent(requestedConsent, usedMarket, new Date().toISOString());
  if (!consent.ok) {
    console.log(`[create-checkout-session] marche="${usedMarket}" consentement incomplet (${consent.missing.join(",")}) - refus consent_required.`);
    return new Response(JSON.stringify({ ok: false, code: consent.code, missing: consent.missing, message: msg(MESSAGES, "consent_required", pickLocale(req, requestedLocale)) }), {
      status: 400,
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

  // Aucun second abonnement : un compte deja abonne (quelle que soit la
  // duree) change de duree dans le portail client, jamais par un nouveau
  // paiement. Lecture sous RLS (policy subscriptions_select_own).
  const { data: live } = await supabaseAuth
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .in("status", LIVE_STATUSES)
    .limit(1);
  if (live && live.length) {
    return new Response(JSON.stringify({ ok: true, processed: false, reason: "already_subscribed" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const { data: mapping } = await supabaseAuth
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    // Prix affiche == prix facture : le Price configure doit correspondre
    // exactement a config/markets.json (devise, duree x1, montant TTC).
    const price = await stripe.prices.retrieve(STRIPE_PRICE_ID_RESOLVED);
    if (!priceMatches(price, { currency: resolution.currency, unitAmount: resolution.unitAmount, interval: usedInterval })) {
      console.error(`[create-checkout-session] Price Stripe incoherent pour ${usedMarket}/${usedInterval} : attendu ${resolution.unitAmount} ${resolution.currency}/${usedInterval}, recu ${price.unit_amount} ${price.currency}/${price.recurring?.interval}x${price.recurring?.interval_count} actif=${price.active} tax=${price.tax_behavior} - refus.`);
      return new Response(JSON.stringify({ ok: true, processed: false, market: usedMarket, interval: usedInterval, reason: "price_mismatch" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
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
    const baseSession = {
      mode: "subscription" as const,
      line_items: [{ price: STRIPE_PRICE_ID_RESOLVED, quantity: 1 }],
      client_reference_id: user.id,
      ...(mapping?.stripe_customer_id ? { customer: mapping.stripe_customer_id } : { customer_email: user.email }),
      success_url: returnBase + "/checkout-succes.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: returnBase + "/checkout-annule.html",
      // Trace durable du consentement (CGV, execution immediate, version des
      // CGV, langue, repertoire, horodatages client et serveur) sur la session
      // ET sur l'abonnement Stripe, qui survit a la session.
      metadata: { market: usedMarket, plan: "pro", interval: usedInterval, ...consent.metadata },
      subscription_data: { metadata: { market: usedMarket, plan: "pro", interval: usedInterval, ...consent.metadata } },
    };
    // Codes promo (campagne email du 25/09/2026), formule au mois uniquement :
    // les reductions en montant fixe ne doivent jamais rendre une semaine
    // gratuite. Par defaut, champ « code promo » sur la page Stripe. Si la page
    // d'abonnement envoie un code de la liste blanche, il est applique
    // d'office (Stripe controle validite, expiration, 1er abonnement) ; refuse
    // par Stripe = repli sur le champ code, jamais d'echec du paiement.
    const CAMPAIGN_CODES = ["BLEUS", "CAIRO5"];
    const promoCode = typeof requestedPromo === "string" ? requestedPromo.trim().toUpperCase() : "";
    let promotionCodeId = "";
    if (usedInterval === "month" && CAMPAIGN_CODES.includes(promoCode)) {
      try {
        const found = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        promotionCodeId = found.data[0]?.id || "";
      } catch (e) {
        console.error("[create-checkout-session] lecture du code promo " + promoCode + " impossible:", (e as Error).message);
      }
    }
    const fieldOnly = usedInterval === "month" ? { allow_promotion_codes: true } : {};
    let session;
    if (promotionCodeId) {
      try {
        session = await stripe.checkout.sessions.create({ ...baseSession, discounts: [{ promotion_code: promotionCodeId }] });
      } catch (e) {
        console.log("[create-checkout-session] code " + promoCode + " refuse par Stripe (" + (e as Error).message + ") - champ code a la place.");
      }
    }
    if (!session) session = await stripe.checkout.sessions.create({ ...baseSession, ...fieldOnly });
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
