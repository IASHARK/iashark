// IASHARK — fonction Edge tickets-du-jour (04/10/2026). NON DEPLOYEE : a deployer a la main
// (supabase functions deploy tickets-du-jour) seulement avec l'accord de Clement, APRES la
// migration 0050_tickets_du_jour.sql.
//
// Sert les tickets x5 / x10, la Selection en or et le buteur du jour du jour de Paris, figes
// dans la table tickets_du_jour par le pipeline (lib/tickets-du-jour.js). Chaque niveau recoit
// ce a quoi il a droit, construit par LISTE BLANCHE (supabase/functions/_shared/tickets-contrat.mjs) :
//  - sans compte : nombre de matchs et cote totale des tickets, rien d'autre ;
//  - compte gratuit : ticket x5 et buteur du jour complets ;
//  - Pro (plan « pro » ou « famille », ou role « admin », lus cote serveur) : tout.
// Le client ne choisit rien : ni le jour (celui du serveur, heure de Paris), ni le niveau
// (lu ici avec la cle service role). Table illisible : 200 avec statut « indisponible ».

import { createClient } from "jsr:@supabase/supabase-js@2";
import { cacheDe, construireReponse, jourParis, niveauDe } from "../_shared/tickets-contrat.mjs";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPA_URL, SERVICE_KEY);
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  // Niveau d'acces, decide ici. Erreur de lecture du plan : compte gratuit (jamais Pro).
  const session: { utilisateur: boolean; ligne: Record<string, unknown> | null; erreurPlan: boolean } = { utilisateur: false, ligne: null, erreurPlan: false };
  if (jwt) {
    try {
      const { data: userData } = await supabase.auth.getUser(jwt);
      if (userData?.user) {
        session.utilisateur = true;
        const { data: row, error } = await supabase
          .from("users")
          .select("plan,role")
          .eq("id", userData.user.id)
          .maybeSingle();
        if (error) session.erreurPlan = true;
        else session.ligne = row ?? null;
      }
    } catch (_e) {
      // jeton illisible : visiteur sans compte
    }
  }
  const niveau = niveauDe(session);
  const jour = jourParis(Date.now());

  let lignes: Record<string, unknown>[] = [];
  let calcul: Record<string, unknown> | null = null;
  let lectureOk = true;
  try {
    const q = await supabase.from("tickets_du_jour").select("type,meta,contenu,etats,publie_a").eq("jour", jour);
    if (q.error) throw new Error(q.error.message);
    lignes = (q.data ?? []) as Record<string, unknown>[];
    const c = await supabase.from("tickets_du_jour_calculs").select("statuts,dernier_calcul_a").eq("jour", jour).maybeSingle();
    if (!c.error) calcul = (c.data ?? null) as Record<string, unknown> | null;
  } catch (e) {
    console.error("tickets_du_jour illisible:", String(e));
    lectureOk = false;
  }

  const corps = construireReponse({ jour, niveau, lignes, calcul, lectureOk });
  return new Response(JSON.stringify(corps), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": cacheDe(niveau),
      "Vary": "Authorization",
    },
  });
});
