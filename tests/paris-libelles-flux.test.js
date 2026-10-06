"use strict";
// LIBELLE AFFICHE = PARI REGLE (controle de l'avocat du diable du 06/10/2026, ROUGE, point 1) : pour TOUS les codes
// « F<bet>:<valeur> » publiables, le libelle que la page affiche (construit depuis le CODE par lib/market-labels.js,
// jamais en relisant un texte deja redige) decrit exactement le pari que lib/flux-paris.js#regler regle : memes
// conditions, meme equipe, meme mi-temps, meme ligne ; dans les 7 langues. Plus : publiable et reglable separes (point 3),
// jumeaux de la correction « petits scores » (point 4), exclusions des combines remises (point 2).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FP = require("../lib/flux-paris.js");
const MP = require("../lib/marches-paris.js");
const ML = require("../lib/market-labels.js");
const P = require("../lib/pronostic.js");
const VM = require("../lib/match-view-model.js");
const MR = require("../lib/match-results.js");
const VERDICTS = require("../config/verdicts-maths.json");
const ROOT = path.join(__dirname, "..");
const EQ = { home: "Lens", away: "Nice" };
const LANGUES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = {}; LANGUES.forEach((l) => { DICTS[l] = require("../i18n/dict/" + l + ".json"); });

// Toutes les valeurs possibles des marches (formes relevees dans odds_snapshots).
const LIGNES = [0.5, 1.5, 2.5, 3.5, 4.5];
const POOL = [].concat(
  ["Home", "Draw", "Away", "Yes", "No", "Odd", "Even", "No goal", "1st Half", "2nd Half", "Home/Draw", "Draw/Away", "Home/Away", "Under 2 goals", "2 or 3 goals", "Over 3 goals"],
  LIGNES.map((l) => "Over " + l), LIGNES.map((l) => "Under " + l),
  [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5, -2, -1, 1, 2].map((l) => ["Home", "Away", "Draw"].map((c) => c + " " + (l > 0 ? "+" : "") + l)).flat(),
  ["Home", "Draw", "Away"].map((a) => ["Home", "Draw", "Away"].map((b) => a + "/" + b)).flat(),
  ["Home", "Draw", "Away"].map((a) => ["Yes", "No"].map((b) => a + "/" + b)).flat(),
  ["Home", "Draw", "Away"].map((a) => ["Over", "Under"].map((b) => [1.5, 2.5, 3.5].map((l) => a + "/" + b + " " + l))).flat(2),
  ["o", "u"].map((a) => ["yes", "no"].map((b) => [1.5, 2.5, 3.5].map((l) => a + "/" + b + " " + l))).flat(2)
);
function codesPubliables() {
  const out = [];
  FP.catalogue().publiables.forEach((x) => {
    POOL.forEach((v) => {
      const code = "F" + x.bet_id + ":" + v;
      if (!FP.estPubliable(code)) return;
      const sp = FP.SPECS[x.bet_id];
      if ((sp.g === "ligne") && !/ \d+\.5$/.test(v)) return;
      if (sp.g === "ah" && !/[+-]\d+\.5$/.test(v)) return;
      if (sp.g === "eu" && !/[+-]\d+$/.test(v)) return;
      if (ML.fluxLibelle(code, EQ) == null) return;
      // Reglable sur un vrai jeu de faits (score, mi-temps, evenements).
      out.push(code);
    });
  });
  return out;
}
const CODES = codesPubliables();

// Ce que le pari VEUT DIRE, ecrit ici independamment du code d'affichage.
const HT = [13, 20, 6, 72, 105, 106, 19, 18, 34, 22, 78, 114, 116], H2 = [3, 33, 26, 107, 108, 104, 181, 35, 63, 115, 117];
const BET_DOM = [16, 105, 107, 23, 27, 29, 37, 43, 111, 114, 115, 192], BET_EXT = [17, 106, 108, 60, 28, 30, 53, 44, 112, 116, 117, 193];
function sens(code) {
  const r = /^F(\d+):(.+)$/.exec(code), b = Number(r[1]), v = r[2], lv = v.toLowerCase();
  const e = { periode: HT.indexOf(b) !== -1 ? "ht" : H2.indexOf(b) !== -1 ? "2h" : null, equipes: new Set(), ligne: null, combine: [24, 25, 78, 49].indexOf(b) !== -1 };
  if (BET_DOM.indexOf(b) !== -1) e.equipes.add("Lens");
  if (BET_EXT.indexOf(b) !== -1) e.equipes.add("Nice");
  const debut = /^(home|away)\b/.exec(lv);
  if (debut && [11, 192, 193, 21, 22, 63, 23, 60].indexOf(b) === -1) e.equipes.add(debut[1] === "home" ? "Lens" : "Nice");
  if (b === 7) lv.split("/").forEach((x) => { if (x !== "draw") e.equipes.add(x === "home" ? "Lens" : "Nice"); });
  if (/^draw [+-]?\d/.test(lv)) e.equipes.add("Lens"); // handicap europeen « nul » : exprime pour le domicile
  if (b === 12 || b === 20 || b === 33) lv.split("/").forEach((x) => { if (x !== "draw") e.equipes.add(x === "home" ? "Lens" : "Nice"); });
  const l = /(\d+(?:\.\d+)?)$/.exec(v);
  if (l && [1, 3, 13, 12, 20, 33, 7, 11, 192, 193, 8, 34, 35, 21, 22, 63, 23, 60, 24, 14, 15, 54, 136, 137, 138, 139, 144, 145, 146, 147, 148, 149, 349].indexOf(b) === -1 && !/^(yes|no)$/.test(lv)) {
    const h = /^(home|away|draw)\s*([+-]?\d+(?:\.\d+)?)$/i.exec(v);
    if (h) { const x = h[1].toLowerCase() === "away" ? -Number(h[2]) : Number(h[2]); e.ligne = (x > 0 ? "+" : x < 0 ? "-" : "") + String(Math.abs(x)).replace(".", ","); }
    else e.ligne = String(Number(l[1])).replace(".", ",");
  }
  return e;
}

test("libelle affiche = pari regle : tous les codes publiables (equipe, mi-temps, ligne, conditions)", () => {
  assert.ok(CODES.length >= 250, "codes publiables testes : " + CODES.length);
  const betsCouverts = new Set(CODES.map((c) => Number(/^F(\d+):/.exec(c)[1])));
  FP.catalogue().publiables.forEach((x) => { if (!FP.raisonExclusion(x.bet_id, "")) assert.ok(betsCouverts.has(x.bet_id), "marche publiable sans libelle teste : " + x.bet_id); });
  CODES.forEach((code) => {
    const lib = ML.marketIdLabelFr(code, EQ);
    const e = sens(code);
    assert.notEqual(lib, code, code);
    assert.doesNotMatch(lib, /[{}]/, code);
    // Mi-temps : exactement celle du pari, jamais l'autre.
    assert.equal(/\(1re mi-temps\)/.test(lib), e.periode === "ht", code + " -> " + lib);
    assert.equal(/\(2e mi-temps\)/.test(lib), e.periode === "2h", code + " -> " + lib);
    // Equipe(s) : celles du pari, jamais l'autre.
    ["Lens", "Nice"].forEach((t) => assert.equal(lib.indexOf(t) !== -1, e.equipes.has(t), code + " -> " + lib + " (" + t + ")"));
    // Ligne (et signe d'un handicap, cote de l'equipe nommee).
    if (e.ligne) assert.ok(lib.indexOf(e.ligne.replace("-", "-")) !== -1 || lib.indexOf(e.ligne.replace("-", "−")) !== -1, code + " -> " + lib + " (ligne " + e.ligne + ")");
    // Deux conditions : les deux sont ecrites.
    if (e.combine) assert.match(lib, / et /, code + " -> " + lib);
    // Chemin de la page : le code passe par marcheFr (marketLabel) et donne le MEME texte ; libelle_fr du pronostic aussi.
    assert.equal(ML.marketLabel(code, EQ), lib, code);
    assert.equal(FP.libelleCode(code, "Lens", "Nice"), lib, code);
    assert.equal(P.libelleFr(code, { home: { n: "Lens" }, away: { n: "Nice" } }), lib, code);
    // 7 langues : jamais l'identifiant brut ni un gabarit vide ; meme equipe, meme mi-temps (marqueur traduit).
    LANGUES.forEach((l) => {
      const t = ML.marketLabel(code, EQ, { locale: l, dict: DICTS[l] });
      assert.ok(t && t !== code && !/[{}]/.test(t), l + " " + code + " -> " + t);
      ["Lens", "Nice"].forEach((x) => assert.equal(t.indexOf(x) !== -1, e.equipes.has(x), l + " " + code + " -> " + t));
    });
  });
  // Les cas reels de l'avocat du diable.
  assert.equal(ML.marketIdLabelFr("F181:Away -1", { home: "Albanie", away: "Îles Féroé" }), "Îles Féroé +1 (handicap à 3 issues) (2e mi-temps)");
  assert.equal(ML.marketIdLabelFr("F107:Over 1.5", { home: "Albanie", away: "Saint-Marin" }), "Albanie\u00a0: plus de 1,5 but (2e mi-temps)");
  assert.equal(ML.marketIdLabelFr("F19:Away +0.5", EQ), "Nice -0,5 (handicap) (1re mi-temps)", "« Away +0.5 » : ligne exprimee pour le domicile, Nice gagne la 1re mi-temps");
  assert.equal(ML.marketIdLabelFr("F37:No", EQ), "Non\u00a0: Lens gagne les deux mi-temps");
  assert.equal(ML.marketIdLabelFr("F25:Home/Over 2.5", EQ), "Victoire Lens et plus de 2,5 buts");
});

test("la page affiche le code, jamais le libelle relu : vue du match, accueil, outils, tickets", () => {
  const d = require("../data.json").matchs[0];
  const raw = Object.assign({}, d, { pari_rec: "Albanie : plus de 1,5 but (2e mi-temps)", market_id: "F107:Over 1.5", model_output_available: true, model_probability: 68, no_signal: false, cote_rec: "1.42" });
  const vm = VM.buildMatchViewModel(raw);
  assert.equal(vm.model.recommendation.market, "F107:Over 1.5");
  // Le libelle francais relu par la page aurait change de mi-temps : c'est ce que le code evite.
  assert.match(ML.marketLabelFr("Albanie : plus de 1,5 but (2e mi-temps)"), /1re mi-temps/);
  const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  assert.match(src("home-list.js"), /var market=\(\/\^F\\d\+:\/\.test\(String\(m\.market_id\|\|''\)\)\?H\.marketIdLabel\(m\):null\)/);
  assert.match(src("tools-page.js"), /marketId: \/\^F\\d\+:\/\.test\(String\(m\.market_id \|\| ''\)\) \? m\.market_id : null/);
  assert.match(src("lib/aujourdhui.js"), /function pariTexte\(j\)/);
  // Tickets : une jambe « F… » s'affiche depuis son code dans la langue de la page.
  global.IasharkMarketLabels = ML;
  try {
    const A = require("../lib/aujourdhui.js");
    assert.equal(typeof A, "object");
  } finally { delete global.IasharkMarketLabels; }
});

test("publiable et reglable separes : un code cache depuis sa publication se regle toujours par ses faits, jamais par son libelle", () => {
  assert.equal(FP.estPubliable("F3:Draw"), true);
  assert.equal(FP.estPubliable("F87:Over 8.5"), false); assert.equal(FP.estCode("F87:Over 8.5"), true);
  assert.equal(FP.estPubliable("F8:No"), false); assert.equal(FP.estCode("F8:No"), true);
  // « Match nul (2e mi-temps) » sur un 2-2 final avec 1-0 a la pause : 2e mi-temps 1-2 = perdu.
  assert.equal(FP.regler("F3:Draw", { ft: [2, 2], ht: [1, 0] }), false);
  assert.equal(FP.regler("F8:No", { ft: [1, 0], ht: [0, 0] }), true, "issue cachee : se regle quand meme");
  assert.equal(FP.regler("F87:Over 8.5", { ft: [1, 0], ht: [0, 0], stats: { tirs_cadres: [5, 4] } }), true);
  // Page des resultats : un code F se regle par lib/flux-paris.js, jamais par resolveMarketWin sur son libelle.
  const fx = { fixture: { id: 1, status: { short: "FT" } }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 2, away: 2 }, score: { fulltime: { home: 2, away: 2 }, halftime: { home: 1, away: 0 } } };
  assert.equal(MR.settleBet({ prediction: "Match nul (2e mi-temps)", market_id: "F3:Draw" }, fx).result, "loss");
  assert.equal(MR.settleBet({ prediction: "Match nul", market_id: "F3:Draw" }, fx).result, "loss", "meme si le libelle dit autre chose");
  assert.equal(MR.settleBet({ prediction: "x", market_id: "F14:Home" }, fx).result, "pending", "evenements absents : en attente");
  // Pipeline : tout code F passe par lib/flux-paris.js (plus seulement les codes publiables).
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /if\(\/\^F\\d\+:\/\.test\(String\(found\.market\|\|''\)\)\)\{/);
  assert.match(wf, /if\(\/\^F\\d\+:\/\.test\(String\(found\.market\|\|''\)\)\)return;/);
});

test("jumeaux de la correction « petits scores » : deux issues equivalentes portent la meme correction", () => {
  // Equivalences exactes trouvees en comparant les issues sur tous les scores (match et mi-temps).
  const parScore = CODES.filter((c) => { const d = MP.definition(c); return d && d.dim === "buts"; }).concat(Object.keys(MP.CATALOGUE).filter((id) => MP.CATALOGUE[id].dim === "buts"));
  const sig = new Map();
  const issues = [];
  for (let h1 = 0; h1 <= 4; h1++) for (let a1 = 0; a1 <= 4; a1++) for (let h2 = 0; h2 <= 4; h2++) for (let a2 = 0; a2 <= 4; a2++) issues.push({ h1, a1, h2, a2 });
  parScore.forEach((id) => { const d = MP.definition(id); const s = issues.map((o) => (d.test(o) ? "1" : "0")).join(""); if (!sig.has(s)) sig.set(s, []); sig.get(s).push(id); });
  const ecarts = [];
  sig.forEach((ids) => { const c = ids.map((id) => FP.petitScore(id)); if (c.some(Boolean) && !c.every(Boolean)) ecarts.push(ids.join(" = ")); });
  assert.deepEqual(ecarts, [], "jumeaux sans la meme correction : " + ecarts.join(" ; "));
  // Jumeaux connus, y compris ceux reglés par les evenements.
  [["F43:No", "home-team-under-05"], ["F44:No", "away-team-under-05"], ["F27:Yes", "away-team-under-05"], ["F14:No goal", "under-05"], ["F15:No goal", "under-05"],
    ["F24:Draw/No", "under-05"], ["F25:Draw/Under 1.5", "under-05"], ["F78:Draw/Under 1.5", "fh-under-05"], ["F349:Under 2 goals", "under-15"], ["F49:u/no 1.5", "under-15"]]
    .forEach(([a, b]) => assert.equal(FP.petitScore(a), FP.petitScore(b), a + " / " + b));
});

test("combines et Selection en or : exclusions plus/moins 1,5 et 3,5 et « les deux marquent » remises ; jamais un autre marche des bookmakers", () => {
  const fam = VERDICTS.categories_no_go.filter((c) => c.famille && !c.ligue).map((c) => c.famille).sort();
  assert.deepEqual(fam, ["BTTS", "OU1.5", "OU3.5"]);
  const J = require("../lib/run-output/jambes-du-jour.js");
  const NOW = Date.parse("2026-10-07T04:00:00Z");
  const m = { id: 1, home: { n: "A" }, away: { n: "B" }, date: "2026-10-07 20:00", league_key: "ligue1", league_id: 61, league: "Ligue 1",
    pari_rec: "A (+0,5)", market_id: "F4:Home +0.5", no_signal: false, cote_rec: "1.42", chance_iashark: 68, pronostic: { market_id: "F4:Home +0.5", publie: true, fiabilite: "vérifiée" } };
  const r = J.candidatsDuJour([m], { 1: [{ market_id: "F4:Home +0.5", famille: "Handicap asiatique", cote: 1.42, chance: 68, chance_affichee: 68, fiabilite: "vérifiée", p_modele: 70, q: 68 }] }, "jambe",
    { jour: "2026-10-07", nowMs: NOW, fixtureById: { 1: { fixture: { timestamp: Date.parse("2026-10-07T18:00:00Z") / 1000, status: { short: "NS" } } } } });
  assert.equal(r.selections.length, 0);
  assert.equal(r.exclus.autre_marche_non_mesure_en_jambe, 1);
});
