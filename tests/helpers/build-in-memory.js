#!/usr/bin/env node
"use strict";
// Lance scripts/build-locales.js COMPLET avec une autre configuration GEO, sans
// rien ecrire sur le disque : config/markets.json est servi depuis le fichier
// passe en argument, chaque ecriture du build est gardee en memoire. Sortie
// (stdout, JSON) : { files: { "<chemin relatif>": contenu }, written: n } pour
// les chemins demandes (contenu genere, ou fichier du depot si le build ne l'a
// pas change : meme resultat que la configuration soit deja bascule ou non).
//
//   node tests/helpers/build-in-memory.js <config.json> <chemin> [<chemin>...]
//   <chemin> finissant par "/" = toutes les pages .html de ce repertoire
//   (niveau 1), generees ou inchangees.
//
// A lancer dans un processus a part (tests/usd-switch.test.js) : le module fs
// est modifie pour toute la duree du processus.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CONFIG = path.join(ROOT, "config", "markets.json");
const [cfgFile, ...wanted] = process.argv.slice(2);
if (!cfgFile || !wanted.length) {
  console.error("usage : node tests/helpers/build-in-memory.js <config.json> <chemin>...");
  process.exit(2);
}
const cfgText = fs.readFileSync(cfgFile, "utf8");
JSON.parse(cfgText);

const mem = new Map();
const real = { readFileSync: fs.readFileSync, existsSync: fs.existsSync, writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync, unlinkSync: fs.unlinkSync };
const underRoot = (p) => typeof p === "string" && path.resolve(p).startsWith(ROOT + path.sep);
const key = (p) => path.resolve(p);
function encoded(text, opt) {
  const enc = typeof opt === "string" ? opt : opt && opt.encoding;
  return enc ? text : Buffer.from(text, "utf8");
}

fs.readFileSync = function (p, opt) {
  if (typeof p === "string") {
    const k = key(p);
    if (k === CONFIG) return encoded(cfgText, opt);
    if (mem.has(k)) return encoded(mem.get(k), opt);
  }
  return real.readFileSync.apply(fs, arguments);
};
fs.existsSync = function (p) {
  if (typeof p === "string" && mem.has(key(p))) return true;
  return real.existsSync.apply(fs, arguments);
};
fs.writeFileSync = function (p, data) {
  if (!underRoot(p)) return real.writeFileSync.apply(fs, arguments);
  mem.set(key(p), Buffer.isBuffer(data) ? data.toString("utf8") : String(data));
};
fs.mkdirSync = function (p) {
  if (!underRoot(p)) return real.mkdirSync.apply(fs, arguments);
  return undefined;
};
fs.unlinkSync = function (p) {
  if (!underRoot(p)) return real.unlinkSync.apply(fs, arguments);
  mem.delete(key(p));
};

// Journal du build sur stderr : stdout ne porte que le JSON.
console.log = function () { process.stderr.write(Array.prototype.join.call(arguments, " ") + "\n"); };
require(path.join(ROOT, "scripts", "build-locales.js")).build();

const files = {};
for (const w of wanted) {
  if (w.endsWith("/")) {
    const dir = path.join(ROOT, w);
    const names = new Set(real.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".html")) : []);
    for (const k of mem.keys()) if (path.dirname(k) === path.resolve(dir) && k.endsWith(".html")) names.add(path.basename(k));
    for (const n of names) {
      const k = path.join(dir, n);
      files[path.relative(ROOT, k)] = mem.has(k) ? mem.get(k) : real.readFileSync(k, "utf8");
    }
    continue;
  }
  const k = path.join(ROOT, w);
  files[w] = mem.has(k) ? mem.get(k) : (real.existsSync(k) ? real.readFileSync(k, "utf8") : null);
}
process.stdout.write(JSON.stringify({ files: files, written: mem.size }));
