"use strict";
// LES JUMEAUX DU MATCH (demande de Clement du 04/10/2026 ; plan UX §2.3 G ; verdict du
// mathematicien du 04/10/2026, verdicts-maths-tickets.md §3 : GO avec condition).
//
// Un FAIT, jamais une chance IASHARK : « ce qui s'est passe dans des matchs que les bookmakers
// voyaient comme celui-ci ». Deux familles (une seule ne dit juste que sur son sujet) :
//  - jumeaux du resultat : matchs DEJA JOUES du meme niveau dont les chances sans marge de
//    victoire domicile ET exterieur sont a +-2 points de celles du match (depuis 2012) ;
//    on montre victoire domicile / nul / victoire exterieur, en comptes bruts ;
//  - jumeaux des buts : chance sans marge de « plus de 2,5 buts » a +-2 points (depuis 2019,
//    championnats europeens seulement) ; on montre plus de 2,5 buts et les deux marquent.
// Conditions du mathematicien, toutes appliquees ici :
//  1. moins de 200 jumeaux : rien (repli « tous championnats » seulement s'il est ANNONCE :
//     niveau « tous ») ; jamais d'elargissement silencieux de la fenetre ;
//  2. jumeaux termines AVANT le jour du match (la table s'arrete a sa date « fin ») ;
//  3. seulement les championnats du reservoir (config/jumeaux.json#ligues) : ni coupe, ni coupe
//     d'Europe, ni selection ; « jumeaux des buts » jamais hors d'Europe ;
//  4. table precalculee (chaque match du reservoir au dixieme de point, voir construireTable) :
//     la requete compte exactement les matchs a +-2 points ; 3 exemples nommes (les plus
//     proches, puis les plus recents) ;
//  5. aucun filtre de forme.
// Chances du match : cote d'avant-match du site (c1, cn, c2 ; co25, cu25), marge retiree par la
// methode puissance (lib/pronostic.js#sansMargePuissance, la meme que le mathematicien).
// Reservoir : cote de CLOTURE sans marge (Pinnacle, sinon moyenne de cloture), comme le verdict.

const fs = require("fs");
const path = require("path");
const PRONOSTIC = require("./pronostic.js");
const CONFIG = require("../config/jumeaux.json");

const VERSION = "jumeaux-1";
const VERSION_TABLE = "table-jumeaux-3";

function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function cote(v) { const x = nombre(v); return x !== null && x > 1 ? x : null; }

function niveauDe(code, config) {
  const n = (config || CONFIG).niveaux || {};
  return Object.keys(n).find((k) => Array.isArray(n[k]) && n[k].indexOf(String(code)) !== -1) || null;
}

// Chances sans marge (0-1) d'une liste de cotes, ou null.
function sansMarge(cotes) {
  if (!cotes.every((c) => c !== null)) return null;
  const q = PRONOSTIC.sansMargePuissance(cotes);
  return Array.isArray(q) && q.every((x) => Number.isFinite(x) && x > 0 && x < 1) ? q : null;
}

// Ligne du fichier football-data (matches_merged.csv, colonnes d'origine) -> ligne du reservoir.
// Seuls le calendrier, le score final et les cotes de cloture servent. null si inutilisable.
function ligneDepuisFootballData(r) {
  if (!r) return null;
  const date = String(r.date_iso || "").slice(0, 10);
  const bd = nombre(r.FTHG), be = nombre(r.FTAG);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || bd === null || be === null) return null;
  const pin = [cote(r.PSCH), cote(r.PSCD), cote(r.PSCA)];
  const moy = [cote(r.AvgCH), cote(r.AvgCD), cote(r.AvgCA)];
  const q = sansMarge(pin.every((x) => x !== null) ? pin : moy);
  const po = [cote(r["PC>2.5"]), cote(r["PC<2.5"])];
  const ao = [cote(r["AvgC>2.5"]), cote(r["AvgC<2.5"])];
  const qo = sansMarge(po.every((x) => x !== null) ? po : ao);
  if (!q && !qo) return null;
  return {
    date: date, code: String(r.league_code || r.Div || ""), ligue: String(r.league_name || r.league_code || ""),
    domicile: String(r.HomeTeam || r.Home || ""), exterieur: String(r.AwayTeam || r.Away || ""), bd: bd, be: be,
    p1: q ? q[0] : null, p2: q ? q[2] : null, po25: qo ? qo[0] : null,
  };
}

// Table precalculee. Le nuage des matchs passes est tres concentre le long d'une ligne (la chance
// du nul varie peu) : une case de 1 point decale la fenetre et change les comptes de plus de 30 %
// (Bournemouth - Liverpool du 20/09/2026 : 379 avec des cases de 1 point, 281 avec la definition
// validee). La table garde donc chaque match comme un POINT (chances au dixieme de point) et la
// requete compte exactement les matchs a +-2 points, comme le mathematicien (au centieme de point :
// au dixieme, l'arrondi seul deplace encore 5 % des jumeaux sur ce nuage dense).
//   resultat[niveau] = { h: [chance domicile x 10 000], a: [chance exterieur x 10 000],
//                        r: "0" domicile / "1" nul / "2" exterieur (un caractere par match),
//                        x: [index de l'exemple + 1, 0 = pas d'exemple] }
//   buts[niveau]     = { o: [chance plus de 2,5 x 10 000], y: "0".."3" (1 = plus de 2,5 ; 2 = les deux marquent) }
//   exemples         = [[date, ligue, domicile, exterieur, score]] (matchs depuis config.debut_exemples),
//                      ligue et equipes en index de noms (dictionnaire « noms »)
// lignes : sorties de ligneDepuisFootballData. opts : { fin : dernier jour inclus, config }.
function construireTable(lignes, opts) {
  const config = (opts && opts.config) || CONFIG;
  const fin = (opts && opts.fin) || null;
  const debutEx = config.debut_exemples || config.debut_resultat;
  const resultat = {}, buts = {}, exemples = [], noms = [], idxNom = {};
  const nom = (x) => { if (idxNom[x] === undefined) { idxNom[x] = noms.length; noms.push(x); } return idxNom[x]; };
  const tri = (lignes || []).filter((l) => l && (!fin || l.date <= fin)).slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.domicile.localeCompare(b.domicile));
  let debut = null, finReelle = null;
  tri.forEach(function (l) {
    const niveau = niveauDe(l.code, config);
    if (!niveau) return;
    if (!finReelle || l.date > finReelle) finReelle = l.date;
    if (l.p1 !== null && l.p2 !== null && l.date >= config.debut_resultat) {
      const t = (resultat[niveau] = resultat[niveau] || { h: [], a: [], r: "", x: [] });
      t.h.push(Math.round(l.p1 * 10000)); t.a.push(Math.round(l.p2 * 10000));
      t.r += l.bd > l.be ? "0" : (l.bd === l.be ? "1" : "2");
      if (l.date >= debutEx) { exemples.push([l.date, nom(l.ligue), nom(l.domicile), nom(l.exterieur), l.bd + "-" + l.be]); t.x.push(exemples.length); } else t.x.push(0);
      if (!debut || l.date < debut) debut = l.date;
    }
    if (l.po25 !== null && l.date >= config.debut_buts && niveau !== "hors_europe") {
      const t = (buts[niveau] = buts[niveau] || { o: [], y: "" });
      t.o.push(Math.round(l.po25 * 10000));
      t.y += String((l.bd + l.be > 2.5 ? 1 : 0) + (l.bd > 0 && l.be > 0 ? 2 : 0));
    }
  });
  return { v: VERSION_TABLE, fin: fin || finReelle, debut: debut, resultat: resultat, buts: buts, exemples: exemples, noms: noms };
}

// Plus grand reste : comptes -> pourcentages entiers de somme 100.
function pourcents(comptes) {
  const s = comptes.reduce((a, b) => a + b, 0);
  if (!(s > 0)) return null;
  const brut = comptes.map((c) => c * 100 / s);
  const ent = brut.map((x) => Math.floor(x + 1e-9));
  let reste = 100 - ent.reduce((a, b) => a + b, 0);
  brut.map((x, i) => ({ i: i, r: x - Math.floor(x + 1e-9) })).sort((a, b) => (b.r - a.r) || (a.i - b.i))
    .forEach((o) => { if (reste > 0) { ent[o.i]++; reste--; } });
  return ent;
}
const pct1 = (k, n) => (n > 0 ? Math.floor(k * 100 / n + 0.5) : null);

// Matchs du reservoir a +-r points (centiemes de point, bornes comprises comme le verdict).
function sommeResultat(tables, H, A, r) {
  const h0 = Math.round(H * 100), a0 = Math.round(A * 100), d = Math.round(r * 100);
  let n = 0;
  const issues = [0, 0, 0], proches = [];
  tables.forEach(function (t) {
    if (!t || !Array.isArray(t.h)) return;
    for (let i = 0; i < t.h.length; i++) {
      const dh = t.h[i] - h0, da = t.a[i] - a0;
      if (dh < -d || dh > d || da < -d || da > d) continue;
      n++; issues[Number(t.r[i])]++;
      if (t.x[i] > 0) proches.push({ dist: dh * dh + da * da, i: t.x[i] - 1 });
    }
  });
  return { n: n, dom: issues[0], nul: issues[1], ext: issues[2], proches: proches };
}

// Jumeaux d'un match du site. table : construireTable ; m : match (league_key, date, c1, cn, c2,
// co25, cu25). -> { v, resultat, buts } (un bloc null s'il ne tient pas les conditions) ou null.
function jumeauxDuMatch(table, m, opts) {
  const config = (opts && opts.config) || CONFIG;
  if (!estObjet(table) || table.v !== VERSION_TABLE || !m) return null;
  const code = config.ligues ? config.ligues[String(m.league_key || "")] : null;
  const niveau = code ? niveauDe(code, config) : null;
  if (!niveau) return null;
  // Condition 2 : la table ne contient que des matchs termines AVANT le jour du match.
  const jour = String(m.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !table.fin || !(table.fin < jour)) return null;
  const nMin = Number(config.n_min) || 200, r = Number(config.rayon_points) || 2, nbEx = Number(config.nb_exemples) || 3;
  const out = { v: VERSION, resultat: null, buts: null };

  const q = sansMarge([cote(m.c1), cote(m.cn), cote(m.c2)]);
  if (q && estObjet(table.resultat)) {
    const H = q[0] * 100, A = q[2] * 100;
    let s = sommeResultat([table.resultat[niveau]], H, A, r), portee = "meme";
    if (s.n < nMin) { s = sommeResultat(Object.keys(table.resultat).map((k) => table.resultat[k]), H, A, r); portee = "tous"; }
    if (s.n >= nMin) {
      const p = pourcents([s.dom, s.nul, s.ext]);
      // Exemples : les jumeaux les plus proches, a egalite les plus recents.
      const noms = Array.isArray(table.noms) ? table.noms : [];
      const ex = s.proches.sort((a, b) => (a.dist - b.dist) || (b.i - a.i)).slice(0, nbEx).map((x) => table.exemples[x.i]).filter(Boolean)
        .map((e) => [e[0], noms[e[1]], noms[e[2]], noms[e[3]], e[4]]);
      out.resultat = {
        n: s.n, depuis: Number(String(config.debut_resultat).slice(0, 4)), niveau: portee,
        dom: s.dom, nul: s.nul, ext: s.ext, pct: { dom: p[0], nul: p[1], ext: p[2] },
        exemples: ex.map((e) => ({ date: e[0], ligue: e[1], domicile: e[2], exterieur: e[3], score: e[4] })),
      };
    }
  }
  const qo = sansMarge([cote(m.co25), cote(m.cu25)]);
  const tb = niveau !== "hors_europe" && estObjet(table.buts) ? table.buts[niveau] : null;
  if (qo && tb && Array.isArray(tb.o)) {
    const o0 = Math.round(qo[0] * 10000), d = Math.round(r * 100);
    let n = 0, plus = 0, btts = 0;
    for (let i = 0; i < tb.o.length; i++) {
      if (Math.abs(tb.o[i] - o0) > d) continue;
      const y = Number(tb.y[i]);
      n++; if (y & 1) plus++; if (y & 2) btts++;
    }
    if (n >= nMin) out.buts = { n: n, depuis: Number(String(config.debut_buts).slice(0, 4)), plus_2_5: plus, btts: btts, pct: { plus_2_5: pct1(plus, n), btts: pct1(btts, n) } };
  }
  return out.resultat || out.buts ? out : null;
}

// Table du depot (config/jumeaux.json#table), ou null (absente, illisible, mauvaise version).
function chargerTable(racine, config) {
  const c = config || CONFIG;
  try {
    const t = JSON.parse(fs.readFileSync(path.join(racine || path.join(__dirname, ".."), String(c.table || "")), "utf8"));
    return estObjet(t) && t.v === VERSION_TABLE ? t : null;
  } catch (e) { return null; }
}

// Pipeline : pose jumeaux (premium) sur chaque match ouvert du reservoir. Rien sans le feu vert
// du mathematicien (config/verdicts-maths.json#match.jumeaux) ni sans table. -> nombre poses.
function poserJumeaux(matchs, table, verdicts) {
  const v = verdicts || require("../config/verdicts-maths.json");
  const ok = !!table && estObjet(v.match) && v.match.jumeaux === "GO";
  let n = 0;
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String(m.no_signal_reason || ""))) return;
    const j = ok ? jumeauxDuMatch(table, m) : null;
    if (j) { m.jumeaux = j; n++; } else delete m.jumeaux;
  });
  return n;
}

// Construction de la table a partir de matches_merged.csv (archive football-data, hors depot) :
//   node lib/jumeaux.js construire <matches_merged.csv> <sortie.json> [fin AAAA-MM-JJ]
// Lecture ligne a ligne ; les colonnes de football-data ne contiennent ni virgule ni guillemet.
async function construireDepuisCsv(fichier, fin) {
  const readline = require("readline");
  const rl = readline.createInterface({ input: fs.createReadStream(fichier, "utf8"), crlfDelay: Infinity });
  let entete = null;
  const lignes = [];
  for await (const brut of rl) {
    const cols = brut.split(",");
    if (!entete) { entete = cols.map((c) => c.replace(/^﻿/, "").trim()); continue; }
    const r = {};
    entete.forEach((k, i) => { r[k] = cols[i]; });
    const l = ligneDepuisFootballData(r);
    if (l) lignes.push(l);
  }
  return construireTable(lignes, { fin: fin || null });
}

if (require.main === module && process.argv[2] === "construire") {
  construireDepuisCsv(process.argv[3], process.argv[5] || null).then(function (t) {
    fs.writeFileSync(process.argv[4], JSON.stringify(t));
    console.log("table des jumeaux : fin " + t.fin + ", " + t.exemples.length + " exemples");
  });
}

module.exports = { VERSION, VERSION_TABLE, ligneDepuisFootballData, construireTable, jumeauxDuMatch, chargerTable, poserJumeaux, construireDepuisCsv, niveauDe, pourcents };
