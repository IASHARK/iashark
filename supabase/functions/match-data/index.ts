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

// ---------------------------------------------------------------------------
// OUVERTURE DES ANALYSES DE MATCHS TERMINES (decision du proprietaire,
// 20/09/2026 ; docs/SPEC_RESULTATS_HIER.md, lot R4).
//
// Une analyse dont le match est TERMINE n'a plus aucune valeur de pari : elle
// devient la preuve publique du travail et s'ouvre a tout le monde, sans
// compte et sans abonnement, exactement comme l'analyse offerte du jour
// (is_free). Une analyse d'un match A VENIR ou EN COURS reste strictement
// payante : rien ne change pour elle.
//
// LE DECLENCHEUR EST VERIFIE ICI, COTE SERVEUR, et uniquement a partir de
// donnees que le navigateur ne peut pas forger : l'heure de coup d'envoi et le
// statut ecrits par le pipeline dans NOS fichiers publics, telecharges par
// cette fonction elle-meme (chargerDonnees). Aucun parametre de la requete
// n'entre dans cette decision - le client ne peut demander qu'un identifiant.
//
// Copie fonctionnelle de lib/match-view-model.js#openedState (Deno ne charge
// pas le module CommonJS du site) : tests/match-page-results.test.js execute
// les deux et verifie qu'elles decident exactement la meme chose. Ne jamais
// modifier l'une sans l'autre.

// Copie minimale de lib/match-time.js#parseParis : les dates des fichiers
// publics sont ecrites en heure de Paris ("2026-09-19 21:30"), changements
// d'heure compris (le decalage est calcule POUR la date, jamais suppose).
// Date absente ou illisible : null, et le match reste ferme.
const FUSEAU_SOURCE = "Europe/Paris";
const RE_DATE_PARIS = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;
function decalageParisMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSEAU_SOURCE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(instant));
  const v: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") v[p.type] = Number(p.value);
  const mur = Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute, v.second);
  return Math.round((mur - Math.floor(instant / 1000) * 1000) / 60000);
}
function coupDEnvoiMs(valeur: unknown): number | null {
  const m = RE_DATE_PARIS.exec(String(valeur == null ? "" : valeur).trim());
  if (!m) return null;
  const mois = Number(m[2]), jour = Number(m[3]);
  const heure = m[4] == null ? 0 : Number(m[4]), minute = m[5] == null ? 0 : Number(m[5]);
  // Date hors calendrier ("2026-13-45") : illisible, donc heure inconnue.
  // Date.UTC la reporterait silencieusement sur un autre mois.
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31 || heure > 23 || minute > 59) return null;
  const devine = Date.UTC(Number(m[1]), mois - 1, jour, heure, minute);
  if (!Number.isFinite(devine)) return null;
  const off = decalageParisMinutes(devine);
  let t = devine - off * 60000;
  // Deuxieme passe : le decalage a l'instant corrige peut differer du premier
  // (nuit du changement d'heure).
  const off2 = decalageParisMinutes(t);
  if (off2 !== off) t = devine - off2 * 60000;
  return t;
}

type EtatOuverture = { open: boolean; reason: string };
// --- DEBUT ETAT OUVERTURE (copie de lib/match-view-model.js#openedState) ---
// Critere volontairement conservateur :
//   1. statut de report, d'annulation, de suspension, de match arrete ou
//      d'horaire a definir -> FERME, meme longtemps apres l'heure prevue : le
//      match peut encore se jouer, le pari garde toute sa valeur ;
//   2. sans heure de coup d'envoi exploitable -> FERME (jamais d'ouverture au
//      jugement) ;
//   3. sinon, ouverture 3 h 30 apres le coup d'envoi seulement. Un match dure
//      au plus ~2 h 05 (2 h 30 avec de longs arrets) : la marge couvre les
//      prolongations, les tirs au but et un coup d'envoi retarde ;
//   4. un statut de fin reel (FT/AET/PEN) est enregistre comme raison mais ne
//      dispense JAMAIS de la marge : les fichiers publics ne sont reecrits
//      qu'aux passages du pipeline, un statut peut donc etre en retard, jamais
//      en avance.
const SETTLED_MARGIN_MS = 3.5 * 60 * 60 * 1000;
const FINISHED_STATUSES = ["FT", "AET", "PEN"];
const BLOCKING_STATUSES = ["PST", "CANC", "SUSP", "INT", "ABD", "AWD", "WO", "TBD"];
function openedState(status: unknown, kickoffMs: unknown, nowMs: unknown): EtatOuverture {
  const s = String(status == null ? "" : status).trim().toUpperCase();
  if (BLOCKING_STATUSES.indexOf(s) !== -1) return { open: false, reason: "postponed" };
  // Heure absente = heure INCONNUE, jamais 1970 : Number(null) vaut 0, et un
  // 0 accepte ici ouvrirait tous les matchs sans date.
  const kickoff = kickoffMs === null || kickoffMs === undefined || kickoffMs === "" ? NaN : Number(kickoffMs);
  if (!Number.isFinite(kickoff)) return { open: false, reason: "unknown_kickoff" };
  const now = Number(nowMs);
  if (!Number.isFinite(now) || now - kickoff < SETTLED_MARGIN_MS) return { open: false, reason: "too_early" };
  return { open: true, reason: FINISHED_STATUSES.indexOf(s) !== -1 ? "finished_status" : "kickoff_margin" };
}
// --- FIN ETAT OUVERTURE ---

// Etat d'ouverture de chaque match servi, calcule sur les donnees du serveur.
function etatsOuverture(matchs: Record<string, unknown>[], maintenant: number): Record<string, EtatOuverture> {
  const out: Record<string, EtatOuverture> = {};
  for (const m of matchs) {
    if (!m || m.id == null) continue;
    out[String(m.id)] = openedState(m.status, coupDEnvoiMs(m.date), maintenant);
  }
  return out;
}
// Drapeaux explicites pour la page : pourquoi ce match est ouvert.
// opened_reason : "settled" (offert car termine), "free" (offert car match du
// jour) ou "pro" (abonne). Un match ferme ne porte aucun drapeau.
function marquerOuverture(m: Record<string, unknown>, etat: EtatOuverture | undefined, isPro: boolean): Record<string, unknown> {
  const termine = !!(etat && etat.open);
  if (!termine && !estGratuit(m) && !isPro) return m;
  return {
    ...m,
    is_settled: termine,
    settled_reason: termine && etat ? etat.reason : null,
    opened_reason: isPro ? "pro" : estGratuit(m) ? "free" : termine ? "settled" : null,
  };
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

// deno-lint-ignore no-explicit-any
type Supabase = any;

// Lignes premium REELLES depuis la table protegee, jamais depuis quoi que ce
// soit qui viendrait du navigateur. Une erreur de lecture est journalisee et
// ne renvoie rien : le match reste servi sans son detail premium.
async function lirePremium(supabase: Supabase, fixtureIds: unknown[]): Promise<Record<string, Record<string, unknown>>> {
  if (!fixtureIds.length) return {};
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
    return {};
  }
  return Object.fromEntries(((q.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.fixture_id), r]));
}

// Match complete avec ses champs premium reels. Sans ligne premium, le match
// est rendu tel quel (jamais un pari invente pour combler un vide).
function enrichirMatch(m: Record<string, unknown>, premium: Record<string, unknown> | undefined, detailFields: Set<string>): Record<string, unknown> {
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
    // abonne confirme (ou sur un match termine, ouvert a tous). On ne fait
    // jamais confiance a ce qui pourrait trainer dans data.json.
    pari_rec: premium.pari_rec ?? m.pari_rec ?? null,
    cote_rec: premium.cote_rec ?? m.cote_rec ?? null,
    model_probability: premium.model_probability ?? m.model_probability ?? null,
    markets_compared: premium.markets_compared ?? m.markets_compared ?? null,
    market_id: premium.market_id ?? m.market_id ?? null,
    marche: premium.marche ?? m.marche ?? null,
  };
}

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
        isPro = row?.plan === "pro" || row?.role === "admin";
      }
    } catch (_e) {
      isPro = false;
    }
  }
  // Pas de bypass "phase de test" ici : cette fonction decide un vrai acces a
  // des donnees premium. isPro doit refleter la realite (plan lu cote serveur,
  // colonne non modifiable par le client : migration 0001).

  const portee = await lirePortee(req);
  let data: Record<string, unknown>;
  try {
    data = await chargerDonnees(portee);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Impossible de charger les donnees", details: String(e) }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const matchs = Array.isArray(data.matchs) ? (data.matchs as Record<string, unknown>[]) : [];
  const detailFields = new Set(Array.isArray(data.detail_fields) ? (data.detail_fields as string[]) : []);

  // Ouverture calculee COTE SERVEUR, sur l'heure de coup d'envoi et le statut
  // de NOS fichiers publics (voir openedState plus haut). Le client n'a aucune
  // prise dessus : il ne choisit que l'identifiant demande.
  const ouverture = etatsOuverture(matchs, Date.now());
  const demande = portee.id ? matchs.find((m) => String(m.id) === portee.id) : undefined;
  const etatDemande = portee.id ? ouverture[portee.id] : undefined;
  const termineDemande = !!(etatDemande && etatDemande.open);
  if (portee.id) {
    console.log("match-data", portee.id, "isPro=" + isPro,
      "ouverture=" + (etatDemande ? (etatDemande.open ? "ouverte/" : "fermee/") + etatDemande.reason : "match absent"));
  }

  // Non-abonne (anonyme ou compte gratuit) : aucun champ premium, jamais,
  // meme s'il trainait dans un fichier public (ancien commit, transition).
  // Deux exceptions, et deux seulement : l'analyse offerte du jour (is_free)
  // et le match TERMINE explicitement demande, dont l'analyse est rendue a
  // tout le monde depuis la table protegee (elle n'a plus de valeur de pari).
  //
  // Seul le match demande est re-enrichi : la liste d'accueil n'a besoin
  // d'aucun champ premium, et on n'envoie jamais plus que ce que la page
  // affiche.
  if (!isPro) {
    let premiumById: Record<string, Record<string, unknown>> = {};
    if (termineDemande && demande && demande.id != null) premiumById = await lirePremium(supabase, [demande.id]);
    data.matchs = matchs.map((m) => {
      if (estGratuit(m)) return m;              // analyse offerte du jour
      // Match termine demande : analyse ouverte a tous, servie depuis la
      // table protegee. Sans ligne premium, le match reste sans analyse -
      // jamais un pari reconstitue a partir d'un fichier public.
      if (termineDemande && String(m.id) === portee.id) return enrichirMatch(retirerPremium(m), premiumById[String(m.id)], detailFields);
      return retirerPremium(m);
    }).map((m) => marquerOuverture(m, ouverture[String(m.id)], false));
    if (data.run_output) data.run_output = runOutputPublic(data.run_output, matchs);
    // openedReason du match demande : "settled" (offert car termine),
    // "free" (offert car analyse du jour) ou null (ferme, mur d'abonnement).
    const raisonDemande = termineDemande ? "settled" : demande && estGratuit(demande) ? "free" : null;
    return new Response(JSON.stringify({ ...data, isPro, isSettled: termineDemande, openedReason: raisonDemande }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Utilisateur pro confirme : enrichir avec les champs premium reels depuis
  // match_premium_data, plutot que de faire confiance a quoi que ce soit qui
  // viendrait du navigateur.
  const fixtureIds = matchs.map((m) => m.id).filter((id) => id != null);
  const premiumById = await lirePremium(supabase, fixtureIds);

  data.matchs = matchs
    .map((m) => enrichirMatch(m, premiumById[String(m.id)], detailFields))
    .map((m) => marquerOuverture(m, ouverture[String(m.id)], true));

  return new Response(JSON.stringify({ ...data, isPro, isSettled: termineDemande, openedReason: portee.id ? "pro" : null }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
