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

test("i18n: aucune valeur de dictionnaire n'est vide (pas de faux placeholder)", () => {
  LOCALES.supported.forEach(function (loc) {
    var dict = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/dict/" + loc + ".json"), "utf8"));
    flatten(dict).forEach(function (keyPath) {
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
    });
  });
});
