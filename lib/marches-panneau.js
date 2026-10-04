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
// Rien n'est produit sans config/verdicts-maths.json#marches_panneau.statut = « GO ».

const CHANCE = require("./chance-iashark.js");
const { MARCHE } = require("./pronostic.js");
const VERDICTS = require("../config/verdicts-maths.json");

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

// m : match COMPLET apres publication des paris (chance affichee posee).
// opts : { verdicts (config/verdicts-maths.json) }. -> le panneau ou null.
function construirePanneau(m, opts) {
  const verdicts = (opts && opts.verdicts) || VERDICTS;
  const verdict = estObjet(verdicts.marches_panneau) ? verdicts.marches_panneau : {};
  if (verdict.statut !== "GO" || !m || typeof m !== "object") return null;
  const affichees = new Set(Array.isArray(verdict.cles_affichees) ? verdict.cles_affichees.map(String) : []);
  const avecCotes = new Set(Array.isArray(verdict.cles_modele_et_cotes_seulement) ? verdict.cles_modele_et_cotes_seulement.map(String) : []);
  const exclues = new Set((Array.isArray(verdict.cles_exclues) ? verdict.cles_exclues : []).map(String));
  const famillesExclues = new Set((Array.isArray(verdict.familles_exclues) ? verdict.familles_exclues : []).map(String));
  const modeleEtCotes = estObjet(m.moteur_v3) && m.moteur_v3.origine_probabilite === "modèle + cotes";
  const dom = nomEquipe(m.home, "Domicile"), ext = nomEquipe(m.away, "Extérieur");

  // Pari publie : sa cle v3 et sa chance affichee (la meme que l'Avis).
  const pariId = m.no_signal !== true && texte(m.pari_rec) ? texte(m.market_id) : null;
  const chancePari = pariId ? CHANCE.chanceDuPari(m) : null;
  const pariCle = pariId && chancePari !== null && MARCHE[pariId] ? MARCHE[pariId].cle_v3 : null;
  const idSite = {};
  Object.keys(MARCHE).forEach((id) => { idSite[MARCHE[id].cle_v3] = id; });

  // Probabilites v3 (en %) de toutes les cles, y compris celles qui ne s'affichent pas :
  // un groupe se calcule entier (ex. mi-temps/fin sur 9 issues), puis on cache.
  const p = {};
  (Array.isArray(m.v3_marches) ? m.v3_marches : []).forEach((mk) => {
    const x = mk && typeof mk.cle === "string" ? nombre(mk.probabilite) : null;
    if (x !== null && x >= 0 && x <= 100) p[mk.cle] = x;
  });
  const montrer = (cle) => affichees.has(cle) && !exclues.has(cle) && !famillesExclues.has(FAMILLE_V3[cle.split(":")[0]]) && !famillesExclues.has(cle.split(":")[0])
    && (!avecCotes.has(cle) || modeleEtCotes);
  const ch = {}; // cle -> chance affichee (entier)

  function groupe(cles) {
    if (!cles.every((k) => p[k] !== undefined)) return;
    const iFixe = pariCle ? cles.indexOf(pariCle) : -1;
    const parts = grouperAvecFixe(cles.map((k) => p[k]), iFixe, iFixe >= 0 ? chancePari : 0, 100);
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
  Object.keys(p).forEach((k) => {
    if (ch[k] !== undefined || /^(SCORE):/.test(k)) return;
    ch[k] = pariCle === k ? chancePari : Math.round(Number((p[k]).toPrecision(12)));
  });

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
    poser({ famille: FAMILLE_V3[k.split(":")[0]], id: idSite[k] || k, cle: k, libelle: libelle, chance: ch[k], source: "modele" });
  });
  // Scores : les NB_SCORES plus probables affichables + « autres scores » (complete a 100).
  const scores = Object.keys(p).filter((k) => /^SCORE:\d+-\d+$/.test(k) && montrer(k))
    .sort((a, b) => (p[b] - p[a]) || a.localeCompare(b, "en", { numeric: true })).slice(0, NB_SCORES);
  if (scores.length && Object.keys(p).some((k) => /^SCORE:/.test(k))) {
    const totalGrille = Object.keys(p).filter((k) => /^SCORE:/.test(k)).reduce((s, k) => s + p[k], 0);
    const autres = Math.max(0, (totalGrille > 0 ? totalGrille : 100) - scores.reduce((s, k) => s + p[k], 0));
    const parts = plusGrandReste(scores.map((k) => p[k]).concat([autres]), 100);
    scores.forEach((k, i) => poser({ famille: "score_exact", id: k, cle: k, libelle: libelleV3(k, dom, ext), chance: parts[i], source: "modele" }));
    if (parts[scores.length] >= 1) poser({ famille: "score_exact", id: "SCORE:autres", cle: "SCORE:autres", libelle: "Autres scores", chance: parts[scores.length], source: "modele" });
  }
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
  const nb = familles.reduce((s, f) => s + f.marches.length, 0);
  if (!nb) return null;
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

module.exports = { construirePanneau, poserPanneaux, cleV3DuCode, libelleV3, plusGrandReste, FAMILLES, FAMILLE_V3, FAMILLE_FLUX, VERSION, NB_SCORES };
