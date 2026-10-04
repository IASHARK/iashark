"use strict";
// PANNEAU « MARCHES » DE LA PAGE MATCH (demande de Clement du 04/10/2026 ; plan UX §3 ;
// verdict du mathematicien du 04/10/2026, verdicts-maths-tickets.md §2 : GO avec conditions).
//
// Une seule liste par match, calculee UNE fois par le pipeline pour le site et le robot
// Telegram (regle « une seule source ») : les marches calcules du match, par familles, avec
// leur chance en % entier. Champ premium marches_panneau, Pro seulement, meme sur le match
// offert (lib/premium-fields.js#PRO_ONLY_FIELDS). Le nombre de lignes (nb_marches, entier
// seul, aucun libelle) est public.
//
// Conditions du mathematicien, toutes appliquees ici :
//  1. Seuls les marches du moteur v3 qu'il a juges justes (config/verdicts-maths.json#
//     marches_panneau.cles_affichees, 71 cles sur 118) ; plus/moins 1,5 but seulement quand
//     le v3 combine modele et cotes (moteur_v3.origine_probabilite « modèle + cotes ») :
//     faux hors Europe (« modèle seul »). Handicaps, corners, cartons du v3, « les deux
//     marquent » du v3, premier but par equipe : jamais.
//  2. UNE SEULE SOURCE : le marche du pari publie porte EXACTEMENT la chance affichee par
//     l'Avis (chance_iashark), jamais la probabilite brute du v3 a cote ; les autres issues de
//     son groupe se partagent le reste.
//  3. Arrondi PAR GROUPE (methode du plus grand reste) : 1N2, mi-temps, mi-temps/fin,
//     plus/moins, mi-temps la plus prolifique font exactement 100 ; double chance = somme des
//     deux issues affichees du 1N2 ; grille des scores : les 8 scores les plus probables +
//     « autres scores » qui complete a 100.
//  4. Doublons une seule fois (0-0 = moins de 0,5 but = aucun but ; premier but avant la
//     45e = au moins un but en 1re mi-temps) : les cles doublons ne sont pas dans la liste.
//  5. Libelles : « si le match n'est pas nul » (remboursé si nul), « à la mi-temps / à la
//     fin », « premier but avant la 15e minute ». Pas de cote, pas de « valeur », pas
//     d'etiquette « vérifié ».
//  6. Marches du flux de cotes (marches_flux, liste blanche config/marches-valides.json
//     validee le 03/10) : gardes tels quels quand le v3 ne montre pas le meme marche (les
//     deux marquent, corners, cartons des cotes...). Un marche montre par le v3 n'est jamais
//     repete par le flux.
//  7. Perimetre (controle du mathematicien du 04/10/2026, points 1 et 2) : aucune ligne du v3
//     hors des 12 championnats mesures en couverture « vérifiée », ni quand la chance de l'Avis
//     s'ecarte de plus de 2 points du v3 sur le meme marche (perimetreV3, avisCoherent) ;
//     le panneau garde alors seulement les marches du flux de cotes.
//  8. VOIE « COTES DU MARCHE » (demande de Clement du 04/10/2026, soir : le panneau et « 10 000
//     fois » sur TOUS les matchs, pas seulement ceux du v3) : hors du perimetre du v3 (point 7),
//     les marches qui ont une cote reelle (1N2, double chance, plus/moins de 1,5 / 2,5 / 3,5 buts,
//     les deux marquent) portent leur chance SANS MARGE, tiree de la MEME source que la chance de
//     l'Avis (chancesMarche) ; jamais de score exact ni de premier but tires des cotes. Un match du
//     perimetre du v3 ne change pas (sa grille, ou l'Avis seul).
// Rien n'est produit sans config/verdicts-maths.json#marches_panneau.statut = « GO ».

const CHANCE = require("./chance-iashark.js");
const PRONO = require("./pronostic.js");
const { MARCHE } = PRONO;
const VERDICTS = require("../config/verdicts-maths.json");
const MS = require("./match-sections.js");

const VERSION = "panneau-2";
const NB_SCORES = 8;

const FAMILLES = [
  { cle: "resultat", libelle: "Résultat" },
  { cle: "buts", libelle: "Buts" },
  { cle: "btts", libelle: "Les deux marquent" },
  { cle: "mi_temps", libelle: "Mi-temps" },
  { cle: "premier_but", libelle: "Premier but" },
  { cle: "score_exact", libelle: "Score exact" },
  { cle: "corners", libelle: "Corners" },
  { cle: "cartons", libelle: "Cartons" },
  { cle: "meme_match", libelle: "Même match" },
];
const ORDRE_FAMILLES = FAMILLES.map((f) => f.cle);

// Famille d'une cle du moteur v3 (prefixe avant « : »).
const FAMILLE_V3 = {
  "1N2": "resultat", DC: "resultat", RB: "resultat",
  TOTAL: "buts", EQUIPE_DOM: "buts", EQUIPE_EXT: "buts",
  MT: "mi_temps", MT_TOTAL: "mi_temps", "2MT_TOTAL": "mi_temps", MT_PROLIFIQUE: "mi_temps", MT_FIN: "mi_temps", BUT_DEUX_MT: "mi_temps",
  PREMIER_BUT: "premier_but",
  SCORE: "score_exact",
  // Lignes de la voie « cotes du marche » seulement (le v3 ne montre jamais SES « deux marquent » :
  // absentes de cles_affichees).
  BTTS: "btts",
};
// Famille d'un marche du flux (nom du catalogue, supabase/functions/_shared/marches-flux.mjs).
// Buteur : jamais ici (un joueur n'apparait que dans la section « Les joueurs »).
const FAMILLE_FLUX = {
  "Résultat du match": "resultat", "Vainqueur (nul remboursé)": "resultat", "Double chance": "resultat",
  "Nombre de buts": "buts", "Buts de l'équipe à domicile": "buts", "Buts de l'équipe à l'extérieur": "buts",
  "Nombre de buts pair ou impair": "buts", "Domicile n'encaisse pas de but": "buts", "Extérieur n'encaisse pas de but": "buts",
  "Les deux équipes marquent": "btts",
  "Résultat de la 1re mi-temps": "mi_temps", "Résultat de la 2e mi-temps": "mi_temps", "Double chance (1re mi-temps)": "mi_temps",
  "Nombre de buts en 1re mi-temps": "mi_temps", "Nombre de buts en 2e mi-temps": "mi_temps",
  "Les deux équipes marquent en 1re mi-temps": "mi_temps", "Les deux équipes marquent en 2e mi-temps": "mi_temps",
  "Nombre de corners": "corners", "Corners de l'équipe à domicile": "corners", "Corners de l'équipe à l'extérieur": "corners",
  "Nombre de cartons": "cartons", "Cartons de l'équipe à domicile": "cartons", "Cartons de l'équipe à l'extérieur": "cartons",
  "Résultat et les deux équipes marquent": "meme_match", "Résultat et nombre de buts": "meme_match",
  "Nombre de buts et les deux équipes marquent": "meme_match",
};

// Code d'une selection du flux (« F5:Over 2.5 ») -> cle du moteur v3 du meme pari, ou null.
const ISSUES_FLUX = {
  1: { home: "1N2:1", draw: "1N2:N", away: "1N2:2" },
  12: { "home/draw": "DC:1N", "draw/away": "DC:N2", "home/away": "DC:12" },
  13: { home: "MT:1", draw: "MT:N", away: "MT:2" },
  2: { home: "RB:1", away: "RB:2" },
  8: { yes: "BTTS:oui", no: "BTTS:non" },
};
const LIGNES_FLUX = { 5: "TOTAL", 16: "EQUIPE_DOM", 17: "EQUIPE_EXT", 6: "MT_TOTAL", 26: "2MT_TOTAL", 45: "CORNERS", 80: "CARTONS" };
function cleV3DuCode(code) {
  const r = /^F(\d+):(.+)$/.exec(String(code || ""));
  if (!r) return null;
  const id = Number(r[1]), v = r[2].trim().toLowerCase();
  if (ISSUES_FLUX[id]) return ISSUES_FLUX[id][v] || null;
  const l = /^(over|under)\s+(\d+(?:\.\d+)?)$/.exec(v);
  if (LIGNES_FLUX[id] && l) return LIGNES_FLUX[id] + ":" + (l[1] === "over" ? "plus" : "moins") + String(Number(l[2]));
  return null;
}

// Cle du moteur v3 d'un marche du site (lib/pronostic.js#MARCHE). Les paris ajoutes le 04/10/2026
// (plus/moins 1,5 et 3,5 buts, les deux marquent : un pari sur chaque match) n'ont pas de cle_v3
// dans lib/pronostic.js : sans cette table, le panneau montrerait pour eux la probabilite du v3
// au lieu de la chance de l'Avis (une seule source).
const CLE_V3_EN_PLUS = {
  "over-15": "TOTAL:plus1.5", "under-15": "TOTAL:moins1.5", "over-35": "TOTAL:plus3.5", "under-35": "TOTAL:moins3.5",
  "btts-yes": "BTTS:oui", "btts-no": "BTTS:non",
};
function cleV3DuMarche(id) {
  const d = MARCHE[String(id || "")];
  return (d && d.cle_v3) || CLE_V3_EN_PLUS[String(id || "")] || null;
}

function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
function nomEquipe(e, defaut) { return texte(e && typeof e === "object" ? (e.n || e.name) : e) || defaut; }
function fr(x) { return String(Number(x)).replace(".", ","); }

// Libelle francais d'une cle du v3 (forme des bookmakers, noms des equipes).
function libelleV3(cle, dom, ext) {
  const [fam, sel] = String(cle).split(/:(.+)/);
  const qui = { 1: dom, 2: ext };
  const nb = (x, un, plusieurs) => fr(x) + " " + (Number(x) < 2 ? un : plusieurs);
  let m;
  switch (fam) {
    case "1N2": return sel === "N" ? "Match nul" : "Victoire " + qui[sel];
    case "DC": return { "1N": dom + " ou match nul", N2: "Match nul ou " + ext, 12: dom + " ou " + ext }[sel] || null;
    case "RB": return qui[sel] ? "Victoire " + qui[sel] + ", si le match n'est pas nul" : null;
    case "TOTAL": m = /^(plus|moins)(.+)$/.exec(sel); return m ? (m[1] === "plus" ? "Plus de " : "Moins de ") + nb(m[2], "but", "buts") : null;
    case "EQUIPE_DOM": case "EQUIPE_EXT": m = /^(plus|moins)(.+)$/.exec(sel);
      return m ? (fam === "EQUIPE_DOM" ? dom : ext) + " : " + (m[1] === "plus" ? "plus de " : "moins de ") + nb(m[2], "but", "buts") : null;
    case "MT": return sel === "N" ? "Égalité à la mi-temps" : qui[sel] ? qui[sel] + " mène à la mi-temps" : null;
    case "MT_TOTAL": m = /^plus(.+)$/.exec(sel); return m ? "1re mi-temps : plus de " + nb(m[1], "but", "buts") : null;
    case "2MT_TOTAL": m = /^plus(.+)$/.exec(sel); return m ? "2e mi-temps : plus de " + nb(m[1], "but", "buts") : null;
    case "MT_PROLIFIQUE": return { "1re": "Plus de buts en 1re mi-temps", "2e": "Plus de buts en 2e mi-temps", egal: "Autant de buts dans chaque mi-temps" }[sel] || null;
    case "BUT_DEUX_MT": return sel === "oui" ? "Au moins un but dans chaque mi-temps" : null;
    case "MT_FIN": m = /^([12N])\/([12N])$/.exec(sel);
      return m ? (m[1] === "N" ? "Nul" : qui[m[1]]) + " à la mi-temps / " + (m[2] === "N" ? "nul" : qui[m[2]]) + " à la fin" : null;
    case "PREMIER_BUT": m = /^avant(\d+)$/.exec(sel); return m ? "Premier but avant la " + m[1] + "e minute" : null;
    case "SCORE": m = /^(\d+)-(\d+)$/.exec(sel); return m ? "Score exact " + m[1] + "-" + m[2] : null;
    case "BTTS": return { oui: "Les deux équipes marquent", non: "Au moins une équipe ne marque pas" }[sel] || null;
    default: return null;
  }
}

// Methode du plus grand reste : valeurs (>= 0) -> entiers de meme somme (total).
// Egalite de reste : l'ordre des valeurs donne (fixe).
function plusGrandReste(valeurs, total) {
  const s = valeurs.reduce((a, b) => a + b, 0);
  if (!(s > 0)) return valeurs.map(() => 0);
  const brut = valeurs.map((v) => (v / s) * total);
  const ent = brut.map((v) => Math.floor(v + 1e-9));
  let reste = total - ent.reduce((a, b) => a + b, 0);
  const ordre = brut.map((v, i) => ({ i: i, r: v - Math.floor(v + 1e-9) })).sort((a, b) => (b.r - a.r) || (a.i - b.i));
  for (let k = 0; k < ordre.length && reste > 0; k++, reste--) ent[ordre[k].i]++;
  return ent;
}
// Groupe avec une issue imposee (chance affichee du pari) : les autres se partagent le reste.
function grouperAvecFixe(valeurs, iFixe, fixe, total) {
  if (iFixe < 0) return plusGrandReste(valeurs, total);
  const autres = valeurs.map((v, i) => (i === iFixe ? 0 : v));
  const parts = plusGrandReste(autres, total - fixe);
  parts[iFixe] = fixe;
  return parts;
}

// PERIMETRE DU MOTEUR V3 (controle du mathematicien du 04/10/2026, points 1 et 2 ;
// config/verdicts-maths.json#perimetre_v3). Les chiffres du v3 autres que le pari ne sortent
// que si :
//  1. le match vient du moteur v3, en couverture « vérifiée », ET dans un des 12 championnats
//     mesures (a1 condition 1, b1 condition 4, c3 condition 4, f) : jamais une selection
//     (Ligue des nations, eliminatoires : seul le 1N2 y est teste), une coupe ni un
//     championnat « données limitées » ;
//  2. la chance du pari affichee par l'Avis ne s'ecarte pas de plus de ecart_max_avis_points
//     (2 points) de la probabilite du v3 pour le MEME marche. Au-dela, le partage « les autres
//     issues se partagent le reste » inventerait des chances qui ne viennent ni du modele ni
//     du marche (cas reel du 03/10 : Macedoine du Nord - Ecosse, Avis 58 %, v3 40,5 %) : l'Avis
//     reste seul.
// Verdicts partiels (tests, appels anciens) : le perimetre vient alors de la configuration.
function perimetreDe(verdicts) {
  if (verdicts && estObjet(verdicts.perimetre_v3)) return verdicts.perimetre_v3;
  return estObjet(VERDICTS.perimetre_v3) ? VERDICTS.perimetre_v3 : {};
}
function ligueMesuree(m, verdicts) {
  const l = perimetreDe(verdicts || VERDICTS).ligues;
  return Array.isArray(l) && l.map(String).indexOf(String((m && m.league_key) || "")) !== -1;
}
function perimetreV3(m, verdicts) {
  return !!m && estObjet(m.moteur_v3) && m.moteur_v3.source === "v3"
    && estObjet(m.v3_fiabilite) && m.v3_fiabilite.couverture === "vérifiée" && ligueMesuree(m, verdicts);
}
// Probabilites v3 (en %) de toutes les cles du match.
function probasV3(m) {
  const p = {};
  (Array.isArray(m && m.v3_marches) ? m.v3_marches : []).forEach((mk) => {
    const x = mk && typeof mk.cle === "string" ? nombre(mk.probabilite) : null;
    if (x !== null && x >= 0 && x <= 100) p[mk.cle] = x;
  });
  return p;
}
const DC_ISSUES = { "DC:1N": ["1N2:1", "1N2:N"], "DC:N2": ["1N2:N", "1N2:2"], "DC:12": ["1N2:1", "1N2:2"] };
// Ecart (en points) entre la chance du pari de l'Avis et la probabilite du v3 du meme
// marche ; null quand il n'y a rien a comparer (pas de pari, marche absent du v3).
function ecartAvisV3(m) {
  if (!m || typeof m !== "object" || m.no_signal === true || !texte(m.pari_rec)) return null;
  const id = texte(m.market_id);
  const ch = id ? CHANCE.chanceDuPari(m) : null;
  const cle = id && ch !== null ? cleV3DuMarche(id) : null;
  if (!cle) return null;
  const p = probasV3(m);
  let v = p[cle];
  if (v === undefined && DC_ISSUES[cle] && DC_ISSUES[cle].every((k) => p[k] !== undefined)) v = p[DC_ISSUES[cle][0]] + p[DC_ISSUES[cle][1]];
  return v === undefined ? null : Math.round(Math.abs(ch - v) * 1000) / 1000;
}
function avisCoherent(m, verdicts) {
  const max = Number(perimetreDe(verdicts || VERDICTS).ecart_max_avis_points);
  const e = ecartAvisV3(m);
  return e === null || e <= (Number.isFinite(max) && max >= 0 ? max : 2) + 1e-9;
}

// CHANCES ENTIERES D'UN MATCH (une seule source pour le panneau, « le match joue 10 000
// fois » et « qui ouvre le score », lib/sections-match.js) : chaque cle du v3 en % entier,
// arrondie par groupe, le pari publie portant la chance de l'Avis.
// Coherences en plus (04/10/2026) : le score 0-0 de la grille et « aucun but » (premier but)
// valent exactement « moins de 0,5 but » (memes evenements, verdicts-maths-tickets.md §2) ; le
// premier but domicile / exterieur se partage le reste.
// m : match COMPLET apres publication des paris (chance affichee posee).
// opts : { verdicts (config/verdicts-maths.json) }. -> null (pas de marche du v3) ou
// { p, ch, montrer(cle), pariId, pariCle, chancePari, idSite }.
function chancesEntieres(m, opts) {
  const verdicts = (opts && opts.verdicts) || VERDICTS;
  const verdict = estObjet(verdicts.marches_panneau) ? verdicts.marches_panneau : {};
  if (!m || typeof m !== "object") return null;
  // Perimetre du v3 et coherence avec l'Avis (points 1 et 2 du mathematicien, 04/10/2026).
  if (!perimetreV3(m, verdicts) || !avisCoherent(m, verdicts)) return null;
  const affichees = new Set(Array.isArray(verdict.cles_affichees) ? verdict.cles_affichees.map(String) : []);
  const avecCotes = new Set(Array.isArray(verdict.cles_modele_et_cotes_seulement) ? verdict.cles_modele_et_cotes_seulement.map(String) : []);
  const exclues = new Set((Array.isArray(verdict.cles_exclues) ? verdict.cles_exclues : []).map(String));
  const famillesExclues = new Set((Array.isArray(verdict.familles_exclues) ? verdict.familles_exclues : []).map(String));
  const modeleEtCotes = estObjet(m.moteur_v3) && m.moteur_v3.origine_probabilite === "modèle + cotes";

  // Pari publie : sa cle v3 et sa chance affichee (la meme que l'Avis).
  const pariId = m.no_signal !== true && texte(m.pari_rec) ? texte(m.market_id) : null;
  const chancePari = pariId ? CHANCE.chanceDuPari(m) : null;
  const pariCle = pariId && chancePari !== null ? cleV3DuMarche(pariId) : null;
  const idSite = {};
  Object.keys(MARCHE).forEach((id) => { if (MARCHE[id].cle_v3) idSite[MARCHE[id].cle_v3] = id; });

  // Probabilites v3 (en %) de toutes les cles, y compris celles qui ne s'affichent pas :
  // un groupe se calcule entier (ex. mi-temps/fin sur 9 issues), puis on cache.
  const p = probasV3(m);
  if (!Object.keys(p).length) return null;
  const montrer = (cle) => affichees.has(cle) && !exclues.has(cle) && !famillesExclues.has(FAMILLE_V3[cle.split(":")[0]]) && !famillesExclues.has(cle.split(":")[0])
    && (!avecCotes.has(cle) || modeleEtCotes);
  const ch = {}; // cle -> chance affichee (entier)

  function groupe(cles, fixeCle, fixe) {
    if (!cles.every((k) => p[k] !== undefined)) return;
    let iFixe = pariCle ? cles.indexOf(pariCle) : -1;
    let val = iFixe >= 0 ? chancePari : 0;
    if (iFixe < 0 && fixeCle && Number.isInteger(fixe)) { iFixe = cles.indexOf(fixeCle); val = fixe; }
    const parts = grouperAvecFixe(cles.map((k) => p[k]), iFixe, val, 100);
    cles.forEach((k, i) => { ch[k] = parts[i]; });
  }
  // 1N2 (et double chance = somme de deux issues affichees). Pari en double chance : ses deux
  // issues font exactement la chance affichee, la troisieme le reste.
  const N12 = ["1N2:1", "1N2:N", "1N2:2"];
  const DC = { "DC:1N": ["1N2:1", "1N2:N"], "DC:N2": ["1N2:N", "1N2:2"], "DC:12": ["1N2:1", "1N2:2"] };
  if (N12.every((k) => p[k] !== undefined)) {
    if (pariCle && DC[pariCle]) {
      const dedans = DC[pariCle], dehors = N12.filter((k) => dedans.indexOf(k) === -1)[0];
      const parts = plusGrandReste(dedans.map((k) => p[k]), chancePari);
      ch[dedans[0]] = parts[0]; ch[dedans[1]] = parts[1]; ch[dehors] = 100 - chancePari;
    } else groupe(N12);
    Object.keys(DC).forEach((k) => { ch[k] = ch[DC[k][0]] + ch[DC[k][1]]; });
  }
  groupe(["MT:1", "MT:N", "MT:2"]);
  groupe(["MT_PROLIFIQUE:1re", "MT_PROLIFIQUE:egal", "MT_PROLIFIQUE:2e"]);
  groupe(["1/1", "1/N", "1/2", "N/1", "N/N", "N/2", "2/1", "2/N", "2/2"].map((x) => "MT_FIN:" + x));
  // Plus / moins : chaque ligne fait 100 ; une issue sans sa jumelle : arrondi simple.
  Object.keys(p).forEach((k) => {
    const r = /^(TOTAL|EQUIPE_DOM|EQUIPE_EXT|MT_TOTAL|2MT_TOTAL):plus(.+)$/.exec(k);
    if (!r) return;
    const moins = r[1] + ":moins" + r[2];
    if (p[moins] !== undefined) groupe([k, moins]);
    else if (ch[k] === undefined) ch[k] = grouperAvecFixe([p[k], Math.max(0, 100 - p[k])], pariCle === k ? 0 : -1, chancePari, 100)[0];
  });
  // « Aucun but » : la valeur affichee de « moins de 0,5 but » (sinon le 0-0 arrondi seul).
  const aucun = Number.isInteger(ch["TOTAL:moins0.5"]) ? ch["TOTAL:moins0.5"] : (p["SCORE:0-0"] !== undefined ? Math.round(Number(p["SCORE:0-0"].toPrecision(12))) : null);
  groupe(["PREMIER_BUT:dom", "PREMIER_BUT:ext", "PREMIER_BUT:aucun"], "PREMIER_BUT:aucun", aucun);
  // Scores : les NB_SCORES plus probables affichables + « autres scores » (complete a 100) ;
  // le 0-0 vaut « aucun but ».
  const scores = Object.keys(p).filter((k) => /^SCORE:\d+-\d+$/.test(k) && montrer(k))
    .sort((a, b) => (p[b] - p[a]) || a.localeCompare(b, "en", { numeric: true })).slice(0, NB_SCORES);
  if (scores.length) {
    const totalGrille = Object.keys(p).filter((k) => /^SCORE:/.test(k)).reduce((s, k) => s + p[k], 0);
    const autres = Math.max(0, (totalGrille > 0 ? totalGrille : 100) - scores.reduce((s, k) => s + p[k], 0));
    const i00 = scores.indexOf("SCORE:0-0");
    const parts = grouperAvecFixe(scores.map((k) => p[k]).concat([autres]), aucun !== null ? i00 : -1, aucun, 100);
    scores.forEach((k, i) => { ch[k] = parts[i]; });
    ch["SCORE:autres"] = parts[scores.length];
  }
  Object.keys(p).forEach((k) => {
    if (ch[k] !== undefined || /^(SCORE):/.test(k)) return;
    ch[k] = pariCle === k ? chancePari : Math.round(Number((p[k]).toPrecision(12)));
  });
  return { p: p, ch: ch, montrer: montrer, pariId: pariId, pariCle: pariCle, chancePari: chancePari, idSite: idSite, scores: scores, exclues: exclues, famillesExclues: famillesExclues, source: "modele" };
}

// VOIE « COTES DU MARCHE » (demande de Clement du 04/10/2026, soir : « 10 000 fois » et le panneau
// Marches sur TOUS les matchs, pas seulement ceux du moteur v3). Hors du perimetre du v3 (selections,
// coupes, championnats sans v3, v3 absent ou « données limitées »), les chances viennent des cotes
// des bookmakers SANS MARGE, de la MEME source que la chance de l'Avis de ce match
// (lib/pronostic.js#candidatsMarche) : la cote sans marge des agrees quand la cote affichee est
// agreee (sans_marge_anj), sinon celle des cotes du match (methode puissance,
// lib/pronostic.js#sansMargeDesCotes). Voie verifiee par le mathematicien (15 837 paris, 60,4 %
// affiches pour 61,0 % reels ; 1N2, double chance, plus/moins de 2,5 buts). Rien d'invente : aucune
// grille de scores (ni score exact, ni premier but), seulement les marches qui ont une cote reelle.
// Memes arrondis par groupe que le v3 ; le pari garde EXACTEMENT la chance de l'Avis ; au-dela de
// ecart_max_avis_points entre l'Avis et la cote sans marge du MEME marche (chance corrigee d'une
// categorie trop optimiste, pari d'une autre voie), rien : l'Avis reste seul (meme garde que le v3).
// Un match du perimetre du v3 ne passe jamais par ici (rien ne change pour lui).
const GROUPES_MARCHE = [
  { ids: ["home-win", "draw", "away-win"], cles: ["1N2:1", "1N2:N", "1N2:2"] },
  { ids: ["over-15", "under-15"], cles: ["TOTAL:plus1.5", "TOTAL:moins1.5"] },
  { ids: ["over-25", "under-25"], cles: ["TOTAL:plus2.5", "TOTAL:moins2.5"] },
  { ids: ["over-35", "under-35"], cles: ["TOTAL:plus3.5", "TOTAL:moins3.5"] },
  { ids: ["btts-yes", "btts-no"], cles: ["BTTS:oui", "BTTS:non"] },
];
// Chances sans marge (en %) par cle, groupe par groupe : toutes les issues d'un groupe viennent de la
// meme source (agrees si la cote de l'Avis est agreee et qu'ils cotent tout le groupe, sinon cotes du
// match, sinon rien) et font 100.
function sansMargeDuMatch(m) {
  const anj = m && m.cote_source === "anj" && estObjet(m.sans_marge_anj) ? m.sans_marge_anj : null;
  const moy = PRONO.sansMargeDesCotes(m || {});
  const lire = (src, ids) => {
    if (!src) return null;
    const v = ids.map((id) => nombre(src[id]));
    if (!v.every((x) => x !== null && x > 0 && x < 100)) return null;
    return Math.abs(v.reduce((a, b) => a + b, 0) - 100) <= 0.5 ? v : null;
  };
  const p = {};
  GROUPES_MARCHE.forEach((g) => {
    const v = lire(anj, g.ids) || lire(moy, g.ids);
    if (v) g.cles.forEach((k, i) => { p[k] = v[i]; });
  });
  return p;
}
// -> null (perimetre du v3, aucune cote, ecart avec l'Avis) ou la meme forme que chancesEntieres
// (scores vides), source « marche ».
function chancesMarche(m, opts) {
  const verdicts = (opts && opts.verdicts) || VERDICTS;
  const verdict = estObjet(verdicts.marches_panneau) ? verdicts.marches_panneau : {};
  if (!m || typeof m !== "object" || perimetreV3(m, verdicts)) return null;
  const p = sansMargeDuMatch(m);
  if (!Object.keys(p).length) return null;
  const exclues = new Set((Array.isArray(verdict.cles_exclues) ? verdict.cles_exclues : []).map(String));
  const famillesExclues = new Set((Array.isArray(verdict.familles_exclues) ? verdict.familles_exclues : []).map(String));
  const pariId = m.no_signal !== true && texte(m.pari_rec) ? texte(m.market_id) : null;
  const chancePari = pariId ? CHANCE.chanceDuPari(m) : null;
  const pariCle = pariId && chancePari !== null ? cleV3DuMarche(pariId) : null;
  // Garde d'ecart avec l'Avis (la meme que pour le v3, ecart_max_avis_points).
  if (pariCle) {
    let v = p[pariCle];
    if (v === undefined && DC_ISSUES[pariCle] && DC_ISSUES[pariCle].every((k) => p[k] !== undefined)) v = p[DC_ISSUES[pariCle][0]] + p[DC_ISSUES[pariCle][1]];
    const max = Number(perimetreDe(verdicts).ecart_max_avis_points);
    if (v !== undefined && Math.abs(chancePari - v) > (Number.isFinite(max) && max >= 0 ? max : 2) + 1e-9) return null;
  }
  const ch = {};
  function groupe(cles) {
    if (!cles.every((k) => p[k] !== undefined)) return;
    const iFixe = pariCle ? cles.indexOf(pariCle) : -1;
    const parts = grouperAvecFixe(cles.map((k) => p[k]), iFixe, iFixe >= 0 ? chancePari : 0, 100);
    cles.forEach((k, i) => { ch[k] = parts[i]; });
  }
  const N12 = ["1N2:1", "1N2:N", "1N2:2"];
  if (N12.every((k) => p[k] !== undefined)) {
    if (pariCle && DC_ISSUES[pariCle]) {
      // Pari en double chance : ses deux issues font exactement la chance de l'Avis, la troisieme le reste.
      const dedans = DC_ISSUES[pariCle], dehors = N12.filter((k) => dedans.indexOf(k) === -1)[0];
      const parts = plusGrandReste(dedans.map((k) => p[k]), chancePari);
      ch[dedans[0]] = parts[0]; ch[dedans[1]] = parts[1]; ch[dehors] = 100 - chancePari;
    } else groupe(N12);
    Object.keys(DC_ISSUES).forEach((k) => { ch[k] = ch[DC_ISSUES[k][0]] + ch[DC_ISSUES[k][1]]; });
  }
  GROUPES_MARCHE.slice(1).forEach((g) => groupe(g.cles));
  const montrer = (cle) => ch[cle] !== undefined && !exclues.has(cle) && !famillesExclues.has(FAMILLE_V3[cle.split(":")[0]]) && !famillesExclues.has(cle.split(":")[0]);
  const idSite = {};
  Object.keys(MARCHE).forEach((id) => { if (MARCHE[id].cle_v3) idSite[MARCHE[id].cle_v3] = id; });
  return { p: p, ch: ch, montrer: montrer, pariId: pariId, pariCle: pariCle, chancePari: chancePari, idSite: idSite, scores: [], exclues: exclues, famillesExclues: famillesExclues, source: "marche" };
}
// Les chances d'un match : la grille du v3 dans son perimetre, sinon les cotes du marche.
function chancesDuMatch(m, opts) {
  return chancesEntieres(m, opts) || chancesMarche(m, opts);
}

// m : match COMPLET apres publication des paris (chance affichee posee).
// opts : { verdicts (config/verdicts-maths.json) }. -> le panneau ou null.
function construirePanneau(m, opts) {
  const verdicts = (opts && opts.verdicts) || VERDICTS;
  const verdict = estObjet(verdicts.marches_panneau) ? verdicts.marches_panneau : {};
  if (verdict.statut !== "GO" || !m || typeof m !== "object") return null;
  const exclues = new Set((Array.isArray(verdict.cles_exclues) ? verdict.cles_exclues : []).map(String));
  const famillesExclues = new Set((Array.isArray(verdict.familles_exclues) ? verdict.familles_exclues : []).map(String));
  const dom = nomEquipe(m.home, "Domicile"), ext = nomEquipe(m.away, "Extérieur");
  // Pari publie : sa cle v3 et sa chance affichee (la meme que l'Avis), avec ou sans v3.
  const pariId = m.no_signal !== true && texte(m.pari_rec) ? texte(m.market_id) : null;
  const chancePari = pariId ? CHANCE.chanceDuPari(m) : null;
  const pariCle = pariId && chancePari !== null ? cleV3DuMarche(pariId) : null;
  // Grille du v3 dans son perimetre, sinon cotes du marche sans marge (point 8).
  const c = chancesDuMatch(m, { verdicts: verdicts });
  const ch = c ? c.ch : {};
  const montrer = c ? c.montrer : () => false;
  const idSite = {};
  Object.keys(MARCHE).forEach((id) => { if (MARCHE[id].cle_v3) idSite[MARCHE[id].cle_v3] = id; });

  const lignes = [];
  const vus = new Set();
  function poser(l) {
    if (vus.has(l.cle) || famillesExclues.has(l.famille)) return;
    if (!Number.isInteger(l.chance) || l.chance < 1 || l.chance > 99) return;
    vus.add(l.cle);
    const pari = pariId && chancePari !== null && ((pariCle && l.cle === pariCle) || l.id === pariId);
    lignes.push({ famille: l.famille, id: pari ? pariId : l.id, cle: l.cle, libelle: l.libelle, chance: pari ? chancePari : l.chance, source: l.source, pari_avis: !!pari });
  }
  Object.keys(ch).forEach((k) => {
    if (!montrer(k) || /^SCORE:/.test(k)) return;
    const libelle = libelleV3(k, dom, ext);
    if (!libelle) return;
    poser({ famille: FAMILLE_V3[k.split(":")[0]], id: idSite[k] || k, cle: k, libelle: libelle, chance: ch[k], source: c.source || "modele" });
  });
  // Scores : les NB_SCORES plus probables affichables + « autres scores » (complete a 100),
  // arrondis par chancesEntieres (0-0 = « aucun but »).
  (c ? c.scores : []).forEach((k) => poser({ famille: "score_exact", id: k, cle: k, libelle: libelleV3(k, dom, ext), chance: ch[k], source: "modele" }));
  if (c && c.scores.length && ch["SCORE:autres"] >= 1) poser({ famille: "score_exact", id: "SCORE:autres", cle: "SCORE:autres", libelle: "Autres scores", chance: ch["SCORE:autres"], source: "modele" });
  // Flux de cotes : seulement ce que le v3 ne montre pas deja.
  const flux = estObjet(m.marches_flux) && Array.isArray(m.marches_flux.liste) ? m.marches_flux : null;
  (flux ? flux.liste : []).forEach(function (x) {
    if (!x) return;
    const famille = FAMILLE_FLUX[String(x.marche || "")];
    const chance = nombre(x.chance);
    if (!famille || chance === null || !Number.isInteger(chance)) return;
    const code = texte(x.code);
    const cleV3 = cleV3DuCode(code);
    if (cleV3 && montrer(cleV3) && ch[cleV3] !== undefined) return; // deja montre par le v3
    if (code && (exclues.has(code) || (cleV3 && exclues.has(cleV3)))) return;
    const sel = texte(x.selection);
    poser({ famille: famille, id: (cleV3 && idSite[cleV3]) || cleV3 || code || null, cle: cleV3 || code || (x.marche + "|" + x.selection),
      libelle: sel ? sel.charAt(0).toUpperCase() + sel.slice(1) : String(x.marche), chance: chance, source: "marche" });
  });

  const parFamille = {};
  lignes.forEach((l) => { (parFamille[l.famille] = parFamille[l.famille] || []).push(l); });
  const familles = ORDRE_FAMILLES.filter((f) => parFamille[f] && parFamille[f].length).map(function (f) {
    const def = FAMILLES.find((x) => x.cle === f);
    const liste = parFamille[f].slice();
    // Scores : du plus probable au moins probable, « autres scores » a la fin ; ailleurs, chance decroissante.
    liste.sort((a, b) => (a.cle === "SCORE:autres") - (b.cle === "SCORE:autres") || (b.chance - a.chance) || a.libelle.localeCompare(b.libelle));
    return { cle: f, libelle: def.libelle, marches: liste.map((l) => ({ id: l.id, libelle: l.libelle, chance: l.chance, source: l.source, pari_avis: l.pari_avis })) };
  });
  if (!familles.reduce((s, f) => s + f.marches.length, 0)) return null;
  // nb (et nb_marches, public) = les lignes que le panneau AFFICHE : une seule ligne par paire de
  // contraires (plus / moins, oui / non), MEME regle que la page (lib/match-sections.js
  // #nbLignesAffichees). Controle de l'avocat du diable du 04/10/2026, point 2 : « Les 54 marches
  // de ce match » pour 49 lignes affichees.
  const nb = MS.nbLignesAffichees(familles);
  return { v: VERSION, releve_at: flux ? texte(flux.releve_at) : null, nb: nb, familles: familles };
}

// Pipeline : pose marches_panneau (premium, Pro seulement) et nb_marches (public, entier)
// sur chaque match ouvert ; un match ferme garde ce que le gel lui a rendu. -> nombre poses.
function poserPanneaux(matchs, opts) {
  let n = 0;
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object") return;
    const ferme = /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String(m.no_signal_reason || ""));
    if (!ferme) {
      const pn = construirePanneau(m, opts);
      if (pn) { m.marches_panneau = pn; n++; } else delete m.marches_panneau;
    }
    if (estObjet(m.marches_panneau) && Number.isInteger(m.marches_panneau.nb)) m.nb_marches = m.marches_panneau.nb;
    else delete m.nb_marches;
  });
  return n;
}

module.exports = { construirePanneau, poserPanneaux, chancesEntieres, chancesMarche, chancesDuMatch, sansMargeDuMatch, perimetreV3, ligueMesuree, ecartAvisV3, avisCoherent, cleV3DuMarche, cleV3DuCode, libelleV3, plusGrandReste, grouperAvecFixe, FAMILLES, FAMILLE_V3, FAMILLE_FLUX, VERSION, NB_SCORES };
