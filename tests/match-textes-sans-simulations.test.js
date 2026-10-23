"use strict";
// Page match : aucun nombre de simulations annonce (24/10/2026, verdict ROUGE de
// historique-public). Les chances affichees viennent des cotes (marge retiree) ou du
// moteur v3, jamais de tirages au hasard : le champ simulation_count de l'ancien moteur
// ne doit plus etre ecrit sur la page. La rubrique sim_resume est un pourcentage ecrit
// sur 10 000 : son titre dit « ramené à 10 000 matchs », jamais « se jouait 10 000 fois ».
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
// Textes de la page match : espaces match_page et match_v4 des dictionnaires, et les
// morceaux qui les alimentent (app.*, matchv4.*).
const NS_PAGE = ["match_page", "match_v4"];

function chaines(o, chemin, out) {
  if (typeof o === "string") out.push([chemin, o]);
  else if (o && typeof o === "object") for (const k of Object.keys(o)) chaines(o[k], chemin ? chemin + "." + k : k, out);
  return out;
}
function textesPageMatch() {
  const out = [];
  for (const l of LOCALES) {
    const dict = JSON.parse(read("i18n/dict/" + l + ".json"));
    for (const ns of NS_PAGE) chaines(dict[ns], l + ":" + ns, out);
    for (const part of ["app", "matchv4"]) {
      const f = "i18n/parts/" + part + "." + l + ".json";
      chaines(JSON.parse(read(f)), f, out);
    }
  }
  return out;
}

// « 5 000 simulations de Monte-Carlo », « {n} Monte Carlo simulations »,
// « {n} Monte-Carlo-Simulationen »... : un nombre (ou {n}) avec Monte-Carlo ou simulations.
const NOMBRE = String.raw`(?:\{n\}|\d[\d\s.,  ]*)`;
const SIMULATIONS_CHIFFREES = [
  new RegExp(NOMBRE + String.raw`\s*(?:simulations?|simulaciones|simulações|simulazioni)\b`, "i"),
  new RegExp(NOMBRE + String.raw`\s*monte[\s-]?carlo`, "i"),
];
const MONTE_CARLO = /monte[\s-]?carlo/i;
// « Si ce match se jouait 10 000 fois » et ses traductions d'avant le 24/10/2026.
const JOUE_10000_FOIS = [
  /se\s+jouait\s+10/i,
  /played\s+10[\s.,  ]?000\s+times/i,
  /se\s+jugara\s+10/i,
  /10[\s.,  ]?000\s+Mal\s+gespielt/i,
  /si\s+giocasse\s+10/i,
  /disputado\s+10[\s.,  ]?000\s+vezes/i,
];

test("page match : jamais « N simulations de Monte-Carlo » dans les textes, aucune langue", () => {
  const fautes = [];
  for (const [ou, s] of textesPageMatch()) {
    const chiffre = /\{n\}|\d/.test(s);
    if (SIMULATIONS_CHIFFREES.some((re) => re.test(s)) || (MONTE_CARLO.test(s) && chiffre)) fautes.push(ou + " : " + s);
  }
  assert.deepEqual(fautes, []);
});

test("page match : jamais « se jouait 10 000 fois », aucune langue (textes et replis du code)", () => {
  const fautes = [];
  for (const [ou, s] of textesPageMatch()) if (JOUE_10000_FOIS.some((re) => re.test(s))) fautes.push(ou + " : " + s);
  for (const f of ["match-page.js", "lib/match-sections.js", "match.html"]) {
    const src = read(f);
    for (const re of JOUE_10000_FOIS) if (re.test(src)) fautes.push(f + " : " + re);
    for (const re of SIMULATIONS_CHIFFREES) if (re.test(src)) fautes.push(f + " : " + re);
  }
  assert.deepEqual(fautes, []);
});

test("titre de la rubrique : « Ce match ramené à 10 000 matchs » (formule de l'offre Pro)", () => {
  const attendu = {
    fr: "Ce match ramené à 10 000 matchs",
    en: "This match scaled to 10,000 matches",
    es: "Este partido llevado a 10 000 partidos",
    "es-mx": "Este partido llevado a 10,000 partidos",
    de: "Dieses Spiel auf 10.000 Spiele hochgerechnet",
    it: "Questa partita riportata a 10.000 partite",
    pt: "Este jogo levado a 10 000 jogos",
  };
  for (const l of LOCALES) {
    const dict = JSON.parse(read("i18n/dict/" + l + ".json"));
    const part = JSON.parse(read("i18n/parts/matchv4." + l + ".json"));
    assert.equal(dict.match_v4.sim_title, attendu[l], l + " (dict)");
    assert.equal(part.match_v4.sim_title, attendu[l], l + " (parts)");
    assert.ok(dict.match_v4.whatif_note5.includes(attendu[l]), l + " : la note « Et si » cite le meme titre");
  }
  assert.match(read("lib/match-sections.js"), /t\("match_v4\.sim_title", "Ce match ramené à 10 000 matchs"\)/);
});

test("questions frequentes : le nombre de simulations n'est plus lu ni ecrit", () => {
  const js = read("match-page.js");
  const debut = js.indexOf("function faqCarte(vm)");
  assert.ok(debut >= 0, "faqCarte introuvable");
  const faq = js.slice(debut, js.indexOf("\n}\n", debut));
  assert.doesNotMatch(faq, /simulationCount|simulation_count|faq_basis_sims|Monte/i);
  assert.match(faq, /faq_basis_sources/);
  assert.match(faq, /faq_basis_quality/);
  for (const l of LOCALES) {
    const dict = JSON.parse(read("i18n/dict/" + l + ".json"));
    const part = JSON.parse(read("i18n/parts/app." + l + ".json"));
    assert.ok(!("faq_basis_sims" in dict.match_page), l + " : faq_basis_sims encore dans le dictionnaire");
    assert.ok(!("faq_basis_sims" in part.match_page), l + " : faq_basis_sims encore dans app." + l + ".json");
  }
});
