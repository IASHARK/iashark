"use strict";
// Question « Sur quoi repose cette analyse ? » de la page match (24/10/2026, verdict ORANGE
// de l'avocat du diable). Sur la page anglaise on lisait : « The analysis relies on data
// from Fixtures and teams, Événements des matchs précédents, Injuries and suspensions,
// Cotes du marché and a data quality score of 70/100 ». Cause : match-page.js
// (SOURCES_CLES) attendait d'autres libelles que ceux ecrits par
// lib/display-data.js#sourceLabels. Ce test construit la VRAIE reponse (faqCarte de
// match-page.js, dictionnaires i18n/dict) dans les 7 langues avec les libelles relus
// dans sourceLabels, et echoue si un mot francais reste hors de la page francaise.
// Il verifie aussi la tournure : qualite entre parentheses, absente si le score manque.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const display = require("../lib/display-data.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const CLES_SOURCES = ["source_fixtures", "source_team_stats", "source_events", "source_injuries", "source_market"];
const CLES_REPONSE = ["faq_q_basis", "faq_basis_with_quality", "faq_basis_no_quality"];

// Balises de langue de i18n/i18n.js (LOCALE_INTL), pour les nombres au format de la page.
const INTL = vm.runInNewContext("(" + read("i18n/i18n.js").match(/var LOCALE_INTL = (\{[^}]*\})/)[1] + ")");

// Tous les libelles que sourceLabels peut ecrire, relus dans son code.
function libellesDeSourceLabels() {
  const src = read("lib/display-data.js");
  const corps = src.slice(src.indexOf("function sourceLabels("), src.indexOf("function hasReliableModelOutput("));
  return [...corps.matchAll(/(?:labels=\[|labels\.push\()'([^']+)'/g)].map((m) => m[1]);
}
// Un match ou sourceLabels sort ses 5 libelles.
const BRUT_COMPLET = {
  crit_home: { source: "api-sports-team-statistics", sample_size: 8, att: 1.2, def: 0.9, fr: 1 },
  crit_away: { source: "api-sports-team-statistics", sample_size: 8, att: 1, def: 1.1, fr: 1 },
  events_home: { source: "api-sports-fixture-events", games: 8, slots: [1, 1, 1, 1, 1, 1], slots_against: [1, 1, 1, 1, 1, 1] },
  events_away: { source: "api-sports-fixture-events", games: 8, slots: [1, 1, 1, 1, 1, 1], slots_against: [1, 1, 1, 1, 1, 1] },
  injuries: [{ player: "X" }],
  market_source: "Pinnacle",
};

// faqCarte de match-page.js, executee telle quelle avec le dictionnaire de la langue.
const MP = read("match-page.js");
function morceau(debut, fin) {
  const i = MP.indexOf(debut);
  assert.ok(i >= 0, "introuvable dans match-page.js : " + debut);
  const j = MP.indexOf(fin, i);
  assert.ok(j > i, "introuvable dans match-page.js : " + fin);
  return MP.slice(i, j);
}
const fonction = (nom) => morceau("function " + nom + "(", "\n}\n") + "\n}\n";
const CODE = [
  "const window=globalThis.__win;",
  morceau("function t(key,fallback)", "const img="),
  "const lucide=()=>'';const dateHeure=()=>({});const marcheFr=(vm,x)=>String(x);",
  fonction("etatAnalyse"),
  fonction("carteX"),
  // Libelles des sources (SOURCES_CLES, libelleSource) puis faqCarte.
  morceau("const SOURCES_CLES", "function faqCarte(vm)") + fonction("faqCarte"),
  "globalThis.__faq=faqCarte;",
].join("\n");

const dicts = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const get = (o, cle) => cle.split(".").reduce((c, k) => (c == null ? null : c[k]), o);
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function reponseBases(l, sources, quality) {
  const dict = dicts[l];
  const win = { I18N: { locale: l, dict, t: (k, fb) => { const v = get(dict, k); return v != null ? v : fb != null ? fb : k; }, localeTag: () => INTL[l] } };
  const ctx = vm.createContext({ __win: win });
  vm.runInContext(CODE, ctx);
  const html = ctx.__faq({
    _raw: { no_signal: true },
    identity: { home: { name: "Arsenal" }, away: { name: "Chelsea" } },
    editorial: { exclusiveFacts: {}, goalTiming: null },
    form: {},
    model: { recommendation: null, sources, quality },
  });
  const question = get(dict, "match_page.faq_q_basis");
  for (const m of html.matchAll(/<summary><span>(.*?)<\/span><\/summary><p>(.*?)<\/p>/g)) {
    if (decode(m[1]) === question) return decode(m[2]);
  }
  return null;
}

// Mots francais de la reponse (libelles et tournure). « suspensions » et « analyse »
// existent aussi en anglais / allemand : non retenus.
const MOTS_FR = ["Calendrier", "équipes", "Statistiques", "Événements", "matchs", "précédents", "Blessures", "Cotes", "marché", "données", "qualité", "appuie", "score de"];
const motsFrancais = (s) => MOTS_FR.filter((w) => new RegExp("(?<!\\p{L})" + w + "(?!\\p{L})", "iu").test(s));

test("sourceLabels : 5 libelles possibles, tous sortis par un match complet", () => {
  const libelles = libellesDeSourceLabels();
  assert.deepEqual(libelles, ["Calendrier et équipes", "Statistiques des équipes", "Événements des matchs précédents", "Blessures et suspensions", "Cotes du marché"]);
  assert.deepEqual(display.sourceLabels(BRUT_COMPLET), libelles);
});

test("cles des sources et de la reponse : presentes dans les 7 langues, identiques dans i18n/dict et i18n/parts", () => {
  for (const l of LOCALES) {
    const part = JSON.parse(read("i18n/parts/app." + l + ".json"));
    for (const k of CLES_SOURCES.concat(CLES_REPONSE)) {
      const v = dicts[l].match_page[k];
      assert.equal(typeof v, "string", l + " : match_page." + k + " absente de i18n/dict");
      assert.ok(v.trim(), l + " : match_page." + k + " vide");
      assert.equal(part.match_page[k], v, l + " : match_page." + k + " differente entre i18n/dict et i18n/parts");
    }
  }
});

test("reponse « Sur quoi repose cette analyse ? » : aucun mot francais hors de la page francaise, 7 langues", () => {
  const sources = display.sourceLabels(BRUT_COMPLET);
  const fautes = [];
  for (const l of LOCALES) {
    const r = reponseBases(l, sources, 70);
    assert.ok(r, l + " : question absente");
    // Chaque source sort avec SA traduction.
    for (const k of CLES_SOURCES) {
      const lib = dicts[l].match_page[k];
      if (!r.includes(lib)) fautes.push(l + " : libelle « " + lib + " » (" + k + ") absent de « " + r + " »");
    }
    if (l !== "fr") {
      const mots = motsFrancais(r);
      if (mots.length) fautes.push(l + " : mots francais [" + mots.join(", ") + "] dans « " + r + " »");
    }
  }
  assert.deepEqual(fautes, []);
});

test("tournure : qualite entre parentheses, rien si le score est absent, nul ou 0", () => {
  const sources = display.sourceLabels(BRUT_COMPLET);
  assert.equal(
    reponseBases("fr", sources, 70),
    "L’analyse s’appuie sur les données Calendrier et équipes, Statistiques des équipes, Événements des matchs précédents, Blessures et suspensions, Cotes du marché (qualité des données : 70/100). Les probabilités décrivent une fréquence attendue sur un grand nombre de matchs semblables, jamais une certitude sur celui-ci."
  );
  for (const l of LOCALES) {
    const avec = reponseBases(l, sources, 70);
    assert.match(avec, /\([^()]*70\/100\)\. /, l + " : qualite entre parentheses, juste avant le point : « " + avec + " »");
    assert.doesNotMatch(avec, /score/i, l + " : plus de « score de qualite » : « " + avec + " »");
    for (const q of [null, undefined, "", 0]) {
      const sans = reponseBases(l, sources, q);
      assert.ok(sans, l + " : la question reste sans score (" + q + ")");
      assert.doesNotMatch(sans, /\(|\/100/, l + " : aucune parenthese sans score (" + q + ") : « " + sans + " »");
    }
  }
});
