"use strict";
// Traduction des textes editoriaux du pipeline (lib/narrative-i18n.js) et
// choix de la langue a l'affichage (lib/match-view-model.js#localizedNarrative).
// Aucune vraie requete API : la reponse du modele est une fixture.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const lib = require("../lib/narrative-i18n.js");
const { buildMatchViewModel, localizedNarrative } = require("../lib/match-view-model.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const fixture = (f) => JSON.parse(read("tests/fixtures/narrative-i18n/" + f));
const clone = (o) => JSON.parse(JSON.stringify(o));
const AN = fixture("analyse-fr.json");
const VALID = fixture("translation-valid.json");
const asModelText = (obj) => "```json\n" + JSON.stringify(obj) + "\n```";

// ---------------------------------------------------------------- source
test("la source ne reprend que les textes francais reellement produits", () => {
  const src = lib.extractTranslationSource(AN);
  assert.deepEqual(Object.keys(src).sort(), ["analyse_card", "buteurs_probables", "conseil", "contexte", "facteur_x", "scenario", "verdict_shark"]);
  assert.equal(src.score_central, undefined, "aucun champ non textuel ne part a la traduction");
  assert.equal(lib.extractTranslationSource(null), null);
  assert.equal(lib.extractTranslationSource({ contexte: "  ", scenario: { phase1: "" } }), null);
});

test("la requete demande toutes les langues cibles en un seul appel, sans parametre d'echantillonnage", () => {
  const req = lib.buildTranslationRequest(lib.extractTranslationSource(AN));
  assert.equal(req.model, "claude-haiku-4-5");
  assert.equal(req.messages.length, 1);
  assert.equal(req.temperature, undefined);
  for (const l of ["en", "es", "es-mx", "de", "it", "pt"]) assert.match(req.system, new RegExp('"' + l + '"'));
  assert.match(req.system, /momios/, "l'espagnol mexicain doit utiliser son vocabulaire");
  assert.match(req.system, /Never urge the reader to bet/);
  assert.match(req.system, /Never promise a win/);
  assert.equal(lib.buildTranslationRequest({ contexte: "x" }, { model: "claude-sonnet-5" }).model, "claude-sonnet-5");
});

// ------------------------------------------------------------ validation
test("une reponse valide (meme entouree de backticks) donne les 6 langues completes", () => {
  const src = lib.extractTranslationSource(AN);
  const { translations, errors } = lib.parseTranslationResponse(asModelText(VALID), src);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(translations).sort(), ["de", "en", "es", "es-mx", "it", "pt"]);
  assert.equal(translations.de.facteur_x, VALID.de.facteur_x);
  assert.deepEqual(Object.keys(translations.en.scenario), ["phase1", "phase2", "phase3"]);
  assert.equal(translations["es-mx"].buteurs["O. Dembélé"], VALID["es-mx"].buteurs_probables[0].raison);
});

test("JSON illisible ou tronque : aucune traduction, jamais d'invention", () => {
  const src = lib.extractTranslationSource(AN);
  const tronque = JSON.stringify(VALID).slice(0, 900);
  for (const brut of [tronque, "Voici la traduction :", "", null, "[1,2]"]) {
    const r = lib.parseTranslationResponse(brut, src);
    assert.deepEqual(r.translations, {});
    assert.ok(r.errors.length);
  }
});

test("une langue absente reste absente, les autres sont conservees", () => {
  const src = lib.extractTranslationSource(AN);
  const sansMx = clone(VALID); delete sansMx["es-mx"];
  const { translations, errors } = lib.parseTranslationResponse(JSON.stringify(sansMx), src);
  assert.equal(translations["es-mx"], undefined);
  assert.ok(translations.es && translations.pt);
  assert.ok(errors.some((e) => e.startsWith("es-mx")));
});

test("les cles de langue mal casees sont normalisees (es_MX -> es-mx)", () => {
  const src = lib.extractTranslationSource(AN);
  const variante = clone(VALID); variante.es_MX = variante["es-mx"]; delete variante["es-mx"];
  const { translations } = lib.parseTranslationResponse(JSON.stringify(variante), src);
  assert.ok(translations["es-mx"]);
});

test("un chiffre absent de la source rejette le champ (aucune affirmation ajoutee)", () => {
  const src = lib.extractTranslationSource(AN);
  const r = clone(VALID);
  r.en.facteur_x = "Monaco have kept a clean sheet only 1 time in their last 12 away matches.";
  r.en.scenario.phase3 = "Both teams score 30% of their goals in the last 15 minutes.";
  const { translations, errors } = lib.parseTranslationResponse(JSON.stringify(r), src);
  assert.equal(translations.en.facteur_x, undefined);
  assert.equal(translations.en.scenario, undefined, "scenario tout-ou-rien : une phase rejetee retire le scenario de la langue");
  assert.ok(translations.en.contexte, "les autres champs restent");
  assert.ok(errors.some((e) => /en\.facteur_x: chiffre absent/.test(e)));
});

test("separateurs decimaux et de milliers locaux acceptes (2,4 / 1,850)", () => {
  const src = { contexte: "Écart ELO : 1850 contre 1738, soit 2.4 buts attendus." };
  const tr = {};
  for (const l of lib.TARGET_LOCALES) tr[l] = { contexte: "ELO gap: 1,850 vs 1 738, i.e. 2,4 expected goals (" + l + ")." };
  tr.en.contexte = "ELO gap: 1,850 vs 1,738, i.e. 2.4 expected goals.";
  tr.it.contexte = "Divario ELO: 1 850 contro 1 738, cioè 2,4 gol attesi.";
  tr.pt.contexte = "Diferença ELO: 1850 contra 1 739, ou seja 2,4 golos esperados.";
  const { translations } = lib.parseTranslationResponse(JSON.stringify(tr), src);
  assert.ok(translations.en.contexte, "separateur de milliers anglais");
  assert.ok(translations.de.contexte, "espace simple de milliers + virgule decimale");
  assert.ok(translations.it.contexte, "espaces insecables");
  assert.equal(translations.pt, undefined, "1 739 n'est pas 1738 : chiffre modifie, rejete (seul champ -> langue absente)");
});

test("incitation a parier ou promesse de gain : champ rejete", () => {
  const src = lib.extractTranslationSource(AN);
  const r = clone(VALID);
  r.en.conseil = "Bet now on PSG's consistent attacking output at home.";
  r.es.conseil = "Victoria garantizada del PSG como local.";
  r.pt.conseil = "Aposte já na regularidade ofensiva do PSG em casa.";
  const { translations, errors } = lib.parseTranslationResponse(JSON.stringify(r), src);
  assert.equal(translations.en.conseil, undefined);
  assert.equal(translations.es.conseil, undefined);
  assert.equal(translations.pt.conseil, undefined);
  assert.ok(errors.some((e) => /incitation/.test(e)) && errors.some((e) => /promesse/.test(e)));
});

test("la garantie reste traduisible si la source francaise la mentionne deja (\"rien n'est garanti\")", () => {
  const src = { conseil: "Rien n'est garanti sur ce match." };
  const tr = {}; for (const l of lib.TARGET_LOCALES) tr[l] = { conseil: "Nothing is guaranteed in this match." };
  assert.ok(lib.parseTranslationResponse(JSON.stringify(tr), src).translations.en.conseil);
});

test("texte recopie du francais, vide ou demesure : rejete", () => {
  const src = lib.extractTranslationSource(AN);
  const r = clone(VALID);
  r.it.analyse_card = AN.analyse_card;
  r.de.contexte = "   ";
  r.en.contexte = "PSG #1 (form WWDWW) host Monaco #5 (form WLDWL). ".repeat(12);
  const { translations } = lib.parseTranslationResponse(JSON.stringify(r), src);
  assert.equal(translations.it.analyse_card, undefined);
  assert.equal(translations.de.contexte, undefined);
  assert.equal(translations.en.contexte, undefined);
});

test("buteurs : seul le joueur exact de la source est retenu, jamais un autre", () => {
  const src = lib.extractTranslationSource(AN);
  const r = clone(VALID);
  r.en.buteurs_probables = [{ joueur: "K. Mbappé", raison: "He averages 1.9 shots on target per 90 minutes." }, VALID.en.buteurs_probables[1]];
  const { translations } = lib.parseTranslationResponse(JSON.stringify(r), src);
  assert.deepEqual(Object.keys(translations.en.buteurs), ["M. Biereth"]);
});

// ------------------------------------------------- public / premium split
test("les jumeaux publics et premium ne se recoupent jamais", () => {
  for (const f of lib.PUBLIC_I18N_FIELDS) assert.ok(!lib.PREMIUM_I18N_FIELDS.includes(f));
  assert.deepEqual(lib.PREMIUM_I18N_FIELDS.sort(), ["facteur_x_i18n", "verdict_shark_i18n"]);
});

test("application : public sur le match, premium uniquement dans la ligne protegee, `an` intact", () => {
  const an = clone(AN);
  const src = lib.extractTranslationSource(an);
  const { translations } = lib.parseTranslationResponse(JSON.stringify(VALID), src);
  const matchObj = {
    analyse_card: an.analyse_card, conseil_public: an.conseil, contexte: an.contexte, scenario: an.scenario,
    top_scorers: [{ name: "O. Dembélé", analyse: an.buteurs_probables[0].raison }, { name: "Autre Joueur", analyse: null }]
  };
  const premiumRow = { fixture_id: 1, facteur_x: an.facteur_x, verdict_shark: an.verdict_shark, raw_response: an };
  const counts = lib.applyNarrativeI18n({ matchObj, premiumRow }, an, translations);

  assert.deepEqual(counts, { public: 4, premium: 2, topScorers: 1 });
  assert.equal(matchObj.analyse_card_i18n.de, VALID.de.analyse_card);
  assert.equal(matchObj.conseil_public_i18n.it, VALID.it.conseil);
  assert.equal(matchObj.contexte_i18n.pt, VALID.pt.contexte);
  assert.deepEqual(matchObj.scenario_i18n.en, VALID.en.scenario);
  assert.equal(matchObj.top_scorers[0].analyse_i18n.en, VALID.en.buteurs_probables[0].raison);
  assert.equal(matchObj.top_scorers[1].analyse_i18n, undefined, "pas de traduction sans texte francais");
  for (const k of lib.PREMIUM_I18N_FIELDS) assert.equal(matchObj[k], undefined, k + " ne doit jamais partir dans data.json");
  assert.ok(!JSON.stringify(matchObj).includes(VALID.en.facteur_x), "le texte premium traduit ne doit pas fuiter dans le match public");

  assert.equal(premiumRow.raw_response.narrative_i18n.facteur_x_i18n["es-mx"], VALID["es-mx"].facteur_x);
  assert.equal(premiumRow.raw_response.narrative_i18n.verdict_shark_i18n.en, VALID.en.verdict_shark);
  assert.equal(premiumRow.raw_response.facteur_x, an.facteur_x, "la reponse brute francaise est conservee");
  assert.equal(an.narrative_i18n, undefined, "l'objet `an` n'est jamais modifie");
  for (const k of Object.keys(premiumRow)) assert.ok(!/_i18n$/.test(k), "aucune nouvelle colonne : " + k);
});

test("analyse_card traduit le texte francais reellement publie (repli sur conseil)", () => {
  const an = clone(AN); delete an.analyse_card;
  const src = lib.extractTranslationSource(an);
  const r = clone(VALID); for (const l of lib.TARGET_LOCALES) delete r[l].analyse_card;
  const { translations } = lib.parseTranslationResponse(JSON.stringify(r), src);
  const built = lib.buildNarrativeI18n(an, translations);
  assert.equal(built.public.analyse_card_i18n.en, VALID.en.conseil);
  assert.equal(built.public.conseil_public_i18n.en, VALID.en.conseil);
});

test("une langue invalide n'apparait dans aucun jumeau", () => {
  const src = lib.extractTranslationSource(AN);
  const r = clone(VALID); r.it = "pas un objet";
  const { translations } = lib.parseTranslationResponse(JSON.stringify(r), src);
  const built = lib.buildNarrativeI18n(AN, translations);
  for (const k of Object.keys(built.public)) assert.equal(built.public[k].it, undefined);
  assert.equal(built.premium.facteur_x_i18n.it, undefined);
});

// -------------------------------------------------- choix a l'affichage
test("localizedNarrative : FR -> francais ; autre langue -> sa traduction ; es-mx -> es ; sinon rien", () => {
  const i18n = { en: "English", es: "Español", de: "Deutsch" };
  assert.equal(localizedNarrative("Français", i18n, "fr"), "Français");
  assert.equal(localizedNarrative("Français", i18n, undefined), "Français");
  assert.equal(localizedNarrative("Français", i18n, "en"), "English");
  assert.equal(localizedNarrative("Français", i18n, "es-mx"), "Español", "es-mx retombe sur es");
  assert.equal(localizedNarrative("Français", { es: "Español", "es-mx": "Mexicano" }, "es-mx"), "Mexicano");
  assert.equal(localizedNarrative("Français", i18n, "it"), null, "jamais de francais sur une page italienne");
  assert.equal(localizedNarrative("Français", { es: "Español" }, "pt"), null, "pt ne retombe pas sur es");
  assert.equal(localizedNarrative("Français", null, "de"), null);
  assert.equal(localizedNarrative("Français", ["English"], "en"), null);
  assert.equal(localizedNarrative("Français", { en: "   " }, "en"), null);
  assert.equal(localizedNarrative("", i18n, "en"), null, "pas de traduction orpheline sans texte francais");
});

test("view-model : les traductions suivent le champ francais reellement retenu", () => {
  const base = { home: { n: "PSG", id: 85 }, away: { n: "Monaco", id: 91 }, date: "2026-09-13 21:00" };
  const publicOnly = buildMatchViewModel({ ...base, conseil_public: "Conseil FR", conseil_public_i18n: { en: "Advice EN" } });
  assert.equal(publicOnly.editorial.decisiveFactor, "Conseil FR");
  assert.deepEqual(publicOnly.editorial.decisiveFactorI18n, { en: "Advice EN" });

  const pro = buildMatchViewModel({ ...base, facteur_x: "Facteur FR", facteur_x_i18n: { en: "Factor EN" }, conseil_public: "Conseil FR", conseil_public_i18n: { en: "Advice EN" } });
  assert.deepEqual(pro.editorial.decisiveFactorI18n, { en: "Factor EN" });

  const sansTraductionFacteur = buildMatchViewModel({ ...base, facteur_x: "Facteur FR", conseil_public: "Conseil FR", conseil_public_i18n: { en: "Advice EN" } });
  assert.equal(sansTraductionFacteur.editorial.decisiveFactorI18n, null, "jamais la traduction d'un autre texte que celui affiche en FR");
  assert.equal(localizedNarrative(sansTraductionFacteur.editorial.decisiveFactor, sansTraductionFacteur.editorial.decisiveFactorI18n, "en"), null);

  const sc = buildMatchViewModel({ ...base, scenario: AN.scenario, scenario_i18n: { en: VALID.en.scenario } });
  assert.equal(sc.editorial.scenarioI18n.en, [VALID.en.scenario.phase1, VALID.en.scenario.phase2, VALID.en.scenario.phase3].join(" "));
  const reading = buildMatchViewModel({ ...base, analyse_card: "Lecture FR", analyse_card_i18n: { de: "Lesart DE" } });
  assert.deepEqual(reading.editorial.readingI18n, { de: "Lesart DE" });
});

// ---------------------------------------------------------------- cablage
test("le pipeline traduit apres le FILET, avant toute copie publique, sans ecrire de jumeau premium dans le match", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /require\('\.\/lib\/narrative-i18n\.js'\)/);
  const iFilet = wf.indexOf("[FILET] aucune analyse precedente");
  const iTrad = wf.indexOf("await translateNarratives(");
  const iAll = wf.indexOf("var allMatchsData = matchsData.slice();");
  const iPublic = wf.indexOf("var matchsPublics=");
  const iPremium = wf.indexOf("await writePremiumData(premiumRows);");
  assert.ok(iFilet > 0 && iTrad > iFilet && iTrad < iAll && iTrad < iPublic && iTrad < iPremium);
  assert.doesNotMatch(wf, /facteur_x_i18n|verdict_shark_i18n/, "les jumeaux premium ne sont nommes que dans lib/narrative-i18n.js");
  assert.match(wf, /r\.stop_reason==='max_tokens'/, "une reponse tronquee n'est jamais exploitee");
});

test("les pages affichent la traduction du texte hors FR, jamais le francais", () => {
  const mp = read("match-page.js");
  assert.match(mp, /localizedNarrative\(v,i18n,window\.I18N\.locale\)/);
  assert.match(mp, /narratif\(vm\.editorial\.decisiveFactor,vm\.editorial\.decisiveFactorI18n\)/);
  const pp = read("player-page.js");
  assert.match(pp, /narratif\(ts\.analyse, ts\.analyse_i18n\)/);
  assert.doesNotMatch(pp, /ts\.analyse && estFr\(\)/);
});
