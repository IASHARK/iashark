import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Fichiers publics decoupes (lib/public-data-split.js, 14/09/2026) : la liste
// legere suffit a l'accueil ; la page match et la fiche joueur n'ont besoin que
// du detail de LEUR match. Memes champs que la copie assainie matchsPublics,
// jamais plus.
// 16/09/2026 (quota Netlify « usage_exceeded » du 15/09) : plus AUCUN
// telechargement de data.json (~13 Mo par appel). Sans portee (anciens clients
// en cache), la fonction sert la liste legere ; data.json n'est plus publie.
const LIST_URL = "https://iashark.com/data-home.json";
const SITE_URL = "https://iashark.com";
function detailUrl(id: string): string {
  return SITE_URL + "/match/" + id + ".json";
}

// Portee demandee : { id } (page match, fiche joueur : liste legere + detail
// complet de CE match) ou { scope: "list" } (accueil, page Outils : liste
// legere). Sans parametre (anciens clients en cache) : liste legere aussi.
async function lirePortee(req: Request): Promise<{ id: string | null; list: boolean }> {
  const url = new URL(req.url);
  let id: unknown = url.searchParams.get("id");
  let scope: unknown = url.searchParams.get("scope");
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        if (body.id != null) id = body.id;
        if (body.scope != null) scope = body.scope;
      }
    } catch (_e) {
      // corps vide ou non JSON : portee par defaut
    }
  }
  const idStr = id == null ? "" : String(id);
  // Identifiant numerique uniquement : il entre dans une URL.
  return { id: /^\d{1,12}$/.test(idStr) ? idStr : null, list: scope === "list" };
}

async function lireJson(url: string): Promise<Record<string, unknown>> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(url + " fetch failed: " + resp.status);
  return await resp.json();
}

async function chargerDonnees(portee: { id: string | null; list: boolean }): Promise<Record<string, unknown>> {
  // Liste legere dans tous les cas ; detail de CE match si un id est demande.
  // Fichier indisponible : erreur (500), jamais de repli sur un fichier lourd.
  const [liste, detail] = await Promise.all([
    lireJson(LIST_URL),
    portee.id ? lireJson(detailUrl(portee.id)) : Promise.resolve(null),
  ]);
  const matchs = Array.isArray(liste.matchs) ? [...(liste.matchs as Record<string, unknown>[])] : [];
  if (portee.id && detail) {
    if (String(detail.id) !== portee.id) throw new Error("detail inattendu pour " + portee.id);
    const i = matchs.findIndex((m) => String(m.id) === portee.id);
    if (i === -1) matchs.push(detail);
    else matchs[i] = detail;
  }
  // detail_fields : champs absents des matchs de liste (detail_omitted).
  // Sert a ne pas regonfler la liste avec les champs premium de detail.
  return { matchs, generated_at: liste.generated_at ?? null, detail_fields: liste.detail_fields ?? [] };
}

// COPIE LITTERALE de lib/premium-fields.js (PREMIUM_FIELDS). Deno ne charge
// pas le module CommonJS du site : tests/premium-fields-sync.test.js verifie
// que les deux listes sont identiques. Ne jamais modifier l'une sans l'autre.
//
// Historique : le 03/09/2026 le pari recommande (pari_rec, cote_rec,
// model_probability, markets_compared) est devenu premium ; le 14/09/2026
// market_id/marche, puis TOUTE sortie du modele ou de l'analyse (audit fuite :
// data.json, data-home.json, match/<id>.json et cette fonction servaient a un
// visiteur anonyme p1/pn/p2, po25, btts, lambda, mc_scores, paris_safe - le
// pari en clair -, vbet, fiabilite detaillee, textes d'analyse, buteurs
// probables).
//
// has_signal et no_signal restent volontairement publics : ils disent qu'une
// analyse existe, sans la donner. conf (note sur 10 = probabilite du modele /
// 10) est premium depuis le 15/09/2026 (decision proprietaire).
const PREMIUM_FIELDS = [
  // Colonnes dediees de match_premium_data.
  "pari_rec", "cote_rec", "model_probability", "markets_compared", "market_id", "marche",
  "kelly", "edge", "verdict_shark", "facteur_x", "dropping_odds", "player_markets",
  // Traductions premium (raw_response.narrative_i18n).
  "facteur_x_i18n", "verdict_shark_i18n",
  // match_premium_data.premium_fields (migration 0020).
  "conf", "p1", "pn", "p2", "po15", "po25", "btts", "lambda_h", "lambda_a",
  "market_aware_p1", "market_aware_pN", "market_aware_p2",
  "market_consensus_p1", "market_consensus_pN", "market_consensus_p2",
  "mc_scores", "scores", "simulation_count",
  "paris_safe", "paris_risque", "vbet", "val", "hot", "risque", "mise",
  "pick_downgrade", "odds_available", "is_canonical_pick",
  "reliability", "model_agreement", "crit_home", "crit_away", "elo_signal",
  "analyse_card", "analyse_card_i18n", "conseil_public", "conseil_public_i18n",
  "contexte", "contexte_i18n", "scenario", "scenario_i18n", "scenario_15min",
  "decision_factors", "risk_principal",
  "top_scorers",
];

// Un match marque is_free par le pipeline est l'offre d'appel du jour : ses
// champs premium restent lisibles par tout le monde, y compris un visiteur
// non authentifie. C'est le seul cas ou on ne retire rien.
function estGratuit(m: Record<string, unknown>): boolean {
  return m && m.is_free === true;
}

function retirerPremium(m: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...m };
  for (const f of PREMIUM_FIELDS) delete copy[f];
  return copy;
}

// run_output public (miroir de lib/public-run-output.js) : garde-fou si un
// data.json ancien portait encore la SAFE_PICK d'un match payant, les joueurs
// du top buteurs ou les jambes des combines.
function runOutputPublic(ro: unknown, matchs: Record<string, unknown>[]): unknown {
  if (!ro || typeof ro !== "object") return ro;
  const libres = new Set(matchs.filter(estGratuit).map((m) => String(m.id)));
  const copy = { ...(ro as Record<string, unknown>) };
  const sp = copy.safe_pick as Record<string, unknown> | null | undefined;
  if (sp && typeof sp === "object") {
    const fid = (sp.fixture as { fixture_id?: unknown } | undefined)?.fixture_id;
    if (!(fid != null && libres.has(String(fid)))) {
      copy.safe_pick = { generated_at: sp.generated_at ?? null, status: sp.status ?? null, evaluated_count: sp.evaluated_count ?? null, redacted: true };
    }
  }
  const top = copy.top5_scorers as Record<string, unknown> | null | undefined;
  if (top && typeof top === "object") {
    copy.top5_scorers = { generated_at: top.generated_at ?? null, eligible_player_count: top.eligible_player_count ?? null, count_returned: top.count_returned ?? null, redacted: true };
  }
  const dc = copy.daily_combos as Record<string, unknown> | null | undefined;
  if (dc && typeof dc === "object") {
    const combos = Array.isArray(dc.combos) ? (dc.combos as Record<string, unknown>[]) : [];
    copy.daily_combos = { generated_at: dc.generated_at ?? null, eligible_pool_size: dc.eligible_pool_size ?? null, combos: combos.map((c) => ({ combo_id: c?.combo_id, status: c?.status })), redacted: true };
  }
  return copy;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PREMIUM_COLUMNS = "fixture_id,kelly,edge,verdict_shark,facteur_x,dropping_odds,player_markets,pari_rec,cote_rec,model_probability,markets_compared,raw_response,market_id,marche";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let isPro = false;
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const supabase = createClient(SUPA_URL, SERVICE_KEY);

  if (jwt) {
    try {
      const { data: userData } = await supabase.auth.getUser(jwt);
      if (userData?.user) {
        const { data: row } = await supabase
          .from("users")
          .select("plan,role")
          .eq("id", userData.user.id)
          .maybeSingle();
        // plan « famille » (migration 0032) : acces complet offert a des
        // proches. Memes droits qu'un abonne, jamais compte comme un client.
        isPro = row?.plan === "pro" || row?.plan === "famille" || row?.role === "admin";
      }
    } catch (_e) {
      isPro = false;
    }
  }
  // Pas de bypass "phase de test" ici : cette fonction decide un vrai acces a
  // des donnees premium. isPro doit refleter la realite (plan lu cote serveur,
  // colonne non modifiable par le client : migration 0001).

  let data: Record<string, unknown>;
  try {
    data = await chargerDonnees(await lirePortee(req));
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Impossible de charger les donnees", details: String(e) }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const matchs = Array.isArray(data.matchs) ? (data.matchs as Record<string, unknown>[]) : [];

  // Non-abonne (anonyme ou compte gratuit) : aucun champ premium, jamais,
  // meme s'il trainait dans un fichier public (ancien commit, transition).
  if (!isPro) {
    data.matchs = matchs.map((m) => {
      if (estGratuit(m)) return m;              // analyse offerte du jour
      return retirerPremium(m);
    });
    if (data.run_output) data.run_output = runOutputPublic(data.run_output, matchs);
    return new Response(JSON.stringify({ ...data, isPro }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Utilisateur pro confirme : enrichir avec les champs premium reels depuis
  // match_premium_data, plutot que de faire confiance a quoi que ce soit qui
  // viendrait du navigateur.
  const fixtureIds = matchs.map((m) => m.id).filter((id) => id != null);
  let premiumById: Record<string, Record<string, unknown>> = {};
  if (fixtureIds.length) {
    // Type explicite : les deux select() n'ont pas le meme type infere.
    let q: { data: unknown; error: { message: string } | null } =
      await supabase.from("match_premium_data").select(PREMIUM_COLUMNS + ",premium_fields").in("fixture_id", fixtureIds);
    if (q.error) {
      // Migration 0020 pas encore appliquee : premium_fields est alors lu
      // dans raw_response.premium_fields (repli du pipeline).
      console.warn("premium_fields indisponible, lecture sans la colonne :", q.error.message);
      q = await supabase.from("match_premium_data").select(PREMIUM_COLUMNS).in("fixture_id", fixtureIds);
    }
    if (q.error) {
      console.error("match_premium_data query failed:", q.error.message);
    } else {
      premiumById = Object.fromEntries(((q.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.fixture_id), r]));
    }
  }

  const detailFields = new Set(Array.isArray(data.detail_fields) ? (data.detail_fields as string[]) : []);

  data.matchs = matchs.map((m) => {
    const premium = premiumById[String(m.id)];
    if (!premium) return m;
    const raw = premium.raw_response as { narrative_i18n?: Record<string, unknown>; premium_fields?: Record<string, unknown> } | null;
    const etendus = (premium.premium_fields ?? raw?.premium_fields ?? null) as Record<string, unknown> | null;
    const enrichi: Record<string, unknown> = { ...m };
    if (etendus && typeof etendus === "object") {
      for (const f of PREMIUM_FIELDS) {
        if (!(f in etendus)) continue;
        // Match de liste (detail_omitted) : on ne regonfle pas les champs de detail.
        if (m.detail_omitted === true && detailFields.has(f)) continue;
        enrichi[f] = etendus[f];
      }
    }
    // conf (note sur 10 = model_probability / 10, premium depuis le 15/09/2026) :
    // lignes ecrites avant ce changement sans conf dans premium_fields. Meme
    // formule que le pipeline ; sans probabilite (pas de pari), pas de note.
    if (enrichi.conf == null && premium.model_probability != null && Number.isFinite(Number(premium.model_probability))) {
      enrichi.conf = Math.round(Number(premium.model_probability)) / 10;
    }
    return {
      ...enrichi,
      kelly: premium.kelly ?? null,
      edge: premium.edge ?? null,
      verdict_shark: premium.verdict_shark ?? null,
      facteur_x: premium.facteur_x ?? null,
      facteur_x_i18n: raw?.narrative_i18n?.facteur_x_i18n ?? null,
      verdict_shark_i18n: raw?.narrative_i18n?.verdict_shark_i18n ?? null,
      dropping_odds: premium.dropping_odds ?? null,
      player_markets: premium.player_markets ?? null,
      // Le pari recommande revient ici, depuis la table protegee, pour un
      // abonne confirme. On ne fait jamais confiance a ce qui pourrait
      // trainer dans data.json.
      pari_rec: premium.pari_rec ?? m.pari_rec ?? null,
      cote_rec: premium.cote_rec ?? m.cote_rec ?? null,
      model_probability: premium.model_probability ?? m.model_probability ?? null,
      markets_compared: premium.markets_compared ?? m.markets_compared ?? null,
      market_id: premium.market_id ?? m.market_id ?? null,
      marche: premium.marche ?? m.marche ?? null,
    };
  });

  return new Response(JSON.stringify({ ...data, isPro }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
