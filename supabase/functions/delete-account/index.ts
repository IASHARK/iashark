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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-iashark-locale",
  "Content-Type": "application/json",
};

// Statuts pour lesquels un abonnement peut encore donner lieu a un
// prelevement : ce sont les seuls qu'il faut resilier avant d'effacer.
const VIVANTS = ["active", "trialing", "past_due", "unpaid", "incomplete"];

// Langue des messages renvoyes a l'utilisateur. Priorite : champ `locale`
// (ou `dir` de la page : fr/en/es/de/it/pt/gb/mx/za) du corps, en-tete
// x-iashark-locale, puis Accept-Language du navigateur ; francais par defaut.
// Les codes `error`/`code` restent stables pour les clients qui traduisent
// eux-memes.
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
  method_not_allowed: { fr: "Méthode non autorisée.", en: "Method not allowed.", es: "Método no permitido.", de: "Methode nicht erlaubt.", it: "Metodo non consentito.", pt: "Método não permitido." },
  confirmation_missing: { fr: "Confirmation manquante.", en: "Confirmation missing.", es: "Falta la confirmación.", de: "Bestätigung fehlt.", it: "Conferma mancante.", pt: "Confirmação em falta." },
  unauthenticated: { fr: "Non authentifié.", en: "Not signed in.", es: "No has iniciado sesión.", de: "Nicht angemeldet.", it: "Accesso non effettuato.", pt: "Sessão não iniciada." },
  subscription_active: {
    fr: "Votre abonnement doit être résilié avant la suppression. Écrivez à contact@iashark.com, nous le faisons pour vous.",
    en: "Your subscription must be cancelled before the account can be deleted. Write to contact@iashark.com and we will do it for you.",
    es: "Tu suscripción debe cancelarse antes de eliminar la cuenta. Escríbenos a contact@iashark.com y lo hacemos por ti.",
    "es-mx": "Tu suscripción debe cancelarse antes de eliminar la cuenta. Escríbenos a contact@iashark.com y lo hacemos por ti.",
    de: "Dein Abonnement muss vor dem Löschen des Kontos gekündigt werden. Schreib an contact@iashark.com, wir erledigen das für dich.",
    it: "Il tuo abbonamento deve essere disdetto prima di eliminare l'account. Scrivi a contact@iashark.com e lo facciamo noi per te.",
    pt: "A tua subscrição tem de ser cancelada antes de eliminar a conta. Escreve para contact@iashark.com e tratamos disso por ti.",
  },
  cancellation_failed: {
    fr: "La résiliation de votre abonnement a échoué, le compte n'a donc pas été supprimé. Écrivez à contact@iashark.com.",
    en: "Cancelling your subscription failed, so the account was not deleted. Write to contact@iashark.com.",
    es: "No se ha podido cancelar tu suscripción, así que la cuenta no se ha eliminado. Escríbenos a contact@iashark.com.",
    "es-mx": "No se pudo cancelar tu suscripción, así que la cuenta no se eliminó. Escríbenos a contact@iashark.com.",
    de: "Die Kündigung deines Abonnements ist fehlgeschlagen, das Konto wurde daher nicht gelöscht. Schreib an contact@iashark.com.",
    it: "La disdetta del tuo abbonamento non è riuscita, quindi l'account non è stato eliminato. Scrivi a contact@iashark.com.",
    pt: "O cancelamento da tua subscrição falhou, por isso a conta não foi eliminada. Escreve para contact@iashark.com.",
  },
  deletion_failed: {
    fr: "La suppression n'a pas pu aboutir. Écrivez à contact@iashark.com.",
    en: "The deletion could not be completed. Write to contact@iashark.com.",
    es: "No se ha podido completar la eliminación. Escríbenos a contact@iashark.com.",
    "es-mx": "No se pudo completar la eliminación. Escríbenos a contact@iashark.com.",
    de: "Die Löschung konnte nicht abgeschlossen werden. Schreib an contact@iashark.com.",
    it: "Non è stato possibile completare l'eliminazione. Scrivi a contact@iashark.com.",
    pt: "Não foi possível concluir a eliminação. Escreve para contact@iashark.com.",
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    const loc = pickLocale(req);
    return new Response(JSON.stringify({ ok: false, code: "method_not_allowed", message: msg(MESSAGES, "method_not_allowed", loc) }), { status: 405, headers });
  }

  // Confirmation explicite exigee dans le corps : une requete envoyee par
  // accident (rejeu, prefetch, curl mal copie) ne suffit pas a effacer un
  // compte. Le mot est le meme que celui saisi dans la fenetre de
  // confirmation cote page.
  let body: { confirmation?: string; locale?: string; dir?: string } = {};
  try { body = await req.json(); } catch { /* corps vide = confirmation absente */ }
  const loc = pickLocale(req, body.locale || body.dir);
  if (String(body.confirmation || "").trim().toUpperCase() !== "SUPPRIMER") {
    return new Response(JSON.stringify({ ok: false, code: "confirmation_missing", message: msg(MESSAGES, "confirmation_missing", loc) }), { status: 400, headers });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return new Response(JSON.stringify({ ok: false, code: "unauthenticated", message: msg(MESSAGES, "unauthenticated", loc) }), { status: 401, headers });
  }

  // Le jeton est valide par Supabase lui-meme, jamais decode a la main ici.
  const commeUtilisateur = createClient(SUPA_URL, SUPA_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await commeUtilisateur.auth.getUser();
  if (authError || !auth.user) {
    return new Response(JSON.stringify({ ok: false, code: "unauthenticated", message: msg(MESSAGES, "unauthenticated", loc) }), { status: 401, headers });
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
          code: "subscription_active",
          message: msg(MESSAGES, "subscription_active", loc),
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
      code: "cancellation_failed",
      message: msg(MESSAGES, "cancellation_failed", loc),
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
      code: "deletion_failed",
      message: msg(MESSAGES, "deletion_failed", loc),
    }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
});
