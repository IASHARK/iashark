// PAGE MATCH PLUS (30/09/2026, page francaise) : un test par nouveau bloc.
// Chaque bloc disparait quand sa donnee manque ; la carte a partager ne porte ni cote, ni
// pari, ni pourcentage de pari, ni mot de jeu d'argent.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const SIM = require("../lib/simulation-15min.js");
const VM = require("../lib/match-view-model.js");

const js = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
const fonction = (debut, fin) => js.slice(js.indexOf(debut), js.indexOf(fin, js.indexOf(debut) + 1));
const LH = 1.88, LA = 1.37;
const SIM_FIELD = SIM.champPipeline({ lambdaH: LH, lambdaA: LA, favori: "home", ligueApi: 61 });

function match(extra) {
  return Object.assign({
    id: 777001, sport: "football", league_id: 61, league: "Ligue 1", date: "2026-10-03 21:00",
    home: { n: "Paris Saint Germain", id: 85 }, away: { n: "Monaco", id: 91 },
    model_output_available: true, data_quality_score: 80,
    lambda_h: LH, lambda_a: LA, p1: 49, pn: 24, p2: 27, sim_15min: SIM_FIELD,
    pari_rec: "Premiere mi-temps moins de 1.5 but", cote_rec: 1.73, model_probability: 64
  }, extra || {});
}
// Stats IASHARK minimales, au format de lib/match-view-model.js#bookStats (vue deja lue).
const periode = { debut: "2024-09-14", fin: "2026-08-28" };
function vmFactice(book, joueurs) {
  return {
    identity: { league: { name: "Ligue 1" }, home: { id: 85, short: "PSG", name: "Paris Saint-Germain" }, away: { id: 91, short: "Monaco", name: "Monaco" } },
    bookStats: book, players: { scoringThreat: joueurs || [] }
  };
}
const BOOK = {
  firstGoal: {
    home: Object.assign({ n: 67, comp: { id: 61, name: "Ligue 1" }, scores: { p: 0.76, lo: 0.65, hi: 0.85 } }, periode),
    away: Object.assign({ n: 67, comp: { id: 61, name: "Ligue 1" }, scores: { p: 0.49, lo: 0.38, hi: 0.61 } }, periode)
  },
  leagueLate: { n: 605, p: { p: 0.51, lo: 0.47, hi: 0.55 }, debut: "2024-08-16", fin: "2026-08-31" }
};

test("1. Le match en 30 secondes : histoire tiree des buts attendus ; sans buts attendus, pas de bloc", () => {
  const vm = VM.buildMatchViewModel(match());
  assert.equal(vm.plus.histoire, "PSG part devant face à Monaco : 1,9 but attendu contre 1,4, un match ouvert (3,3 buts attendus au total).");
  const sans = VM.buildMatchViewModel(match({ lambda_h: null, lambda_a: null }));
  assert.equal(sans.plus.histoire, null);
  assert.equal(sans.plus.partage, null);
  const bloc = fonction("function resumeCard(vm)", "function chiffreFouCard");
  assert.match(bloc, /if\(!P\.histoire\)return '';/);
  // Gratuit : le pari et l'histoire ; les 2 buteurs seulement en vue Pro.
  assert.match(bloc, /VUE_PRO\?\(buteurs\?\[B\.length>1\?'Les 2 buteurs':'Le buteur'/);
  assert.match(bloc, /lignePro\('Les 2 buteurs du match : réservé aux abonnés Pro\.'\)/);
});

test("2. Le piege du match : une vraie stat (nombre de matchs, periode), jamais le chiffre fou ; sinon rien", () => {
  const P = VM.matchPlus(match(), vmFactice(BOOK), true);
  assert.equal(P.chiffreFou.id, "premier_but_home");
  assert.equal(P.piege.id, "premier_but_away");
  assert.equal(P.piege.phrase, "Monaco a ouvert le score dans 49 % de ses matchs");
  assert.equal(P.piege.detail, "sur 67 matchs de Ligue 1, 2024-2026");
  assert.equal(VM.matchPlus(match(), vmFactice(null), true).piege, null);
  const avis = fonction("function signalCard(vm)", "// PROBABILITES ET COTES");
  assert.match(avis, /\$\{estFr\(\)\?\(piege\?`<div class="plus-piege" role="note">\$\{cardIcon\('alert'\)\}<p><b>Le piège du match<\/b> \$\{piege\}<\/p><\/div>`:''\)/);
  assert.doesNotMatch(avis, /confMeter|riskStat/);
});

test("3. Le chiffre fou : la stat la plus surprenante, avec matchs et periode ; rien de surprenant ou pas de stats : cache", () => {
  const P = VM.matchPlus(match(), vmFactice(BOOK), true);
  assert.equal(P.chiffreFou.grand, "76 %");
  assert.equal(P.chiffreFou.phrase, "PSG a ouvert le score dans 76 % de ses matchs");
  assert.equal(P.chiffreFou.detail, "sur 67 matchs de Ligue 1, 2024-2026");
  const banal = JSON.parse(JSON.stringify(BOOK));
  banal.firstGoal.home.scores.p = 0.52;
  assert.equal(VM.matchPlus(match(), vmFactice(banal), true).chiffreFou, null);
  assert.equal(VM.matchPlus(match(), vmFactice(null), true).chiffreFou, null);
  assert.match(fonction("function chiffreFouCard(vm)", "function filmCard"), /if\(!c\)return '';/);
});

test("4. Le film du match : buts attendus par tranche = exactement ceux du moteur ; sans simulation, cache", () => {
  const T = VM.buildMatchViewModel(match()).plus.tranches;
  assert.equal(T.length, 6);
  assert.ok(Math.abs(T.reduce((s, x) => s + x.buts, 0) - (LH + LA)) < 1e-9);
  assert.ok(Math.abs(T.reduce((s, x) => s + x.home, 0) - LH) < 1e-9);
  // Plus de mot de tranche (verdict du mathematicien, 30/09/2026 : identiques sur tous les matchs).
  T.forEach(x => assert.equal(x.niveau, undefined));
  assert.equal(VM.buildMatchViewModel(match({ sim_15min: null })).plus.tranches, null);
  assert.equal(VM.buildMatchViewModel(match({ sim_15min: { tr: [0.3, 0.3, 0.4] } })).plus.tranches, null);
  assert.match(fonction("function filmCard(vm)", "function siAlorsCard"), /if\(!g\|\|!g\.slots\.length\|\|!T\)return '';/);
});

test("5. Si... alors... : Poisson sur les buts attendus restants, probabilites coherentes ; sans simulation, cache", () => {
  const L = VM.buildMatchViewModel(match()).plus.siAlors;
  assert.deepEqual(L.map(x => x.cle), ["marque_avant_30", "nul_pause", "autre_mene_pause", "nul_60"]);
  L.forEach(x => assert.ok(x.p > 0 && x.p < 1, x.cle));
  const T = VM.buildMatchViewModel(match()).plus.tranches;
  const apres60 = T.slice(4).reduce((s, x) => s + x.buts, 0);
  assert.ok(Math.abs(L[3].p - Math.exp(-apres60)) < 1e-12, "0-0 final sachant 0-0 a la 60e = exp(-buts attendus restants)");
  assert.ok(L[0].p > L[1].p && L[1].p > L[2].p, "marquer tot aide, etre mene a la pause nuit");
  assert.match(L[0].texte, /^Si PSG marque avant la 30e minute, la victoire suit \d fois sur 10\.$/);
  for (const x of L) assert.doesNotMatch(x.texte, /cote|pari|mise|gain|valeur|avantage/i);
  assert.equal(VM.buildMatchViewModel(match({ sim_15min: null })).plus.siAlors, null);
  assert.match(fonction("function siAlorsCard(vm)", "function buteursCard"), /if\(!L\|\|!L\.length\)return '';/);
});

test("6. Les 2 buteurs : chance du moteur v3 (deja arrondie vers le bas a 5 points, 45 % au plus), lue telle quelle ; titulaire et forme ; sans joueur, cache", () => {
  // Une seule source (01/10/2026) : scoringProbability = v3_buteurs[].chance, arrondie UNE fois
  // par le pipeline (lib/chance-iashark.js#chanceButeur : 0,583 -> 45 ; 0,299 -> 25).
  const CHANCE = require("../lib/chance-iashark.js");
  assert.deepEqual([0.583, 0.299, 0.2].map(CHANCE.chanceButeur), [45, 25, 20]);
  const j = (id, p, extra) => Object.assign({ id, name: "Joueur  " + id, teamId: 85, team: "Paris Saint-Germain", scoringProbability: p, startsLast: 4, teamMatchesLast: 5, goalsRecent: 3, appearances: 8 }, extra || {});
  const P = VM.matchPlus(match(), vmFactice(null, [j(1, 45), j(2, 25, { goalsRecent: 0 }), j(3, 20)]), true);
  assert.equal(P.buteurs.length, 2);
  assert.equal(P.buteurs[0].chance, 45);
  assert.equal(P.buteurs[1].chance, 25);
  assert.equal(P.buteurs[0].name, "Joueur 1");
  assert.equal(P.buteurs[0].team, "PSG");
  assert.equal(P.buteurs[0].titulaire, "Titulaire probable : 4 titularisations sur les 5 derniers matchs de l’équipe");
  assert.equal(P.buteurs[0].forme, "3 buts sur ses 8 derniers matchs joués");
  assert.equal(P.buteurs[1].forme, "Aucun but sur ses 8 derniers matchs joués");
  assert.equal(P.buteurs[0].chanceTexte, "45\u00a0%");
  assert.equal(VM.matchPlus(match(), vmFactice(null, []), true).buteurs, null);
  // Page : bloc Pro seulement ; sans buteur, pas de carte.
  assert.match(fonction("function buteursCard(vm)", "function analysePlus"), /if\(!B\)return '';/);
  assert.match(fonction("function analysePlus(vm)", "const B2="), /if\(VUE_PRO\)\{/);
});

test("7. Carte a partager : histoire et chiffre fou, AUCUNE cote, aucun pari, aucun mot de jeu d'argent", () => {
  const P = VM.matchPlus(match(), vmFactice(BOOK), true);
  const texte = JSON.stringify(P.partage);
  assert.ok(P.partage.histoire && P.partage.chiffre);
  assert.deepEqual(Object.keys(P.partage).sort(), ["chiffre", "domicile", "exterieur", "histoire", "ligue"]);
  assert.doesNotMatch(texte, /1[.,]73|64|cote|pari|mise|bookmaker|gain|parier|pronostic|mi-temps/i);
  // Le dessin ne lit que la carte (PARTAGE = vm.plus.partage), jamais le pari ni une cote.
  const dessin = fonction("async function dessinerCarte(c)", "async function partagerCarte");
  const envoi = fonction("async function partagerCarte(btn)", "// Barre collante");
  for (const interdit of ["recommendation", "recommended", "odds(", "marcheFr", "pari", "cote", "_raw", "vm."]) {
    assert.ok(!dessin.includes(interdit), "le dessin lit " + interdit);
    assert.ok(!envoi.includes(interdit), "l'envoi lit " + interdit);
  }
  assert.match(js, /PARTAGE=P\.partage\|\|null;/);
  // Sans histoire (pas de buts attendus), rien a partager.
  assert.equal(VM.matchPlus(match({ lambda_h: null }), vmFactice(BOOK), true).partage, null);
});

test("page francaise seulement ; la vue visiteur ne lit aucun bloc nouveau", () => {
  assert.match(js, /const plus=estFr\(\);/);
  const visiteur = fonction("function gateCard(vm,opts)", "function renderAuthWall");
  // Decision de Clement (30/09/2026) : le visiteur voit aussi « Le chiffre fou » (page
  // francaise), tire du SEUL champ public stats_iashark_gratuit (copie sans premium).
  for (const f of ["resumeCard", "filmCard", "siAlorsCard", "buteursCard", "analysePlus", "lectureCard", "vm.plus.tranches", "vm.plus.buteurs"]) assert.ok(!visiteur.includes(f), f);
  assert.match(visiteur, /const vm=viewModel\(publicCopy\(raw\)\);/);
  assert.match(visiteur, /estFr\(\)\?\['chiffre',chiffreFouCard\(vm\)\]:null/);
  // Aucun mot interdit dans les textes ajoutes.
  const plus = fonction("// PAGE MATCH PLUS", "// Barre collante").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(plus, /historique public|espérance|mise conseill|avantage|value bet|valeur/i);
});

// ---------------------------------------------------------------------------
// Ajouts valides par Clement (30/09/2026, fusion V3).
test("le score audacieux : le plus probable des scores a 4 buts ou plus, vraie probabilite du moteur v3, Pro seulement", () => {
  const v3 = (cle, probabilite) => ({ cle, probabilite, market_id: null });
  const raw = match({ moteur_v3: { source: "v3" }, v3_marches: [v3("SCORE:1-0", 12.1), v3("SCORE:2-1", 9.4), v3("SCORE:2-2", 4.6), v3("SCORE:3-1", 5.3), v3("SCORE:4-0", 1.2), v3("SCORE:autre", 3), v3("1N2:1", 49)] });
  assert.deepEqual(VM.scoreAudacieux(raw), { score: "3-1", probability: 5.3, buts: 4 });
  assert.equal(VM.buildMatchViewModel(raw).model.boldScore.score, "3-1");
  // Ancien moteur, pas de marches v3, aucun score a 4 buts : rien.
  assert.equal(VM.scoreAudacieux(match({ v3_marches: raw.v3_marches })), null);
  assert.equal(VM.scoreAudacieux(match({ moteur_v3: { source: "v3" }, v3_marches: [v3("SCORE:1-0", 12)] })), null);
  // La page ne l'affiche qu'en vue Pro (VUE_PRO), marque « audacieux ».
  const bloc = fonction("function outputsCard(vm,opts)", "function texteLisible");
  assert.match(bloc, /const au=VUE_PRO&&estFr\(\)\?vm\.model\.boldScore:null;/);
  assert.match(bloc, /audacieux<\/em>/);
});

test("notre lecture du match : texte de l'IA sans aucun chiffre, relu, Pro seulement, cache si absent", () => {
  const MI = require("../lib/analyse-mots-interdits.js");
  const an = { lecture_match: "Paris devrait contrôler sans forcer au début. Monaco attendra ses contres. Le PSG gagne dans 64 % des cas. La cote de 1,73 est belle. Avec cet avantage, Paris ne peut pas perdre. La fin de match sera la plus animée. Une cinquième phrase de trop." };
  const r = MI.nettoyerAnalyse(an, {}).an.lecture_match;
  assert.equal(r, "Paris devrait contrôler sans forcer au début. Monaco attendra ses contres. La fin de match sera la plus animée. Une cinquième phrase de trop.");
  assert.doesNotMatch(r, /\d|cote|avantage|perdre/);
  assert.equal(MI.nettoyerAnalyse({ lecture_match: "Le match finit 2-1." }, {}).an.lecture_match, "", "un texte sans phrase gardee reste vide : bloc cache");
  assert.equal(MI.nettoyerAnalyse({ lecture_match: "Ce pari tient la route. Paris attendra." }, {}).an.lecture_match, "Paris attendra.", "« pari » retire, la ville de Paris gardee");
  // Chaine complete : consigne de l'IA, champ publie, champ Pro seulement, page.
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /"lecture_match": "\[3 a 4 phrases courtes, SANS AUCUN CHIFFRE/);
  assert.match(wf, /lecture_match:an\?\(an\.lecture_match\|\|''\):'',/);
  assert.ok(require("../lib/premium-fields.js").PRO_ONLY_FIELDS.includes("lecture_match"));
  assert.equal(VM.buildMatchViewModel(match({ lecture_match: "Monaco attendra ses contres." })).editorial.matchReading, "Monaco attendra ses contres.");
  const carte = fonction("function lectureCard(vm)", "const B2=");
  assert.match(carte, /const txt=VUE_PRO\?String\(vm\.editorial\.matchReading\|\|''\)\.trim\(\):'';/);
  assert.match(carte, /if\(!txt\|\|\/\\d\/\.test\(txt\)\)return '';/);
  assert.match(fonction("function analysePlus(vm)", "function lectureCard"), /const lecture=lectureCard\(vm\);\n  if\(lecture\)blocs\.push\(lecture\);\n  return blocs/);
});

// Avocat du diable (01/10/2026) : l'image a partager d'un match « Fiabilité : en test » le dit.
test("8. Carte a partager : « Fiabilité : en test » quand la competition est en test (ou une selection)", () => {
  const P = VM.matchPlus(Object.assign(match(), { league_reliability: "en_test" }), vmFactice(BOOK), true);
  assert.equal(P.partage.enTest, true);
  assert.equal(VM.matchPlus(match(), vmFactice(BOOK), true).partage.enTest, undefined, "competition validee : rien");
  assert.match(fonction("async function dessinerCarte(c)", "async function partagerCarte"), /if\(c\.enTest\)\{[^}]*Fiabilité : en test/);
});
