"use strict";
// RUBRIQUES PRO DU 06/11/2026 (demande de Clement : « en haut de la page combines, le detecteur de nul et le Loto Foot,
// avec les bons calculs, pas seulement dans le sens des bookmakers »). Methode discutee avec ChatGPT (Codex) le 06/11.
// Produites par le calcul du matin (lib/tickets-du-jour.js, types « nul » et « loto ») SEULEMENT si le mathematicien a
// donne « GO » (config/verdicts-maths.json : tickets.nul_du_jour, tickets.loto_grille). Figees une fois publiees.
//
// 1. LE NUL DU JOUR (etude VERIF-GROSSE-COTE-ET-NUL.md du 03/10/2026, 581 jours) : parmi les matchs du jour des
//    7 championnats de l'etude, cote du nul entre 2,80 et 4,00, celui ou la chance du nul du moteur v3 depasse le plus
//    la chance donnee par la cote (sans marge : 1/cN rapporte a 1/c1 + 1/cN + 1/c2). Seulement si l'ecart est positif
//    (au-dessus du seuil) : sinon, aucun nul ce jour-la. Affiche : chance du moteur, chance de la cote, cote.
// 2. LA GRILLE LOTO FOOT DU JOUR (grille maison, pas la grille FDJ) : les 7 matchs du jour (championnats mesures du v3)
//    dont l'issue la plus probable est la plus probable ; un choix par match (1, N ou 2), puis 2 doubles la ou ajouter la
//    2e issue augmente le plus le produit des chances couvertes. Affiche : chance que toute la grille soit juste, avec et
//    sans les doubles (produit exact, matchs supposes independants ; jamais un nombre de tirages), et le nombre moyen de
//    bons resultats attendus.
// Probabilites : p1 / pn / p2 du moteur v3 (lib/moteur-v3.js#probabilitesSite, en %, absentes quand le moteur dit le
// marche faux dans ce championnat). Aucun chiffre invente : une donnee absente = match ignore.
const { kickoffGate, KICKOFF_MARGIN_MINUTES } = require("../kickoff-guard.js");
const REGLES = require("../../config/tickets.json");
const VERDICTS = require("../../config/verdicts-maths.json");

const NUL = { ligues: ["premier", "laliga", "seriea", "bundesliga", "ligue1", "eredivisie", "primeira"], cote_min: 2.8, cote_max: 4.0, ecart_min_points: 0 };
const LOTO = { nb_matchs: 7, nb_doubles: 2 };

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function nombre(v) { if (v === null || v === undefined || v === "") return null; const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : null; }
function cote(v) { const x = nombre(v); return x !== null && x > 1 ? x : null; }
function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
function nomEquipe(e) { return texte(e && typeof e === "object" ? (e.n || e.name) : e); }
function arrondi(x, d) { const k = Math.pow(10, d || 0); return Math.round(x * k) / k; }

function duJour(m, jour) { return typeof (m && m.date) === "string" && m.date.slice(0, 10) === jour; }
// Garde coup d'envoi (fixture API-Football du run, jamais devinee), comme les jambes des combines.
function garde(m, opts) {
  const fx = opts.fixtureById ? opts.fixtureById[String(m.id)] : null;
  const r = opts.regles || REGLES;
  const marge = Number.isFinite(Number(r.marge_coup_envoi_min)) ? Number(r.marge_coup_envoi_min) : KICKOFF_MARGIN_MINUTES;
  return kickoffGate(fx || null, opts.nowMs, { marginMinutes: marge });
}
// Probabilites 1 / N / 2 du moteur (0-1), ramenees a une somme de 1 ; null si l'une manque.
function probas(m) {
  const p = [nombre(m.p1), nombre(m.pn), nombre(m.p2)];
  if (p.some((x) => x === null || x <= 0 || x >= 100)) return null;
  const s = p[0] + p[1] + p[2];
  return s > 0 ? { "1": p[0] / s, N: p[1] / s, "2": p[2] / s } : null;
}
// Chances donnees par les cotes, sans la marge du bookmaker ; null si une cote manque.
function sansMarge(m) {
  const c = [cote(m.c1), cote(m.cn), cote(m.c2)];
  if (c.some((x) => x === null)) return null;
  const inv = c.map((x) => 1 / x), s = inv[0] + inv[1] + inv[2];
  return { "1": inv[0] / s, N: inv[1] / s, "2": inv[2] / s };
}
function fiche(m, opts) {
  return { fixture_id: m.id, domicile: nomEquipe(m.home), exterieur: nomEquipe(m.away), ligue: texte(m.league), ligue_key: texte(m.league_key),
    ligue_id: nombre(m.league_id), coup_envoi: texte(m.date), coup_envoi_ms: garde(m, opts).kickoff_ms || null };
}
function base(m, opts) { return !!m && m.id != null && duJour(m, opts.jour) && garde(m, opts).open; }

// -> fiche du nul du jour, ou null.
function nulDuJour(matchs, opts) {
  opts = opts || {};
  const r = Object.assign({}, NUL, estObjet(opts.regle) ? opts.regle : {});
  let meilleur = null;
  (matchs || []).forEach(function (m) {
    if (!base(m, opts) || r.ligues.indexOf(String(m.league_key || "")) === -1) return;
    const p = probas(m), q = sansMarge(m), cN = cote(m.cn);
    if (!p || !q || cN === null || cN < r.cote_min || cN > r.cote_max) return;
    const ecart = (p.N - q.N) * 100;
    if (!(ecart > r.ecart_min_points)) return;
    if (!meilleur || ecart > meilleur.ecart) meilleur = { m: m, p: p.N, q: q.N, cote: cN, ecart: ecart };
  });
  if (!meilleur) return null;
  return Object.assign(fiche(meilleur.m, opts), { market_id: "draw", pari: "Match nul", cote: meilleur.cote,
    chance: Math.round(meilleur.p * 100), chance_marche: Math.round(meilleur.q * 100), ecart_points: arrondi(meilleur.ecart, 1) });
}

// -> { nb_matchs, nb_doubles, matchs: [...], chance_grille, chance_sans_doubles, bons_attendus } ou null (moins de 7 matchs).
function grilleLoto(matchs, opts) {
  opts = opts || {};
  const r = Object.assign({}, LOTO, estObjet(opts.regle) ? opts.regle : {});
  const ligues = opts.ligues || ((VERDICTS.perimetre_v3 && VERDICTS.perimetre_v3.ligues) || []);
  const cands = [];
  (matchs || []).forEach(function (m) {
    if (!base(m, opts) || ligues.indexOf(String(m.league_key || "")) === -1) return;
    const p = probas(m);
    if (!p) return;
    const issues = ["1", "N", "2"].map((k) => ({ k: k, p: p[k] })).sort((a, b) => b.p - a.p);
    cands.push({ m: m, p: p, issues: issues });
  });
  if (cands.length < r.nb_matchs) return null;
  // Les plus lisibles d'abord ; a egalite, le numero de match (ordre stable).
  cands.sort((a, b) => (b.issues[0].p - a.issues[0].p) || (Number(a.m.id) - Number(b.m.id)));
  const grille = cands.slice(0, r.nb_matchs);
  // Doubles : le plus grand gain relatif du produit, (p1re + p2e) / p1re.
  const doubles = grille.map((g, i) => ({ i: i, gain: (g.issues[0].p + g.issues[1].p) / g.issues[0].p }))
    .sort((a, b) => b.gain - a.gain).slice(0, r.nb_doubles).map((x) => x.i);
  let produit = 1, produitSimple = 1, attendus = 0;
  const lignes = grille.map(function (g, i) {
    const dbl = doubles.indexOf(i) !== -1;
    const choix = dbl ? [g.issues[0].k, g.issues[1].k].sort((a, b) => "1N2".indexOf(a) - "1N2".indexOf(b)) : [g.issues[0].k];
    const couv = choix.reduce((s, k) => s + g.p[k], 0);
    produit *= couv; produitSimple *= g.issues[0].p; attendus += couv;
    return Object.assign(fiche(g.m, opts), { choix: choix, double: dbl, p1: Math.round(g.p["1"] * 100), pn: Math.round(g.p.N * 100), p2: Math.round(g.p["2"] * 100), chance: Math.round(couv * 100) });
  }).sort((a, b) => (nombre(a.coup_envoi_ms) || 0) - (nombre(b.coup_envoi_ms) || 0) || String(a.coup_envoi).localeCompare(String(b.coup_envoi)));
  return { nb_matchs: lignes.length, nb_doubles: doubles.length, matchs: lignes,
    chance_grille: arrondi(produit * 100, 1), chance_sans_doubles: arrondi(produitSimple * 100, 1), bons_attendus: arrondi(attendus, 1) };
}

module.exports = { nulDuJour, grilleLoto, probas, sansMarge, NUL, LOTO };
