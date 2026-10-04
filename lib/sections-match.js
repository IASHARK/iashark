"use strict";
// NOUVELLES SECTIONS DE LA PAGE MATCH : CHIFFRES PRO (demande de Clement du 04/10/2026 ;
// plan UX §2.3 D, E, F, I, J ; verdicts du mathematicien du 04/10/2026 :
// verdicts-maths-temps.md (a, b, c, d) et verdicts-maths-tickets.md (f, g)).
//
// Aucun nouveau calcul de probabilite ici : on LIT ce que le moteur v3 et la simulation par
// quarts d'heure ont deja calcule, et on l'arrondit avec les MEMES regles que le panneau
// « Marches » (lib/marches-panneau.js#chancesEntieres) : un meme evenement a le meme chiffre
// partout sur la page, et le pari publie garde exactement la chance de l'Avis.
//
// Rien n'est produit sans le feu vert du mathematicien (config/verdicts-maths.json#match,
// seule la valeur « GO » compte) ni hors de la couverture « vérifiée » du moteur v3 DANS les
// 12 championnats mesures (condition 1 de a1, b1 ; config/verdicts-maths.json#perimetre_v3 ;
// ni coupe, ni selection, ni « données limitées »), ni quand la chance de l'Avis s'ecarte de
// plus de 2 points du v3 sur le meme marche (controle du mathematicien du 04/10/2026).
//
// Champs (premium, lib/premium-fields.js) :
//  - sim_resume (« Si ce match se jouait 10 000 fois », d1) : comptes EXACTS tires de la grille
//    du v3 (pourcentage entier x 100), jamais un tirage au hasard, jamais « rejoue 10 000
//    fois » ; scores les plus probables SANS le filtre du pari. Visible sur le match offert.
//      { v, base: 10000, issues: { dom, nul, ext } | null,
//        scores: [{ score: "1-0", n }] (5 au plus), total_buts: [{ buts: "0", n }, ...] | null }
//    total_buts : 0 / 1 / 2 / 3 / 4+ ; quand « plus de 1,5 but » est cache (moteur « modèle
//    seul », verdict f) les tranches qui le reveleraient sont fusionnees (« 1-2 »).
//  - premier_but (« Qui ouvre le score ? », c1 et c2), Pro seulement :
//      { dom, ext, aucun } (entiers, somme 100, aucun = 0-0 affiche) et/ou avant_pause (entier,
//      = « au moins un but en 1re mi-temps »). La minute mediane est dans sim_15min.
// Gardes du gel : un match ferme (coup d'envoi passe) garde ce que le gel lui a rendu.

const PANNEAU = require("./marches-panneau.js");
const VERDICTS = require("../config/verdicts-maths.json");

const VERSION_RESUME = "grille-v3-1";
const BASE = 10000;
const NB_SCORES_RESUME = 5;
// Seuils « au moins k buts » (cle TOTAL:plus(k - 0,5)) -> tranches du nombre de buts.
const SEUILS_BUTS = [1, 2, 3, 4];

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

function feux(verdicts) {
  const v = verdicts || VERDICTS;
  return estObjet(v) && estObjet(v.match) ? v.match : {};
}
function go(verdicts, cle) { return feux(verdicts)[cle] === "GO"; }

// Le moteur v3 a produit ce match (pas l'ancien moteur, pas un repli), sa couverture est
// « vérifiée » ET le match est dans un des 12 championnats mesures du v3
// (verdicts-maths-temps.md a1 condition 1 ; controle du mathematicien du 04/10/2026, point 1 :
// le moteur marque aussi « vérifiée » les selections et coupes d'Europe ou seul le 1N2 est
// teste). config/verdicts-maths.json#perimetre_v3.ligues.
function couvertureVerifiee(m, verdicts) { return PANNEAU.perimetreV3(m, verdicts || VERDICTS); }

function ferme(m) { return /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String((m && m.no_signal_reason) || "")); }

// Ajouts de la simulation par quarts d'heure (lib/simulation-15min.js#champPipeline) permis
// par le mathematicien. La « zone chaude » (a3) n'existe dans aucun cas (NO-GO).
function ajoutsSimulation(verdicts) {
  return { tr_equipes: go(verdicts, "film_tr_equipes"), et_si: go(verdicts, "et_si"), minute_mediane: go(verdicts, "minute_mediane_premier_but") };
}
// La simulation elle-meme (a1 : chance d'au moins un but par quart d'heure).
function simulationPermise(m, verdicts) { return go(verdicts, "film_tr") && couvertureVerifiee(m, verdicts); }

// Tranches du nombre de buts a partir des chances affichees « plus de k - 0,5 ».
function tranchesButs(ch, montrer) {
  const seuils = SEUILS_BUTS.filter((k) => Number.isInteger(ch["TOTAL:plus" + (k - 0.5)]) && montrer("TOTAL:plus" + (k - 0.5)));
  if (!seuils.length || seuils[0] !== 1) return null;
  const C = seuils.map((k) => ch["TOTAL:plus" + (k - 0.5)]);
  for (let i = 0; i < C.length; i++) {
    if (C[i] < 0 || C[i] > 100 || (i && C[i] > C[i - 1])) return null; // incoherent : rien plutot qu'un chiffre faux
  }
  const out = [{ buts: "0", n: (100 - C[0]) * 100 }];
  for (let i = 0; i < seuils.length; i++) {
    const de = seuils[i];
    const derniere = i === seuils.length - 1;
    const a = derniere ? null : seuils[i + 1] - 1;
    const label = derniere ? de + "+" : (a === de ? String(de) : de + "-" + a);
    out.push({ buts: label, n: (derniere ? C[i] : C[i] - C[i + 1]) * 100 });
  }
  return out;
}

// d1 : « Si ce match se jouait 10 000 fois ». m : match complet (pari publie, chance posee).
function resumeSur10000(m, opts) {
  const c = PANNEAU.chancesEntieres(m, opts);
  if (!c) return null;
  const ch = c.ch;
  let issues = null;
  if (["1N2:1", "1N2:N", "1N2:2"].every((k) => Number.isInteger(ch[k]) && c.montrer(k))) {
    const s = ch["1N2:1"] + ch["1N2:N"] + ch["1N2:2"];
    if (s === 100) issues = { dom: ch["1N2:1"] * 100, nul: ch["1N2:N"] * 100, ext: ch["1N2:2"] * 100 };
  }
  const scores = c.scores.filter((k) => Number.isInteger(ch[k]) && ch[k] >= 1).slice(0, NB_SCORES_RESUME)
    .map((k) => ({ score: k.slice("SCORE:".length), n: ch[k] * 100 }));
  const totalButs = tranchesButs(ch, c.montrer);
  if (!issues && !scores.length && !totalButs) return null;
  return { v: VERSION_RESUME, base: BASE, issues: issues, scores: scores, total_buts: totalButs };
}

// c1 + c2 : qui ouvre le score (grille du v3) et premier but avant la pause.
function premierBut(m, opts) {
  const verdicts = (opts && opts.verdicts) || VERDICTS;
  const c = PANNEAU.chancesEntieres(m, opts);
  if (!c) return null;
  const ch = c.ch;
  const out = {};
  if (go(verdicts, "qui_ouvre") && ["PREMIER_BUT:dom", "PREMIER_BUT:ext", "PREMIER_BUT:aucun"].every((k) => Number.isInteger(ch[k]))
    && ch["PREMIER_BUT:dom"] + ch["PREMIER_BUT:ext"] + ch["PREMIER_BUT:aucun"] === 100) {
    out.dom = ch["PREMIER_BUT:dom"]; out.ext = ch["PREMIER_BUT:ext"]; out.aucun = ch["PREMIER_BUT:aucun"];
  }
  // « Premier but avant la pause » = « au moins un but en 1re mi-temps » (meme evenement, meme
  // chiffre que le panneau).
  if (go(verdicts, "premier_but_avant_pause") && Number.isInteger(ch["MT_TOTAL:plus0.5"]) && c.montrer("MT_TOTAL:plus0.5")) out.avant_pause = ch["MT_TOTAL:plus0.5"];
  return Object.keys(out).length ? out : null;
}

// Pipeline : pose sim_resume et premier_but sur chaque match ouvert, APRES la publication
// des paris (la chance de l'Avis est connue). Garde du perimetre (controle du mathematicien du
// 04/10/2026, points 1 et 2) :
//  - hors des 12 championnats mesures du v3 en couverture « vérifiée » : ni sim_resume, ni
//    premier_but, ni premier buteur, ni simulation par quarts d'heure (sim_15min) ;
//  - chance de l'Avis a plus de 2 points du v3 sur le meme marche : ni sim_resume, ni
//    premier_but, ni premier buteur, ni « Et si » (sim_15min.si et si_affiche), ni la chance de
//    chaque equipe par quart d'heure (sim_15min.tr_dom, tr_ext : le film designerait alors
//    l'autre equipe que le favori de l'Avis ; controle du mathematicien de la PR 114, point 4) :
//    l'Avis reste seul (le film du match, chance d'au moins un but par quart d'heure, reste).
// -> { sim_resume: n, premier_but: n, hors_perimetre: n, ecart_avis: n } (compteurs seulement).
function poserSections(matchs, opts) {
  const verdicts = (opts && opts.verdicts) || VERDICTS;
  const o = { verdicts: verdicts };
  const n = { sim_resume: 0, premier_but: 0, hors_perimetre: 0, ecart_avis: 0 };
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || ferme(m)) return;
    const ok = couvertureVerifiee(m, verdicts);
    const coherent = ok && PANNEAU.avisCoherent(m, verdicts);
    if (!ok) {
      if (m.moteur_v3 && m.moteur_v3.source === "v3") n.hors_perimetre++;
      if (m.sim_15min != null) m.sim_15min = null;
      delete m.v3_premiers_buteurs;
    } else if (!coherent) {
      n.ecart_avis++;
      delete m.v3_premiers_buteurs;
      if (estObjet(m.sim_15min) && ["si", "si_affiche", "tr_dom", "tr_ext"].some((k) => k in m.sim_15min)) {
        const s15 = Object.assign({}, m.sim_15min);
        delete s15.si; delete s15.si_affiche; delete s15.tr_dom; delete s15.tr_ext;
        m.sim_15min = s15;
      }
    }
    const r = coherent && go(verdicts, "sim_resume") ? resumeSur10000(m, o) : null;
    if (r) { m.sim_resume = r; n.sim_resume++; } else delete m.sim_resume;
    const pb = coherent ? premierBut(m, o) : null;
    if (pb) { m.premier_but = pb; n.premier_but++; } else delete m.premier_but;
  });
  return n;
}

// J. L'ARBITRE : les statistiques de l'arbitre (lib/stats-book.js, deja calculees) ne
// s'affichent qu'avec le feu vert du mathematicien (verdicts-maths-tickets.md §2 : « jamais
// l'arbitre tant que l'heure de sa nomination n'est pas mesuree »). Sans feu vert : retirees du
// detail Pro et de la liste des rubriques annoncees. sb : { gratuit, pro } ou null.
function feuArbitre(sb, verdicts) {
  if (!sb || !estObjet(sb.pro) || go(verdicts, "arbitre")) return sb;
  const pro = Object.assign({}, sb.pro, { arbitre: null });
  const gratuit = estObjet(sb.gratuit) ? Object.assign({}, sb.gratuit) : sb.gratuit;
  if (gratuit && Array.isArray(gratuit.detail_pro)) gratuit.detail_pro = gratuit.detail_pro.filter((x) => x !== "arbitre");
  const vide = !pro.dom && !pro.ext && !pro.ligue
    && !(gratuit && (gratuit.premier_but_dom || gratuit.premier_but_ext || gratuit.ligue_apres_75));
  return vide ? null : { gratuit: gratuit, pro: pro };
}

// CONTENUS PRO DE CHAQUE MATCH (controle UX du 04/10/2026, tour 2 : « le flou n'est pas honnete »).
// Liste PUBLIQUE pro_sections (sur le modele de nb_marches) : les noms des sections que Pro verra
// VRAIMENT sur ce match (« sim », « film », « film_modele », « premier », « et_si », « jumeaux »,
// « joueurs », « arbitre », « marches »), calculee avec les MEMES regles que la page
// (lib/match-sections.js#contenusPro) sur le match complet, APRES toutes les sections (jumeaux
// compris). Aucun chiffre : seulement l'existence. L'apercu flou du match bloque, les lignes
// cadenas du match offert et les avantages du composant de paiement ne montrent que ce qui est
// dans cette liste. -> nombre de matchs qui ont au moins un contenu Pro liste.
function poserContenusPro(matchs) {
  const MS = require("./match-sections.js");
  let n = 0;
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object") return;
    const l = MS.contenusPro(m);
    if (l.length) { m.pro_sections = l; n++; } else delete m.pro_sections;
  });
  return n;
}

module.exports = {
  VERSION_RESUME, BASE, NB_SCORES_RESUME,
  couvertureVerifiee, simulationPermise, ajoutsSimulation, resumeSur10000, premierBut, poserSections, feuArbitre, tranchesButs, poserContenusPro,
};
