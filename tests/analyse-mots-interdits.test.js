"use strict";
// 2e contre-controle de l'avocat du diable (30/09/2026) : « sûr », « garanti » et
// « certain » n'etaient interdits que dans la CONSIGNE donnee a l'IA, et seulement
// pour les paris v3. Aucun controle ne relisait le texte produit. Desormais
// lib/analyse-mots-interdits.js relit chaque texte avant publication, pour tous les
// matchs, et retire la phrase fautive.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../lib/analyse-mots-interdits.js");

const WF = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");

test("mots interdits reperes, y compris avec majuscule ou au feminin", () => {
  for (const [phrase, terme] of [
    ["Un pari sûr pour ce soir.", "sûr"],
    ["La victoire est SÛRE.", "SÛRE"],
    ["Lens gagnera à coup sûr.", "sûr"],
    ["Ils marqueront sûrement.", "sûrement"],
    ["Un choix sécurisé.", "sécurisé"],
    ["Résultat garanti.", "garanti"],
    ["Rien ne peut garantir ce score.", "garantir"],
    ["Une victoire certaine.", "certaine"],
    ["C'est certain.", "certain"],
    ["Les buts sont quasi certains.", "sont quasi certains"],
    ["Aucune certitude ici.", "certitude"],
    ["Le pari safe du jour.", "safe"],
    ["Un pari sans risque.", "sans risque"],
    ["Une méthode infaillible.", "infaillible"],
  ]) {
    assert.equal(M.motInterdit(phrase), terme, phrase);
  }
});

// 3e contre-controle (30/09/2026) : l'avocat du diable a rejoue genAnalyse et
// « Nantes va certainement gagner. Victoire assurée. » etait publie tel quel.
test("promesses elargies : certainement, assuré(e), aucun risque, sans aucun doute...", () => {
  for (const [phrase, terme] of [
    ["Nantes va certainement gagner.", "certainement"],
    ["Victoire assurée.", "assurée"],
    ["VICTOIRE ASSURÉE !", "ASSURÉE"],
    ["Victoire assuree.", "assuree"],
    ["Un succès assuré pour Lens.", "assuré"],
    ["Lens gagnera assurément.", "assurément"],
    ["Il marquera a coup sur.", "a coup sur"],
    ["Lens gagnera à tous les coups.", "à tous les coups"],
    ["Aucun risque ce soir.", "Aucun risque"],
    ["Zéro risque sur ce match.", "Zéro risque"],
    ["Risque zéro.", "Risque zéro"],
    ["Sans le moindre risque.", "Sans le moindre risque"],
    ["Sans aucun doute, Lens l'emporte.", "Sans aucun doute"],
    ["Nul doute que Lens gagnera.", "Nul doute"],
    ["Forcément, Lens part devant.", "Forcément"],
    ["Une frappe imparable.", "imparable"],
    ["Une victoire inévitable.", "inévitable"],
    ["C'est gagné d'avance.", "gagné d'avance"],
  ]) {
    assert.equal(M.motInterdit(phrase), terme, phrase);
  }
  const r = M.nettoyerTexte("Nantes va certainement gagner. Victoire assurée. Nantes reste sur 3 victoires.");
  assert.equal(r.texte, "Nantes reste sur 3 victoires.");
  assert.deepEqual(r.retraits.map((x) => x.terme), ["certainement", "assurée"]);
  // Nuances permises : le texte n'est pas vide pour rien.
  for (const phrase of [
    "Il faudra sans doute attendre la seconde période.",
    "Ce n'est pas forcément un match fermé.",
    "Le gardien assure ses sorties.",
    "Lens prend des risques en fin de match.",
    "Un risque de contre existe.",
    "Le doute s'installe chez Lille.",
  ]) {
    assert.equal(M.motInterdit(phrase), null, phrase);
  }
});

test("aucune fausse alerte sur les mots proches", () => {
  for (const phrase of [
    "Lens reste sur 3 victoires sur ses 5 derniers matchs.",
    "Lille pèse sur le jeu : 1.5 but par match.",
    "Il faudra un certain temps d'adaptation.",
    "Certains joueurs sont absents, certaines lignes bougent.",
    "D'un certain point de vue, le match est ouvert.",
    "Les assurances du gardien comptent.",
    "La sécurité défensive de Lille : 0.8 but encaissé.",
  ]) {
    assert.equal(M.motInterdit(phrase), null, phrase);
  }
});

test("la phrase fautive est retiree, le reste du texte est garde tel quel", () => {
  const r = M.nettoyerTexte("Lens marque 1.5 but par match. Victoire sûre ce soir ! Lille encaisse peu.");
  assert.equal(r.texte, "Lens marque 1.5 but par match. Lille encaisse peu.");
  assert.deepEqual(r.retraits.map((x) => x.terme), ["sûre"]);
  const propre = "Texte sans rien à retirer.  Deux espaces gardés.";
  assert.equal(M.nettoyerTexte(propre).texte, propre, "texte propre : jamais retouche");
  assert.equal(M.nettoyerTexte("Pari garanti.").texte, "", "plus aucune phrase : champ vide, le site masque le bloc");
});

test("toute la reponse de l'IA est relue, sans modifier l'objet recu", () => {
  const an = {
    verdict_shark: "Signal net. C'est sûr.",
    analyse_card: "Lens domine : 61 % de victoires.",
    conseil: "Un pari safe.",
    contexte: "Lens est 3e.",
    facteur_x: "Écart Elo de 120 points, victoire certaine.",
    score_central: "2-0",
    scenario: { phase1: "Début fermé.", phase2: "Lens pousse, but garanti.", phase3: "Fin maîtrisée." },
    scenario_15min: [{ t: "0-15", prob: 20, txt: "Départ prudent." }, { t: "15-30", prob: 25, txt: "Un but sûr ici." }],
    buteurs_probables: [{ joueur: "A. Dupont", raison: "2,1 tirs cadrés par match. Il marquera à coup sûr." }],
  };
  const avant = JSON.stringify(an);
  const r = M.nettoyerAnalyse(an);
  assert.equal(JSON.stringify(an), avant, "l'objet d'origine n'est pas modifie");
  assert.equal(r.an.verdict_shark, "Signal net.");
  assert.equal(r.an.analyse_card, an.analyse_card);
  assert.equal(r.an.conseil, "");
  assert.equal(r.an.contexte, an.contexte);
  assert.equal(r.an.facteur_x, "");
  assert.equal(r.an.score_central, "2-0");
  assert.deepEqual(r.an.scenario, { phase1: "Début fermé.", phase2: "", phase3: "Fin maîtrisée." });
  assert.deepEqual(r.an.scenario_15min.map((s) => [s.t, s.prob, s.txt]), [["0-15", 20, "Départ prudent."], ["15-30", 25, ""]]);
  assert.deepEqual(r.an.buteurs_probables, [{ joueur: "A. Dupont", raison: "2,1 tirs cadrés par match." }]);
  assert.deepEqual(r.retraits.map((x) => x.champ), ["verdict_shark", "conseil", "facteur_x", "scenario.phase2", "scenario_15min[1]", "buteurs_probables[A. Dupont]"]);
  assert.deepEqual(M.nettoyerAnalyse(null), { an: null, retraits: [] });
});

test("pipeline : chaque texte de genAnalyse passe par la relecture, pour tous les matchs", () => {
  assert.match(WF, /var MOTS_INTERDITS=require\('\.\/lib\/analyse-mots-interdits\.js'\);/);
  const gen = WF.slice(WF.indexOf("async function genAnalyse(d)"), WF.indexOf("async function genTraductions("));
  assert.match(gen, /var relu=MOTS_INTERDITS\.nettoyerAnalyse\(JSON\.parse\(cleaned\),\{modeleSeul:!chiffreAvecCotes\}\);/);
  assert.match(gen, /return relu\.an;/);
  assert.doesNotMatch(gen, /return JSON\.parse\(cleaned\);/, "plus aucun texte publie sans relecture");
  // La consigne l'annonce aussi pour l'ancien moteur, pas seulement pour le v3.
  const role = gen.slice(gen.indexOf("=== TON ROLE (STRICT) ==="), gen.indexOf("var jsonTpl ="));
  assert.match(role, /VOCABULAIRE INTERDIT dans tous les champs : « sûr »/);
  assert.match(role, /« safe »/);
  for (const m of ["« certainement »", "« assuré » / « assurée »", "« aucun risque »", "« sans aucun doute »", "« à coup sûr »"]) assert.ok(role.includes(m), "consigne : " + m);
  // La relecture a lieu avant la traduction (qui part du texte francais relu).
  assert.ok(WF.indexOf("var relu=MOTS_INTERDITS") < WF.indexOf("async function genTraductions("));
});

// Contre-controle ronde 4 (30/09/2026). Preuve de l'avocat du diable (scratchpad
// avocat-v3-r3/genanalyse-contournement.js) : ces phrases, renvoyees par l'IA au VRAI
// genAnalyse, etaient publiees telles quelles. On rejoue le meme genAnalyse.
test("ronde 4 : sans accents et expressions de promesse, rejoue dans le vrai genAnalyse", async () => {
  const os = require("node:os");
  const V3 = require("../lib/moteur-v3.js");
  const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "moteur-v3.json"), "utf8"));
  const debut = WF.indexOf("cat > pipeline.js << 'JSEOF'\n");
  const script = WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => l.startsWith("          ") ? l.slice(10) : l).join("\n");
  const fnSrc = script.slice(script.indexOf("async function genAnalyse(d) {"), script.indexOf("// TRADUCTION DES TEXTES EDITORIAUX"));
  const fabrique = new Function("MOTEUR_V3", "ANT_KEY", "postJSONWithRetry", "MOTS_INTERDITS", fnSrc + "\nreturn genAnalyse;");
  const b = V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: path.join(os.tmpdir(), "absent-" + process.pid) }, config: CONFIG, nowMs: Date.parse("2026-09-27T08:00:00Z") });
  const reponse = {
    verdict_shark: "Nantes gagnera à coup sur. La victoire ne fait pas de doute.",
    conseil: "Un pari à jouer les yeux fermés : Nantes ne peut pas perdre.",
    contexte: "C'est couru d'avance, Nantes reste sur 3 victoires.",
  };
  const gen = fabrique(b, "cle-factice", async () => ({ content: [{ type: "text", text: JSON.stringify(reponse) }] }), M);
  const an = await gen({ fixtureId: 42, home: "Nantes", away: "Lille", league: "Ligue 1", date: "2026-10-03 21:00", stade: "Beaujoire", no_signal: true, picked_market: null, mc_scores: [], all_markets: [] });
  assert.deepEqual(an, { verdict_shark: "", conseil: "", contexte: "" }, "plus aucune de ces phrases publiee");

  for (const [phrase, terme] of [
    ["Nantes gagnera à coup sur.", "à coup sur"],
    ["La victoire ne fait pas de doute.", "ne fait pas de doute"],
    ["Il ne fait aucun doute que Lens gagnera.", "ne fait aucun doute"],
    ["Sans l'ombre d'un doute, Lens gagne.", "Sans l'ombre d'un doute"],
    ["Pas de doute, Lens l'emporte.", "Pas de doute"],
    ["Un pari à jouer les yeux fermés.", "les yeux fermés"],
    ["Un pari a jouer les yeux fermes.", "les yeux fermes"],
    ["Nantes ne peut pas perdre.", "ne peut pas perdre"],
    ["Nantes ne peut que gagner.", "ne peut que gagner"],
    ["C'est couru d'avance.", "couru d'avance"],
    ["La victoire est dans la poche.", "dans la poche"],
    ["C'est plié pour Lens.", "C'est plié"],
    // Variantes sans accents.
    ["Victoire sure pour Lens.", "sure"],
    ["Ils marqueront surement.", "surement"],
    ["Un choix securise.", "securise"],
    ["Une defaite inevitable.", "inevitable"],
    ["Lens gagnera assurement.", "assurement"],
    ["Victoire assuree.", "assuree"],
    ["C'est gagne d'avance.", "gagne d'avance"],
    ["Zero risque.", "Zero risque"],
    ["Forcement, Lens part devant.", "Forcement"],
  ]) {
    assert.equal(M.motInterdit(phrase), terme, phrase);
  }
  // Tournures anodines : jamais retirees (sinon le texte se vide pour rien).
  for (const phrase of [
    "Il faudra sans doute attendre la seconde période.",
    "Le gardien assure ses sorties aériennes.",
    "Lens a assuré son maintien la saison dernière.",
    "Lens s'est assuré la 3e place samedi.",
    "Lens pèse sur le jeu : 1.5 but par match.",
    "Les yeux rivés sur le classement.",
    "Lens ne peut pas se permettre de perdre.",
    "Lens ne perdra pas de temps pour presser.",
    "Le doute s'installe chez Lille.",
    "Ce n'est pas forcément un match fermé.",
  ]) {
    assert.equal(M.motInterdit(phrase), null, phrase);
  }
  // La consigne donnee a l'IA cite aussi ces expressions.
  const gen2 = WF.slice(WF.indexOf("async function genAnalyse(d)"), WF.indexOf("async function genTraductions("));
  const role = gen2.slice(gen2.indexOf("=== TON ROLE (STRICT) ==="), gen2.indexOf("var jsonTpl ="));
  for (const m of ["« couru d’avance »", "« ne fait pas de doute »", "« les yeux fermés »", "« ne peut pas perdre »", "(avec ou sans accents)"]) assert.ok(role.includes(m), "consigne : " + m);
});

// Condition du mathematicien et de l'avocat du diable (30/09/2026) : aucun avantage
// face au marche n'est prouve. Jamais « valeur » ni « avantage » dans un texte public
// lie au v3 : la phrase est retiree avant publication, comme les promesses.
test("« valeur », « value », « avantage », « edge » : phrase retiree", () => {
  for (const [phrase, terme] of [
    ["Un pari à forte valeur.", "valeur"],
    ["Belle value sur ce match.", "value"],
    ["Le value bet du jour.", "value"],
    ["Lens a l'avantage du terrain.", "avantage"],
    ["Lens part avec un léger AVANTAGE.", "AVANTAGE"],
    ["Lens est avantagé par le calendrier.", "avantagé"],
    ["Une situation avantageuse pour Lille.", "avantageuse"],
    ["L'edge est net sur ce marché.", "edge"],
  ]) {
    assert.equal(M.motInterdit(phrase), terme, phrase);
  }
  const r = M.nettoyerTexte("Lens a l'avantage du terrain. Lens reste sur 3 victoires.");
  assert.equal(r.texte, "Lens reste sur 3 victoires.");
  // Mots voisins permis.
  for (const phrase of ["Lens a validé sa place en tête.", "Un match à valider.", "La pression reste forte."]) assert.equal(M.motInterdit(phrase), null, phrase);
  // La consigne de l'IA le dit aussi.
  assert.ok(WF.includes("« valeur » / « value », « avantage » / « edge »"), "consigne : valeur et avantage");
});

// Avocat du diable et mathematicien (30/09/2026, point 3) : sur un match « modèle seul »
// (moteur v3 hors d'Europe, ancien moteur), la page masque l'ecart en faveur du modele,
// mais la consigne donnait a l'IA le chiffre du marche et rien ne l'empechait d'ecrire
// « le modèle voit plus de chances que la cote ». Rejoue dans le VRAI genAnalyse.
function genAnalyseReel(capture) {
  const debut = WF.indexOf("cat > pipeline.js << 'JSEOF'\n");
  const script = WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => l.startsWith("          ") ? l.slice(10) : l).join("\n");
  const fnSrc = script.slice(script.indexOf("async function genAnalyse(d) {"), script.indexOf("// TRADUCTION DES TEXTES EDITORIAUX"));
  const fabrique = new Function("MOTEUR_V3", "ANT_KEY", "postJSONWithRetry", "MOTS_INTERDITS", fnSrc + "\nreturn genAnalyse;");
  return (reponse) => fabrique({ actif: false }, "cle-factice", async (h, chemin, corps) => { capture.push(corps.messages[0].content); return { content: [{ type: "text", text: JSON.stringify(reponse) }] }; }, M);
}
const MATCH = { fixtureId: 900001, home: "Austin", away: "Dallas", league: "Major League Soccer", date: "2026-10-03 23:30", stade: "Q2", no_signal: false,
  picked_market: { market: "Victoire Domicile", cote: "1.62", prob: 70 }, pinnacle_p1: 60, pinnacle_pN: 23, pinnacle_p2: 17, market_source: "Pinnacle",
  final_p1: 70, final_pN: 18, final_p2: 12, mc_scores: [], all_markets: [{ id: "home-win", market: "Victoire Domicile", prob: 70, estimate: null, cote: "1.62" }] };
const FAUTIF = { verdict_shark: "Austin reste sur 4 victoires. Le modèle voit plus de chances que la cote : 70 % contre 60 %.",
  analyse_card: "Le marché sous-estime Austin. Dallas encaisse 1,8 but par match.", contexte: "Les bookmakers ne donnent que 60 % à Austin." };

test("match « modèle seul » : ni chiffre du marche dans la consigne, ni « plus de chances que la cote » publie", async () => {
  const consignes = [];
  const gen = genAnalyseReel(consignes);
  const an = await gen(FAUTIF)(Object.assign({}, MATCH, { moteur_texte: "v3", v3_avec_cotes: false }));
  assert.equal(an.verdict_shark, "Austin reste sur 4 victoires.");
  assert.equal(an.analyse_card, "Dallas encaisse 1,8 but par match.");
  assert.equal(an.contexte, "");
  assert.doesNotMatch(consignes[0], /Probabilite marche/, "le chiffre du marche n'est plus donne");
  assert.match(consignes[0], /Marche: non fourni pour ce match/);
  assert.match(consignes[0], /INTERDIT POUR CE MATCH : n'ecris jamais que le modele \(ou IASHARK\) voit plus de chances que la cote/);
  // Ancien moteur (origine inconnue, ecart masque aussi) : interdiction et relecture.
  const ancien = await gen(FAUTIF)(Object.assign({}, MATCH));
  assert.equal(ancien.verdict_shark, "Austin reste sur 4 victoires.");
  assert.match(consignes[1], /INTERDIT POUR CE MATCH/);
});

test("match « modèle + cotes » (Europe) : chiffre du marche donne, ecart affiche sur la page, phrase gardee", async () => {
  const consignes = [];
  const an = await genAnalyseReel(consignes)(FAUTIF)(Object.assign({}, MATCH, { moteur_texte: "v3", v3_avec_cotes: true }));
  assert.equal(an.verdict_shark, FAUTIF.verdict_shark);
  assert.match(consignes[0], /Probabilite marche \(Pinnacle, retrait de marge\): DOM 60%/);
  assert.doesNotMatch(consignes[0], /INTERDIT POUR CE MATCH/);
});

test("ecartFavorable : seulement une phrase qui parle du prix ET d'un ecart en faveur du modele", () => {
  for (const [phrase, terme] of [
    ["Le modèle voit plus de chances que la cote.", "plus de chances"],
    ["Notre estimation dépasse la cote de 8 points.", "dépasse"],
    ["Les bookmakers sous-évaluent Austin.", "sous-évaluent"],
    ["La cote de 1,62 est généreuse.", "généreuse"],
    ["IASHARK estime 70 %, au-dessus de la probabilité implicite.", "au-dessus"],
    ["Le marché ne donne que 60 % à Austin.", "ne donne que"],
    ["Un écart favorable face au marché.", "écart favorable"],
  ]) assert.equal(M.ecartFavorable(phrase), terme, phrase);
  for (const phrase of ["La cote de 1,62 fait d'Austin le favori.", "Austin a marqué plus de buts que Dallas.", "Le marché des buts reste ouvert.", "Dallas encaisse 1,8 but par match."]) {
    assert.equal(M.ecartFavorable(phrase), null, phrase);
  }
  // Sans l'option, rien ne change pour un match « modèle + cotes ».
  assert.equal(M.nettoyerTexte("Le modèle voit plus de chances que la cote.").retraits.length, 0);
  assert.equal(M.nettoyerTexte("Le modèle voit plus de chances que la cote.", { modeleSeul: true }).texte, "");
});
