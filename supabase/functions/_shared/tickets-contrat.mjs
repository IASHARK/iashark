// IASHARK — CONTRAT DE LA FONCTION tickets-du-jour (version 1, 04/10/2026). Logique PURE :
// aucun appel reseau, aucun module Node ni Deno (charge par la fonction Edge
// supabase/functions/tickets-du-jour/index.ts et par les tests Node).
//
// Regles du trader de cotes (regles-tickets.md §5) et demande de Clement du 04/10/2026 :
//  - sans compte  : type, statut, nombre de matchs et cote totale de chaque ticket ; « 3 paris »
//                   pour la Selection en or ; « pret » pour le buteur. Jamais un match, un pari,
//                   une cote de jambe, une chance, un joueur ;
//  - compte gratuit : ticket x5 complet et buteur du jour complet ; ticket x10 et Selection en
//                   or comme sans compte (verrou « pro ») ;
//  - Pro          : tout.
// La reponse est CONSTRUITE PAR LISTE BLANCHE : un objet neuf avec les seuls champs permis,
// jamais une copie d'une ligne a laquelle on retirerait des champs. Les faux chiffres sous le
// flou sont dessines par la page a partir de constantes, jamais tires de cette reponse.
// Le jour est TOUJOURS celui du serveur (Paris) : un jour envoye par le client est ignore.

export const VERSION = 1;
export const TYPES_TICKETS = ["x5", "x10"];

// Regle Pro : COPIE LITTERALE de supabase/functions/match-data/index.ts (plan « pro » ou
// « famille », ou role « admin », lus cote serveur). tests/tickets-du-jour-contrat.test.js
// verifie que les deux expressions sont identiques.
export function estPro(row) {
  return row?.plan === "pro" || row?.plan === "famille" || row?.role === "admin";
}

// Niveau d'acces : pas de session -> anonyme ; session valide -> gratuit ; ligne users Pro
// -> pro. Plan illisible -> gratuit (jamais Pro par defaut).
export function niveauDe(session) {
  if (!session || !session.utilisateur) return "anonyme";
  if (session.erreurPlan) return "gratuit";
  return estPro(session.ligne) ? "pro" : "gratuit";
}

// Jour de Paris « AAAA-MM-JJ » d'un instant (ms).
export function jourParis(ms) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Number.isFinite(Number(ms)) ? Number(ms) : Date.now()))
    .forEach((x) => { p[x.type] = x.value; });
  return p.year + "-" + p.month + "-" + p.day;
}

// Ce que chaque niveau debloque : null = debloque ; « compte » = un compte gratuit
// debloque ; « pro » = l'abonnement Pro debloque.
const VERROUS = {
  anonyme: { x5: "compte", x10: "compte", or: "compte", buteur: "compte" },
  gratuit: { x5: null, x10: "pro", or: "pro", buteur: null },
  pro: { x5: null, x10: null, or: null, buteur: null },
};
export function verrouDe(niveau, type) {
  const v = VERROUS[niveau] || VERROUS.anonyme;
  return Object.prototype.hasOwnProperty.call(v, type) ? v[type] : "pro";
}

const ETATS = ["a_venir", "reporte", "annule", "retire"];
const texte = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const entier = (v) => (Number.isInteger(Number(v)) && v !== null && v !== "" ? Number(v) : null);
const nombre = (v) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const objet = (v) => (!!v && typeof v === "object" && !Array.isArray(v) ? v : {});
const etat = (v) => (ETATS.indexOf(v) !== -1 ? v : "a_venir");

// statut d'un type : ligne presente -> publie ; sinon dernier calcul du jour : aucun ->
// aucun ; non_go ou indisponible -> indisponible ; pas encore de calcul -> en_preparation.
export function statutDe(type, ligne, calcul, lectureOk) {
  if (lectureOk === false) return "indisponible";
  if (ligne) return "publie";
  const s = calcul && objet(calcul.statuts)[type];
  if (s === "aucun") return "aucun";
  if (s === "non_go" || s === "indisponible") return "indisponible";
  if (s === "publie") return "indisponible"; // ligne attendue mais illisible
  return "en_preparation";
}

function jambePublique(j, etats) {
  return {
    fixture_id: entier(j.fixture_id), domicile: texte(j.domicile), exterieur: texte(j.exterieur),
    ligue: texte(j.ligue), coup_envoi: texte(j.coup_envoi), pari: texte(j.pari), market_id: texte(j.market_id),
    cote: nombre(j.cote), operateur: texte(j.operateur), chance: entier(j.chance),
    etat: etat(objet(etats)[String(j.fixture_id)]),
  };
}

function ticket(type, ligne, statut, niveau) {
  const verrou = verrouDe(niveau, type);
  const out = { type: type, statut: statut, verrou: verrou };
  if (statut !== "publie") return out;
  const meta = objet(ligne.meta);
  out.nb_matchs = entier(meta.nb_matchs);
  out.cote_totale = nombre(meta.cote_totale);
  if (verrou !== null) return out;
  const c = objet(ligne.contenu);
  const e = objet(ligne.etats);
  const sans = objet(e.sans_matchs_reportes);
  out.publie_a = texte(ligne.publie_a);
  out.chance = entier(c.chance);
  out.operateur_unique = texte(c.operateur_unique);
  out.jambes = (Array.isArray(c.jambes) ? c.jambes : []).map((j) => jambePublique(objet(j), e.jambes));
  out.sans_matchs_reportes = e.sans_matchs_reportes ? { nb_matchs: entier(sans.nb_matchs), cote_totale: nombre(sans.cote_totale), chance: entier(sans.chance) } : null;
  return out;
}

function selectionOr(ligne, statut, niveau) {
  const verrou = verrouDe(niveau, "or");
  const out = { statut: statut, verrou: verrou };
  if (statut !== "publie") return out;
  out.nb_paris = entier(objet(ligne.meta).nb_paris);
  if (verrou !== null) return out;
  const e = objet(ligne.etats);
  out.publie_a = texte(ligne.publie_a);
  out.paris = (Array.isArray(objet(ligne.contenu).paris) ? objet(ligne.contenu).paris : [])
    .map((p) => Object.assign({ rang: entier(objet(p).rang) }, jambePublique(objet(p), e.jambes)));
  return out;
}

function buteur(ligne, statut, niveau) {
  const verrou = verrouDe(niveau, "buteur");
  const out = { statut: statut, verrou: verrou };
  if (statut !== "publie" || verrou !== null) return out;
  const b = objet(ligne.contenu);
  return Object.assign(out, {
    publie_a: texte(ligne.publie_a),
    joueur: texte(b.joueur), joueur_id: entier(b.joueur_id), poste: texte(b.poste),
    equipe: texte(b.equipe), adversaire: texte(b.adversaire), fixture_id: entier(b.fixture_id),
    ligue: texte(b.ligue), coup_envoi: texte(b.coup_envoi), chance: entier(b.chance),
    etat: etat(objet(ligne.etats).joueur),
  });
}

// { jour, niveau, lignes: [{type, meta, contenu, etats, publie_a}], calcul: {statuts} | null,
//   lectureOk } -> reponse JSON (version 1).
export function construireReponse({ jour, niveau, lignes, calcul, lectureOk }) {
  const n = VERROUS[niveau] ? niveau : "anonyme";
  const parType = {};
  (Array.isArray(lignes) ? lignes : []).forEach((l) => { if (l && typeof l.type === "string") parType[l.type] = l; });
  const st = (t) => statutDe(t, parType[t], calcul, lectureOk);
  return {
    version: VERSION, jour: String(jour), niveau: n,
    tickets: TYPES_TICKETS.map((t) => ticket(t, parType[t], st(t), n)),
    selection_or: selectionOr(parType.or, st("or"), n),
    buteur_du_jour: buteur(parType.buteur, st("buteur"), n),
  };
}

// En-tetes de cache : anonyme -> cache public court ; connecte -> jamais en cache.
export function cacheDe(niveau) {
  return niveau === "anonyme" ? "public, max-age=300" : "private, no-store";
}
