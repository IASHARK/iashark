"use strict";
// Contre-controle ronde 4 (30/09/2026). Preuve de l'avocat du diable : 12 pages
// publiees (6 accueils, 6 landings) disaient « sans jamais utiliser les cotes / never
// uses the odds / nunca usa las cuotas ». C'est vrai pour l'ancien moteur, FAUX des que
// MOTEUR_V3=1 : pour les championnats europeens, la probabilite v3 affichee melange le
// modele et la cote d'avant-match, et la cote y pese environ 4 fois plus
// (moteur-v3/CONTRAT_SORTIE.md §8, lib/moteur-v3.js#probabilitesSite).
// Ronde 4.2 (30/09/2026) : meme defaut sous les buteurs de chaque page de match,
// « Aucune cote de bookmaker / No bookmaker odds » (match_page.players_note). Cette carte
// calcule avec lambda_h/lambda_a, que le v3 remplace par ses buts attendus, eux-memes
// tires de la probabilite melangee (modele + cote) en Europe. Phrase retiree des 7 langues.
// Option prudente retenue : un texte VRAI AVEC LES DEUX MOTEURS (la phrase est retiree,
// rien d'autre n'est affirme). Ecrire « modele + cotes d'avant-match » sur les pages de
// match europeennes reste une decision de Clement.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(root, f), "utf8");
const existe = (f) => fs.existsSync(path.join(root, f));

// « Le calcul n'utilise jamais / pas les cotes », dans les 7 langues du site.
const SANS_COTES = /sans (?:jamais )?(?:utiliser |regarder )?les cotes|n['’]utilise (?:jamais|pas) les cotes|jamais influenc|never us(?:es|ing) the odds|without (?:using |looking at )?the odds|sin (?:usar nunca |mirar )?(?:las cuotas|los momios)|nunca usa (?:las cuotas|los momios|as odds)|ohne (?:jemals )?die Quoten|nie die Quoten|non usa mai le quote|senza (?:mai usare )?le quote|sem (?:nunca usar )?as odds|aucune cote de bookmaker|no bookmaker odds|sin (?:cuotas|momios) de casas de apuestas|keine buchmacherquoten|nessuna quota dei bookmaker|sem odds de casas de apostas/i;

const SOURCES = []
  .concat(["fr", "en", "es", "es-mx", "de", "it", "pt"].map((l) => "i18n/dict/" + l + ".json"))
  // Toutes les parties (ronde 4.2 : « Aucune cote de bookmaker » etait dans match.*.json).
  .concat(fs.readdirSync(path.join(root, "i18n", "parts")).filter((f) => f.endsWith(".json")).map((f) => "i18n/parts/" + f))
  .concat(fs.readdirSync(path.join(root, "i18n", "seo")).filter((f) => f.endsWith(".json")).map((f) => "i18n/seo/" + f))
  .concat(["scripts/i18n-manifest.js", "match-page.js"]);
const PAGES = ["index.html", "landing.html"]
  .concat(["fr", "en", "es", "gb", "za", "mx"].flatMap((d) => [d + "/index.html", d + "/landing.html"]))
  .filter(existe);

test("aucune page ni source de texte ne dit que le calcul n'utilise jamais les cotes (faux avec le v3)", () => {
  assert.ok(PAGES.length >= 13, "les 6 accueils, les 6 landings et la page racine sont relus");
  const trouves = [];
  for (const f of SOURCES.concat(PAGES)) {
    const t = lire(f).replace(/<[^>]+>/g, " ");
    const m = t.match(SANS_COTES);
    if (m) trouves.push(f + " : « " + m[0] + " »");
  }
  assert.deepEqual(trouves, []);
});

test("les pages portent le texte neutre de leur source (dictionnaire, textes SEO, manifeste)", () => {
  const dict = (l) => JSON.parse(lire("i18n/dict/" + l + ".json"));
  // Etape « Calcul » des landings : texte du dictionnaire, identique sur la page.
  assert.equal(dict("fr").landing_page.step2_desc, "Buts attendus, probabilité de chaque score, puis de chaque marché.");
  assert.equal(dict("en").landing_page.step2_desc, "Expected goals, the probability of every scoreline, then of every market.");
  for (const [page, l] of [["fr/landing.html", "fr"], ["landing.html", "fr"], ["en/landing.html", "en"], ["es/landing.html", "es"]]) {
    assert.ok(lire(page).includes(dict(l).landing_page.step2_desc), page);
  }
  // Landings pays ecrites a la main.
  for (const [page, l] of [["gb/landing.html", "en"], ["za/landing.html", "en"], ["mx/landing.html", "es-mx"]]) {
    assert.ok(lire(page).includes(dict(l).landing_page.step2_desc), page);
  }
  // Paragraphe « La methode en bref » des accueils : texte SEO de chaque version.
  for (const d of ["fr", "en", "es", "gb", "za", "mx"]) {
    const seo = JSON.parse(lire("i18n/seo/" + d + ".json"));
    const debut = seo.home.paragraphs[0].split(". ")[0];
    assert.ok(lire(d + "/index.html").includes(debut), d + "/index.html : " + debut);
    assert.doesNotMatch(seo.home.paragraphs[0], SANS_COTES, d);
  }
});

test("la raison : avec le v3, la probabilite affichee est celle du moteur (modele + cotes en Europe)", () => {
  const v3 = lire("lib/moteur-v3.js");
  assert.match(v3, /Object\.assign\(matchObj, probabilitesSite\(v3\)\);/);
  if (existe("moteur-v3/CONTRAT_SORTIE.md")) assert.match(lire("moteur-v3/CONTRAT_SORTIE.md"), /le marché y pèse environ 4 fois plus/);
});

test("buteurs de la page de match : la note ne dit plus « aucune cote de bookmaker » (faux avec le v3)", () => {
  const LANGUES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  for (const l of LANGUES) {
    for (const f of ["i18n/dict/" + l + ".json", "i18n/parts/match." + l + ".json"]) {
      const note = JSON.parse(lire(f)).match_page.players_note;
      assert.ok(note && note.length > 40, f + " : la note reste (titulaires probables, tirs, buts attendus)");
      assert.doesNotMatch(note, SANS_COTES, f);
    }
  }
  const js = lire("match-page.js");
  const repli = js.slice(js.indexOf("match_page.players_note"), js.indexOf("match_page.players_note") + 300);
  assert.doesNotMatch(repli, SANS_COTES, "texte de secours de match-page.js");
  // La raison : la carte des buteurs lit les buts attendus du match, que le v3 remplace.
  assert.match(lire("lib/moteur-v3.js"), /lambda_h/);
});
