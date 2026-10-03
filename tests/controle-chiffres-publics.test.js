// CONTROLE DES CHIFFRES PUBLICS ET VERDICT DU MATHEMATICIEN (ORANGE, 30/09/2026) sur la
// fusion V3 : un test par point corrige (page match, pipeline, espace Pro).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const SIM = require("../lib/simulation-15min.js");
const VM = require("../lib/match-view-model.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const sansCommentaires = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"\\])\/\/.*$/gm, "$1");
const page = read("match-page.js");
const workflow = read(".github/workflows/update-data.yml");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));

const LH = 1.88, LA = 1.37;
function match(extra) {
  return Object.assign({
    id: 777002, sport: "football", league_id: 61, league: "Ligue 1", date: "2026-10-03 21:00",
    home: { n: "Paris Saint Germain", id: 85 }, away: { n: "Monaco", id: 91 },
    model_output_available: true, data_quality_score: 80,
    lambda_h: LH, lambda_a: LA, p1: 49, pn: 24, p2: 27,
    sim_15min: SIM.champPipeline({ lambdaH: LH, lambdaA: LA, favori: "home", ligueApi: 61 }),
    pari_rec: "Premiere mi-temps moins de 1.5 but", cote_rec: 1.73, model_probability: 64
  }, extra || {});
}
function vmFactice(book, ligue) {
  return {
    identity: { league: { name: ligue || "Ligue 1" }, home: { id: 85, short: "PSG", name: "Paris Saint-Germain" }, away: { id: 91, short: "Monaco", name: "Monaco" } },
    bookStats: book, players: { scoringThreat: [] }
  };
}

test("1. score audacieux : plus « avec sa vraie chance », marque « pas encore vérifié » (page et fiche des sources)", () => {
  assert.doesNotMatch(sansCommentaires(page), /vraie chance/);
  assert.match(page, /<p class="score-bold-note">\$\{insecable\('Le score à 4 buts ou plus le plus probable\. Pas encore vérifié\.'\)\}<\/p>/);
  const ligne = read("docs/SOURCES-PAGE-MATCH.md").split("\n").find((l) => l.includes("Le score audacieux |"));
  assert.ok(ligne && /Pas encore vérifié/.test(ligne) && !/« Le score à 4 buts ou plus le plus probable, avec sa vraie chance »/.test(ligne));
});

test("2. film du match : plus aucun mot de tranche (identiques sur tous les matchs), barres et buts attendus gardes", () => {
  const T = VM.buildMatchViewModel(match()).plus.tranches;
  assert.equal(T.length, 6);
  T.forEach((x) => { assert.equal(x.niveau, undefined); assert.equal(x.phrase, undefined); assert.ok(x.buts > 0); });
  const MOTS = /Début fermé|Tranche calme|Rythme moyen|Tranche animée|Tranche chaude|Fin de match chaude/;
  assert.doesNotMatch(sansCommentaires(read("lib/match-view-model.js")), MOTS);
  assert.doesNotMatch(sansCommentaires(page), MOTS);
  const film = page.slice(page.indexOf("function filmCard(vm)"), page.indexOf("function siAlorsCard"));
  assert.doesNotMatch(film, /x\.niveau/);
  assert.match(film, /scenarioChart\(g\)/, "barres gardees");
  assert.match(film, /fmt\(x\.buts,1\)/, "buts attendus par tranche gardes");
});

test("3. « au moins un but apres la 75e » : nom de la competition DU MATCH (coupe), jusque sur l'image a partager", () => {
  const periode = { debut: "2024-09-14", fin: "2026-08-28" };
  const book = {
    // Profils d'equipe du championnat (Ligue 1), sans surprise.
    firstGoal: {
      home: Object.assign({ n: 67, comp: { id: 61, name: "Ligue 1" }, scores: { p: 0.52 } }, periode),
      away: Object.assign({ n: 67, comp: { id: 61, name: "Ligue 1" }, scores: { p: 0.5 } }, periode)
    },
    // Stat du fichier de la coupe (lib/stats-book.js : fichier de match.league_id).
    leagueLate: { n: 120, p: { p: 0.8 }, debut: "2024-08-16", fin: "2026-08-31" }
  };
  const P = VM.matchPlus(match({ league_id: 66, league: "Coupe de France" }), vmFactice(book, "Coupe de France"), true);
  assert.equal(P.chiffreFou.id, "ligue_apres_75");
  assert.match(P.chiffreFou.phrase, /des matchs de Coupe de France ont eu au moins un but après la 75e minute/);
  assert.doesNotMatch(P.chiffreFou.phrase, /Ligue 1/);
  assert.match(P.partage.chiffre.phrase, /Coupe de France/, "image a partager");
  assert.doesNotMatch(JSON.stringify(P.partage), /matchs de Ligue 1/);
});

test("4. plus de « X marque / encaisse Y % de ses buts dans le dernier quart d'heure » (test placebo : du hasard)", () => {
  const slots = (fin) => [0.1, 0.12, 0.15, 0.13, 0.15, fin].map((p) => ({ p }));
  const all = { debut: "2024-09-14", fin: "2026-08-28", slots: { n: 60, for: slots(0.45), against: slots(0.45) } };
  const book = { teams: { home: { all, comp: { id: 61, name: "Ligue 1" } }, away: { all, comp: { id: 61, name: "Ligue 1" } } } };
  const P = VM.matchPlus(match(), vmFactice(book), true);
  assert.ok(!P.chiffreFou || !/dernier quart d/.test(P.chiffreFou.phrase));
  assert.ok(!P.piege || !/dernier quart d/.test(P.piege.phrase));
  const code = sansCommentaires(read("lib/match-view-model.js"));
  assert.doesNotMatch(code, /dernier quart d’heure|fin_marque|fin_encaisse/);
});

test("5. « Si... alors... » : masque pour une competition « en test » et pour les selections nationales", () => {
  assert.ok(Array.isArray(VM.buildMatchViewModel(match()).plus.siAlors), "championnat valide : garde");
  assert.equal(VM.buildMatchViewModel(match({ league_reliability: "en_test" })).plus.siAlors, null, "ligue en test");
  assert.equal(VM.buildMatchViewModel(match({ league_id: 5, league: "UEFA Nations League" })).plus.siAlors, null, "selections");
});

test("6. selections en retour arriere (MOTEUR_V3 = 0) : aucun marche retenu, ni dans le pipeline ni sur la page", () => {
  // Page : un pari de l'ancien moteur (sans moteur_v3) sur un match de selections n'est jamais affiche.
  const vm = VM.buildMatchViewModel(match({ league_id: 5, league: "UEFA Nations League", has_signal: true, no_signal: false }));
  assert.equal(vm.model.recommendation, null);
  assert.notEqual(VM.buildMatchViewModel(match()).model.recommendation, null, "championnat : pari garde");
  // Pipeline : la regle est APRES le bloc du moteur v3 (donc appliquee aussi quand il est eteint).
  const fin = workflow.indexOf("// MOTEUR_V3:FIN");
  const regle = workflow.indexOf("if(SELECTIONS.estSelectionNationale({league_id:lg.id,league:lg.name})){ pickedMarket=null; pickDowngrade=null; }");
  const garde = workflow.indexOf("if(!kickoffGateFix.open){ pickedMarket=null; pickDowngrade=null; }");
  assert.ok(fin > 0 && regle > fin && regle < garde, "regle entre MOTEUR_V3:FIN et la garde du coup d'envoi");
  assert.ok(workflow.indexOf("var SELECTIONS=require('./lib/selections-nationales.js');") < regle, "module charge avant");
});

test("7. l'IA ne recoit que les confrontations des 10 dernieres annees avant le match", () => {
  assert.match(workflow, /var h2hMinIA=\(function\(\)\{var j=String\(f\.date\|\|''\)\.slice\(0,10\);[^\n]*return \(Number\(j\.slice\(0,4\)\)-10\)\+j\.slice\(4\);\}\)\(\);/);
  assert.match(workflow, /var h2hIA=\(h2hRaw\|\|\[\]\)\.filter\(function\(g\)\{return String\(\(g&&g\.fixture&&g\.fixture\.date\)\|\|''\)\.slice\(0,10\)>=h2hMinIA;\}\);/);
  assert.match(workflow, /injuries,h2h:h2hIA,/, "genAnalyse recoit la liste filtree");
  assert.doesNotMatch(workflow, /injuries,h2h:h2hRaw,/);
  assert.match(workflow, /h2hIA\.slice\(0,5\)\.forEach/, "moyenne de buts des face-a-face : 10 ans aussi");
});

test("8. outil « detecteur » : le vrai nombre de competitions (config/leagues.json), plus « 19 championnats »", () => {
  const n = JSON.parse(read("config/leagues.json")).leagues.length;
  const outil = read("tools-page.js");
  assert.match(outil, new RegExp("kpi\\('" + n + "', t\\('tools_page\\.scan_kpi_leagues'"));
  assert.doesNotMatch(outil, /kpi\('19'/);
  LOCALES.forEach((l) => {
    assert.doesNotMatch(DICTS[l].tools_page.scan_kpi_leagues, /chaque jour|every day|cada día|täglich|ogni giorno|todos os dias/i, l);
    assert.doesNotMatch(DICTS[l].tools_page.scan_kpi_free, /par jour|per day|al día|pro Tag|al giorno|por dia/i, l);
  });
});

test("9. selections : texte neutre « Les sélections Pro du jour sont envoyées aux abonnés » (7 langues), jamais « retenu par le modele »", () => {
  const sans = page.slice(page.indexOf("function sansPari(raw)"), page.indexOf("function etatAnalyse"));
  // Un match de selections REPORTE dit « Match reporté » (avocat du diable, 01/10/2026).
  assert.match(sans, /if\(estSelection\(raw\)&&!\(raw&&raw\.no_signal_reason==='KICKOFF_POSTPONED'\)\)return t\('match_page\.avis_no_signal_selections','Les sélections Pro du jour sont envoyées aux abonnés, en privé sur Telegram\.'\);/);
  assert.match(page, /function etatAnalyse\(raw\)\{\n  if\(!raw\)return 'unknown';\n  if\(estSelection\(raw\)\)return 'none';/);
  assert.equal(DICTS.fr.match_page.avis_no_signal_selections, "Les sélections Pro du jour sont envoyées aux abonnés, en privé sur Telegram.");
  LOCALES.forEach((l) => assert.ok(DICTS[l].match_page.avis_no_signal_selections, l));
  // Resume « en 30 secondes » : le meme texte, plus de phrase en dur.
  assert.doesNotMatch(page, /esc\('Pas de pari retenu par le modèle sur ce match'\)/);
});
