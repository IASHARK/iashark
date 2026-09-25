"use strict";
// Repertoires publics du site (25/09/2026) : cles de config/markets.json#_dirs
// MOINS les versions retirees (config/markets.json#_retiredDirs, ex. de/it/pt
// -> 301 vers /en/). La configuration d'un repertoire retire reste dans _dirs
// (e-mails des comptes existants) mais aucune page n'est generee pour lui.
const fs = require("fs");
const path = require("path");

const MARKETS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "config/markets.json"), "utf8"));
const RETIRED = MARKETS._retiredDirs || {};

function isRetired(dir) { return Object.prototype.hasOwnProperty.call(RETIRED, dir); }
function publicDirs(markets) {
  const m = markets || MARKETS;
  const retired = m._retiredDirs || {};
  return Object.keys(m._dirs).filter((d) => !Object.prototype.hasOwnProperty.call(retired, d));
}
// Repertoire qui sert reellement une URL /<dir>/... (repli 301 si retire).
function servedDir(dir) { return isRetired(dir) ? RETIRED[dir] : dir; }

// Chemin relatif ("de/compte.html") -> fichier qui le sert reellement : un
// repertoire retire est remplace par son repli ("en/compte.html"), a condition
// que _redirects declare bien la 301 "/de/*  /en/:splat  301!" (sinon le lien
// serait mort : le chemin d'origine est renvoye tel quel et le test echoue).
function servedPath(rel) {
  const seg = rel.split("/")[0];
  if (!isRetired(seg)) return rel;
  const rules = fs.readFileSync(path.join(__dirname, "..", "..", "_redirects"), "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/));
  const ok = rules.some((r) => r[0] === "/" + seg + "/*" && r[1] === "/" + RETIRED[seg] + "/:splat" && r[2] === "301!" && r.length === 3);
  return ok ? RETIRED[seg] + rel.slice(seg.length) : rel;
}

module.exports = { PUBLIC_DIRS: publicDirs(), RETIRED_DIRS: RETIRED, publicDirs, isRetired, servedDir, servedPath };
