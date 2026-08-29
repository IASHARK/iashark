"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const LOCALES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales.json"), "utf8"));

function flatten(obj, prefix) {
  var keys = [];
  for (var k in obj) {
    var p = prefix ? prefix + "." + k : k;
    if (obj[k] && typeof obj[k] === "object") keys = keys.concat(flatten(obj[k], p));
    else keys.push(p);
  }
  return keys.sort();
}

test("i18n: tous les dictionnaires ont exactement les memes cles (aucune traduction manquante)", () => {
  var ref = null;
  LOCALES.supported.forEach(function (loc) {
    var dict = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/dict/" + loc + ".json"), "utf8"));
    var keys = flatten(dict);
    if (!ref) { ref = keys; return; }
    assert.deepEqual(keys, ref, "cles manquantes/en trop dans " + loc + ".json par rapport a " + LOCALES.default);
  });
});

// Cles ou une chaine vide est un choix linguistique legitime (pas un oubli
// de traduction) - ex. tools_page.kelly_applied_prefix : en francais "Kelly
// quart applique..." a le mot Kelly en prefixe, mais en anglais l'ordre
// naturel est "Quarter Kelly applied..." (Kelly passe dans le suffixe),
// donc le prefixe est legitimement vide pour cette langue.
// Cle = "locale.chemin.dans.le.dictionnaire" (precis par locale : un champ
// peut etre legitimement vide dans une langue et pas dans une autre, quand
// l'ordre des mots differe - ex. "Kelly quart applique" (FR, prefixe) vs
// "Quarter Kelly applied" (EN, le mot Kelly passe dans le suffixe)).
var ALLOWED_EMPTY = new Set([
  "en.tools_page.kelly_applied_prefix", "de.tools_page.kelly_applied_prefix",
  // landing_page.strip_* : le "signal strip" FR est "MODÈLE POISSON" (prefixe
  // + mot en gras) mais EN/DE composent des mots-valises ("POISSON MODEL",
  // "MONTE-CARLO-SIMULATION") sans prefixe separe.
  "en.landing_page.strip_poisson", "en.landing_page.strip_mc", "en.landing_page.strip_elo", "en.landing_page.strip_shin", "en.landing_page.strip_kelly",
  "de.landing_page.strip_poisson", "de.landing_page.strip_mc", "de.landing_page.strip_elo", "de.landing_page.strip_shin", "de.landing_page.strip_kelly"
]);

test("i18n: aucune valeur de dictionnaire n'est vide (pas de faux placeholder)", () => {
  LOCALES.supported.forEach(function (loc) {
    var dict = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/dict/" + loc + ".json"), "utf8"));
    flatten(dict).forEach(function (keyPath) {
      if (ALLOWED_EMPTY.has(loc + "." + keyPath)) return;
      var v = keyPath.split(".").reduce(function (o, k) { return o[k]; }, dict);
      assert.ok(typeof v === "string" && v.trim().length > 0, loc + "." + keyPath + " est vide");
    });
  });
});

test("i18n: build-locales.js s'execute sans erreur et produit un JS valide par locale", () => {
  execFileSync("node", ["scripts/build-locales.js"], { cwd: ROOT });
  var manifest = require(path.join(ROOT, "scripts/i18n-manifest.js"));
  manifest.forEach(function (page) {
    LOCALES.supported.forEach(function (loc) {
      var filePath = path.join(ROOT, loc, page.file);
      assert.ok(fs.existsSync(filePath), "fichier genere manquant: " + filePath);
      var html = fs.readFileSync(filePath, "utf8");

      // hreflang complet (6 langues + x-default) et canonical present.
      LOCALES.supported.forEach(function (l2) {
        assert.match(html, new RegExp('hreflang="' + l2 + '"'), "hreflang " + l2 + " manquant dans " + filePath);
      });
      assert.match(html, /hreflang="x-default"/, "hreflang x-default manquant dans " + filePath);
      assert.match(html, /<link rel="canonical" href="https:\/\/iashark\.com\/[a-z]{2}\//, "canonical manquant/incorrect dans " + filePath);
      assert.match(html, new RegExp('<html lang="' + loc + '">'), "html lang incorrect dans " + filePath);

      // Le JS embarque doit rester syntaxiquement valide - c'est la ou une
      // apostrophe non echappee dans une traduction casserait silencieusement
      // la page (voir le bug reel AUJOURD'HUI corrige dans ce jalon).
      var scripts = html.match(/<script>\n([\s\S]*?)<\/script>/g) || [];
      scripts.forEach(function (block, i) {
        var code = block.replace(/^<script>\n/, "").replace(/<\/script>$/, "");
        assert.doesNotThrow(function () {
          new Function(code);
        }, loc + "/" + page.file + " script#" + i + " : JS invalide (verifier les apostrophes non echappees dans le dictionnaire)");
      });

      // Tout script type="application/ld+json" doit rester du JSON valide -
      // \' n'est PAS un echappement JSON valide (contrairement a un litteral
      // JS) et casserait JSON.parse cote navigateur si une traduction avec
      // apostrophe etait injectee avec l'echappement JS par erreur (bug reel
      // trouve et corrige : home_page.org_description sur index.html).
      var jsonLdBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
      jsonLdBlocks.forEach(function (block, i) {
        var jsonText = block.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, "");
        assert.doesNotThrow(function () {
          JSON.parse(jsonText);
        }, loc + "/" + page.file + " JSON-LD#" + i + " : JSON invalide (verifier l'echappement des apostrophes dans le dictionnaire - JSON n'echappe jamais l'apostrophe)");
      });

      // Aucune sequence \' ne doit fuiter dans le HTML statique (hors balises
      // <script>) : ce serait un backslash visible a l'ecran, symptome du
      // meme bug (echappement JS applique a tort a du texte HTML brut - bug
      // reel trouve et corrige : tools_page.calc_prob_hint/kelly_hint_static
      // sur pro.html).
      var htmlOutsideScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
      assert.doesNotMatch(
        htmlOutsideScripts, /\\'/,
        loc + "/" + page.file + " : sequence \\' qui fuite dans le HTML statique (echappement JS applique par erreur a du texte HTML)"
      );
    });
  });
});
