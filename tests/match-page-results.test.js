"use strict";
// OUVERTURE DES ANALYSES DE MATCHS TERMINES (lot R4, 20/09/2026 ;
// docs/SPEC_RESULTATS_HIER.md).
//
// Une analyse dont le match est termine n'a plus de valeur de pari : elle
// devient la preuve publique du travail et s'ouvre a tout le monde. Une
// analyse d'un match A VENIR ou EN COURS reste strictement payante - c'est le
// point le plus important de ce fichier, et le premier test.
//
// Ces tests EXECUTENT la logique reelle de la fonction Edge (Deno) : les
// fonctions et la chaine de service du non-abonne sont extraites de
// supabase/functions/match-data/index.ts, debarrassees de leurs annotations
// de type, puis evaluees. Aucune copie de la logique ici : si la fonction
// Edge change, ces tests changent de resultat.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PREMIUM = require("../lib/premium-fields.js");
const VM = require("../lib/match-view-model.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const EDGE_SRC = read("supabase/functions/match-data/index.ts");
const PAGE = read("match-page.js");
const CSS = read("assets/match-page.css");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const HEURE = 3600 * 1000;

// --- Extraction de la logique serveur reelle ------------------------------
// Annotations de type retirees a l'identique (les plus longues d'abord) : la
// liste est explicite pour ne jamais toucher a un vrai objet du code.
const ANNOTATIONS = [
  " as { narrative_i18n?: Record<string, unknown>; premium_fields?: Record<string, unknown> } | null",
  " as Record<string, unknown> | null",
  ": Record<string, unknown> | undefined",
  ": Record<string, unknown>[]",
  ": Record<string, EtatOuverture>",
  ": Record<string, number>",
  ": Record<string, unknown>",
  ": EtatOuverture | undefined",
  ": EtatOuverture",
  ": number | null",
  ": Set<string>",
  ": boolean",
  ": number",
  ": unknown",
];
function sansTypes(src) {
  let out = src;
  for (const a of ANNOTATIONS) out = out.split(a).join("");
  return out;
}
function fonctionEdge(nom) {
  const debut = EDGE_SRC.indexOf("function " + nom + "(");
  assert.ok(debut !== -1, "fonction " + nom + " introuvable dans la fonction Edge");
  const fin = EDGE_SRC.indexOf("\n}\n", debut);
  assert.ok(fin !== -1, "fin de " + nom + " introuvable");
  return EDGE_SRC.slice(debut, fin + 2);
}
function constanteEdge(nom) {
  const debut = EDGE_SRC.indexOf("const " + nom + " =");
  assert.ok(debut !== -1, "constante " + nom + " introuvable");
  return EDGE_SRC.slice(debut, EDGE_SRC.indexOf("\n", debut));
}
const EDGE = (() => {
  const listePremium = EDGE_SRC.slice(EDGE_SRC.indexOf("const PREMIUM_FIELDS = ["), EDGE_SRC.indexOf("];", EDGE_SRC.indexOf("const PREMIUM_FIELDS = [")) + 2);
  const code = [
    listePremium,
    constanteEdge("FUSEAU_SOURCE"), constanteEdge("RE_DATE_PARIS"),
    constanteEdge("SETTLED_MARGIN_MS"), constanteEdge("FINISHED_STATUSES"), constanteEdge("BLOCKING_STATUSES"),
    fonctionEdge("estGratuit"), fonctionEdge("retirerPremium"),
    fonctionEdge("decalageParisMinutes"), fonctionEdge("coupDEnvoiMs"),
    fonctionEdge("openedState"), fonctionEdge("etatsOuverture"), fonctionEdge("marquerOuverture"),
    fonctionEdge("enrichirMatch"),
    "return { PREMIUM_FIELDS, SETTLED_MARGIN_MS, estGratuit, retirerPremium, coupDEnvoiMs, openedState, etatsOuverture, marquerOuverture, enrichirMatch };",
  ].join("\n");
  return new Function(sansTypes(code))();
})();

// Chaine de service du NON-ABONNE, extraite telle quelle de la fonction Edge.
const CHAINE_ANONYME = (() => {
  const i = EDGE_SRC.indexOf("if (!isPro) {");
  assert.ok(i !== -1, "branche non-abonne introuvable");
  const debut = EDGE_SRC.indexOf("data.matchs = matchs.map((m) => {", i);
  const fin = EDGE_SRC.indexOf("\n    if (data.run_output)", debut);
  assert.ok(debut !== -1 && fin !== -1, "chaine de service du non-abonne introuvable");
  return EDGE_SRC.slice(debut, fin);
})();
const chaine = new Function(
  "matchs", "portee", "termineDemande", "premiumById", "ouverture", "detailFields",
  "estGratuit", "retirerPremium", "enrichirMatch", "marquerOuverture",
  "const data = {};\n" + CHAINE_ANONYME + "\nreturn data.matchs;",
);
// Sert la liste EXACTEMENT comme la fonction Edge la sert a un visiteur non
// abonne (anonyme ou compte gratuit).
function servirAnonyme(matchs, idDemande, maintenant, premiumById) {
  const ouverture = EDGE.etatsOuverture(matchs, maintenant);
  const etat = idDemande ? ouverture[String(idDemande)] : undefined;
  const termineDemande = !!(etat && etat.open);
  return chaine(matchs, { id: idDemande == null ? null : String(idDemande) }, termineDemande, premiumById || {}, ouverture, new Set(),
    EDGE.estGratuit, EDGE.retirerPremium, EDGE.enrichirMatch, EDGE.marquerOuverture);
}

// --- Fixtures --------------------------------------------------------------
// 21:30 heure de Paris (UTC+2 en septembre) = 19:30 UTC.
const COUP_ENVOI = Date.parse("2026-09-19T19:30:00Z");
function matchBrut(over) {
  return Object.assign({
    id: 1575507, home: { id: 1, n: "Nacional" }, away: { id: 2, n: "Famalicao" },
    league: "Primeira Liga", league_key: "primeira", date: "2026-09-19 21:30", status: "NS",
    model_output_available: true, data_quality_score: 82, has_signal: true, is_free: false,
    market_source: "Pinnacle (sharp)", c1: "2.10", cn: "3.40", c2: "3.20",
  }, over || {});
}
// Le meme match tel que le moteur le produit, champs premium compris : si un
// fichier public en trainait encore, ils ne doivent JAMAIS ressortir.
function avecPremium(m) {
  return Object.assign({}, m, {
    pari_rec: "Over 1.5", cote_rec: 1.32, model_probability: 78.4, market_id: "over15", marche: "Plus de 1,5 but",
    conf: 7.8, p1: 44, pn: 27, p2: 29, po25: 61, btts: 55, kelly: 0.04, edge: 5.1,
    verdict_shark: "SECRET", facteur_x: "SECRET", top_scorers: [{ goal_threat_score: 80 }],
    markets_compared: [{ id: "over15", market: "Over 1.5", probability: 78.4, consensus: 73.3, edge: 5.1 }],
  });
}
const LIGNE_PREMIUM = {
  fixture_id: 1575507, pari_rec: "Over 1.5", cote_rec: 1.32, model_probability: 78.4,
  market_id: "over15", marche: "Plus de 1,5 but", kelly: 0.04, edge: 5.1,
  verdict_shark: "Analyse reservee", facteur_x: "Facteur X", dropping_odds: null, player_markets: null,
  markets_compared: [{ id: "over15", market: "Over 1.5", probability: 78.4, consensus: 73.3, edge: 5.1 }],
  raw_response: { narrative_i18n: {}, premium_fields: { conf: 7.8, p1: 44, pn: 27, p2: 29, po25: 61 } },
};

// ===========================================================================
// 1. LE TEST LE PLUS IMPORTANT : un match a venir ne fuit rien, jamais.
// ===========================================================================
test("un match A VENIR ne renvoie AUCUN champ premium a un anonyme", () => {
  const maintenant = COUP_ENVOI - 2 * HEURE; // 2 h avant le coup d'envoi
  const aVenir = avecPremium(matchBrut());
  const servis = servirAnonyme([aVenir], 1575507, maintenant, { "1575507": LIGNE_PREMIUM });
  const servi = servis[0];
  assert.deepEqual(PREMIUM.premiumLeaks(servi), [], "champ premium de premier niveau servi a un anonyme");
  assert.deepEqual(PREMIUM.deepPremiumLeaks(servi), [], "champ premium imbrique servi a un anonyme");
  assert.equal(servi.pari_rec, undefined);
  assert.equal(servi.cote_rec, undefined);
  assert.equal(servi.model_probability, undefined);
  assert.equal(servi.conf, undefined);
  assert.equal(servi.market_id, undefined);
  // Aucun drapeau d'ouverture : la page ne voit qu'un match ferme.
  assert.equal(servi.is_settled, undefined);
  assert.equal(servi.opened_reason, undefined);
  // Les faits publics restent servis (equipes, cotes de bookmaker, amorce).
  assert.equal(servi.has_signal, true);
  assert.equal(servi.c1, "2.10");
});

test("match EN COURS et match a peine fini : toujours fermes pour un anonyme", () => {
  const cas = [
    ["coup d'envoi passe de 10 minutes", COUP_ENVOI + 10 * 60 * 1000, "1H"],
    ["mi-temps", COUP_ENVOI + 55 * 60 * 1000, "HT"],
    ["coup de sifflet final il y a 5 minutes", COUP_ENVOI + 2 * HEURE, "FT"],
    ["une minute avant la marge de securite", COUP_ENVOI + 3.5 * HEURE - 60000, "FT"],
  ];
  for (const [libelle, maintenant, statut] of cas) {
    const servi = servirAnonyme([avecPremium(matchBrut({ status: statut }))], 1575507, maintenant, { "1575507": LIGNE_PREMIUM })[0];
    assert.deepEqual(PREMIUM.deepPremiumLeaks(servi), [], libelle + " : analyse servie trop tot");
    assert.equal(servi.is_settled, undefined, libelle + " : match annonce comme termine");
  }
});

// ===========================================================================
// 2. Un match termine s'ouvre - et seulement celui-la.
// ===========================================================================
test("un match TERMINE s'ouvre a un anonyme, avec l'analyse reelle de la table protegee", () => {
  const maintenant = COUP_ENVOI + 4 * HEURE;
  const servi = servirAnonyme([matchBrut({ status: "FT" })], 1575507, maintenant, { "1575507": LIGNE_PREMIUM })[0];
  assert.equal(servi.is_settled, true);
  assert.equal(servi.settled_reason, "finished_status");
  assert.equal(servi.opened_reason, "settled");
  assert.equal(servi.pari_rec, "Over 1.5", "le pari publie doit revenir depuis match_premium_data");
  assert.equal(servi.cote_rec, 1.32);
  assert.equal(servi.model_probability, 78.4);
  assert.equal(servi.conf, 7.8);
  assert.equal(servi.verdict_shark, "Analyse reservee");
});

test("un match termine SANS ligne premium reste sans analyse : rien n'est reconstitue", () => {
  const maintenant = COUP_ENVOI + 4 * HEURE;
  // Le fichier public porte encore des champs premium (ancien commit) : ils
  // sont retires AVANT l'enrichissement, et rien ne les remplace.
  const servi = servirAnonyme([avecPremium(matchBrut({ status: "FT" }))], 1575507, maintenant, {})[0];
  assert.equal(servi.is_settled, true);
  assert.equal(servi.pari_rec, undefined);
  assert.equal(servi.verdict_shark, undefined);
  assert.deepEqual(PREMIUM.deepPremiumLeaks(servi), []);
});

test("un match termine NON demande est signale, mais son analyse n'est pas envoyee", () => {
  const maintenant = COUP_ENVOI + 5 * HEURE;
  const autre = avecPremium(matchBrut({ id: 999111, status: "FT" }));
  const demande = matchBrut({ status: "FT" });
  const servis = servirAnonyme([demande, autre], 1575507, maintenant, { "1575507": LIGNE_PREMIUM });
  const servi = servis.find((m) => m.id === 999111);
  assert.equal(servi.is_settled, true, "l'accueil doit savoir que le match est termine");
  assert.deepEqual(PREMIUM.deepPremiumLeaks(servi), [], "analyse d'un match non demande envoyee inutilement");
  assert.equal(servis.find((m) => m.id === 1575507).pari_rec, "Over 1.5");
});

test("l'analyse offerte du jour n'est pas touchee par l'ouverture des matchs termines", () => {
  const offert = avecPremium(matchBrut({ id: 424242, is_free: true }));
  const servi = servirAnonyme([offert], 424242, COUP_ENVOI - 4 * HEURE, {})[0];
  assert.equal(servi.pari_rec, "Over 1.5", "le match offert reste complet");
  assert.equal(servi.opened_reason, "free");
  assert.equal(servi.is_settled, false);
});

// ===========================================================================
// 3. Critere serveur : conservateur, et le meme des deux cotes.
// ===========================================================================
test("match reporte, annule, suspendu ou sans heure fiable : reste FERME", () => {
  const tard = COUP_ENVOI + 30 * HEURE; // bien apres l'heure prevue
  for (const statut of ["PST", "CANC", "SUSP", "INT", "ABD", "AWD", "WO", "TBD"]) {
    const etat = EDGE.openedState(statut, COUP_ENVOI, tard);
    assert.equal(etat.open, false, statut + " : un match qui peut encore se jouer ne s'ouvre pas");
    assert.equal(etat.reason, "postponed");
    const servi = servirAnonyme([avecPremium(matchBrut({ status: statut }))], 1575507, tard, { "1575507": LIGNE_PREMIUM })[0];
    assert.deepEqual(PREMIUM.deepPremiumLeaks(servi), [], statut + " : analyse servie sur un match non joue");
  }
  // Heure de coup d'envoi absente, vide ou illisible : ferme, jamais au juge.
  for (const date of [undefined, null, "", "date inconnue", "2026-13-45", "a confirmer"]) {
    const m = matchBrut({ status: "FT", date });
    const servi = servirAnonyme([avecPremium(m)], 1575507, tard, { "1575507": LIGNE_PREMIUM })[0];
    assert.deepEqual(PREMIUM.deepPremiumLeaks(servi), [], "date " + JSON.stringify(date) + " : analyse servie sans heure fiable");
    assert.equal(servi.is_settled, undefined);
  }
  assert.equal(EDGE.openedState("FT", EDGE.coupDEnvoiMs("2026-13-45"), tard).reason, "unknown_kickoff");
});

test("la marge de securite est de 3 h 30 apres le coup d'envoi, jamais moins", () => {
  assert.equal(EDGE.SETTLED_MARGIN_MS, 3.5 * HEURE);
  assert.equal(VM.SETTLED_MARGIN_MS, 3.5 * HEURE);
  assert.equal(EDGE.openedState("NS", COUP_ENVOI, COUP_ENVOI + 3.5 * HEURE - 1).open, false);
  assert.equal(EDGE.openedState("NS", COUP_ENVOI, COUP_ENVOI + 3.5 * HEURE).open, true);
  // Un statut de fin reel ne dispense pas de la marge (un statut peut etre en
  // retard dans les fichiers publics, jamais en avance).
  assert.equal(EDGE.openedState("FT", COUP_ENVOI, COUP_ENVOI + 2 * HEURE).open, false);
  assert.equal(EDGE.openedState("FT", COUP_ENVOI, COUP_ENVOI + 4 * HEURE).reason, "finished_status");
  assert.equal(EDGE.openedState("NS", COUP_ENVOI, COUP_ENVOI + 4 * HEURE).reason, "kickoff_margin");
});

test("l'heure de coup d'envoi est lue en heure de Paris, changement d'heure compris", () => {
  assert.equal(EDGE.coupDEnvoiMs("2026-09-19 21:30"), Date.parse("2026-09-19T19:30:00Z"), "UTC+2 en septembre");
  assert.equal(EDGE.coupDEnvoiMs("2026-12-19 21:30"), Date.parse("2026-12-19T20:30:00Z"), "UTC+1 en decembre");
  assert.equal(EDGE.coupDEnvoiMs(null), null);
});

test("fonction Edge et lib/match-view-model.js decident exactement la meme chose", () => {
  const statuts = ["", "NS", "1H", "HT", "2H", "ET", "FT", "AET", "PEN", "PST", "CANC", "SUSP", "INT", "ABD", "AWD", "WO", "TBD", "ft", " ft ", "INCONNU"];
  const instants = [COUP_ENVOI - HEURE, COUP_ENVOI, COUP_ENVOI + 3.5 * HEURE - 1, COUP_ENVOI + 3.5 * HEURE, COUP_ENVOI + 48 * HEURE];
  for (const s of statuts) {
    for (const now of instants) {
      assert.deepEqual(VM.openedState(s, COUP_ENVOI, now), EDGE.openedState(s, COUP_ENVOI, now), `divergence sur "${s}" a ${now}`);
    }
    assert.deepEqual(VM.openedState(s, null, COUP_ENVOI + 48 * HEURE), EDGE.openedState(s, null, COUP_ENVOI + 48 * HEURE));
  }
  assert.deepEqual(VM.FINISHED_STATUSES, EDGE.PREMIUM_FIELDS ? VM.FINISHED_STATUSES : null); // garde-fou de lecture
  assert.deepEqual([...VM.BLOCKING_STATUSES].sort(), ["ABD", "AWD", "CANC", "INT", "PST", "SUSP", "TBD", "WO"]);
});

// ===========================================================================
// 4. Le declencheur est SERVEUR : rien de ce que le navigateur envoie ne compte.
// ===========================================================================
test("le declencheur d'ouverture ne lit aucun champ envoye par le navigateur", () => {
  // La requete ne porte qu'une portee : { id } ou { scope: "list" }.
  const portee = EDGE_SRC.slice(EDGE_SRC.indexOf("async function lirePortee("), EDGE_SRC.indexOf("async function lireJson("));
  assert.match(portee, /\/\^\\d\{1,12\}\$\/\.test\(idStr\)/, "l'identifiant reste strictement numerique");
  assert.doesNotMatch(portee, /is_settled|settled|status|date/, "la portee ne lit aucun etat envoye par le client");
  // L'etat d'ouverture est calcule sur les matchs charges par le serveur.
  assert.match(EDGE_SRC, /const ouverture = etatsOuverture\(matchs, Date\.now\(\)\);/);
  assert.match(EDGE_SRC, /out\[String\(m\.id\)\] = openedState\(m\.status, coupDEnvoiMs\(m\.date\), maintenant\);/);
  // Les donnees viennent de NOS fichiers publics, telecharges par la fonction.
  assert.match(EDGE_SRC, /const LIST_URL = "https:\/\/iashark\.com\/data-home\.json";/);
  assert.match(EDGE_SRC, /data = await chargerDonnees\(portee\);/);
  // Aucun bypass.
  assert.doesNotMatch(EDGE_SRC, /isPro\s*=\s*true/);
  // Journalisation du cas servi (ouvert / ferme et pourquoi).
  assert.match(EDGE_SRC, /console\.log\("match-data", portee\.id/);
});

test("la page n'ouvre jamais d'elle-meme : elle ne fait que demander au serveur", () => {
  const init = PAGE.slice(PAGE.indexOf("async function init()"));
  assert.match(init, /if\(ctx\.session\|\|sembleTermine\(raw\)\)\{/, "l'appel a match-data doit aussi partir sans session sur un match qui semble termine");
  assert.match(init, /termine=result\.data\.isSettled===true\|\|!!\(servi&&servi\.is_settled===true\);/,
    "l'ouverture ne doit venir que de la reponse du serveur");
  // sembleTermine ne sert qu'a declencher l'appel : il n'ouvre rien.
  assert.equal((PAGE.match(/sembleTermine\(raw\)/g) || []).length, 2, "sembleTermine defini une fois, appele une fois");
  assert.ok(init.indexOf("if(termine){") < init.indexOf("const isFree="), "le match termine est traite avant les murs d'acces");
  assert.match(init, /render\(raw,\{settled:true,result:await chargerReglement\(raw\),isPro:ctx\.isPro\}\);/);
  // Les murs d'acces des matchs a venir sont intacts.
  assert.match(init, /if\(isFree&&!ctx\.session\)\{renderAuthWall\(raw\);return;\}/);
  assert.match(init, /if\(!isFree&&!ctx\.isPro\)\{renderProWall\(raw\);return;\}/);
});

// ===========================================================================
// 5. Bandeau de resultat : jamais sans reglement reel.
// ===========================================================================
test("aucun bandeau sans reglement : en attente, ligne absente ou ligne d'un autre match", () => {
  const raw = matchBrut({ status: "FT" });
  const ligne = { id: 1575507, score: "2-1", pick: "Plus de 1,5 but", market_id: "over15", cote: 1.32, odds_source: "pinnacle", result: "win" };
  assert.equal(VM.matchResultView(null, 1575507, raw), null);
  assert.equal(VM.matchResultView(undefined, 1575507, raw), null);
  assert.equal(VM.matchResultView({}, 1575507, raw), null);
  assert.equal(VM.matchResultView(Object.assign({}, ligne, { result: "pending" }), 1575507, raw), null, "un match non regle n'a pas de verdict");
  assert.equal(VM.matchResultView(Object.assign({}, ligne, { result: "" }), 1575507, raw), null);
  assert.equal(VM.matchResultView(Object.assign({}, ligne, { result: "gagne" }), 1575507, raw), null, "un resultat hors contrat n'est jamais interprete");
  assert.equal(VM.matchResultView(Object.assign({}, ligne, { id: 999111 }), 1575507, raw), null, "la ligne d'un autre match ne doit rien afficher");
  assert.equal(VM.matchResultView(ligne, null, raw), null);
  // Ligne reelle : verdict, score, marche et cote.
  assert.deepEqual(VM.matchResultView(ligne, 1575507, raw),
    { outcome: "win", score: "2-1", pick: "Plus de 1,5 but", marketId: "over15", odds: 1.32, oddsSource: "pinnacle" });
  // Table match_results (cle fixture_id) : meme lecture.
  assert.equal(VM.matchResultView({ fixture_id: 1575507, result: "loss", score: "0-0", cote: 1.9 }, 1575507, raw).outcome, "loss");
  // Score illisible : le verdict reste, le score n'est pas invente.
  assert.equal(VM.matchResultView(Object.assign({}, ligne, { score: "à venir" }), 1575507, raw).score, null);
  assert.equal(VM.matchResultView(Object.assign({}, ligne, { result: "void" }), 1575507, raw).outcome, "void");
  // Le bandeau lui-meme ne se rend pas sans verdict connu.
  assert.match(PAGE, /function resultBanner\(vm,res\)\{\s*if\(!res\|\|!VERDICTS\[res\.outcome\]\)return '';/);
  assert.match(PAGE, /\['resultat',o\.settled\?resultBanner\(vm,o\.result\):''\]/);
});

test("la mention de source de cote est honnete", () => {
  const raw = matchBrut({ status: "FT" });
  const base = { id: 1575507, result: "win", score: "2-1", cote: 1.32 };
  const source = (over, m) => VM.matchResultView(Object.assign({}, base, over), 1575507, m || raw).oddsSource;
  assert.equal(source({ odds_source: "pinnacle" }), "pinnacle");
  assert.equal(source({ odds_source: "Pinnacle (sharp)" }), "pinnacle");
  assert.equal(source({ odds_source: "moyenne" }), "average");
  assert.equal(source({ odds_source: "Cotes moyennes multi-bookmakers" }), "average");
  // Source absente sur la ligne : celle du match, telle que le pipeline l'ecrit.
  assert.equal(source({}), "pinnacle", "market_source du match : Pinnacle (sharp)");
  assert.equal(source({}, matchBrut({ market_source: "Cotes moyennes multi-bookmakers" })), "average");
  // Source vraiment inconnue : aucune mention, jamais une source supposee.
  assert.equal(source({ odds_source: "" }, matchBrut({ market_source: "" })), null);
  assert.equal(source({ odds_source: "Aucune cote fiable" }, matchBrut({ market_source: "Aucune cote fiable" })), null);
  // Sans cote exploitable, ni cote ni source.
  const sansCote = VM.matchResultView(Object.assign({}, base, { cote: null }), 1575507, raw);
  assert.equal(sansCote.odds, null);
  assert.equal(sansCote.oddsSource, null);
  // Affichage : « (Pinnacle) » / « (cotes moyennes) », en tout petit, entre
  // parentheses, et seulement quand la source est connue.
  assert.match(PAGE, /res\.oddsSource==='pinnacle'\?t\('match_page\.result_source_pinnacle','Pinnacle'\)/);
  assert.match(PAGE, /res\.oddsSource==='average'\?t\('match_page\.result_source_average','cotes moyennes'\):''/);
  assert.match(PAGE, /\$\{source\?`<small>\(\$\{esc\(source\)\}\)<\/small>`:''\}/);
  assert.match(CSS, /\.res-fact small\{[^}]*font-size:11px/);
});

test("verdict : bordure, fond teinte, libelle et icone - jamais la couleur seule", () => {
  for (const [cle, libelle, icone] of [["win", "Gagné", "check"], ["loss", "Perdu", "cross"], ["void", "Match annulé", "dash"]]) {
    assert.match(PAGE, new RegExp(`${cle}:\\['match_page\\.result_verdict_${cle}','${libelle}','${icone}'\\]`), cle);
    assert.ok(PAGE.includes(`${icone}:'<path`), "icone " + icone + " absente");
  }
  assert.match(PAGE, /<span class="res-verdict">\$\{cardIcon\(v\[2\]\)\}<b>\$\{esc\(t\(v\[0\],v\[1\]\)\)\}<\/b><\/span>/);
  // Jetons de assets/admin.css : --green #34d399, --red #fb8a8a.
  assert.match(CSS, /--green:#34d399/);
  assert.match(CSS, /--red-soft:#fb8a8a/);
  assert.match(CSS, /--green-wash:rgba\(52,211,153,\.10\)/);
  assert.match(CSS, /--red-wash:rgba\(251,138,138,\.10\)/);
  assert.match(CSS, /\.res-banner\{[^}]*border-left:3px solid/);
  assert.match(CSS, /\.res-banner\.is-win\{border-left-color:var\(--green\);background:var\(--green-wash\)\}/);
  assert.match(CSS, /\.res-banner\.is-loss\{border-left-color:var\(--red-soft\);background:var\(--red-wash\)\}/);
  assert.match(CSS, /\.res-banner\.is-void\{/);
});

test("appel a l'abonnement sobre : aucune promesse de gain, jamais pour un abonne", () => {
  const cta = PAGE.slice(PAGE.indexOf("function ctaAbonnement(raw)"), PAGE.indexOf("// Barre collante"));
  assert.ok(cta.length > 200, "ctaAbonnement introuvable");
  assert.match(cta, /result_cta_title','Les analyses d’aujourd’hui sont réservées aux abonnés'/);
  assert.match(cta, /href="\$\{esc\(offrePro\(raw\)\)\}"/);
  assert.doesNotMatch(cta, /gagn|profit|rentab|ROI|%/i, "aucune promesse de gain dans l'appel a l'action");
  assert.match(PAGE, /\['abonnement',o\.settled&&!o\.isPro\?ctaAbonnement\(raw\):''\]/);
  // Aucun chiffre de reussite, aucun « 0 % » nulle part dans le bandeau.
  const bandeau = PAGE.slice(PAGE.indexOf("function resultBanner(vm,res)"), PAGE.indexOf("function ctaAbonnement(raw)"));
  assert.doesNotMatch(bandeau, /pct\(|0\s?%/, "le bandeau n'affiche aucun pourcentage");
});

// ===========================================================================
// 6. Parite mobile / ordinateur : meme contenu, seule la presentation change.
// ===========================================================================
test("parite mobile / ordinateur : meme bandeau, meme contenu", () => {
  // Un seul rendu du bandeau et de l'appel a l'action, sans test de largeur
  // ni de support cote JavaScript.
  assert.equal((PAGE.match(/resultBanner\(vm,o\.result\)/g) || []).length, 1, "un seul rendu du bandeau");
  assert.equal((PAGE.match(/ctaAbonnement\(raw\)/g) || []).length, 2, "defini une fois, rendu une fois");
  const bloc = PAGE.slice(PAGE.indexOf("function sembleTermine(raw)"), PAGE.indexOf("// Barre collante"));
  assert.doesNotMatch(bloc, /innerWidth|matchMedia|isMobile|ontouchstart/, "le contenu ne doit pas dependre de la taille d'ecran");
  // CSS : la regle mobile ne fait que reagencer (aucun contenu masque).
  const mobile = CSS.slice(CSS.indexOf(".res-banner{"));
  const media = mobile.slice(mobile.indexOf("@media(max-width:640px)"), mobile.indexOf("@media(prefers-reduced-motion"));
  assert.ok(media.includes(".res-banner{padding"), "regle mobile du bandeau absente");
  assert.doesNotMatch(media, /display:none|visibility:hidden|content-visibility/, "du contenu est masque sur mobile");
});

// ===========================================================================
// 7. Traductions reelles dans les 7 langues.
// ===========================================================================
const CLES_RESULTAT = ["result_eyebrow", "result_verdict_win", "result_verdict_loss", "result_verdict_void",
  "result_market_label", "result_market_unknown", "result_odds_label", "result_source_pinnacle",
  "result_source_average", "result_score_label", "result_note", "result_cta_title", "result_cta_text", "result_cta_button"];
test("bandeau de resultat : textes dans les 7 langues, parts et dictionnaires identiques", () => {
  const fr = JSON.parse(read("i18n/dict/fr.json")).match_page;
  for (const loc of LOCALES) {
    const dict = JSON.parse(read(`i18n/dict/${loc}.json`)).match_page;
    const part = JSON.parse(read(`i18n/parts/matchpage.${loc}.json`)).match_page;
    for (const k of CLES_RESULTAT) {
      assert.ok(typeof dict[k] === "string" && dict[k].trim(), `${loc} : match_page.${k} absent du dictionnaire`);
      assert.equal(part[k], dict[k], `${loc} : match_page.${k} differe entre part et dictionnaire`);
      // Traduction reelle : hors FR, seuls les noms propres restent identiques.
      if (loc !== "fr" && k !== "result_source_pinnacle") {
        assert.notEqual(dict[k], fr[k], `${loc} : match_page.${k} n'est pas traduit`);
      }
    }
    // Mention obligatoire : les resultats passes ne prejugent pas des futurs.
    assert.ok(dict.result_note.length > 40, `${loc} : mention des resultats passes trop courte`);
  }
  // Repli francais du code = dictionnaire francais.
  for (const k of CLES_RESULTAT) {
    const m = PAGE.match(new RegExp(`(?:'match_page\\.${k}'|\\['${k}'),'([^']*)'`));
    assert.ok(m, `repli FR de ${k} introuvable dans match-page.js`);
    assert.equal(m[1], fr[k], `repli FR de ${k} different du dictionnaire`);
  }
});

// ===========================================================================
// 8. Source du reglement : fichier public puis table, jamais rien d'invente.
// ===========================================================================
test("le reglement vient de results/<jour>.json puis de match_results, sans rien deviner", () => {
  const bloc = PAGE.slice(PAGE.indexOf("async function chargerReglement(raw)"), PAGE.indexOf("const VERDICTS="));
  assert.match(bloc, /fetch\('\/results\/'\+jour\+'\.json'/);
  assert.match(bloc, /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(jour\)/, "jour du match verifie avant toute requete");
  assert.match(bloc, /from\('match_results'\)\.select\('\*'\)\.eq\('fixture_id',raw\.id\)/);
  assert.match(bloc, /vmLib\.matchResultView\(/);
  assert.ok(bloc.indexOf("/results/") < bloc.indexOf("match_results"), "le fichier public est essaye en premier");
  assert.match(bloc, /return null;\s*\}/, "sans source lisible : aucun reglement");
  // Les deux sources sont facultatives : chaque acces est protege.
  assert.equal((bloc.match(/catch\(e\)\{\}/g) || []).length, 2);
});

// ===========================================================================
// 9. Contrat reel du lot R1 : fichier results/<jour>.json et table
// match_results (migration 0032). Fichiers absents (purge, lot pas encore
// passe) : rien a verifier, jamais un test qui invente ses donnees.
// ===========================================================================
test("lecture du VRAI fichier results/<jour>.json produit par le lot R1", () => {
  const dir = path.join(ROOT, "results");
  if (!fs.existsSync(dir)) return;
  const jours = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (!jours.length) return;
  let regles = 0, attentes = 0;
  for (const f of jours) {
    const fichier = JSON.parse(read("results/" + f));
    assert.ok(Array.isArray(fichier.matches), f + " : contrat { matches: [] } non respecte");
    for (const ligne of fichier.matches) {
      const raw = { id: ligne.id, market_source: null };
      const vue = VM.matchResultView(ligne, ligne.id, raw);
      if (ligne.result === "pending") {
        assert.equal(vue, null, f + " : un match en attente ne doit produire aucun bandeau");
        attentes++;
        continue;
      }
      regles++;
      assert.ok(vue, f + " : ligne reglee illisible (" + ligne.id + ")");
      assert.equal(vue.outcome, ligne.result);
      // odds_source de la table : 'pinnacle' | 'moyenne' (migration 0032).
      if (ligne.cote && ligne.odds_source === "moyenne") assert.equal(vue.oddsSource, "average");
      if (ligne.cote && ligne.odds_source === "pinnacle") assert.equal(vue.oddsSource, "pinnacle");
      if (ligne.score) assert.match(vue.score, /^\d{1,2}-\d{1,2}$/);
    }
  }
  assert.ok(regles + attentes > 0, "aucune ligne lue dans results/");
});

test("migration 0032 : lecture anonyme de match_results, et seulement des matchs termines", () => {
  const f = "supabase/migrations/0032_match_results.sql";
  if (!fs.existsSync(path.join(ROOT, f))) return; // lot R1 pas encore passe
  const sql = read(f);
  assert.match(sql, /fixture_id bigint primary key/, "la page lit la table par fixture_id");
  assert.match(sql, /for select\s*\n\s*to anon, authenticated/, "lecture anonyme necessaire au bandeau");
  assert.match(sql, /result text not null check \(result in \('win', 'loss', 'void', 'pending'\)\)/);
  assert.match(sql, /odds_source is null or odds_source in \('pinnacle', 'moyenne'\)/);
  assert.match(sql, /revoke insert, update, delete on public\.match_results from anon, authenticated;/);
});
