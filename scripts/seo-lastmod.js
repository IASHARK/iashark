"use strict";
// <lastmod> des sitemaps, exact et verifiable (Google Search Central, "Build
// and submit a sitemap" : lastmod n'est utilise que s'il est "consistently and
// verifiably accurate"). Avant : chaque URL recevait la date du jour a chaque
// build, donc Google ignorait le champ.
//
// Principe : un registre seo-lastmod.json (racine du depot, jamais publie :
// scripts/build-public.js ne copie que des fichiers publics) garde, par groupe
// de sitemap et par URL, une empreinte du contenu servi et la date a laquelle
// cette empreinte a change pour la derniere fois. Contenu identique -> date
// conservee ; contenu different -> date du jour. Le pipeline quotidien commite
// le registre avec les sitemaps (.github/workflows/update-data.yml).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = "seo-lastmod.json";

function load(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, FILE), "utf8")); } catch (e) { return {}; }
}

function write(dir, reg) {
  var sorted = {};
  Object.keys(reg).sort().forEach(function (g) {
    var o = {};
    Object.keys(reg[g]).sort().forEach(function (k) { o[k] = reg[g][k]; });
    sorted[g] = o;
  });
  var s = JSON.stringify(sorted, null, 1) + "\n";
  var p = path.join(dir, FILE);
  if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== s) fs.writeFileSync(p, s);
}

// Champs techniques qui changent a chaque run sans changer ce que lit le
// visiteur : exclus de l'empreinte.
function normalize(content) {
  return String(content)
    .replace(/"pipeline_sha":"[^"]*"/g, "")
    .replace(/"generated_at":"[^"]*"/g, "")
    .replace(/"run_id":"[^"]*"/g, "");
}

function fingerprint(content) {
  return crypto.createHash("sha1").update(normalize(content)).digest("hex").slice(0, 16);
}

// tracker(dir, group, today) -> { lastmod(loc, content, firstSeen), save() }
// firstSeen : date connue a utiliser la premiere fois qu'une URL est vue
// (ex. dateModified d'un article) ; sinon la date du jour.
// save() remplace le groupe par les URLs vues pendant ce passage (les URLs
// retirees sortent du registre) et relit le fichier juste avant d'ecrire, pour
// ne jamais ecraser les autres groupes.
function tracker(dir, group, today) {
  var prev = load(dir)[group] || {};
  var next = {};
  return {
    lastmod: function (loc, content, firstSeen) {
      var h = fingerprint(content);
      var e = prev[loc];
      var d = e ? (e.h === h ? e.d : today) : (firstSeen || today);
      if (firstSeen && e && e.h !== h && firstSeen > d) d = firstSeen;
      next[loc] = { h: h, d: d };
      return d;
    },
    save: function () {
      var reg = load(dir);
      reg[group] = next;
      write(dir, reg);
    }
  };
}

module.exports = { FILE: FILE, tracker: tracker, fingerprint: fingerprint, load: load };
