// IASHARK — MENU du Canal Pro (30/09/2026). Logique PURE : aucun appel reseau.
// Regle : iashark-strategies/REGLE-VIP.md (trader de cotes), validee ORANGE par
// le mathematicien avec 5 conditions, toutes appliquees ici ou dans canal-pro.mjs :
//   1. aucune « cote minimum » affichee (et, decision de Clement du 30/09 :
//      aucune ligne « il faut gagner X % », aucune mise, aucune esperance) ;
//   2. seulement « chance calculee par IASHARK » (jamais taux de reussite,
//      « chance reelle », « les plus fiables », valeur, avantage, rentable, VIP) ;
//   3. buteur : UN modele nomme et fige (MODELE_BUTEUR), chance arrondie vers le
//      bas a 5 points, plafonnee a 45 %, « 1 chance sur N » coherent, « X marque
//      (a n'importe quel moment) », « sans preuve : pas de cote buteur » ;
//   4. double chance seulement si une VRAIE cote double chance existe chez un
//      operateur agree suivi ; sinon repli sur le 1N2 du match ;
//   5. meme match : chance lue dans la grille des scores du v3 (jamais un simple
//      produit).
// UNE SEULE SOURCE DE CHIFFRES (regle de Clement, 01/10/2026) : la chance affichee d'une
// selection est SA chance_iashark (le plus bas entre le moteur v3 et la cote sans marge,
// en % entier), posee UNE FOIS par le pipeline sur la sortie deposee
// (scripts/canal-pro/deposer-sortie-v3.mjs, lib/chance-iashark.js) : la meme que la page
// match pour le meme pari. Combine du jour et tickets : produit des chances IASHARK de leurs
// selections (comme « Mon combiné » de l'espace Pro). Le CHOIX des paris, lui, ne change
// pas : il suit toujours la probabilite du moteur v3.
// Source : la sortie du moteur v3 (contrat 1.1, moteur-v3/CONTRAT_SORTIE.md).
// Le « cerveau » la remplacera plus tard avec la MEME regle (meme contrat).
// Reference de calcul : les scripts du mathematicien (math-vip/outils.py).
// Tests : tests/canal-pro-menu.test.mjs.
// Module Node seulement (robot scripts/canal-pro, depot de la sortie) : jamais charge par
// l'Edge Function telegram-bot (qui n'importe que canal-pro.mjs).
import * as C from "./canal-pro.mjs";
import { createRequire } from "node:module";
const CHANCE = createRequire(import.meta.url)("../../../lib/chance-iashark.js");

// LIGUES DU MENU (fusion V3, 30/09/2026) : le Canal Pro lit la liste des competitions
// VALIDEES de la fusion (config/leagues.json#fiabilite.ligues_validees, que seul le
// mathematicien modifie), reliee aux codes du moteur v3 par config/moteur-v3.json#ligues.
// Une competition « Fiabilite : en test » n'y est donc jamais ; les selections nationales
// non plus (aucune n'est validee, et competition_type « selections » est ecarte plus bas).
// La regle du trader (REGLE-VIP) borne la liste : championnats europeens a 1N2 / double
// chance ; l'Angleterre en est exclue tant que le v3 n'y publie pas.
export const LIGUES_REGLE_VIP = Object.freeze({ SP1: "Liga", D1: "Bundesliga", I1: "Serie A", F1: "Ligue 1", N1: "Eredivisie", P1: "Liga Portugal" });
/**
 * Voie v3 : { code moteur : cle de la competition (config/leagues.json) } des ligues de la regle VIP
 * VALIDEES dans la config de la fusion (ex. { SP1: "laliga", F1: "ligue1" }).
 */
export function clesVoieV3(configLigues, configMoteur, regle = LIGUES_REGLE_VIP) {
  const validees = new Set(((configLigues && configLigues.fiabilite && configLigues.fiabilite.ligues_validees) || []).map(String));
  const codeParApi = (configMoteur && configMoteur.ligues) || {};
  const out = {};
  for (const l of (configLigues && configLigues.leagues) || []) {
    if (!validees.has(String(l.key)) || l.national === true || l.selections === true) continue;
    const code = codeParApi[String(l.apiFootballId)];
    if (code && regle[code] && !out[code]) out[code] = String(l.key);
  }
  return Object.freeze(out);
}
/** Codes moteur des ligues de la regle VIP qui sont VALIDEES dans la config de la fusion. */
export function liguesValidees(configLigues, configMoteur, regle = LIGUES_REGLE_VIP) {
  const codes = clesVoieV3(configLigues, configMoteur, regle);
  const out = {};
  for (const [code, nom] of Object.entries(regle)) if (codes[code]) out[code] = nom;
  return Object.freeze(out);
}
/**
 * VOIE « COTES DU MARCHE » (02/10/2026 ; selections europeennes ajoutees le 03/10/2026) : competitions de la LISTE A PART
 * config/leagues.json#fiabilite.ligues_validees_cotes_marche (verification du 02/10/2026,
 * VERIF-COTES-MARCHE-HORS-V3.md : la chance tiree des cotes du marche sans marge y tient ; ce n'est PAS
 * un moteur valide). Pour elles, et SEULEMENT pour leurs marches autorises (1N2, DC, OU2.5), la chance
 * d'une selection = la probabilite sans marge des cotes du marche (sansMargePuissance sur la moyenne
 * des bookmakers releves : Pinnacle, reference du marche, et/ou plusieurs agrees), libelle
 * « chance calculee par IASHARK a partir des cotes du marche ». Memes fourchettes de cotes et memes
 * regles de choix que les ligues du v3. Jamais une selection nationale (aucune cote passee verifiee),
 * jamais une competition hors de cette liste.
 * 03/10/2026 : une competition VALIDEE (ligues_validees) mais HORS du menu v3 (Premier League, MLS, Suede,
 * Liga MX, Argentine : le v3 n'y publie rien) passe aussi par cette voie si elle est dans la liste ; seules
 * les ligues de la voie v3 (clesVoieV3 : Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Liga Portugal) en
 * sont exclues (jamais deux voies pour un meme match). Sans config du moteur : prudence, toute competition
 * validee est exclue (ancien comportement).
 * -> { cle: { nom, sport (cle The Odds API, ou null), apiFootballId, marches: [codes du menu] } }.
 */
export const MARCHES_COTES_MARCHE = Object.freeze({ "1N2": ["1", "N", "2"], DC: ["1X", "X2", "12"], "OU2.5": ["O25", "U25"] });
export function liguesCotesMarche(configLigues, configMoteur = null) {
  const liste = (configLigues && configLigues.fiabilite && configLigues.fiabilite.ligues_validees_cotes_marche) || {};
  const exclues = configMoteur ? new Set(Object.values(clesVoieV3(configLigues, configMoteur)))
    : new Set(((configLigues && configLigues.fiabilite && configLigues.fiabilite.ligues_validees) || []).map(String));
  // SELECTIONS EUROPEENNES (03/10/2026, VERIF-SELECTIONS.md du 02/10) : seules les cles de
  // fiabilite.selections_cotes_marche (Ligue des nations, eliminatoires du Mondial zone Europe) passent ;
  // toute autre selection (amicaux, autres zones) reste exclue.
  const selOk = new Set(((configLigues && configLigues.fiabilite && configLigues.fiabilite.selections_cotes_marche) || []).map(String));
  const out = {};
  for (const l of (configLigues && configLigues.leagues) || []) {
    const marches = Array.isArray(liste[l.key]) ? liste[l.key] : null;
    const selection = l.national === true || l.selections === true || l.kind === "nations" || l.kind === "wcq";
    if (!marches || exclues.has(String(l.key)) || (selection && !selOk.has(String(l.key)))) continue;
    const codes = [...new Set(marches.flatMap((m) => MARCHES_COTES_MARCHE[m] || []))];
    if (!codes.length) continue;
    out[l.key] = Object.freeze({ nom: (l.names && l.names.fr) || l.displayName || l.key, sport: l.oddsSportKey || null, apiFootballId: Number(l.apiFootballId) || null, marches: Object.freeze(codes) });
  }
  return Object.freeze(out);
}
const lireConfig = (f) => { try { return createRequire(import.meta.url)(f); } catch { return null; } };
// Config absente (extraction partielle du depot sans config/) : AUCUNE ligue, jamais la liste en dur.
const CONFIG_LIGUES = lireConfig("../../../config/leagues.json");
const CONFIG_MOTEUR = lireConfig("../../../config/moteur-v3.json");
const LIGUES_DU_MENU = liguesValidees(CONFIG_LIGUES, CONFIG_MOTEUR);
const LIGUES_COTES_MARCHE = liguesCotesMarche(CONFIG_LIGUES, CONFIG_MOTEUR);

export const MENU = Object.freeze({
  version: "menu-2026-09-30",
  contrat: "1.1",
  age_max_sortie_h: 26,
  // Championnats de la regle VIP VALIDES dans config/leagues.json (voir liguesValidees).
  ligues: LIGUES_DU_MENU,
  // Voie « cotes du marche » : competitions et marches autorises (liguesCotesMarche).
  ligues_cotes_marche: LIGUES_COTES_MARCHE,
  simple: Object.freeze({ cote_min: 1.40, cote_max: 2.00, max: 3 }),
  combine: Object.freeze({ cote_min: 1.20, cote_max: 1.50, k_min: 2, k_max: 3, total_min: 1.80, total_max: 2.50, parmi: 10 }),
  fun10: Object.freeze({ cote_min: 1.45, cote_max: 1.90, k_min: 4, k_max: 6, total_min: 8 }),
  fun25: Object.freeze({ cote_min: 1.45, cote_max: 1.90, k_min: 6, k_max: 8, total_min: 20 }),
  reve: Object.freeze({ cote_min: 1.45, cote_max: 1.90, k_min: 8, k_max: 10, total_min: 50 }),
  buteur: Object.freeze({ pas: 0.05, plafond: 0.45, plancher: 0.10 }),
  // Tickets du week-end (autour de 10 et de 25, et le 50-100 du mois) : envoyes le vendredi,
  // matchs du vendredi 12 h au dimanche soir (REGLE-VIP §1).
  jour_tickets: 5,
});
/** Le seul modele buteur utilise (condition 3 du mathematicien) : nomme et fige. */
export const MODELE_BUTEUR = "buteurs du moteur v3, contrat 1.1 (champ p_marque), figé";
export const SOURCE_V3 = "chance calculée par IASHARK (moteur v3)";
export const SOURCE_CHANCE = "chance calculée par IASHARK : le plus bas entre le moteur v3 et la cote sans marge";
export const SOURCE_COTES_MARCHE = C.SOURCE_COTES_MARCHE;

const CLE_V3 = { "1N2:1": "1", "1N2:N": "N", "1N2:2": "2", "DC:1N": "1X", "DC:N2": "X2", "DC:12": "12" };
const DC = new Set(["1X", "X2", "12"]);
const ok = (x) => typeof x === "number" && isFinite(x);
const iso = (s) => new Date(String(s).replace(" ", "T")).toISOString();

// ------------------------------------------------------------------ grille des scores (Dixon-Coles, comme matrices_scores du v3)
function poisson(l, n) {
  const out = [];
  let p = Math.exp(-l);
  for (let k = 0; k < n; k++) { out.push(p); p = p * l / (k + 1); }
  return out;
}
/** Grille 11 x 11 des scores (i buts domicile, j buts exterieur), normalisee. */
export function grille(lh, la, rho, n = 11) {
  const a = poisson(lh, n), b = poisson(la, n);
  const m = a.map((x) => b.map((y) => x * y));
  m[0][0] *= Math.max(1 - lh * la * rho, 1e-9);
  m[0][1] *= Math.max(1 + lh * rho, 1e-9);
  m[1][0] *= Math.max(1 + la * rho, 1e-9);
  m[1][1] *= Math.max(1 - rho, 1e-9);
  const s = m.flat().reduce((x, y) => x + y, 0);
  return m.map((r) => r.map((x) => x / s));
}
export function probas1n2(m) {
  let p1 = 0, pn = 0, p2 = 0;
  m.forEach((r, i) => r.forEach((x, j) => { if (i > j) p1 += x; else if (i === j) pn += x; else p2 += x; }));
  return { p1, pn, p2 };
}
/**
 * « Le favori gagne + le joueur marque (a n'importe quel moment) », lu dans la grille (REGLE-VIP §5) :
 * part s des buts de l'equipe telle que somme P(score) x [1 - (1 - s)^buts] = p_joueur, puis
 * somme P(score) x [1 - (1 - s)^buts] x 1[le favori gagne]. Jamais un simple produit.
 */
export function chanceMemeMatch(m, cote, pJoueur) {
  const F = (i, j) => (cote === "1" ? i : j), A = (i, j) => (cote === "1" ? j : i);
  const marg = (s) => { let t = 0; m.forEach((r, i) => r.forEach((x, j) => { t += x * (1 - (1 - s) ** F(i, j)); })); return t; };
  let lo = 0, hi = 1;
  if (!(pJoueur > 0) || marg(1) <= pJoueur) return null; // impossible d'atteindre cette chance : pas de pari
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (marg(mid) < pJoueur) lo = mid; else hi = mid; }
  const s = (lo + hi) / 2;
  let joint = 0;
  m.forEach((r, i) => r.forEach((x, j) => { if (F(i, j) > A(i, j)) joint += x * (1 - (1 - s) ** F(i, j)); }));
  return { part: s, joint };
}
/**
 * Chance affichee du buteur : arrondie VERS LE BAS a 5 points, plafonnee a 45 % ; null sous 10 %.
 * Meme fonction que la page match et l'accueil Pro (lib/chance-iashark.js#chanceButeur).
 */
export function chanceButeurAffichee(p) {
  if (!ok(p)) return null;
  const c = CHANCE.chanceButeur(p);
  return c === null ? null : c / 100;
}

// ------------------------------------------------------------------ marge retiree (methode « puissance », comme le v3)
export function sansMargePuissance(cotes) {
  if (!Array.isArray(cotes) || !cotes.every((o) => ok(o) && o > 1)) return null;
  const inv = cotes.map((o) => 1 / o);
  const f = (k) => inv.reduce((s, x) => s + x ** k, 0) - 1;
  let lo = 0.2, hi = 5;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const k = (lo + hi) / 2;
  return inv.map((x) => x ** k);
}

// ------------------------------------------------------------------ lecture de la sortie du moteur
/** Sortie du moteur -> { ok, raison } (contrat, fraicheur 26 h, interrupteur d'urgence). */
export function verifierSortie(sortie, maintenant) {
  if (!sortie || typeof sortie !== "object") return { ok: false, raison: "sortie du moteur v3 absente" };
  if (String(sortie.contrat_version) !== MENU.contrat) return { ok: false, raison: `contrat du moteur v3 non accepté (${sortie.contrat_version}, attendu ${MENU.contrat})` };
  const t = Date.parse(sortie.genere_le);
  if (!isFinite(t)) return { ok: false, raison: "heure de génération du moteur v3 illisible" };
  const age = (new Date(maintenant).getTime() - t) / 3600e3;
  if (age > MENU.age_max_sortie_h) return { ok: false, raison: `sortie du moteur v3 périmée (générée il y a ${Math.round(age)} h, 26 h au plus)` };
  if (age < -0.25) return { ok: false, raison: "sortie du moteur v3 datée dans le futur" };
  if (sortie.interrupteur_urgence !== false) return { ok: false, raison: "interrupteur d'urgence du moteur v3 allumé" };
  if (!Array.isArray(sortie.matchs)) return { ok: false, raison: "liste des matchs du moteur v3 absente" };
  return { ok: true, raison: null };
}
/** Matchs des 6 championnats europeens dont le coup d'envoi est dans la fenetre. */
export function matchsMenu(sortie, debut, fin) {
  const d = new Date(debut).getTime(), f = new Date(fin).getTime();
  return (sortie?.matchs || []).filter((m) => MENU.ligues[m.ligue_code] && m.coup_envoi_utc && m.competition_type !== "coupe_europe" && m.competition_type !== "selections")
    .map((m) => ({ ...m, _ko: Date.parse(String(m.coup_envoi_utc).replace(" ", "T")) }))
    .filter((m) => m._ko >= d && m._ko <= f);
}
/** Cotes moyennes du 1N2 (v3) -> chances du marche sans marge (methode puissance), par cle du v3. */
export function sansMargeV3(m) {
  const c = ["1N2:1", "1N2:N", "1N2:2"].map((k) => (m.marches || []).find((x) => x.cle === k)?.cote_disponible);
  const q = sansMargePuissance(c.map(Number));
  return q ? { "1N2:1": q[0], "1N2:N": q[1], "1N2:2": q[2], "DC:1N": q[0] + q[1], "DC:N2": q[1] + q[2], "DC:12": q[0] + q[2] } : null;
}
/** Chance affichee d'un marche : sa chance_iashark (posee par le pipeline), en fraction ; sans elle, la probabilite du v3. */
function chanceDe(mk) {
  const c = Number(mk.chance_iashark);
  return c > 0 && c < 100 ? c / 100 : Number(mk.probabilite);
}

/**
 * Selections possibles (« jambes ») : 1N2 et double chance verifies du v3 (eligible_vip du match ET
 * du marche), avec la cote moyenne du v3 (celle de la regle) ET une cote chez un agree suivi.
 * cotesParMatch[match_id] = { event_id, sport_key, books (booksDepuisOddsApi), releve_at }.
 * Double chance sans VRAIE cote double chance chez un agree suivi : ecartee (repli sur le 1N2).
 */
export function jambesCandidates(matchs, cotesParMatch, { pays = "FR" } = {}) {
  const jambes = [], ecartes = [], nonEvalues = [];
  const suivis = C.bookmakersSuivis(pays);
  for (const m of matchs) {
    const label = `${m.domicile} – ${m.exterieur}`;
    if (!m.eligible_vip) continue; // match non verifie sur le passe : jamais dans le menu
    const fixture = Number(m.ids_api_football?.fixture) || null;
    const cotes = cotesParMatch[m.match_id];
    if (!cotes?.books) { nonEvalues.push({ match: label, ligue: MENU.ligues[m.ligue_code], raison: "pas de cotes des bookmakers agréés pour ce match" }); continue; }
    const q = sansMargeV3(m);
    let repliDc = false;
    for (const mk of m.marches || []) {
      const marche = CLE_V3[mk.cle];
      if (!marche || !mk.eligible_vip || !(Number(mk.cote_disponible) > 1) || !(mk.probabilite > 0 && mk.probabilite < 1)) continue;
      const brutes = C.cotesExecutables(cotes.books, marche, null);
      const agrees = Object.fromEntries(Object.entries(brutes).filter(([bk]) => suivis.includes(C.bookmakerAgree(bk, pays))));
      if (!Object.keys(agrees).length) {
        // Note interne seulement si cette double chance aurait pu servir (cote dans une fourchette du menu).
        if (DC.has(marche) && Number(mk.cote_disponible) >= MENU.combine.cote_min && Number(mk.cote_disponible) <= MENU.simple.cote_max) repliDc = true;
        continue;
      }
      jambes.push({ match_id: m.match_id, fixture_id: fixture, event_id: cotes.event_id || null, sport_key: cotes.sport_key || null,
        ligue: MENU.ligues[m.ligue_code], ligue_code: m.ligue_code, dom: m.domicile, ext: m.exterieur, coup_envoi: iso(m.coup_envoi_utc),
        marche, cle_v3: mk.cle, proba: Number(mk.probabilite), chance: chanceDe(mk), cote_moy: Number(mk.cote_disponible), q_marche: q ? q[mk.cle] : null,
        cotes: agrees, pinnacle_cote: C.referencePinnacle(cotes.books, marche, null).cote ?? null, releve_at: cotes.releve_at || null });
    }
    // Note INTERNE (information) : le match est bien evalue sur le 1N2 ; ce n'est ni un refus ni une donnee manquante.
    if (repliDc) ecartes.push({ match: label, famille: "simple", raison: "pas de vraie cote double chance chez un opérateur agréé suivi : repli sur le 1N2", info: true });
  }
  return { jambes, ecartes, nonEvalues };
}

// ------------------------------------------------------------------ voie « cotes du marche »
/**
 * Matchs des competitions de la voie « cotes du marche » dont le coup d'envoi est dans la fenetre, lus dans
 * la liste des matchs du site (data.json : identifiant API-Football = match relie aux resultats).
 * -> [{ match_id: « cm-<fixture> », voie, ligue_cle, ligue, domicile, exterieur, coup_envoi_utc, fixture, _ko }].
 */
export function matchsCotesMarche(matchsSite, debut, fin, ligues = MENU.ligues_cotes_marche) {
  const d = new Date(debut).getTime(), f = new Date(fin).getTime();
  const parId = new Map(Object.entries(ligues).map(([k, l]) => [Number(l.apiFootballId), k]));
  const nom = (e) => (e && typeof e === "object" ? e.n || e.name : e) || "";
  const out = [];
  for (const m of matchsSite || []) {
    const cle = parId.get(Number(m?.league_id));
    // Competition sans cle de cotes (ex. Championship ecossais) : jamais evaluable, donc pas listee.
    if (!cle || !ligues[cle].sport || !m.id || (m.status && m.status !== "NS")) continue;
    const ko = m.kickoff_utc ? Date.parse(m.kickoff_utc) : m.date ? C.parisVersDate(String(m.date).slice(0, 10), String(m.date).slice(11, 16)).getTime() : NaN;
    if (!isFinite(ko) || ko < d || ko > f) continue;
    out.push({ match_id: `cm-${m.id}`, voie: C.VOIE_COTES_MARCHE, ligue_cle: cle, ligue: ligues[cle].nom, domicile: nom(m.home), exterieur: nom(m.away),
      coup_envoi_utc: new Date(ko).toISOString(), fixture: Number(m.id), _ko: ko });
  }
  return out;
}
const moyenne = (v) => v.reduce((a, x) => a + x, 0) / v.length;
/**
 * Cotes d'un match (books de booksDepuisOddsApi) -> chances sans marge de la voie « cotes du marche ».
 * Cote de reference : la MOYENNE des bookmakers releves qui donnent tout le marche (comme les cotes « Avg »
 * de la verification), Pinnacle compris s'il n'est pas douteux ; il faut Pinnacle (reference du marche) OU
 * au moins 2 bookmakers agrees. Un bookmaker dont une cote depasse 2 fois la moyenne est ecarte (coquille).
 * Marge retiree par la methode puissance (sansMargePuissance). Double chance : somme de deux issues du 1N2
 * sans marge ; sa cote de reference (fourchettes) = 1 / (1/a + 1/b) des cotes moyennes (marge comprise).
 * -> { q: { "1","N","2","1X","X2","12","O25","U25" }, moy: { memes cles } }.
 */
export function chancesCotesMarche(books) {
  const lignes = (champ, k) => {
    let rows = Object.entries(books || {}).filter(([bk, r]) => Array.isArray(r[champ]) && r[champ].length === k && r[champ].every((x) => ok(x) && x > 1)
      && (bk !== "pinnacle" || C.margePinnacleNormale(r[champ])));
    if (rows.length >= 3) {
      const moy = Array.from({ length: k }, (_, i) => moyenne(rows.map(([, r]) => r[champ][i])));
      rows = rows.filter(([, r]) => r[champ].every((x, i) => x <= 2 * moy[i]));
    }
    const pin = rows.some(([bk]) => bk === "pinnacle");
    if (!(pin || rows.length >= 2)) return null;
    return Array.from({ length: k }, (_, i) => moyenne(rows.map(([, r]) => r[champ][i])));
  };
  const q = {}, moy = {};
  const a = lignes("1x2", 3);
  const qa = a ? sansMargePuissance(a) : null;
  if (qa) {
    [["1", 0], ["N", 1], ["2", 2]].forEach(([c, i]) => { q[c] = qa[i]; moy[c] = a[i]; });
    [["1X", 0, 1], ["X2", 1, 2], ["12", 0, 2]].forEach(([c, i, j]) => { q[c] = qa[i] + qa[j]; moy[c] = 1 / (1 / a[i] + 1 / a[j]); });
  }
  const o = lignes("ou", 2);
  const qo = o ? sansMargePuissance(o) : null;
  if (qo) { q.O25 = qo[0]; q.U25 = qo[1]; moy.O25 = o[0]; moy.U25 = o[1]; }
  return { q, moy };
}
/**
 * Jambes de la voie « cotes du marche » : SEULEMENT les marches autorises de la competition, avec une vraie
 * cote chez un agree suivi du pays (double chance : VRAIE cote double chance, condition 4). proba = chance
 * sans marge (sert au choix, comme la probabilite du v3) ; chance = la meme en % entier (chance affichee).
 */
export function jambesCotesMarche(matchs, cotesParMatch, { pays = "FR", ligues = MENU.ligues_cotes_marche } = {}) {
  const jambes = [], ecartes = [], nonEvalues = [];
  const suivis = C.bookmakersSuivis(pays);
  for (const m of matchs) {
    const label = `${m.domicile} – ${m.exterieur}`;
    const lg = ligues[m.ligue_cle];
    if (!lg || m.voie !== C.VOIE_COTES_MARCHE) continue;
    const cotes = cotesParMatch[m.match_id];
    if (!cotes?.books) { nonEvalues.push({ match: label, ligue: lg.nom, raison: lg.sport ? "pas de cotes des bookmakers agréés pour ce match" : "compétition sans cotes chez notre fournisseur" }); continue; }
    const { q, moy } = chancesCotesMarche(cotes.books);
    let repliDc = false;
    for (const marche of lg.marches) {
      const p = q[marche];
      if (!(p > 0 && p < 1) || !(moy[marche] > 1)) continue;
      const brutes = C.cotesExecutables(cotes.books, marche, null);
      const agrees = Object.fromEntries(Object.entries(brutes).filter(([bk]) => suivis.includes(C.bookmakerAgree(bk, pays))));
      if (!Object.keys(agrees).length) {
        if (DC.has(marche) && moy[marche] >= MENU.combine.cote_min && moy[marche] <= MENU.simple.cote_max) repliDc = true;
        continue;
      }
      const c = CHANCE.chanceIashark(p * 100, null);
      jambes.push({ match_id: m.match_id, fixture_id: m.fixture, event_id: cotes.event_id || null, sport_key: cotes.sport_key || null,
        ligue: lg.nom, ligue_code: m.ligue_cle, dom: m.domicile, ext: m.exterieur, coup_envoi: iso(m.coup_envoi_utc), voie: C.VOIE_COTES_MARCHE,
        marche, cle_v3: null, proba: p, chance: c ? c.chance / 100 : p, cote_moy: Math.round(moy[marche] * 100) / 100, q_marche: p,
        cotes: agrees, pinnacle_cote: C.referencePinnacle(cotes.books, marche, null).cote ?? null, releve_at: cotes.releve_at || null });
    }
    if (repliDc) ecartes.push({ match: label, famille: "simple", raison: "pas de vraie cote double chance chez un opérateur agréé suivi : repli sur le 1N2", info: true });
  }
  return { jambes, ecartes, nonEvalues };
}

// ------------------------------------------------------------------ la regle (REGLE-VIP §1, meme code que math-vip/outils.py)
const parChance = (a, b) => b.proba - a.proba || Date.parse(a.coup_envoi) - Date.parse(b.coup_envoi) || String(a.match_id).localeCompare(String(b.match_id));
/** Un seul pari par match : le plus probable parmi ceux qui passent la fourchette. */
function unParMatch(jambes) {
  const best = new Map();
  for (const j of jambes) { const b = best.get(j.match_id); if (!b || j.proba > b.proba) best.set(j.match_id, j); }
  return [...best.values()];
}
const dansFourchette = (j, r) => j.cote_moy >= r.cote_min - 1e-9 && j.cote_moy <= r.cote_max + 1e-9;
const produit = (v) => v.reduce((a, x) => a * x, 1);

/** Jusqu'a 3 simples, cote 1,40-2,00, les plus probables selon le v3. */
export function choisirSimples(jambes) {
  return unParMatch(jambes.filter((j) => dansFourchette(j, MENU.simple))).sort(parChance).slice(0, MENU.simple.max);
}
/**
 * Combine du jour : 2 ou 3 selections a 1,20-1,50, matchs differents, jamais un match deja en simple,
 * cote totale 1,80-2,50 ; parmi les 10 plus probables, la combinaison la plus probable.
 */
export function choisirCombine(jambes, matchsPris = new Set()) {
  const r = MENU.combine;
  const z = unParMatch(jambes.filter((j) => dansFourchette(j, r) && !matchsPris.has(j.match_id))).sort(parChance).slice(0, r.parmi);
  let best = null;
  const essayer = (idx) => {
    const sel = idx.map((i) => z[i]);
    if (new Set(sel.map((j) => j.match_id)).size !== sel.length) return; // matchs differents (garanti, verifie quand meme)
    const o = produit(sel.map((j) => j.cote_moy));
    if (o < r.total_min - 1e-9 || o > r.total_max + 1e-9) return;
    const p = produit(sel.map((j) => j.proba));
    if (!best || p > best.p + 1e-15) best = { p, sel, o };
  };
  for (let a = 0; a < z.length; a++) for (let b = a + 1; b < z.length; b++) {
    essayer([a, b]);
    for (let c = b + 1; c < z.length; c++) essayer([a, b, c]);
  }
  return best ? { jambes: best.sel, proba_v3: best.p, chance: produit(best.sel.map((j) => j.chance)), cote_moy: best.o } : null;
}
/**
 * Ticket du week-end (autour de 10, de 25, ou 50-100) : les plus probables du week-end, cote 1,45-1,90,
 * matchs differents, jusqu'a la cote totale voulue. Chance affichee = produit des chances IASHARK des
 * selections (chacune deja le plus bas entre le v3 et la cote sans marge) ; proba_v3 et proba_marche
 * restent pour la trace interne.
 */
export function choisirTicket(jambes, regle) {
  const z = unParMatch(jambes.filter((j) => dansFourchette(j, regle))).sort(parChance);
  const sel = [];
  let o = 1;
  for (const j of z) {
    sel.push(j); o *= j.cote_moy;
    if (sel.length >= regle.k_min && o >= regle.total_min) break;
    if (sel.length === regle.k_max) break;
  }
  if (sel.length < regle.k_min || o < regle.total_min - 1e-9) return null;
  const pv3 = produit(sel.map((j) => j.proba));
  const pm = sel.every((j) => ok(j.q_marche)) ? produit(sel.map((j) => j.q_marche)) : null;
  return { jambes: sel, proba_v3: pv3, proba_marche: pm, chance: produit(sel.map((j) => j.chance)), cote_moy: o };
}
/**
 * Meme match avec buteur (samedi et dimanche) : le favori le plus probable du jour (6 championnats), et
 * son joueur le plus probable de marquer (titulaire probable) selon MODELE_BUTEUR. Chance lue dans la grille.
 */
export function choisirButeur(matchs) {
  let best = null;
  for (const m of matchs) {
    if (!m.eligible_vip || !m.ids_api_football?.fixture) continue;
    const b = m.buts_attendus || {};
    if (!ok(b.domicile) || !ok(b.exterieur) || !ok(b.rho)) continue;
    const g = grille(b.domicile, b.exterieur, b.rho);
    const { p1, p2 } = probas1n2(g);
    const cote = p1 >= p2 ? "1" : "2";
    const equipe = cote === "1" ? m.domicile : m.exterieur;
    const pGagne = Math.max(p1, p2);
    const joueurs = (m.buteurs || []).filter((x) => x.equipe === equipe && x.statut === "titulaire probable" && x.p_marque > 0 && x.p_marque < 1 && x.joueur);
    if (!joueurs.length) continue;
    const j = [...joueurs].sort((x, y) => y.p_marque - x.p_marque || String(x.joueur).localeCompare(String(y.joueur)))[0];
    if (!best || pGagne > best.p_gagne) best = { m, g, cote, equipe, joueur: j, p_gagne: pGagne };
  }
  if (!best) return null;
  const r = chanceMemeMatch(best.g, best.cote, best.joueur.p_marque);
  const affiche = r ? chanceButeurAffichee(r.joint) : null;
  if (!affiche) return null;
  return { ...best, joint: r.joint, part: r.part, affiche };
}

// ------------------------------------------------------------------ le menu du jour
/** Vendredi dont le samedi tombe entre le 1er et le 7 du mois : 1er week-end du mois (ticket 50-100). */
export function premierWeekendDuMois(jour) {
  return C.nomJour(jour) === "vendredi" && Number(C.jourSuivant(jour, 1).slice(8, 10)) <= 7;
}
/** Fenetre des tickets du week-end : du vendredi 12 h au dimanche 23 h 59 (Paris). */
export function fenetreWeekend(vendredi) {
  return { debut: C.parisVersDate(vendredi, "12:00"), fin: C.parisVersDate(C.jourSuivant(vendredi, 2), "23:59") };
}
/** Cotes d'un pari a plusieurs selections chez chaque bookmaker qui les propose TOUTES (produit). */
export function cotesCombinees(jambes) {
  const bks = Object.keys(jambes[0]?.cotes || {}).filter((bk) => jambes.every((j) => ok(j.cotes?.[bk])));
  return Object.fromEntries(bks.map((bk) => [bk, Math.round(produit(jambes.map((j) => j.cotes[bk])) * 100) / 100]));
}
const jambeArchive = (j) => ({ match_id: j.match_id, fixture_id: j.fixture_id, event_id: j.event_id, sport_key: j.sport_key, ligue: j.ligue, dom: j.dom, ext: j.ext,
  coup_envoi: j.coup_envoi, marche: j.marche, selection: C.selectionTxt(j), proba: Math.round(j.chance * 10000) / 10000, proba_moteur: Math.round(j.proba * 10000) / 10000,
  q_marche: ok(j.q_marche) ? Math.round(j.q_marche * 10000) / 10000 : null, cote_moy: j.cote_moy, ...(j.voie ? { voie: j.voie } : {}) });
function plusieurs(famille, choix, { fin } = {}) {
  const js = [...choix.jambes].sort((a, b) => Date.parse(a.coup_envoi) - Date.parse(b.coup_envoi));
  return { famille, marche: "combine", dom: js[0].dom, ext: js[0].ext, ligue: "", fixture_id: js[0].fixture_id, event_id: js[0].event_id, sport_key: js[0].sport_key,
    coup_envoi: js[0].coup_envoi, fin_coup_envoi: js.at(-1).coup_envoi, proba: Math.round(choix.chance * 10000) / 10000,
    source_proba: js.some((j) => j.voie === C.VOIE_COTES_MARCHE)
      ? `chance calculée par IASHARK, matchs différents : produit des chances IASHARK des sélections (moteur v3 : le plus bas entre le moteur et la cote sans marge ; ${SOURCE_COTES_MARCHE} : la cote sans marge)`
      : `${SOURCE_V3}, matchs différents : produit des chances IASHARK des sélections (chacune le plus bas entre le moteur v3 et la cote sans marge)`,
    selections: js.map(jambeArchive), cotes: cotesCombinees(js), releve_at: js.map((j) => j.releve_at).filter(Boolean).sort()[0] || null,
    ...(fin ? { fin_fenetre: new Date(fin).toISOString() } : {}) };
}

/**
 * Le menu d'un programme (jour J) : { candidats (paris proposes), ecartes, nonEvalues, evenements }.
 * - chaque jour : jusqu'a 3 simples + 1 combine du jour ;
 * - samedi et dimanche : 1 « meme match avec buteur » ;
 * - vendredi : ticket autour de 10, ticket autour de 25 (week-end) ; le 1er week-end du mois, le 50-100.
 * matchsJour / matchsWeekend : matchsMenu() ; cotesParMatch : voir jambesCandidates.
 */
export function construireMenu({ jour, matchsJour, matchsWeekend = [], cotesParMatch, pays = "FR", marcheJour = [], marcheWeekend = [] }) {
  const dow = C.nomJour(jour);
  // Les deux voies (moteur v3 et cotes du marche) donnent des jambes de meme forme : memes fourchettes, memes regles.
  const fusion = (a, b) => ({ jambes: [...a.jambes, ...b.jambes], ecartes: [...a.ecartes, ...b.ecartes], nonEvalues: [...a.nonEvalues, ...b.nonEvalues] });
  const jour1 = fusion(jambesCandidates(matchsJour, cotesParMatch, { pays }), jambesCotesMarche(marcheJour, cotesParMatch, { pays }));
  const candidats = [];
  const simples = choisirSimples(jour1.jambes);
  // Chance affichee du simple : sa chance_iashark (la meme que la page match pour ce pari) ; voie « cotes du
  // marche » : la chance sans marge des cotes du marche, avec son libelle.
  for (const s of simples) candidats.push({ famille: "simple", ...s, proba: s.chance, fin_coup_envoi: s.coup_envoi, source_proba: s.voie === C.VOIE_COTES_MARCHE ? SOURCE_COTES_MARCHE : SOURCE_CHANCE, selections: [] });
  const combo = choisirCombine(jour1.jambes, new Set(simples.map((s) => s.match_id)));
  if (combo) candidats.push(plusieurs("combine", combo));
  if (dow === "samedi" || dow === "dimanche") {
    const b = choisirButeur(matchsJour);
    if (b) {
      const m = b.m;
      candidats.push({ famille: "buteur", marche: "buteur", dom: m.domicile, ext: m.exterieur, ligue: MENU.ligues[m.ligue_code], fixture_id: Number(m.ids_api_football.fixture),
        event_id: cotesParMatch[m.match_id]?.event_id || null, sport_key: cotesParMatch[m.match_id]?.sport_key || null,
        coup_envoi: iso(m.coup_envoi_utc), fin_coup_envoi: iso(m.coup_envoi_utc), proba: b.affiche, source_proba: `${SOURCE_V3} ; ${MODELE_BUTEUR}`,
        cotes: {}, releve_at: null,
        selections: [{ type: "buteur", match_id: m.match_id, equipe: b.equipe, cote_equipe: b.cote, joueur: b.joueur.joueur, joueur_id: b.joueur.joueur_id ?? null,
          p_joueur: b.joueur.p_marque, p_gagne: Math.round(b.p_gagne * 10000) / 10000, p_grille: Math.round(b.joint * 10000) / 10000, modele: MODELE_BUTEUR }] });
    }
  }
  let we = { jambes: [], ecartes: [], nonEvalues: [] };
  if (C.nomJour(jour) === "vendredi" && (matchsWeekend.length || marcheWeekend.length)) {
    we = fusion(jambesCandidates(matchsWeekend, cotesParMatch, { pays }), jambesCotesMarche(marcheWeekend, cotesParMatch, { pays }));
    const fin = fenetreWeekend(jour).fin;
    for (const [fam, regle] of [["fun10", MENU.fun10], ["fun25", MENU.fun25], ...(premierWeekendDuMois(jour) ? [["reve", MENU.reve]] : [])]) {
      const t = choisirTicket(we.jambes, regle);
      if (t) candidats.push(plusieurs(fam, t, { fin }));
    }
  }
  const vus = new Set([...matchsJour, ...matchsWeekend, ...marcheJour, ...marcheWeekend].map((m) => m.match_id));
  const nonEv = [...jour1.nonEvalues, ...we.nonEvalues.filter((x) => !jour1.nonEvalues.some((y) => y.match === x.match))];
  const ecartes = [...jour1.ecartes, ...we.ecartes.filter((x) => !jour1.ecartes.some((y) => y.match === x.match))];
  return { candidats, ecartes, nonEvalues: nonEv, evenements: vus.size };
}

// ------------------------------------------------------------------ regle d'arret (INTERNE, jamais affichee)
/**
 * Apres 300 simples regles : si la fourchette a 95 % de l'ecart (reussite reelle - chance annoncee)
 * est ENTIEREMENT sous -3 points, on suspend les simples (condition du mathematicien). Alerte a
 * Clement des que l'ecart lui-meme passe sous -3 points (a surveiller).
 */
export const ARRET = Object.freeze({ min_paris: 300, seuil: -0.03 });
export function regleArret(simples) {
  const x = simples.filter((p) => p.famille === "simple" && ["gagne", "perdu"].includes(p.resultat) && ok(Number(p.proba)));
  const n = x.length;
  if (!n) return { n: 0, suspendre: false, alerte: false };
  const annonce = x.reduce((s, p) => s + Number(p.proba), 0) / n;
  const reel = x.filter((p) => p.resultat === "gagne").length / n;
  const ecart = reel - annonce;
  const marge = 1.96 * Math.sqrt(x.reduce((s, p) => s + Number(p.proba) * (1 - Number(p.proba)), 0)) / n;
  const haut = ecart + marge;
  return { n, annonce, reel, ecart, marge, haut, alerte: n >= ARRET.min_paris && ecart < ARRET.seuil, suspendre: n >= ARRET.min_paris && haut < ARRET.seuil };
}
