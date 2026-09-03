import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@22.3.0";

// Suppression definitive d'un compte, demandee par son proprietaire.
//
// Pourquoi cette fonction existe : le navigateur ne peut pas faire ce travail.
// Il n'a pas le droit d'effacer une ligne de auth.users, et il n'a evidemment
// pas les cles Stripe. Avant cette fonction, "Supprimer mon compte" ouvrait un
// simple mailto: - le bouton promettait une suppression que rien n'executait.
//
// Ordre des operations, volontairement dans ce sens : on resilie d'abord chez
// Stripe, on efface ensuite. Si la resiliation echoue, on s'arrete et on ne
// supprime rien : un abonnement qui continue a prelever sans compte associe
// serait bien pire qu'une suppression qui echoue proprement.
//
// La fonction n'agit QUE sur le compte du porteur du jeton. Aucun identifiant
// d'utilisateur n'est lu depuis le corps de la requete : il n'y a donc pas de
// parametre a falsifier pour supprimer le compte de quelqu'un d'autre.
// verify_jwt est desactive au niveau plateforme pour que la reponse 401 soit
// la notre (message francais lisible) plutot qu'une erreur brute de la
// passerelle ; le jeton est verifie ici, a chaque appel, sans exception.

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Statuts pour lesquels un abonnement peut encore donner lieu a un
// prelevement : ce sont les seuls qu'il faut resilier avant d'effacer.
const VIVANTS = ["active", "trialing", "past_due", "unpaid", "incomplete"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Methode non autorisee." }), { status: 405, headers });
  }

  // Confirmation explicite exigee dans le corps : une requete envoyee par
  // accident (rejeu, prefetch, curl mal copie) ne suffit pas a effacer un
  // compte. Le mot est le meme que celui saisi dans la fenetre de
  // confirmation cote page.
  let body: { confirmation?: string } = {};
  try { body = await req.json(); } catch { /* corps vide = confirmation absente */ }
  if (String(body.confirmation || "").trim().toUpperCase() !== "SUPPRIMER") {
    return new Response(JSON.stringify({ ok: false, message: "Confirmation manquante." }), { status: 400, headers });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return new Response(JSON.stringify({ ok: false, message: "Non authentifie." }), { status: 401, headers });
  }

  // Le jeton est valide par Supabase lui-meme, jamais decode a la main ici.
  const commeUtilisateur = createClient(SUPA_URL, SUPA_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await commeUtilisateur.auth.getUser();
  if (authError || !auth.user) {
    return new Response(JSON.stringify({ ok: false, message: "Non authentifie." }), { status: 401, headers });
  }
  const userId = auth.user.id;

  const admin = createClient(SUPA_URL, SERVICE_KEY);

  // 1. Resiliation de l'abonnement, si le compte en a un qui court encore.
  try {
    const { data: abos } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id,status")
      .eq("user_id", userId);
    const aResilier = (abos ?? []).filter((s) => VIVANTS.includes(String(s.status)));

    if (aResilier.length) {
      if (PAYMENT_PROVIDER !== "stripe" || !STRIPE_SECRET_KEY) {
        // Un abonnement vivant est enregistre mais on ne peut pas joindre le
        // prestataire pour le resilier. On refuse plutot que de laisser un
        // prelevement orphelin derriere nous.
        console.error("[delete-account] abonnement vivant mais Stripe indisponible", userId);
        return new Response(JSON.stringify({
          ok: false,
          message: "Votre abonnement doit etre resilie avant la suppression. Ecrivez a contact@iashark.com, nous le faisons pour vous.",
        }), { status: 409, headers });
      }
      const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
      for (const s of aResilier) {
        await stripe.subscriptions.cancel(s.stripe_subscription_id);
      }
    }
  } catch (error) {
    console.error("[delete-account] resiliation impossible:", (error as Error).message);
    return new Response(JSON.stringify({
      ok: false,
      message: "La resiliation de votre abonnement a echoue, le compte n'a donc pas ete supprime. Ecrivez a contact@iashark.com.",
    }), { status: 502, headers });
  }

  // 2. Suppression du compte. Toutes les tables du produit referencent
  // auth.users(id) avec `on delete cascade` (public.users, user_preferences,
  // betting_decisions, billing_customers, subscriptions) : cette seule
  // suppression emporte donc l'ensemble des donnees personnelles.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[delete-account] suppression impossible:", deleteError.message);
    return new Response(JSON.stringify({
      ok: false,
      message: "La suppression n'a pas pu aboutir. Ecrivez a contact@iashark.com.",
    }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
});
